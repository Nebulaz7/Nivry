import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

export type Lifecycle = 'provisioning' | 'ready' | 'failed' | 'uncertain';
export type OperationKind = 'executor_payment' | 'owner_withdraw';
export type OperationStatus = 'pending' | 'succeeded' | 'failed';

export interface ManifestView {
  schema_version: string;
  name: string;
  description: string;
  runtime_hint: string;
  bundle_sha256: string;
  task_kind: string;
  manifest_uri: string;
}

export interface GrantView {
  executor_id: string;
  owner_at_grant: string;
  epoch: number;
  recipients: string[];
  per_payment_cap_yocto: string;
  total_budget_yocto: string;
  spent_yocto: string;
  remaining_budget_yocto: string;
  /** Raw `u64` in the contract's JSON; decimal nanoseconds. */
  expires_at_ns: number;
}

export interface PendingOperationView {
  operation_id: string;
  nonce: number;
  kind: OperationKind;
  recipient: string;
  amount_yocto: string;
  epoch: number;
}

export interface PendingTransferCallView {
  operation_id: string;
  receiver_id: string;
  previous_owner: string;
  epoch: number;
}

export interface ListingView {
  listing_id: number;
  seller: string;
  version: number;
  price_yocto: string;
  manifest_hash: string;
}

export interface AgentInfoView {
  token_id: string;
  /** `null` until provisioning confirms and the NFT is actually minted. */
  owner_id: string | null;
  treasury_account_id: string;
  authority_epoch: number;
  /** Buyer-visible state version (contract `AgentRecord::version`). */
  version: number;
  ownership_change_count: number;
  lifecycle: Lifecycle;
  frozen: boolean;
  executor_grant: GrantView | null;
  next_command_nonce: number;
  pending_operation: PendingOperationView | null;
  pending_transfer_call: PendingTransferCallView | null;
  listing: ListingView | null;
  manifest: ManifestView;
  manifest_hash: string;
}

export interface OperationView {
  operation_id: string;
  sequence: number;
  authority_epoch: number;
  recipient: string;
  amount_yocto: string;
  status: OperationStatus;
}

export interface TreasuryInfoView {
  registry: string;
  token_id: string;
  balance_yocto: string;
  storage_reserve_yocto: string;
  spendable_yocto: string;
  pending: boolean;
  next_sequence: number;
  last_operation: OperationView | null;
  recorded_payment_count: number;
  recorded_payment_amount_yocto: string;
}

export interface AccountLockVerification {
  account_id: string;
  amount_yocto: string;
  storage_usage: number;
  code_hash: string;
  expected_code_hash?: string | null;
  code_hash_matches?: boolean;
  key_count: number;
  is_keyless: boolean;
  verification_label: 'locked_release' | 'development/unverified';
}

export interface AccessKeyEntry {
  public_key: string;
  access_key: {
    nonce: number;
    permission:
      | 'FullAccess'
      | {
          FunctionCall: {
            allowance: string | null;
            receiver_id: string;
            method_names: string[];
          };
        };
  };
}

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Decodes a Base58 string into raw bytes, or returns null if invalid.
 */
export function decodeBase58(input: string): Buffer | null {
  if (!input || typeof input !== 'string') return null;
  let num = 0n;
  for (const ch of input) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx === -1) return null;
    num = num * 58n + BigInt(idx);
  }
  let hex = num === 0n ? '' : num.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const trailingBytes = hex ? Buffer.from(hex, 'hex') : Buffer.alloc(0);

  let leadingZeros = 0;
  for (const ch of input) {
    if (ch === '1') leadingZeros++;
    else break;
  }
  return Buffer.concat([Buffer.alloc(leadingZeros), trailingBytes]);
}

/**
 * Normalizes a 32-byte SHA-256 code hash from either 64-char hex or NEAR RPC Base58 into lowercase hex.
 */
