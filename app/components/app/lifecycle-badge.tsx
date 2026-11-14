import type { Lifecycle } from "@/lib/near/types";

const LABELS: Record<Lifecycle, string> = {
  provisioning: "PROVISIONING",
  ready: "READY",
  failed: "FAILED",
  uncertain: "UNCERTAIN",
};

/**
 * Only `ready` is a filled chip: the title exists and the treasury is funded.
 * Everything else is an outline, and the two failure states carry their own hue
 * so they are not mistaken for neutral metadata.
 */
const TONE: Record<Lifecycle, string> = {
  ready: "border-accent bg-accent text-canvas",
  provisioning: "animate-pulse border-sand/45 text-sand",
  failed: "border-clay/45 text-clay",
  uncertain: "border-line text-dim",
};

export function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  return (
    <span
      className={`shrink-0 border px-2 py-1 font-mono text-[9px] tracking-[0.18em] ${TONE[lifecycle]}`}
    >
      {LABELS[lifecycle]}
    </span>
  );
}
