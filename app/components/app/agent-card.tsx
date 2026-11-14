import Link from "next/link";

import { LifecycleBadge } from "@/components/app/lifecycle-badge";
import { Sigil } from "@/components/app/sigil";
import { formatNearAmount, formatTokenId, shorten } from "@/lib/near/format";
import type { AgentListing } from "@/lib/near/views";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[9px] tracking-[0.18em] text-dim/80">{label}</dt>
      <dd className="mt-1 font-mono text-[13px] text-ink">{value}</dd>
    </div>
  );
}

type Tone = "accent" | "sand" | "dim";

const CHIP_TONE: Record<Tone, string> = {
  accent: "border-accent/30 text-accent/90",
  sand: "border-sand/35 text-sand/90",
  dim: "border-line text-dim",
};

function Chip({ tone = "accent", children }: { tone?: Tone; children: string }) {
  return (
    <span
      className={`border px-1.5 py-0.5 font-mono text-[9px] tracking-[0.16em] ${CHIP_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

export function AgentCard({
  agent,
  owned,
}: {
  agent: AgentListing;
  owned: boolean;
}) {
  const { info, balanceYocto } = agent;
  // Older agents fall outside the balance sample; `—` is honest, `0` is not.
  const balance = balanceYocto === null ? "—" : formatNearAmount(balanceYocto);

  return (
    <Link
      href={`/app/agent/${info.token_id}`}
      className={[
        "group block border bg-panel p-5 transition-colors duration-150",
        owned
          ? "border-accent/30 hover:border-accent/60"
          : "border-line hover:border-accent/45",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Sigil seed={info.token_id} />
          <div className="min-w-0">
            <p className="font-mono text-[9px] tracking-[0.2em] text-accent/70 transition-colors group-hover:text-accent">
              AGENT #{formatTokenId(info.token_id)}
            </p>
            <h3 className="mt-1 truncate text-[15px] leading-tight text-ink">
              {info.manifest.name}
            </h3>
          </div>
        </div>
        <LifecycleBadge lifecycle={info.lifecycle} />
      </div>

      <p className="mt-4 truncate font-mono text-[10px] text-dim/80">
        {shorten(info.treasury_account_id, 10, 6)}
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
        <Metric label="BALANCE" value={balance} />
        <Metric label="VERSION" value={String(info.version)} />
        <Metric label="EPOCH" value={String(info.authority_epoch)} />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {owned ? <Chip>YOURS</Chip> : null}
        {info.frozen ? <Chip tone="sand">LOCKED</Chip> : null}
        {info.listing ? (
          <Chip tone="sand">{`FOR SALE ${formatNearAmount(info.listing.price_yocto)}`}</Chip>
        ) : null}
        {info.executor_grant ? <Chip>EXECUTOR</Chip> : null}
        {info.pending_operation ? <Chip tone="dim">SETTLING</Chip> : null}
      </div>
    </Link>
  );
}