export function normalizeCodeHashToHex(codeHash: string): string | null {
  if (
    !codeHash ||
    typeof codeHash !== 'string' ||
    codeHash === '11111111111111111111111111111111'
  ) {
    return null;
  }
  if (/^[0-9a-fA-F]{64}$/.test(codeHash)) {
    return codeHash.toLowerCase();
  }
  const decoded = decodeBase58(codeHash);
  if (!decoded || decoded.length !== 32 || decoded.every((b) => b === 0)) {
    return null;
  }
  return decoded.toString('hex').toLowerCase();
}

export function codeHashesMatch(
  actualCodeHash: string,
  expectedCodeHash: string,
): boolean {
  if (!actualCodeHash || !expectedCodeHash) return false;
  if (actualCodeHash.toLowerCase() === expectedCodeHash.toLowerCase()) {
    return true;
  }
  const actualHex = normalizeCodeHashToHex(actualCodeHash);
  const expectedHex = normalizeCodeHashToHex(expectedCodeHash);
  return (
    actualHex !== null && expectedHex !== null && actualHex === expectedHex
  );
}

export interface ParsedNep297Event {
  receipt_id: string;
  executor_id: string;
  block_hash: string;
  log_index: number;
  standard: string;
  version: string;
  event: string;
  data: unknown;
}

export interface FinalizedTransactionOutcome {
  transaction_hash: string;
  signer_id: string;
  receiver_id: string;
  succeeded: boolean;
  events: ParsedNep297Event[];
  raw_outcome: unknown;
}

@Injectable()
export class ChainReaderService {
  private readonly rpcUrl: string;
  private readonly registryContractId: string;

  constructor() {
    this.rpcUrl = process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org';
    this.registryContractId =
      process.env.REGISTRY_CONTRACT_ID || 'nivry.testnet';
  }

  getRegistryContractId(): string {
    return this.registryContractId;
  }

  /**
   * Calls a finalized view method on the Registry contract.
   */
  async getAgentInfo(tokenId: string): Promise<AgentInfoView> {
    return this.callViewMethod<AgentInfoView>(
      this.registryContractId,
      'agent_info',
      {
        token_id: tokenId,
      },
    );
  }

  async getProvisioningCost(): Promise<string> {
    return this.callViewMethod<string>(
      this.registryContractId,
      'provisioning_cost',
      {},
    );
  }

  async getWalletCodeHash(): Promise<string> {
    return this.callViewMethod<string>(
      this.registryContractId,
      'wallet_code_hash',
      {},
    );
  }

  async getNextTokenId(): Promise<number> {
    return this.callViewMethod<number>(
      this.registryContractId,
      'next_token_id',
      {},
    );
  }

  /**
   * Calls finalized view methods on a keyless child Treasury contract.
   */
  async getTreasuryInfo(treasuryAccountId: string): Promise<TreasuryInfoView> {
    return this.callViewMethod<TreasuryInfoView>(
      treasuryAccountId,
      'treasury_info',
      {},
    );
  }

  async getOperationStatus(
    treasuryAccountId: string,
    operationId: string,
  ): Promise<OperationView | null> {
    return this.callViewMethod<OperationView | null>(
      treasuryAccountId,
      'operation_status',
      {
        operation_id: operationId,
      },
    );
  }

  /**
   * Queries finalized access keys for an account (`view_access_key_list`).
   */
  async getAccessKeyList(accountId: string): Promise<AccessKeyEntry[]> {
    const keysRes = await this.rpcRequest<{
      keys: AccessKeyEntry[];
    }>('query', {
      request_type: 'view_access_key_list',
      finality: 'final',
      account_id: accountId,
    });
    return Array.isArray(keysRes?.keys) ? keysRes.keys : [];
  }

