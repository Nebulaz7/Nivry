import type { Lifecycle } from "@/lib/near/types";

const LABELS: Record<Lifecycle, string> = {
  provisioning: "PROVISIONING",
  ready: "READY",
  failed: "FAILED",
  uncertain: "UNCERTAIN",
};

/**
 * `ready` is the only state where the title exists and the treasury is funded, so
 * it is the only filled chip. Everything else reads as an outline.
 */
export function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  const filled = lifecycle === "ready";

  return (
    <span
      className={[
        "shrink-0 border px-2 py-1 font-mono text-[9px] tracking-[0.18em]",
        filled
          ? "border-accent bg-accent text-void"
          : lifecycle === "provisioning"
            ? "animate-pulse border-accent/40 text-accent"
            : "border-mint/20 text-mint/45",
      ].join(" ")}
    >
      {LABELS[lifecycle]}
    </span>
  );
}
