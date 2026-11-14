"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AgentCard } from "@/components/app/agent-card";
import { ConnectPanel } from "@/components/app/connect-panel";
import { MintModal } from "@/components/app/mint-modal";
import { ProvisioningCard } from "@/components/app/provisioning-card";
import { Stat } from "@/components/app/stat";
import { messageOf } from "@/lib/near/errors";
import { formatCount, formatNear } from "@/lib/near/format";
import {
  getProvisioningCost,
  getWalletCodeHash,
  listAgents,
  type RegistryPage,
} from "@/lib/near/views";
import { useWallet } from "@/lib/near/wallet";

interface TrackedAgent {
  tokenId: string;
  name: string;
}

export default function DashboardPage() {
  const { accountId, connect, connecting, ready } = useWallet();

  const [page, setPage] = useState<RegistryPage | null>(null);
  const [cost, setCost] = useState<string | null>(null);
  const [codeHash, setCodeHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mintOpen, setMintOpen] = useState(false);
  const [tracked, setTracked] = useState<TrackedAgent[]>([]);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setRevision((value) => value + 1);
  }, []);
  const closeModal = useCallback(() => setMintOpen(false), []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([listAgents(), getProvisioningCost(), getWalletCodeHash()])
      .then(([registryPage, provisioningCost, hash]) => {
        if (cancelled) return;
        setPage(registryPage);
        setCost(provisioningCost);
        setCodeHash(hash);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(messageOf(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [revision]);

  const handleReserved = useCallback((tokenId: string, name: string) => {
    setTracked((current) => [
      { tokenId, name },
      ...current.filter((item) => item.tokenId !== tokenId),
    ]);
  }, []);

  // Owned agents first, everything else in the contract's order.
  const agents = useMemo(() => {
    const list = page?.agents ?? [];
    if (!accountId) return list;
    return [...list].sort(
      (a, b) =>
        Number(b.info.owner_id === accountId) - Number(a.info.owner_id === accountId),
    );
  }, [page, accountId]);

  const mineCount = useMemo(
    () =>
      accountId === null
        ? 0
        : agents.filter((agent) => agent.info.owner_id === accountId).length,
    [agents, accountId],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] tracking-[0.24em] text-accent">
            REGISTRY
          </p>
          <h1 className="mt-2 text-[30px] leading-none text-ink">Agents</h1>
        </div>

        {accountId ? (
          <button
            type="button"
            onClick={() => setMintOpen(true)}
            className="btn btn-primary"
          >
            Mint agent
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void connect()}
            disabled={connecting}
            className="btn btn-primary"
          >
            {connecting ? "Connecting" : "Connect wallet"}
          </button>
        )}
      </header>

      <div className="mt-8 grid grid-cols-2 gap-y-4 border-y border-line py-2 sm:grid-cols-4">
        <Stat
          label="AGENTS"
          value={loading && !page ? "—" : formatCount(page?.total ?? 0)}
        />
        <Stat
          label="YOURS"
          value={!ready ? "—" : accountId ? formatCount(mineCount) : "—"}
        />
        <Stat label="MINT COST" value={cost ? `${formatNear(cost)} NEAR` : "—"} />
        <Stat
          label="WALLET CODE"
          value={codeHash ? codeHash.slice(0, 8) : "—"}
        />
      </div>

      {tracked.length > 0 ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {tracked.map((item) => (
            <ProvisioningCard
              key={item.tokenId}
              tokenId={item.tokenId}
              name={item.name}
              onSettled={refresh}
            />
          ))}
        </div>
      ) : null}

      {!accountId && ready ? (
        <div className="mt-8">
          <ConnectPanel />
        </div>
      ) : null}

      {error ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border border-clay/30 px-4 py-3">
          <p className="font-mono text-[11px] leading-relaxed text-clay">
            {error}
          </p>
          <button
            type="button"
            onClick={refresh}
            className="btn btn-secondary btn-sm shrink-0"
          >
            Try again
          </button>
        </div>
      ) : null}

      <section className="mt-12">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-mono text-[9px] tracking-[0.22em] text-dim">
            ALL AGENTS
          </h2>
          <button
            type="button"
            onClick={refresh}
            className="font-mono text-[9px] tracking-[0.16em] text-dim transition-colors hover:text-accent"
          >
            REFRESH
          </button>
        </div>

        {loading && !page ? <SkeletonGrid /> : null}

        {!loading && agents.length === 0 ? (
          <div className="mt-4 border border-dashed border-line px-5 py-10 text-center">
            <p className="text-[13px] text-dim">No agents yet.</p>
          </div>
        ) : null}

        {agents.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.info.token_id}
                agent={agent}
                owned={accountId !== null && agent.info.owner_id === accountId}
              />
            ))}
          </div>
        ) : null}

        {page?.truncated ? (
          <p className="mt-4 font-mono text-[10px] text-dim/80">
            Showing the newest {formatCount(agents.length)} of{" "}
            {formatCount(page.total)}.
          </p>
        ) : null}
      </section>

      <MintModal
        open={mintOpen}
        onClose={closeModal}
        onReserved={handleReserved}
      />
    </main>
  );
}

function SkeletonGrid() {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((key) => (
        <div
          key={key}
          className="h-[172px] animate-pulse border border-line bg-panel"
        />
      ))}
    </div>
  );
}
