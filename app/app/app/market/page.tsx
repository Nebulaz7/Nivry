"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { MarketCard } from "@/components/app/market-card";
import { buyAgent } from "@/lib/near/actions";
import { explainFailure, messageOf } from "@/lib/near/errors";
import { formatCount } from "@/lib/near/format";
import {
  getAgentInfo,
  listListings,
  type ListingAgent,
  type ListingPage,
} from "@/lib/near/views";
import { useWallet } from "@/lib/near/wallet";

interface Pending {
  tokenId: string;
  phase: "checking" | "signing";
}

export default function MarketPage() {
  const { accountId, signAndSend } = useWallet();

  const [page, setPage] = useState<ListingPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    listListings()
      .then((value) => {
        if (cancelled) return;
        setPage(value);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageOf(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [revision]);

  const buy = useCallback(
    async (listing: ListingAgent) => {
      const tokenId = listing.info.token_id;
      const seen = listing.info.listing;

      setFailure(null);
      setNotice(null);
      setPending({ tokenId, phase: "checking" });

      try {
        // The purchase is only safe against state read now, not state rendered
        // a minute ago.
        const fresh = await getAgentInfo(tokenId);
        const live = fresh.listing;

        if (!live) throw new Error("This agent is no longer listed.");
        if (live.listing_id !== seen.listing_id) {
          throw new Error("The listing was replaced. The page has been refreshed.");
        }
        if (fresh.version !== live.version) {
          throw new Error(
            "The seller changed this agent after listing, so the price no longer binds the state. It has to be relisted.",
          );
        }
        if (live.manifest_hash !== seen.manifest_hash) {
          throw new Error("The listed manifest is not the one you inspected.");
        }

        setPending({ tokenId, phase: "signing" });

        await signAndSend(
          buyAgent(
            tokenId,
            live.listing_id,
            fresh.version,
            live.manifest_hash,
            live.price_yocto,
          ),
        );

        setNotice(`Agent #${tokenId} is yours. The treasury came with it.`);
      } catch (cause) {
        setFailure(explainFailure(messageOf(cause)));
      } finally {
        setPending(null);
        refresh();
      }
    },
    [signAndSend, refresh],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] tracking-[0.24em] text-accent">MARKET</p>
          <h1 className="mt-2 text-[30px] leading-none text-ink">For sale</h1>
        </div>

        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-dim">
            {page ? `${formatCount(page.listings.length)} LISTED` : "…"}
          </span>
          <button
            type="button"
            onClick={refresh}
            className="font-mono text-[9px] tracking-[0.16em] text-dim transition-colors hover:text-accent"
          >
            REFRESH
          </button>
        </div>
      </header>

      <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-dim">
        Every listing is a live agent. The title, the treasury and the authority
        move in one receipt.
      </p>

      {failure ? (
        <p className="mt-5 border border-clay/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-clay">
          {failure}
        </p>
      ) : null}

      {notice ? (
        <p className="mt-5 border border-accent/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-accent">
          {notice}
        </p>
      ) : null}

      {error ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-clay/30 px-4 py-3">
          <p className="font-mono text-[11px] leading-relaxed text-clay">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="btn btn-secondary btn-sm shrink-0"
          >
            Try again
          </button>
        </div>
      ) : null}

      {!page && !error ? <SkeletonGrid /> : null}

      {page && page.listings.length === 0 ? (
        <div className="mt-6 border border-dashed border-line px-5 py-12 text-center">
          <p className="text-[13px] text-dim">Nothing is listed yet.</p>
          <Link
            href="/app"
            className="mt-3 inline-block font-mono text-[10px] tracking-[0.16em] text-accent transition-colors hover:text-ink"
          >
            LOCK AND LIST AN AGENT →
          </Link>
        </div>
      ) : null}

      {page && page.listings.length > 0 ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {page.listings.map((listing) => (
            <MarketCard
              key={listing.info.token_id}
              listing={listing}
              accountId={accountId}
              pending={pending}
              onBuy={buy}
            />
          ))}
        </div>
      ) : null}

      {page?.truncated ? (
        <p className="mt-4 font-mono text-[10px] text-dim/70">
          Showing listings among the newest {formatCount(page.listings.length)} of{" "}
          {formatCount(page.total)} agents.
        </p>
      ) : null}
    </main>
  );
}

function SkeletonGrid() {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          className="h-[248px] animate-pulse border border-line bg-panel"
        />
      ))}
    </div>
  );
}
