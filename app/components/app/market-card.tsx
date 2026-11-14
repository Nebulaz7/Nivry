"use client";

import Link from "next/link";

import { LifecycleBadge } from "@/components/app/lifecycle-badge";
import { Sigil } from "@/components/app/sigil";
import {
  formatNear,
  formatNearAmount,
  formatTokenId,
  shorten,
} from "@/lib/near/format";
import type { ListingAgent } from "@/lib/near/views";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] tracking-[0.18em] text-dim/80">{label}</dt>
      <dd className="mt-1 font-mono text-[13px] text-ink">{value}</dd>
    </div>
  );
}

export function MarketCard({
  listing,
  accountId,
  pending,
  onBuy,
}: {
  listing: ListingAgent;
  accountId: string | null;
  pending: { tokenId: string; phase: "checking" | "signing" } | null;
  onBuy: (listing: ListingAgent) => void;
}) {
  const { info } = listing;
  const sale = info.listing;
  const isMine = accountId !== null && accountId === sale.seller;
  const isPending = pending?.tokenId === info.token_id;

  const blocked = !accountId || isMine || pending !== null;

  const label = isPending
    ? pending.phase === "checking"
      ? "Checking"
      : "Signing"
    : isMine
      ? "Your listing"
      : !accountId
        ? "Connect to buy"
        : "Buy";

  return (
    <article className="flex flex-col border border-line bg-panel p-5 transition-colors duration-150 hover:border-accent/35">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Sigil seed={info.token_id} />
          <div className="min-w-0">
            <Link
              href={`/app/agent/${info.token_id}`}
              className="font-mono text-[9px] tracking-[0.2em] text-accent/70 transition-colors hover:text-accent"
            >
              AGENT #{formatTokenId(info.token_id)}
            </Link>
            <h3 className="mt-1 truncate text-[15px] leading-tight text-ink">
              {info.manifest.name}
            </h3>
          </div>
        </div>
        <LifecycleBadge lifecycle={info.lifecycle} />
      </div>

      <p className="mt-4 font-mono text-[24px] leading-none text-sand">
        {formatNear(sale.price_yocto)}
        <span className="ml-2 text-[11px] text-dim">NEAR</span>
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
        <Metric
          label="TREASURY"
          value={listing.balanceYocto ? formatNearAmount(listing.balanceYocto) : "—"}
        />
        <Metric label="VERSION" value={String(sale.version)} />
      </dl>

      <p className="mt-3 truncate font-mono text-[10px] text-dim">
        SELLER {shorten(sale.seller, 10, 6)}
      </p>

      <button
        type="button"
        disabled={blocked}
        onClick={() => onBuy(listing)}
        className="btn btn-primary btn-sm mt-4 w-full"
      >
        {label}
      </button>

      <p className="mt-2 font-mono text-[10px] leading-relaxed text-dim/80">
        {isMine
          ? "Manage this listing on the passport."
          : !accountId
            ? "Connect a wallet to sign the purchase."
            : "Re-reads the agent and aborts if the version or manifest moved."}
      </p>
    </article>
  );
}
