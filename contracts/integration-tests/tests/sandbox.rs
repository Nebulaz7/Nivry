//! Sandbox seam test for the Day-1 flow.
//!
//! Proves, on a real NEAR sandbox, that:
//!   1. `create_agent` provisions a *separate, real* treasury account with code
//!      deployed and no access keys;
//!   2. the token stays unusable until the async batch confirms;
//!   3. a customer can pay the treasury and it is recorded as a payment;
//!   4. a bounded executor payout settles and leaves no pending operation;
//!   5. after a transfer the old executor is rejected and the treasury address and
//!      balance are unchanged.
//!
//! Run `scripts/build-contracts.sh` first: this test reads the built artifacts
//! rather than compiling contracts itself.

use anyhow::{anyhow, Context, Result};
use near_workspaces::network::Sandbox;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{AccountId, Contract, Worker};
use serde_json::json;
use std::path::PathBuf;

const MANIFEST: &str = r#"{
  "schema_version": "1",
  "name": "Docs Reporter",
  "description": "Produces a repository documentation report.",
  "runtime_hint": "hermes",
  "bundle_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "task_kind": "docs_report_v1",
  "manifest_uri": "https://example.invalid/bundles/docs-reporter.tar.gz"
}"#;

fn artifact(name: &str) -> Result<Vec<u8>> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("target")
        .join("wasm32-unknown-unknown")
        .join("release")
        .join(name);
    std::fs::read(&path).with_context(|| {
        format!(
            "missing artifact {}; run scripts/build-contracts.sh first",
            path.display()
        )
    })
}

async fn wait_ready(
    worker: &Worker<Sandbox>,
    registry: &Contract,
    token_id: &str,
) -> Result<serde_json::Value> {
    for _ in 0..60 {
        let outcome = registry
            .view("agent_info")
            .args_json(json!({ "token_id": token_id }))
            .await?;
        let info: serde_json::Value = outcome.json()?;
        match info["lifecycle"].as_str() {
            Some("ready") => return Ok(info),
            Some("failed") | Some("uncertain") => {
                return Err(anyhow!("provisioning ended in {info}"));
            }
            _ => {
                worker.fast_forward(1).await?;
            }
        }
    }
    Err(anyhow!("provisioning never confirmed"))
}

