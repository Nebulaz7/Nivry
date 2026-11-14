/**
 * Minimal read-only NEAR JSON-RPC client.
 *
 * No SDK: the dashboard only needs `query` calls, and running them in a bounded
 * pool keeps the registry enumeration to a handful of round trips.
 */

/**
 * Read endpoints, tried in order.
 *
 * `rpc.testnet.near.org` is the canonical public node, but it is unreachable on
 * some networks. Showing an empty registry because of one blocked host would be
 * worse than failing over, so the client keeps a second node and an override.
 * Set `NEXT_PUBLIC_NEAR_RPC_URL` to pin a single endpoint.
 */
const ENDPOINTS: string[] = (() => {
  const override =
    typeof process === "undefined"
      ? undefined
      : process.env.NEXT_PUBLIC_NEAR_RPC_URL;

  if (override) return [override];

  return ["https://rpc.testnet.near.org", "https://test.rpc.fastnear.com"];
})();

/** `final` on purpose — a just-provisioned agent must never read as stale. */
const FINALITY = "final";

const CONCURRENCY = 6;

let requestId = 0;

export class RpcError extends Error {
  constructor(
    message: string,
    readonly kind: "transport" | "contract" = "contract",
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export type ViewOutcome =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export interface BatchCall {
  contractId: string;
  methodName: string;
  args?: Record<string, unknown>;
}

interface RpcErrorNode {
  message?: string;
  data?: { error_message?: string };
}

interface QueryResultNode {
  error?: string;
  result?: { result?: number[]; logs?: string[] };
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function queryRequest(call: BatchCall) {
  return {
    jsonrpc: "2.0" as const,
    id: ++requestId,
    method: "query",
    params: {
      request_type: "call_function",
      finality: FINALITY,
      account_id: call.contractId,
      method_name: call.methodName,
      args_base64: toBase64(JSON.stringify(call.args ?? {})),
    },
  };
}

function hostOf(endpoint: string): string {
  return endpoint.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

async function post(payload: unknown): Promise<unknown> {
  let failure = "Could not reach any NEAR RPC endpoint.";

  for (const endpoint of ENDPOINTS) {
    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
    } catch {
      failure = `Could not reach ${hostOf(endpoint)}.`;
      continue;
    }

    // A busy or unavailable node deserves a second opinion; a rejection does not.
    if (response.status === 429 || response.status >= 500) {
      failure = `${hostOf(endpoint)} responded ${response.status}.`;
      continue;
    }

    if (!response.ok) {
      throw new RpcError(
        `${hostOf(endpoint)} responded ${response.status}.`,
        "transport",
      );
    }

    return response.json();
  }

  throw new RpcError(failure, "transport");
}

function parseView(body: unknown): ViewOutcome {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Malformed RPC response." };
  }

  const node = body as { error?: RpcErrorNode | string; result?: QueryResultNode };

  // Top-level JSON-RPC error.
  if (node.error) {
    if (typeof node.error === "string") return { ok: false, error: node.error };
    return {
      ok: false,
      error:
        node.error.data?.error_message ?? node.error.message ?? "NEAR RPC error.",
    };
  }

  const result = node.result;
  if (!result) return { ok: false, error: "Malformed RPC result." };

  // Contract panic — a `query` returns this instead of failing the request.
  if (typeof result.error === "string") return { ok: false, error: result.error };

  const bytes = result.result;
  if (!Array.isArray(bytes)) return { ok: false, error: "Malformed RPC result." };

  const text = new TextDecoder().decode(Uint8Array.from(bytes));
  if (text.length === 0) return { ok: true, value: null };

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "Unexpected contract payload." };
  }
}

/** A single `view` call that reports failure instead of throwing. */
export async function viewCallSafe<T>(
  contractId: string,
  methodName: string,
  args: Record<string, unknown> = {},
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    const body = await post(queryRequest({ contractId, methodName, args }));
    const outcome = parseView(body);
    if (!outcome.ok) return outcome;
    return { ok: true, value: outcome.value as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** A single `view` call that throws {@link RpcError} on failure. */
export async function viewCall<T>(
  contractId: string,
  methodName: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const outcome = await viewCallSafe<T>(contractId, methodName, args);
  if (!outcome.ok) throw new RpcError(outcome.error);
  return outcome.value;
}

/**
 * Many `view` calls, run in parallel with a bounded pool.
 *
 * The public RPC rejects JSON-RPC batch arrays (`400`, "JSON RPC Request format
 * was expected"), so batching has to happen client-side. Results come back in
 * the same order as `calls`; a failing element does not fail the rest.
 */
export async function viewBatch(calls: BatchCall[]): Promise<ViewOutcome[]> {
  const outcomes: ViewOutcome[] = new Array(calls.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < calls.length) {
      const index = cursor;
      cursor += 1;

      const call = calls[index];
      outcomes[index] = await viewCallSafe(call.contractId, call.methodName, call.args);
    }
  };

  const workers = Math.min(CONCURRENCY, calls.length);
  await Promise.all(Array.from({ length: workers }, worker));

  return outcomes;
}

export interface RpcAccount {
  amount: string;
  code_hash: string;
}

/** Native account state — used to prove a treasury carries no code of its own choice. */
export async function viewAccount(accountId: string): Promise<RpcAccount> {
  const body = await post({
    jsonrpc: "2.0",
    id: ++requestId,
    method: "query",
    params: {
      request_type: "view_account",
      finality: FINALITY,
      account_id: accountId,
    },
  });

  const node = body as {
    error?: RpcErrorNode | string;
    result?: { amount?: string; code_hash?: string };
  };

  if (node.error) {
    throw new RpcError(
      typeof node.error === "string"
        ? node.error
        : (node.error.data?.error_message ?? node.error.message ?? "NEAR RPC error."),
    );
  }

  if (!node.result?.amount) {
    throw new RpcError("Malformed account state.");
  }

  return {
    amount: node.result.amount,
    code_hash: node.result.code_hash ?? "",
  };
}