  /**
   * Verifies that `publicKey` is currently installed on `accountId` on-chain with either
   * `FullAccess` or a `FunctionCall` permission targeting the Nivry registry contract (PLAN.md §13).
   */
  async verifyAccountAccessKey(
    accountId: string,
    publicKey: string,
  ): Promise<boolean> {
    const keys = await this.getAccessKeyList(accountId);
    const match = keys.find((k) => k.public_key === publicKey);
    if (!match || !match.access_key) {
      return false;
    }
    const perm = match.access_key.permission;
    if (perm === 'FullAccess') {
      return true;
    }
    if (
      typeof perm === 'object' &&
      perm !== null &&
      'FunctionCall' in perm &&
      perm.FunctionCall?.receiver_id === this.registryContractId
    ) {
      return true;
    }
    return false;
  }

  /**
   * Verifies whether an on-chain account has zero access keys and deployed code (PLAN.md §6).
   * For treasury child accounts, also requires `accountRes.code_hash` to match the Registry
   * contract's `wallet_code_hash()` view (`ISSUES.md` #2).
   * Always returns 'development/unverified' unless keys list is empty and expected code is present.
   */
  async verifyAccountLockState(
    accountId: string,
  ): Promise<AccountLockVerification> {
    const isRegistryAccount = accountId === this.registryContractId;
    const [accountRes, keysRes, expectedWalletCodeHash] = await Promise.all([
      this.rpcRequest<{
        amount: string;
        storage_usage: number;
        code_hash: string;
      }>('query', {
        request_type: 'view_account',
        finality: 'final',
        account_id: accountId,
      }),
      this.rpcRequest<{
        keys: unknown[];
      }>('query', {
        request_type: 'view_access_key_list',
        finality: 'final',
        account_id: accountId,
      }),
      isRegistryAccount ? Promise.resolve(null) : this.getWalletCodeHash(),
    ]);

    const keyCount = Array.isArray(keysRes.keys) ? keysRes.keys.length : 0;
    const hasContractCode =
      typeof accountRes.code_hash === 'string' &&
      accountRes.code_hash !== '11111111111111111111111111111111';
    const isKeyless = keyCount === 0;
    const codeHashMatches = isRegistryAccount
      ? hasContractCode
      : hasContractCode &&
        typeof expectedWalletCodeHash === 'string' &&
        codeHashesMatch(accountRes.code_hash, expectedWalletCodeHash);

    return {
      account_id: accountId,
      amount_yocto: accountRes.amount,
      storage_usage: accountRes.storage_usage,
      code_hash: accountRes.code_hash,
      expected_code_hash: expectedWalletCodeHash,
      code_hash_matches: codeHashMatches,
      key_count: keyCount,
      is_keyless: isKeyless,
      verification_label:
        isKeyless && hasContractCode && codeHashMatches
          ? 'locked_release'
          : 'development/unverified',
    };
  }

  /**
   * Fetches finalized transaction execution outcome and parses NEP-297 EVENT_JSON logs.
   */
  async getFinalTransactionOutcome(
    txHash: string,
    signerAccountId: string,
  ): Promise<FinalizedTransactionOutcome> {
    const result = await this.rpcRequest<{
      status: Record<string, unknown>;
      transaction: { hash: string; signer_id: string; receiver_id: string };
      receipts_outcome: Array<{
        id: string;
        block_hash: string;
        outcome: {
          executor_id: string;
          logs: string[];
          status: Record<string, unknown>;
        };
      }>;
    }>('EXPERIMENTAL_tx_status', {
      tx_hash: txHash,
      sender_account_id: signerAccountId,
      wait_until: 'FINAL',
    });

    const succeeded =
      result?.status !== undefined &&
      !('Failure' in result.status) &&
      ('SuccessValue' in result.status || 'SuccessReceiptId' in result.status);

    const events = this.extractNep297Events(result.receipts_outcome || []);

    return {
      transaction_hash: result.transaction?.hash || txHash,
      signer_id: result.transaction?.signer_id || signerAccountId,
      receiver_id: result.transaction?.receiver_id || '',
      succeeded,
      events,
      raw_outcome: result,
    };
  }

