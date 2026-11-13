import { SITE } from "@/lib/site";

/**
 * The card the pixel portrait resolves into. Content is real deployed state,
 * not invented copy: name, treasury balance, code hash prefix.
 */
export function AgentCard({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="flex h-[62%] w-[88%] flex-col justify-between border border-accent/40 bg-void p-5">
        <span className="font-mono text-[10px] tracking-[0.18em] text-accent">
          {SITE.nep}
        </span>

        <div className="space-y-1">
          <p className="text-[15px] leading-tight text-mint">{SITE.agentName}</p>
          <p className="font-mono text-[22px] leading-none text-mint">
            {SITE.balance}
          </p>
          <p className="truncate font-mono text-[10px] text-mint/40">
            {SITE.codeHash.slice(0, 16)}
          </p>
        </div>
      </div>
    </div>
  );
}
