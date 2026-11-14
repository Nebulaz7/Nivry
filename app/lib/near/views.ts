/**
 * Typed read layer over the deployed registry and treasury contracts.
 *
 * There is no indexer, so the registry is enumerated: `next_token_id()` gives the
 * upper bound and `agent_info` is read in a bounded parallel pool over it. Ids are
 * monotonic and never reused, so a gap is not possible — but a call is still
 * allowed to fail without taking the whole list down.
 */

import { SITE } from "@/lib/site";

import { RpcError } from "./rpc";
import { viewBatch, viewCall, viewCallSafe } from "./rpc";
import type {
  AgentInfo,
  Lifecycle,
  ListingView,
  SellerCreditView,
  TreasuryInfo,
} from "./types";

export const REGISTRY_ID = SITE.registry;

/** Ceiling on how many tokens one enumeration reads. */
export const ENUMERATION_LIMIT = 200;

/** How many of the newest agents also get a treasury balance read. */
const BALANCE_SAMPLE = 12;

/** How many listings get a treasury balance read. */
const LISTING_BALANCE_SAMPLE = 60;

export interface AgentListing {
  info: AgentInfo;
  /** Treasury balance in yoctoNEAR, or `null` when it was not read. */
  balanceYocto: string | null;
}

/** A listing is never shown without its price, so the type carries it. */
export interface ListingAgent extends AgentListing {
  info: AgentInfo & { listing: ListingView };
}

export interface RegistryPage {
  agents: AgentListing[];
  /** Total reserved tokens, including ones outside the read window. */
  total: number;
  truncated: boolean;
}

export interface ListingPage {
  listings: ListingAgent[];
  /** Total reserved tokens, whether listed or not. */
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

/** Sale proceeds the registry owes an account. Never treasury funds. */
export function getSellerCredit(accountId: string): Promise<SellerCreditView> {
  return viewCall(REGISTRY_ID, "seller_credit", { account_id: accountId });
}

export async function getOwnedTokenIds(accountId: string): Promise<string[]> {
  const tokens = await viewCall<Array<{ token_id: string }>>(
    REGISTRY_ID,
    "nft_tokens_for_owner",
    { account_id: accountId, limit: 100 },
  );
  return tokens.map((token) => token.token_id);
}

function idsDescending(total: number, take: number): string[] {
  const ids: string[] = [];
  for (let id = total; id > total - take; id -= 1) ids.push(String(id));
  return ids;
}

async function readAgents(ids: string[]): Promise<AgentListing[]> {
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
  return agents;
}

/** Fills in treasury balances for the first `max` candidates that lack one. */
async function attachBalances(
  agents: Array<AgentListing | ListingAgent>,
  max: number,
): Promise<void> {
  const sample = agents
    .slice(0, max)
    .filter((agent) => agent.info.lifecycle === "ready" && agent.balanceYocto === null);

  if (sample.length === 0) return;

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

/** Newest first, capped at {@link ENUMERATION_LIMIT}. */
export async function listAgents(limit = ENUMERATION_LIMIT): Promise<RegistryPage> {
  const next = await getNextTokenId();
  const total = Math.max(0, Number(next) - 1);
  const take = Math.min(total, limit);

  if (take === 0) return { agents: [], total, truncated: false };

  const agents = await readAgents(idsDescending(total, take));
  await attachBalances(agents, BALANCE_SAMPLE);

  return { agents, total, truncated: total > take };
}

/**
 * Only the agents with a live listing, newest first. Balances are read for the
 * listings themselves — the balance travels with the token, so the price alone
 * is not the whole offer.
 */
export async function listListings(limit = ENUMERATION_LIMIT): Promise<ListingPage> {
  const page = await listAgents(limit);

  const listings = page.agents.filter(
    (agent): agent is ListingAgent => agent.info.listing !== null,
  );

  await attachBalances(listings, LISTING_BALANCE_SAMPLE);

  return { listings, total: page.total, truncated: page.truncated };
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
