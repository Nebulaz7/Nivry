import type { ReactNode } from "react";

import type { ContractCall } from "@/lib/near/wallet";

export type RunAction = (label: string, call: ContractCall) => Promise<void>;

export const INPUT =
  "w-full border border-line bg-canvas px-2.5 py-2 font-mono text-[12px] text-ink placeholder:text-dim/40 transition-colors focus:border-accent focus:outline-none";

export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-line bg-panel ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="font-mono text-[9px] tracking-[0.22em] text-dim">{title}</h2>
        {aside}
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

const TONE = {
  ink: "text-ink",
  accent: "text-accent",
  sand: "text-sand",
  clay: "text-clay",
  dim: "text-dim",
} as const;

export function Data({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: ReactNode;
  tone?: keyof typeof TONE;
}) {
  return (
    <div>
      <dt className="font-mono text-[9px] tracking-[0.18em] text-dim/80">{label}</dt>
      <dd className={`mt-1 break-all font-mono text-[13px] ${TONE[tone]}`}>{value}</dd>
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 font-mono text-[9px] tracking-[0.18em] text-dim/80">
      {children}
    </p>
  );
}

export function Reason({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 font-mono text-[10px] leading-relaxed text-dim/80">{children}</p>
  );
}
