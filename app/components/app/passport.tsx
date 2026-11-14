"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CopyValue } from "@/components/app/copy-value";
import { LifecycleBadge } from "@/components/app/lifecycle-badge";
import { AuthorityPanel } from "@/components/app/passport/authority-panel";
import { HistoryPanel } from "@/components/app/passport/history-panel";
import { MarketPanel } from "@/components/app/passport/market-panel";
import { MoneyPanel } from "@/components/app/passport/money-panel";
import { Sigil } from "@/components/app/sigil";
import { explainFailure, messageOf } from "@/lib/near/errors";
import { formatTokenId } from "@/lib/near/format";
import type { SellerCreditView } from "@/lib/near/types";
import { useAgent } from "@/lib/near/use-agent";
import { getListingDeposit, getSellerCredit } from "@/lib/near/views";
import { useWallet, type ContractCall } from "@/lib/near/wallet";

/** One agent: identity, money, authority, market, record. */
export function Passport({ tokenId }: { tokenId: string }) {
  const { accountId, connecting, connect, signAndSend, sendTransfer } = useWallet();
  const { info, treasury, error, refresh } = useAgent(tokenId);

  const [listingDeposit, setListingDeposit] = useState<string | null>(null);
  const [credit, setCredit] = useState<SellerCreditView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refreshAll = useCallback(() => {
    setTick((value) => value + 1);
    refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;

    getListingDeposit()
      .then((value) => {
        if (!cancelled) setListingDeposit(value);
      })
      .catch(() => {
        if (!cancelled) setListingDeposit(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!accountId) return;

    let cancelled = false;

    getSellerCredit(accountId)
      .then((value) => {
        if (!cancelled) setCredit(value);
      })
      .catch(() => {
        if (!cancelled) setCredit(null);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, tick]);

  const attempt = useCallback(
    async (label: string, action: () => Promise<unknown>) => {
      setBusy(label);
      setFailure(null);
      setNotice(null);

      try {
        await action();
        setNotice(`${label} submitted.`);
        refreshAll();
      } catch (cause) {
        setFailure(explainFailure(messageOf(cause)));
      } finally {
        setBusy(null);
      }
    },
    [refreshAll],
  );

  const run = useCallback(
    (label: string, call: ContractCall) => attempt(label, () => signAndSend(call)),
    [attempt, signAndSend],
  );

  const runTransfer = useCallback(
    (label: string, receiverId: string, amount: string) =>
      attempt(label, () => sendTransfer(receiverId, amount)),
    [attempt, sendTransfer],
  );

  const isOwner = accountId !== null && info?.owner_id === accountId;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 sm:px-8">
      <Link
        href="/app"
        className="font-mono text-[9px] tracking-[0.2em] text-dim transition-colors hover:text-accent"
      >
        ← REGISTRY
      </Link>

      {!info && !error ? <PassportSkeleton /> : null}

      {error ? (
        <div className="mt-6 border border-clay/30 px-4 py-3 font-mono text-[11px] text-clay">
          {error}
        </div>
      ) : null}

      {info ? (
        <>
          <header className="mt-4 border border-line bg-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <Sigil seed={info.token_id} size={56} />
                <div>
                  <p className="font-mono text-[9px] tracking-[0.22em] text-accent">
                    AGENT #{formatTokenId(info.token_id)}
                  </p>
                  <h1 className="mt-1 text-[26px] leading-tight text-ink">
                    {info.manifest.name}
                  </h1>
                  <p className="mt-1 font-mono text-[10px] text-dim">
                    {info.manifest.runtime_hint} · {info.manifest.task_kind}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isOwner ? (
                  <span className="border border-accent/35 px-2 py-1 font-mono text-[9px] tracking-[0.16em] text-accent">
                    YOURS
                  </span>
                ) : null}
                <LifecycleBadge lifecycle={info.lifecycle} />
              </div>
            </div>

            <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-[9px] tracking-[0.18em] text-dim/80">
                  OWNER
                </span>
                <span className="truncate font-mono text-[11px] text-ink">
                  {info.owner_id ?? "not minted"}
                </span>
                {info.owner_id ? (
                  <CopyValue value={info.owner_id} label="owner account" />
                ) : null}
              </div>

              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-[9px] tracking-[0.18em] text-dim/80">
                  TREASURY
                </span>
                <span className="truncate font-mono text-[11px] text-ink">
                  {info.treasury_account_id}
                </span>
              </div>
            </div>
          </header>

          {failure ? (
            <p className="mt-4 border border-clay/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-clay">
              {failure}
            </p>
          ) : null}

          {notice ? (
            <p className="mt-4 border border-accent/30 px-3 py-2 font-mono text-[11px] leading-relaxed text-accent">
              {notice}
            </p>
          ) : null}

          {!accountId ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-line bg-panel px-4 py-3">
              <p className="font-mono text-[11px] text-dim">
                Connect a wallet to sign owner actions.
              </p>
              <button
                type="button"
                onClick={() => void connect()}
                disabled={connecting}
                className="btn btn-primary btn-sm"
              >
                {connecting ? "Connecting" : "Connect"}
              </button>
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <MoneyPanel
                info={info}
                treasury={treasury}
                isOwner={isOwner}
                busy={busy}
                run={run}
                runTransfer={runTransfer}
              />
            </div>
            <div className="lg:col-span-3">
              <AuthorityPanel
                info={info}
                isOwner={isOwner}
                busy={busy}
                run={run}
              />
            </div>
          </div>

          <div className="mt-4">
            <MarketPanel
              info={info}
              isOwner={isOwner}
              busy={busy}
              run={run}
              listingDeposit={listingDeposit}
              credit={credit}
            />
          </div>

          <div className="mt-4">
            <HistoryPanel info={info} />
          </div>
        </>
      ) : null}
    </main>
  );
}

function PassportSkeleton() {
  return (
    <div className="mt-4 space-y-4">
      <div className="h-32 animate-pulse border border-line bg-panel" />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="h-64 animate-pulse border border-line bg-panel lg:col-span-2" />
        <div className="h-64 animate-pulse border border-line bg-panel lg:col-span-3" />
      </div>
    </div>
  );
}
