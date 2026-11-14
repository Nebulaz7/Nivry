import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
}) {
  return (
    <div className="border-l border-line px-4 py-3 first:border-l-0 first:pl-0">
      <p className="font-mono text-[9px] tracking-[0.22em] text-dim">{label}</p>
      <p className="mt-1.5 font-mono text-[19px] leading-none text-ink">{value}</p>
      {detail ? (
        <p className="mt-1.5 font-mono text-[10px] text-dim/80">{detail}</p>
      ) : null}
    </div>
  );
}