  /**
   * Parses NEP-297 `EVENT_JSON:{...}` lines from receipt outcomes while preserving
   * exact `(receipt_id, log_index)` ordering keys.
   */
  extractNep297Events(
    receiptsOutcome: Array<{
      id: string;
      block_hash: string;
      outcome: {
        executor_id: string;
        logs: string[];
        status?: Record<string, unknown>;
      };
    }>,
  ): ParsedNep297Event[] {
    const events: ParsedNep297Event[] = [];

    for (const receipt of receiptsOutcome) {
      // A failed receipt can still carry logs written before the panic. Its state changes
      // were rolled back, so its events must never be treated as facts.
      if (receipt.outcome?.status && 'Failure' in receipt.outcome.status) {
        continue;
      }
      const logs = receipt.outcome?.logs || [];
      for (let logIndex = 0; logIndex < logs.length; logIndex++) {
        const line = logs[logIndex];
        if (!line.startsWith('EVENT_JSON:')) {
          continue;
        }
        const jsonPart = line.slice('EVENT_JSON:'.length).trim();
        try {
          const parsed = JSON.parse(jsonPart) as {
            standard?: string;
            version?: string;
            event?: string;
            data?: unknown;
          };
          if (
            parsed &&
            typeof parsed.standard === 'string' &&
            typeof parsed.event === 'string'
          ) {
            events.push({
              receipt_id: receipt.id,
              executor_id: receipt.outcome.executor_id,
              block_hash: receipt.block_hash,
              log_index: logIndex,
              standard: parsed.standard,
              version: parsed.version || '1.0.0',
              event: parsed.event,
              data: parsed.data ?? null,
            });
          }
        } catch {
          // Ignore malformed non-JSON log lines
        }
      }
    }

    return events;
  }

  /**
   * Reads the finalized height and timestamp of a block, so event ordering never depends
   * on values supplied by an API caller.
   */
  async getBlockInfo(
    blockHash: string,
  ): Promise<{ height: number; timestamp_ns: string }> {
    const block = await this.rpcRequest<{
      header: { height: number; timestamp_nanosec: string };
    }>('block', { block_id: blockHash });
    return {
      height: block.header.height,
      timestamp_ns: String(block.header.timestamp_nanosec),
    };
  }

  /**
   * Executes a finalized `call_function` RPC query and decodes the UTF-8 JSON response.
   */
  async callViewMethod<T>(
    contractId: string,
    methodName: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const argsBase64 = Buffer.from(JSON.stringify(args), 'utf8').toString(
      'base64',
    );

    const response = await this.rpcRequest<{
      result: number[];
      block_height: number;
      block_hash: string;
    }>('query', {
      request_type: 'call_function',
      finality: 'final',
      account_id: contractId,
      method_name: methodName,
      args_base64: argsBase64,
    });

    const decoded = Buffer.from(response.result).toString('utf8');
    return JSON.parse(decoded) as T;
  }

  async rpcRequest<T>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'nivry-chain-reader',
          method,
          params,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      throw new BadGatewayException(
        `NEAR RPC request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(`NEAR RPC HTTP error: ${response.status}`);
    }

    const payload = (await response.json()) as {
      result?: T;
      error?: {
        message?: string;
        data?: unknown;
        cause?: { name?: string };
      };
    };

    if (payload.error) {
      const causeName = payload.error.cause?.name || '';
      const errorData = JSON.stringify(payload.error.data ?? '');
      if (
        causeName === 'UNKNOWN_ACCOUNT' ||
        errorData.includes('does not exist') ||
        errorData.includes('unknown token')
      ) {
        throw new NotFoundException(
          `On-chain resource not found: ${errorData || causeName}`,
        );
      }
      throw new BadGatewayException(
        `NEAR RPC error (${causeName || 'Error'}): ${payload.error.message || errorData}`,
      );
    }

    if (payload.result === undefined) {
      throw new BadGatewayException('NEAR RPC returned an empty result');
    }

    return payload.result;
  }
}