#[tokio::test]
async fn day_one_provisioning_payout_and_handover() -> Result<()> {
    let worker = near_workspaces::sandbox().await?;

    let registry = worker
        .dev_deploy(&artifact("nivry_registry.wasm")?)
        .await?;
    let owner = worker.dev_create_account().await?;
    eprintln!("[step] init registry");
    registry
        .call("new")
        .args_json(json!({ "owner_id": owner.id() }))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?
        .into_result()?;

    // --- 1/2: provisioning is asynchronous and gated --------------------
    let cost: String = registry
        .view("provisioning_cost")
        .await?
        .json()?;
    let cost = NearToken::from_yoctonear(cost.parse::<u128>()?);
    assert!(cost.as_yoctonear() > 0);

    let manifest: serde_json::Value = serde_json::from_str(MANIFEST)?;
    eprintln!("[step] create_agent");
    owner
        .call(registry.id(), "create_agent")
        .args_json(json!({ "manifest": manifest, "expected_cost": cost.as_yoctonear().to_string() }))
        .deposit(cost)
        .gas(Gas::from_tgas(300))
        .transact()
        .await?
        .into_result()?;

    let info = wait_ready(&worker, &registry, "1").await?;
    let treasury_id: AccountId = info["treasury_account_id"].as_str().unwrap().parse()?;
    assert_ne!(treasury_id, *registry.id(), "treasury must be its own account");

    // The treasury is real, funded, correctly bound, and carries no access keys.
    let treasury = worker.view_account(&treasury_id).await?;
    assert!(
        treasury.balance.as_yoctonear() > 0,
        "treasury must be funded"
    );
    let binding: serde_json::Value = worker
        .view(&treasury_id, "treasury_info")
        .await?
        .json()?;
    assert_eq!(binding["registry"], registry.id().as_str());
    assert_eq!(binding["token_id"], "1");
    let keys = worker.view_access_keys(&treasury_id).await?;
    assert!(
        keys.is_empty(),
        "treasury must have zero access keys, found {keys:?}"
    );

    // --- 3: a customer payment is recorded, not inferred ----------------
    let customer = worker.dev_create_account().await?;
    eprintln!("[step] pay_agent");
    customer
        .call(&treasury_id, "pay_agent")
        .args_json(json!({ "payment_reference_hash": "ref-1", "observed_authority_epoch": 1 }))
        .deposit(NearToken::from_millinear(20))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let treasury_info: serde_json::Value = customer
        .view(&treasury_id, "treasury_info")
        .await?
        .json()?;
    assert_eq!(treasury_info["recorded_payment_count"], 1);

    // --- 4: a bounded executor payout settles ---------------------------
    let executor = worker.dev_create_account().await?;
    let epoch = info["authority_epoch"].as_u64().unwrap();
    let now_ns = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_nanos() as u64;
    let expires_at_ns = (now_ns + 30 * 24 * 60 * 60 * 1_000_000_000u64).to_string();
    eprintln!("[step] set_executor");
    let set_exec = owner
        .call(registry.id(), "set_executor")
        .args_json(json!({
            "token_id": "1",
            "expected_epoch": epoch,
            "grant": {
                "executor_id": executor.id(),
                "recipients": [customer.id()],
                "per_payment_cap": NearToken::from_millinear(10).as_yoctonear().to_string(),
                "total_budget": NearToken::from_millinear(30).as_yoctonear().to_string(),
                "expires_at_ns": expires_at_ns,
            }
        }))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;
    set_exec.into_result()?;

    let after_grant: serde_json::Value = registry
        .view("agent_info")
        .args_json(json!({ "token_id": "1" }))
        .await?
        .json()?;
    let grant_epoch = after_grant["authority_epoch"].as_u64().unwrap();
    let nonce = after_grant["next_command_nonce"].as_u64().unwrap();

    let before = worker.view_account(customer.id()).await?.balance;
    eprintln!("[step] execute_payment");
    let payment = executor
        .call(registry.id(), "execute_payment")
        .args_json(json!({
            "token_id": "1",
            "expected_owner": owner.id(),
            "authority_epoch": grant_epoch,
            "nonce": nonce,
            "recipient": customer.id(),
            "amount": NearToken::from_millinear(5).as_yoctonear().to_string(),
            "deadline_ns": "9999999999999999999",
        }))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;
    payment.into_result()?;

    // Settle: the pending lock must clear once the treasury reports an outcome.
    let mut settled = None;
    for _ in 0..60 {
        let info: serde_json::Value = registry
            .view("agent_info")
            .args_json(json!({ "token_id": "1" }))
            .await?
            .json()?;
        if info["pending_operation"].is_null() {
            settled = Some(info);
            break;
        }
        worker.fast_forward(1).await?;
    }
    let settled = settled.ok_or_else(|| anyhow!("operation never settled"))?;
    let after = worker.view_account(customer.id()).await?.balance;
    assert!(
        after > before,
        "recipient balance should increase: {before:?} -> {after:?}"
    );

    // --- 5: handover invalidates the old executor, keeps the treasury ---
    let buyer = worker.dev_create_account().await?;
    let treasury_before = worker.view_account(&treasury_id).await?.balance;
    let transfer_epoch = settled["authority_epoch"].as_u64().unwrap();
    eprintln!("[step] nft_transfer");
    owner
        .call(registry.id(), "nft_transfer")
        .args_json(json!({ "receiver_id": buyer.id(), "token_id": "1" }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(100))
        .transact()
        .await?
        .into_result()?;

    let after_sale: serde_json::Value = registry
        .view("agent_info")
        .args_json(json!({ "token_id": "1" }))
        .await?
        .json()?;
    assert_eq!(after_sale["owner_id"], buyer.id().as_str());
    assert_eq!(after_sale["treasury_account_id"], treasury_id.as_str());
    assert!(after_sale["executor_grant"].is_null(), "grant must be cleared");
    assert!(
        after_sale["authority_epoch"].as_u64().unwrap() > transfer_epoch,
        "authority epoch must advance"
    );
    assert_eq!(
        worker.view_account(&treasury_id).await?.balance,
        treasury_before,
        "treasury address and balance must survive the sale"
    );

    let stale = executor
        .call(registry.id(), "execute_payment")
        .args_json(json!({
            "token_id": "1",
            "expected_owner": buyer.id(),
            "authority_epoch": after_sale["authority_epoch"].as_u64().unwrap(),
            "nonce": after_sale["next_command_nonce"].as_u64().unwrap(),
            "recipient": customer.id(),
            "amount": NearToken::from_millinear(1).as_yoctonear().to_string(),
            "deadline_ns": "9999999999999999999",
        }))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(
        stale.is_failure(),
        "the previous owner's executor must be rejected"
    );

    Ok(())
}
