import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeManifestHash, validateManifest, type Manifest } from '@nivry/shared';
import {
  callView,
  hasContractCode,
  proveTreasuryLock,
  viewAccount,
  type AgentView,
  type CliConfig,
} from './chain.js';

/** Deterministic `docs_report_v1` output for `fixtures/sample-repo` (see backend spec). */
export const EXPECTED_SAMPLE_REPORT_SHA256 =
  '997a048a0f03ea1ecce7df320609b980ac1e7c0db0c97aad31dade52791b4fac';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

/** Finds the repo root (the directory holding `fixtures/` and `runtime/hermes/`). */
export function findRepoRoot(startDir: string): string | null {
  const fromEnv = process.env.NIVRY_ROOT;
  if (fromEnv && existsSync(join(fromEnv, 'fixtures'))) return resolve(fromEnv);

  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, 'fixtures', 'manifest.example.json')) && existsSync(join(dir, 'runtime', 'hermes'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

async function check(name: string, fn: () => Promise<string>): Promise<CheckResult> {
  try {
    return { name, ok: true, detail: await fn() };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * `nivry demo [token-id]`
 *
 * Verifies the deployed demo end to end from public data: chain reachability, the live
 * agent and its keyless treasury, that the deployed manifest equals the committed fixture,
 * and that the deterministic Hermes task reproduces its published output hash.
 */
export async function runDemo(config: CliConfig, tokenId: string): Promise<number> {
  const root = findRepoRoot(__dirname);
  const results: CheckResult[] = [];
  let agent: AgentView | null = null;

  console.log(`Nivry demo check  (registry ${config.registryId}, token ${tokenId})`);
  console.log('');

  results.push(
    await check('Registry contract is deployed', async () => {
      const account = await viewAccount(config, config.registryId);
      if (!hasContractCode(account.code_hash)) throw new Error(`${config.registryId} has no contract code`);
      return `${config.registryId} runs contract ${account.code_hash}`;
    }),
  );

  results.push(
    await check('Agent exists and is ready', async () => {
      agent = await callView<AgentView>(config, config.registryId, 'agent_info', { token_id: tokenId });
      if (agent.lifecycle !== 'ready') throw new Error(`lifecycle is "${agent.lifecycle}"`);
      return `owner ${agent.owner_id}, epoch ${agent.authority_epoch}, treasury ${agent.treasury_account_id}`;
    }),
  );

  results.push(
    await check('Treasury is keyless and runs the pinned wallet code', async () => {
      if (!agent) throw new Error('skipped: agent not readable');
      const lock = await proveTreasuryLock(config, agent.treasury_account_id);
      if (!lock.is_keyless) throw new Error(`treasury has ${lock.key_count} access key(s)`);
      if (!lock.code_hash_matches) throw new Error('code hash differs from registry wallet_code_hash()');
      return `0 access keys; code hash ${lock.expected_code_hash}`;
    }),
  );

  results.push(
    await check('Deployed manifest equals fixtures/manifest.example.json', async () => {
      if (!agent) throw new Error('skipped: agent not readable');
      if (!root) throw new Error('repo root not found (set NIVRY_ROOT)');
      const fixture = JSON.parse(
        readFileSync(join(root, 'fixtures', 'manifest.example.json'), 'utf8'),
      ) as Manifest;
      validateManifest(fixture);
      const local = computeManifestHash(fixture);
      if (local !== agent.manifest_hash) {
        throw new Error(`fixture hash ${local} != on-chain ${agent.manifest_hash}`);
      }
      return `manifest_hash ${local}`;
    }),
  );

  results.push(
    await check('Hermes docs_report_v1 reproduces its published hash', async () => {
      if (!root) throw new Error('repo root not found (set NIVRY_ROOT)');
      const modulePath = join(root, 'runtime', 'hermes', 'run-docs-report.mjs');
      const mod = (await import(pathToFileURL(modulePath).href)) as {
        runDocsReport: (dir: string) => { output_sha256: string; files_analyzed: string[] };
      };
      const report = mod.runDocsReport(join(root, 'fixtures', 'sample-repo'));
      if (report.output_sha256 !== EXPECTED_SAMPLE_REPORT_SHA256) {
        throw new Error(`got ${report.output_sha256}, expected ${EXPECTED_SAMPLE_REPORT_SHA256}`);
      }
      return `${report.files_analyzed.length} files, output_sha256 ${report.output_sha256}`;
    }),
  );

  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}`);
    console.log(`    ${r.detail}`);
  }
  console.log('');
  console.log(failed === 0 ? `All ${results.length} checks passed.` : `${failed} of ${results.length} checks failed.`);
  return failed === 0 ? 0 : 1;
}

