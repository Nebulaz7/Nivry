"use client";

import { useEffect, useState } from "react";

import { LifecycleBadge } from "@/components/app/lifecycle-badge";
import { formatNearAmount, formatTokenId } from "@/lib/near/format";
import type { AgentInfo, Lifecycle } from "@/lib/near/types";
import { getAgentInfoSafe, getTreasuryInfo } from "@/lib/near/views";

const POLL_MS = 2500;

const COPY: Record<Lifecycle, string> = {
  provisioning:
    "Creating the treasury account, deploying the wallet and minting the title — one batch, no keys.",
  ready: "Provisioning confirmed. The title exists and the treasury is funded.",
  failed: "Provisioning failed. The deposit returns to the funder.",
  uncertain:
    "The batch landed uncertain. Reconcile before using this agent — it is not safe to assume either outcome.",
};

/** Watches one reserved token until provisioning settles, then reports upward. */
export function ProvisioningCard({
  tokenId,
  name,
  onSettled,
}: {
  tokenId: string;
  name: string;
  onSettled?: () => void;
}) {
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const next = await getAgentInfoSafe(tokenId);
      if (cancelled) return;

      if (next) {
        setInfo(next);

        if (next.lifecycle === "ready") {
          try {
            const treasury = await getTreasuryInfo(next.treasury_account_id);
            if (!cancelled) setBalance(treasury.balance_yocto);
          } catch {
            // The balance is decoration here; the title is the fact.
          }
          onSettled?.();
          return;
        }

        if (next.lifecycle !== "provisioning") {
          onSettled?.();
          return;
        }
      }

      timer = setTimeout(() => void tick(), POLL_MS);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tokenId, onSettled]);

  const lifecycle = info?.lifecycle ?? "provisioning";

  return (
    <div className="border border-accent/30 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[9px] tracking-[0.22em] text-accent">
          RESERVED #{formatTokenId(tokenId)}
        </p>
        <LifecycleBadge lifecycle={lifecycle} />
      </div>

      <h3 className="mt-3 truncate text-[15px] text-mint">{name}</h3>
      <p className="mt-2 max-w-lg text-[12px] leading-relaxed text-mint/40">
        {COPY[lifecycle]}
      </p>

      {lifecycle === "provisioning" ? (
        <div className="mt-4 h-px w-full overflow-hidden bg-mint/10">
          <div className="h-px w-1/3 animate-pulse bg-accent" />
        </div>
      ) : null}

      {balance ? (
        <p className="mt-3 font-mono text-[10px] text-mint/50">
          TREASURY {formatNearAmount(balance)}
        </p>
      ) : null}
    </div>
  );
}
