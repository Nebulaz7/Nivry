import type { TransactionDispatchFn } from './executor.service';

/** The only part of near-api-js's `Account` this module relies on. */
interface SigningAccount {
  callFunctionRaw(params: {
    contractId: string;
    methodName: string;
    args: object;
    gas: bigint;
    deposit: bigint;
    waitUntil: 'FINAL';
  }): Promise<{ transaction: { hash: string } }>;
}

/** Gas attached to `execute_payment` (registry `DISPATCH_GAS` + settle + headroom). */
export const EXECUTE_PAYMENT_GAS = 150_000_000_000_000n;

export interface NearKeySignerConfig {
  executorAccountId: string;
  /** Curve-prefixed secret key, e.g. `ed25519:...`. Never logged. */
  privateKey: string;
  rpcUrl: string;
}

/**
 * Builds a dispatcher that signs `execute_payment` with a local executor key and submits
 * it to the registry. The executor key is only ever an authorized *caller*: spending limits
 * are enforced on-chain by the registry grant, not by this process.
 *
 * `near-api-js` is loaded on first dispatch so processes (and unit tests) that never sign
 * do not pay for, or depend on, its ESM-only crypto dependencies.
 */
export function createNearKeyDispatcher(
  config: NearKeySignerConfig,
): TransactionDispatchFn {
  if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]+$/.test(config.privateKey)) {
    throw new Error('EXECUTOR_PRIVATE_KEY must be an "ed25519:<base58>" key');
  }

  let accountPromise: Promise<SigningAccount> | undefined;
  const getAccount = (): Promise<SigningAccount> => {
    accountPromise ??= import('near-api-js').then(
      ({ Account, JsonRpcProvider, KeyPairSigner }) =>
        new Account(
          config.executorAccountId,
          new JsonRpcProvider({ url: config.rpcUrl }),
          KeyPairSigner.fromSecretKey(config.privateKey as `ed25519:${string}`),
        ) as SigningAccount,
    );
    return accountPromise;
  };

  return async ({ registryContractId, executorAccountId, args }) => {
    if (executorAccountId !== config.executorAccountId) {
      throw new Error(
        `Signer is bound to ${config.executorAccountId}, not ${executorAccountId}`,
      );
    }
    const account = await getAccount();
    const outcome = await account.callFunctionRaw({
      contractId: registryContractId,
      methodName: 'execute_payment',
      args,
      gas: EXECUTE_PAYMENT_GAS,
      deposit: 0n,
      waitUntil: 'FINAL',
    });
    return { transaction_hash: outcome.transaction.hash };
  };
}
