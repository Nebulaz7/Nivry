/**
 * Descriptors for every mutating registry call the app makes.
 *
 * Deposits are exact, not approximate: `set_frozen` and `nft_transfer` require
 * exactly 1 yoctoNEAR, `list_agent` requires the published listing deposit, and
 * the non-payable methods reject anything attached.
 */

import type { ContractCall } from "./wallet";
import { REGISTRY_ID } from "./views";

const ONE_YOCTO = "1";
const ZERO = "0";

export interface GrantInput {
  executorId: string;
  recipients: string[];
  perPaymentCapYocto: string;
  totalBudgetYocto: string;
  expiresAtNs: string;
}

export function setFrozen(
  tokenId: string,
  version: number,
  frozen: boolean,
): ContractCall {
  return {
    receiverId: REGISTRY_ID,
    methodName: "set_frozen",
    args: { token_id: tokenId, expected_version: version, frozen },
    deposit: ONE_YOCTO,
  };
}

export function listAgent(
  tokenId: string,
  version: number,
  priceYocto: string,
  listingDeposit: string,
): ContractCall {
  return {
    receiverId: REGISTRY_ID,
    methodName: "list_agent",
    args: { token_id: tokenId, expected_version: version, price: priceYocto },
    deposit: listingDeposit,
  };
}

export function cancelListing(tokenId: string, listingId: number): ContractCall {
  return {
    receiverId: REGISTRY_ID,
    methodName: "cancel_listing",
    args: { token_id: tokenId, listing_id: listingId },
    deposit: ZERO,
  };
}

export function setExecutor(
  tokenId: string,
  epoch: number,
  grant: GrantInput,
): ContractCall {
  return {
    receiverId: REGISTRY_ID,
    methodName: "set_executor",
    args: {
      token_id: tokenId,
      expected_epoch: epoch,
      grant: {
        executor_id: grant.executorId,
        recipients: grant.recipients,
        per_payment_cap: grant.perPaymentCapYocto,
        total_budget: grant.totalBudgetYocto,
        expires_at_ns: grant.expiresAtNs,
      },
    },
    deposit: ZERO,
  };
}

export function revokeExecutor(tokenId: string, epoch: number): ContractCall {
  return {
    receiverId: REGISTRY_ID,
    methodName: "revoke_executor",
    args: { token_id: tokenId, expected_epoch: epoch },
    deposit: ZERO,
  };
}

export function ownerWithdraw(
  tokenId: string,
  epoch: number,
  nonce: number,
  recipient: string,
  amountYocto: string,
): ContractCall {
  return {
    receiverId: REGISTRY_ID,
    methodName: "owner_withdraw",
    args: {
      token_id: tokenId,
      expected_epoch: epoch,
      nonce,
      recipient,
      amount: amountYocto,
    },
    deposit: ZERO,
  };
}

export function withdrawSaleProceeds(amountYocto: string): ContractCall {
  return {
    receiverId: REGISTRY_ID,
    methodName: "withdraw_sale_proceeds",
    args: { amount: amountYocto },
    deposit: ZERO,
  };
}

export function transferTitle(tokenId: string, receiverId: string): ContractCall {
  return {
    receiverId: REGISTRY_ID,
    methodName: "nft_transfer",
    args: {
      receiver_id: receiverId,
      token_id: tokenId,
      approval_id: null,
      memo: null,
    },
    deposit: ONE_YOCTO,
  };
}

/** Nanosecond timestamp `days` from now, clamped under the contract's 90-day cap. */
export function expiryFromDays(days: number): string {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 89);
  const now = BigInt(Date.now()) * BigInt(1_000_000);
  return (now + BigInt(safeDays) * BigInt(86_400_000_000_000)).toString();
}
