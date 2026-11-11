import {
  callView,
  formatNear,
  proveTreasuryLock,
  type AgentView,
  type CliConfig,
  type TreasuryView,
} from './chain.js';

/**
 * `nivry status <token-id> [--json]`
 *
 * Reads finalized chain state directly: the agent record, its treasury and the proof
 * that the treasury is keyless and runs the registry's pinned wallet code.
 */
export async function runStatus(
  config: CliConfig,
  tokenId: string,
  asJson: boolean,
): Promise<number> {
  let agent: AgentView;
  try {
    agent = await callView<AgentView>(config, config.registryId, 'agent_info', {
      token_id: tokenId,
    });
  } catch (err) {
    console.error(
      `✗ cannot read agent ${tokenId} from ${config.registryId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  const [treasury, lock] = await Promise.all([
    callView<TreasuryView>(config, agent.treasury_account_id, 'treasury_info'),
    proveTreasuryLock(config, agent.treasury_account_id),
  ]);

  if (asJson) {
    console.log(JSON.stringify({ agent, treasury, lock }, null, 2));
    return 0;
  }

  const grant = agent.executor_grant;
  const flags = [
    agent.frozen ? 'frozen' : null,
    agent.listing ? 'listed for sale' : null,
    agent.pending_operation ? 'pending operation' : null,
  ].filter(Boolean);

  console.log(`Agent #${agent.token_id}  "${agent.manifest.name}"  (${agent.manifest.task_kind})`);
  console.log(`  registry:        ${config.registryId}`);
  console.log(`  owner:           ${agent.owner_id ?? '(not minted yet)'}`);
  console.log(`  lifecycle:       ${agent.lifecycle}${flags.length ? `  [${flags.join(', ')}]` : ''}`);
  console.log(`  authority epoch: ${agent.authority_epoch}  (state version ${agent.version})`);
  console.log(`  manifest hash:   ${agent.manifest_hash}`);
  console.log(`  bundle sha256:   ${agent.manifest.bundle_sha256}`);
  console.log('');
  if (grant) {
    console.log(`Executor grant`);
    console.log(`  executor:        ${grant.executor_id}`);
    console.log(`  recipients:      ${grant.recipients.join(', ')}`);
    console.log(`  per-payment cap: ${formatNear(grant.per_payment_cap_yocto)}`);
    console.log(
      `  budget:          ${formatNear(grant.remaining_budget_yocto)} remaining of ${formatNear(grant.total_budget_yocto)}`,
    );
    // expires_at_ns arrives as a JSON number and can lose sub-millisecond precision, which is
    // irrelevant for a human-readable date.
    console.log(`  expires:         ${new Date(grant.expires_at_ns / 1_000_000).toISOString()}`);
  } else {
    console.log('Executor grant: none (no operator is authorized)');
  }
  console.log('');
  console.log(`Treasury ${agent.treasury_account_id}`);
  console.log(`  balance:         ${formatNear(treasury.balance_yocto)}`);
  console.log(`  spendable:       ${formatNear(treasury.spendable_yocto)}`);
  console.log(`  storage reserve: ${formatNear(treasury.storage_reserve_yocto)}`);
  console.log(
    `  recorded payments: ${treasury.recorded_payment_count} (${formatNear(treasury.recorded_payment_amount_yocto)})`,
  );
  console.log('');
  console.log(`Lock verification: ${lock.label}`);
  console.log(`  access keys:     ${lock.key_count} ${lock.is_keyless ? '✓ keyless' : '✗ HAS KEYS'}`);
  console.log(`  code hash:       ${lock.code_hash_matches ? '✓ matches' : '✗ does not match'} registry wallet_code_hash()`);
  return 0;
}

