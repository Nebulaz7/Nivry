"use client";

type Started = { started: boolean };

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Provisioning is asynchronous: the id exists before the title does. */
export function MintFlow({ started }: Started) {
  const stages = ["reserved", "created", "funded", "ready"];

  return (
    <div>
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.16em]">
        {stages.map((stage, index) => (
          <span
            key={stage}
            className={index === stages.length - 1 ? "text-accent" : "text-mint/45"}
            style={{
              opacity: started ? 1 : 0.25,
              transition: `opacity 300ms ${140 + index * 240}ms linear`,
            }}
          >
            {stage}
          </span>
        ))}
      </div>

      <div className="relative mt-4 h-[2px] w-full bg-mint/12">
        <div
          className="absolute inset-0 origin-left bg-accent"
          style={{
            transform: started ? "scaleX(1)" : "scaleX(0)",
            transition: `transform 1100ms ${EASE}`,
          }}
        />

        {stages.map((stage, index) => (
          <span
            key={stage}
            className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
            style={{
              left: `${(index / (stages.length - 1)) * 100}%`,
              opacity: started ? 1 : 0,
              transition: `opacity 200ms ${200 + index * 240}ms linear`,
            }}
          />
        ))}
      </div>

      <div className="mt-6 flex items-baseline gap-2 font-mono">
        <span className="text-[24px] leading-none text-mint">3.03</span>
        <span className="text-[11px] text-mint/40">NEAR · one receipt</span>
      </div>
    </div>
  );
}

/** Spending fills to a limit, then the whole budget is revoked. */
export function GrantBudget({ started }: Started) {
  return (
    <div>
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-mint/40">
        <span>budget</span>
        <span>cap per payment</span>
      </div>

      <div className="relative mt-4 h-6 w-full bg-mint/10">
        <div
          className="absolute inset-y-0 left-0 bg-accent/85"
          style={{
            width: started ? "42%" : "0%",
            transition: `width 620ms 150ms ${EASE}`,
          }}
        />
        <span
          className="absolute inset-y-0 left-[42%] w-px bg-mint/60"
          style={{
            opacity: started ? 1 : 0,
            transition: "opacity 250ms 900ms linear",
          }}
        />
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-[11px]">
        <span
          className="text-accent"
          style={{
            opacity: started ? 1 : 0.15,
            transition: "opacity 300ms 900ms linear",
          }}
        >
          frozen
        </span>
        <span
          className="text-mint/40"
          style={{
            opacity: started ? 1 : 0.15,
            transition: "opacity 300ms 1200ms linear",
          }}
        >
          revoked in one call
        </span>
      </div>
    </div>
  );
}

/** The listing pins a version; a mismatch aborts the purchase. */
export function VersionCheck({ started }: Started) {
  return (
    <div>
      <div className="flex items-center gap-3 font-mono text-[11px]">
        <span className="border border-mint/20 px-2 py-1 text-mint/60">
          listed v3
        </span>

        <span className="relative h-px flex-1 bg-mint/20">
          <span
            className="absolute inset-0 origin-left bg-accent"
            style={{
              transform: started ? "scaleX(1)" : "scaleX(0)",
              transition: `transform 500ms 200ms ${EASE}`,
            }}
          />
        </span>

        <span className="border border-mint/20 px-2 py-1 text-mint/60">
          current v4
        </span>
      </div>

      <p
        className="mt-6 font-mono text-[11px] text-accent"
        style={{
          opacity: started ? 1 : 0,
          transition: "opacity 300ms 900ms linear",
        }}
      >
        mismatch · purchase aborted
      </p>
    </div>
  );
}
