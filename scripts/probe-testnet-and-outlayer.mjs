#!/usr/bin/env node
/**
 * Day 1 Live Probe: NEAR Testnet RPC and OutLayer Testnet Custody Gate
 */

const NEAR_RPC_URL = process.env.NEAR_RPC_URL || 'https://rpc.testnet.near.org';
const OUTLAYER_API_URL = process.env.OUTLAYER_API_URL || 'https://testnet-api.outlayer.ai';

async function checkNearRpc() {
  try {
    const res = await fetch(NEAR_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'nivry-probe',
        method: 'status',
        params: [],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return {
      ok: res.ok && Boolean(data?.result?.chain_id),
      status: res.status,
      chain_id: data?.result?.chain_id,
      latest_block_height: data?.result?.sync_info?.latest_block_height,
      syncing: data?.result?.sync_info?.syncing,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkOutLayerApi() {
  try {
    const res = await fetch(`${OUTLAYER_API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return {
      ok: res.ok,
      status: res.status,
      has_wallet_id: Boolean(parsed?.wallet_id),
      has_near_account_id: Boolean(parsed?.near_account_id),
      near_account_id: parsed?.near_account_id || null,
      note: res.ok
        ? 'OutLayer /register responded with custody identity'
        : `HTTP ${res.status}: ${text.slice(0, 160)}`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const [nearRpc, outlayer] = await Promise.all([checkNearRpc(), checkOutLayerApi()]);
console.log(
  JSON.stringify(
    {
      checked_at: new Date().toISOString(),
      near_rpc: nearRpc,
      outlayer_testnet: outlayer,
      recommended_executor_mode: outlayer.ok ? 'outlayer_or_local' : 'local',
    },
    null,
    2
  )
);

