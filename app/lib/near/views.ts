/**
 * Typed read layer over the deployed registry and treasury contracts.
 *
 * There is no indexer, so the registry is enumerated: `next_token_id()` gives the
 * upper bound and `agent_info` is batched over it. Ids are monotonic and never
 * reused, so a gap is not possible — but a call is still allowed to fail without
 * taking the whole list down.
 */

import { SITE } from "@/lib/site";

import { RpcError } from "./rpc";
import { viewBatch, viewCall, viewCallSafe } from "./rpc";
import type { AgentInfo, Lifecycle, TreasuryInfo } from "./types";

export const REGISTRY_ID = SITE.registry;

/** Ceiling on how many tokens one enumeration reads. */
export const ENUMERATION_LIMIT = 200;

/** How many of the newest agents also get a treasury balance read. */
const BALANCE_SAMPLE = 12;

export interface AgentListing {
  info: AgentInfo;
  /** Treasury balance in yoctoNEAR, or `null` when it was not read. */
  balanceYocto: string | null;
}

export interface RegistryPage {
  agents: AgentListing[];
  /** Total reserved tokens, including ones outside the read window. */
  total: number;
  truncated: boolean;
}

export function getAgentInfo(tokenId: string): Promise<AgentInfo> {
  return viewCall<AgentInfo>(REGISTRY_ID, "agent_info", { token_id: tokenId });
}

export function getNextTokenId(): Promise<number> {
  return viewCall<number>(REGISTRY_ID, "next_token_id");
}

/** Exact deposit `create_agent` requires, as yoctoNEAR. */
export async function getProvisioningCost(): Promise<string> {
  return viewCall<string>(REGISTRY_ID, "provisioning_cost");
}

/** Exact deposit `list_agent` requires, as yoctoNEAR. */
export async function getListingDeposit(): Promise<string> {
  return viewCall<string>(REGISTRY_ID, "listing_deposit");
}

export function getWalletCodeHash(): Promise<string> {
  return viewCall<string>(REGISTRY_ID, "wallet_code_hash");
}

export function getTreasuryInfo(accountId: string): Promise<TreasuryInfo> {
  return viewCall<TreasuryInfo>(accountId, "treasury_info");
}

export async function getOwnedTokenIds(accountId: string): Promise<string[]> {
  const tokens = await viewCall<Array<{ token_id: string }>>(
    REGISTRY_ID,
    "nft_tokens_for_owner",
    { account_id: accountId, limit: 100 },
  );
  return tokens.map((token) => token.token_id);
}

/** Newest first, capped at {@link ENUMERATION_LIMIT}. */
export async function listAgents(limit = ENUMERATION_LIMIT): Promise<RegistryPage> {
  const next = await getNextTokenId();
  const total = Math.max(0, Number(next) - 1);
  const take = Math.min(total, limit);

  if (take === 0) return { agents: [], total, truncated: false };

  const ids: string[] = [];
  for (let id = total; id > total - take; id -= 1) ids.push(String(id));

  const outcomes = await viewBatch(
    ids.map((tokenId) => ({
      contractId: REGISTRY_ID,
      methodName: "agent_info",
      args: { token_id: tokenId },
    })),
  );

  const agents: AgentListing[] = [];
  for (const outcome of outcomes) {
    if (outcome.ok && outcome.value) {
      agents.push({ info: outcome.value as AgentInfo, balanceYocto: null });
    }
  }

  const sample = agents
    .slice(0, BALANCE_SAMPLE)
    .filter((agent) => agent.info.lifecycle === "ready");

  if (sample.length > 0) {
    const balances = await viewBatch(
      sample.map((agent) => ({
        contractId: agent.info.treasury_account_id,
        methodName: "treasury_info",
      })),
    );

    balances.forEach((outcome, index) => {
      if (outcome.ok && outcome.value) {
        sample[index].balanceYocto = (outcome.value as TreasuryInfo).balance_yocto;
      }
    });
  }

  return { agents, total, truncated: total > take };
}

/** `agent_info` that returns `null` instead of throwing — used while polling. */
export async function getAgentInfoSafe(tokenId: string): Promise<AgentInfo | null> {
  const outcome = await viewCallSafe<AgentInfo>(REGISTRY_ID, "agent_info", {
    token_id: tokenId,
  });
  return outcome.ok ? outcome.value : null;
}

export function isSettling(lifecycle: Lifecycle): boolean {
  return lifecycle === "provisioning";
}

export { RpcError };
