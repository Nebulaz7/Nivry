/**
 * Minimal read-only NEAR JSON-RPC client for the CLI. It talks to the chain directly so
 * `status` and `demo` work without the Nivry backend running.
 */

export const DEFAULT_RPC_URL = 'https://rpc.testnet.near.org';
export const DEFAULT_REGISTRY = 'nivry.testnet';

/** Account hash NEAR reports for an account with no contract deployed. */
const NO_CODE_HASH = '11111111111111111111111111111111';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export interface CliConfig {
  rpcUrl: string;
  registryId: string;
}

export function loadConfig(): CliConfig {
  return {
    rpcUrl: process.env.NEAR_RPC_URL || DEFAULT_RPC_URL,
    registryId: process.env.REGISTRY_CONTRACT_ID || DEFAULT_REGISTRY,
  };
}

export class RpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RpcError';
  }
}

async function rpc<T>(
  config: CliConfig,
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'nivry-cli', method, params }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new RpcError(
      `Cannot reach NEAR RPC at ${config.rpcUrl}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    throw new RpcError(`NEAR RPC returned HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    result?: T & { error?: string };
    error?: { message?: string; data?: unknown };
  };
  if (payload.error) {
    throw new RpcError(
      `${payload.error.message ?? 'RPC error'}${payload.error.data ? `: ${JSON.stringify(payload.error.data)}` : ''}`,
    );
  }
  // Some nodes report contract-level failures inside `result.error`.
  if (payload.result && typeof payload.result.error === 'string') {
    throw new RpcError(payload.result.error);
  }
  return payload.result as T;
}

/** Calls a finalized view method and decodes its JSON result. */
export async function callView<T>(
  config: CliConfig,
  accountId: string,
  methodName: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = await rpc<{ result: number[] }>(config, 'query', {
    request_type: 'call_function',
    finality: 'final',
    account_id: accountId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args), 'utf8').toString('base64'),
  });
  return JSON.parse(Buffer.from(result.result).toString('utf8')) as T;
}

export interface AccountSummary {
  amount: string;
  storage_usage: number;
  code_hash: string;
}

export function viewAccount(config: CliConfig, accountId: string): Promise<AccountSummary> {
  return rpc<AccountSummary>(config, 'query', {
    request_type: 'view_account',
    finality: 'final',
    account_id: accountId,
  });
}

export async function accessKeyCount(config: CliConfig, accountId: string): Promise<number> {
  const res = await rpc<{ keys: unknown[] }>(config, 'query', {
    request_type: 'view_access_key_list',
    finality: 'final',
    account_id: accountId,
  });
  return Array.isArray(res.keys) ? res.keys.length : 0;
}

export function hasContractCode(codeHash: string): boolean {
  return typeof codeHash === 'string' && codeHash !== NO_CODE_HASH;
}

function decodeBase58(input: string): Buffer | null {
  let num = 0n;
  for (const ch of input) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    num = num * 58n + BigInt(idx);
  }
  let hex = num === 0n ? '' : num.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  let zeros = 0;
  for (const ch of input) {
    if (ch !== '1') break;
    zeros++;
  }
  return Buffer.concat([Buffer.alloc(zeros), hex ? Buffer.from(hex, 'hex') : Buffer.alloc(0)]);
}

/** Normalizes a code hash given as 64-char hex or NEAR's base58 into lowercase hex. */
export function codeHashToHex(codeHash: string): string | null {
  if (/^[0-9a-fA-F]{64}$/.test(codeHash)) return codeHash.toLowerCase();
  const decoded = decodeBase58(codeHash);
  return decoded && decoded.length === 32 ? decoded.toString('hex') : null;
}

export function codeHashesMatch(actual: string, expected: string): boolean {
  const a = codeHashToHex(actual);
  const b = codeHashToHex(expected);
  return a !== null && b !== null && a === b;
}

export interface AgentView {
  token_id: string;
  owner_id: string | null;
  treasury_account_id: string;
  authority_epoch: number;
  version: number;
  lifecycle: string;
  frozen: boolean;
  executor_grant: {
    executor_id: string;
    recipients: string[];
    per_payment_cap_yocto: string;
    total_budget_yocto: string;
    spent_yocto: string;
    remaining_budget_yocto: string;
    expires_at_ns: number;
  } | null;
  next_command_nonce: number;
  listing: unknown | null;
  pending_operation: unknown | null;
  manifest: { name: string; task_kind: string; bundle_sha256: string };
  manifest_hash: string;
}

export interface TreasuryView {
  balance_yocto: string;
  spendable_yocto: string;
  storage_reserve_yocto: string;
  recorded_payment_count: number;
  recorded_payment_amount_yocto: string;
}

export interface TreasuryLockProof {
  account_id: string;
  key_count: number;
  is_keyless: boolean;
  code_hash: string;
  expected_code_hash: string;
  code_hash_matches: boolean;
  /** `locked_release` only when keyless AND running exactly the registry's pinned wallet code. */
  label: 'locked_release' | 'development/unverified';
}

/** Proves a treasury has no keys and runs the registry's pinned wallet bytecode. */
export async function proveTreasuryLock(
  config: CliConfig,
  treasuryAccountId: string,
): Promise<TreasuryLockProof> {
  const [account, keys, expected] = await Promise.all([
    viewAccount(config, treasuryAccountId),
    accessKeyCount(config, treasuryAccountId),
    callView<string>(config, config.registryId, 'wallet_code_hash'),
  ]);
  const matches = hasContractCode(account.code_hash) && codeHashesMatch(account.code_hash, expected);
  const keyless = keys === 0;
  return {
    account_id: treasuryAccountId,
    key_count: keys,
    is_keyless: keyless,
    code_hash: account.code_hash,
    expected_code_hash: expected,
    code_hash_matches: matches,
    label: keyless && matches ? 'locked_release' : 'development/unverified',
  };
}

/** Formats a yoctoNEAR decimal string as NEAR with up to 5 decimals. */
export function formatNear(yocto: string): string {
  const value = BigInt(yocto);
  const unit = 10n ** 24n;
  const whole = value / unit;
  const frac = ((value % unit) * 100_000n) / unit;
  return `${whole}.${frac.toString().padStart(5, '0')} NEAR`;
}

