"use client";

import { useEffect, useRef } from "react";

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

type Started = { started: boolean };

export function TileVisual({ id, started }: { id: string; started: boolean }) {
  switch (id) {
    case "01":
      return <KeyCount started={started} />;
    case "02":
      return <CapGauge started={started} />;
    case "03":
      return <EpochShift started={started} />;
    case "04":
      return <HashScan started={started} />;
    case "05":
      return <AtomicChecks started={started} />;
    case "06":
      return <SettleHalt started={started} />;
    default:
      return null;
  }
}

/** 45 keys, then none. The number itself is the argument. */
function KeyCount({ started }: Started) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const from = 45;
    const to = 0;

    if (!started) {
      node.textContent = String(from);
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.textContent = String(to);
      return;
    }

    let frame = 0;
    const duration = 1300;
    const begin = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - begin) / duration);
      const eased = 1 - (1 - progress) ** 3;

      node.textContent = String(Math.round(from + (to - from) * eased));

      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [started]);

  return (
    <span
      ref={ref}
      className="block font-mono text-[clamp(4.5rem,11vw,8rem)] leading-[0.8] tabular-nums text-accent"
    >
      45
    </span>
  );
}

/** Spending fills to a cap, then stops. It never reaches the end of the bar. */
function CapGauge({ started }: Started) {
  return (
    <div className="relative h-[2px] w-full bg-mint/15">
      <div
        className="absolute inset-0 origin-left bg-accent"
        style={{
          transform: started ? "scaleX(0.66)" : "scaleX(0)",
          transition: `transform 800ms ${EASE}`,
        }}
      />
      <div
        className="absolute -top-[3px] left-[66%] h-2 w-px bg-mint/60"
        style={{
          opacity: started ? 1 : 0,
          transition: "opacity 300ms 700ms linear",
        }}
      />
    </div>
  );
}

/** The old authority is struck through; the new one arrives. */
function EpochShift({ started }: Started) {
  return (
    <div className="flex items-center gap-3 font-mono text-[13px]">
      <span className="relative text-mint/45">
        epoch 01
        <span
          className="absolute left-0 top-1/2 h-px w-full origin-left bg-mint/70"
          style={{
            transform: started ? "scaleX(1)" : "scaleX(0)",
            transition: `transform 380ms 150ms ${EASE}`,
          }}
        />
      </span>

      <span aria-hidden className="text-mint/25">
        &rarr;
      </span>

      <span
        className="text-accent"
        style={{
          opacity: started ? 1 : 0,
          transition: "opacity 300ms 520ms linear",
        }}
      >
        epoch 02
      </span>
    </div>
  );
}

/** A scan crosses the hash and resolves into a check drawn stroke by stroke. */
function HashScan({ started }: Started) {
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden">
        <span className="font-mono text-[13px] tracking-[0.02em] text-accent">
          ce3b675e2b3d9ab5
        </span>
        <span
          className="pointer-events-none absolute inset-y-0 w-6 bg-accent/25"
          style={{
            left: started ? "100%" : "-1.5rem",
            transition: `left 800ms 100ms ${EASE}`,
          }}
        />
      </div>

      <svg
        aria-hidden
        width="12"
        height="12"
        viewBox="0 0 12 12"
        className="block"
      >
        <path
          d="M2 6.5 L5 9.5 L10 3"
          fill="none"
          stroke="#34d399"
          strokeWidth="1.4"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={started ? 0 : 1}
          style={{ transition: `stroke-dashoffset 420ms 880ms ${EASE}` }}
        />
      </svg>
    </div>
  );
}

/** Price, version and manifest all have to line up. */
function AtomicChecks({ started }: Started) {
  const checks = ["price", "version", "manifest"];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] text-mint/50">
      {checks.map((label, index) => (
        <span key={label} className="flex items-center gap-1.5">
          <svg aria-hidden width="10" height="10" viewBox="0 0 10 10">
            <path
              d="M1 5.5 L3.6 8.2 L9 2.4"
              fill="none"
              stroke="#34d399"
              strokeWidth="1.4"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={started ? 0 : 1}
              style={{
                transition: `stroke-dashoffset 380ms ${260 + index * 170}ms ${EASE}`,
              }}
            />
          </svg>
          {label}
        </span>
      ))}
    </div>
  );
}

/** The payout travels, stops short, and stays unresolved. */
function SettleHalt({ started }: Started) {
  return (
    <div className="relative h-[2px] w-full bg-mint/15">
      <div
        className="absolute inset-0"
        style={{
          transform: started ? "translateX(66%)" : "translateX(0)",
          transition: `transform 800ms ${EASE}`,
        }}
      >
        <span className="absolute -top-[3px] left-0 h-2 w-2 rounded-full bg-accent" />
      </div>

      <div
        className="absolute -top-[3px] left-[66%] h-2 w-px bg-mint/60"
        style={{
          opacity: started ? 1 : 0,
          transition: "opacity 300ms 700ms linear",
        }}
      />
    </div>
  );
}
