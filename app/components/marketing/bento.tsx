"use client";

import { useEffect, useRef, useState } from "react";

import { TileVisual } from "./bento-visuals";

type Tile = {
  index: string;
  method: string;
  claim: string;
  proof: string;
  span: string;
};

const TILES: Tile[] = [
  {
    index: "01",
    method: "create_agent()",
    claim: "The treasury has no keys.",
    proof: "ACCESS KEYS",
    span: "md:col-span-2 lg:col-span-3 lg:row-span-2",
  },
  {
    index: "02",
    method: "set_executor()",
    claim: "Spending is capped before it happens.",
    proof: "cap \u00b7 budget \u00b7 \u226490d",
    span: "lg:col-span-3",
  },
  {
    index: "03",
    method: "buy_agent()",
    claim: "A sale revokes the operator.",
    proof: "authority_epoch++",
    span: "lg:col-span-3",
  },
  {
    index: "04",
    method: "wallet_code_hash()",
    claim: "You can check the code yourself.",
    proof: "matches the deployed bytecode",
    span: "lg:col-span-2",
  },
  {
    index: "05",
    method: "expected_version",
    claim: "What you inspect is what you buy.",
    proof: "price \u00b7 version \u00b7 manifest",
    span: "lg:col-span-2",
  },
  {
    index: "06",
    method: "on_dispatch_status()",
    claim: "A failed payout is never guessed at.",
    proof: "status = uncertain",
    span: "lg:col-span-2",
  },
];

/**
 * Six guarantees, each pairing a claim with the contract call that enforces it.
 * The tiles reveal once, staggered, and their visuals arm at the same moment.
 */
export function Bento() {
  const gridRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    setMounted(true);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStarted(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );

    observer.observe(grid);

    return () => observer.disconnect();
  }, []);

  return (
    <section id="guarantees" className="relative border-t border-mint/10 bg-void">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <p className="font-mono text-[11px] tracking-[0.2em] text-accent">
          || guarantees
        </p>

        <h2 className="mt-6 max-w-2xl text-[clamp(1.75rem,3.4vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] text-mint">
          Six things the contract enforces, not the platform.
        </h2>

        <div
          ref={gridRef}
          className="mt-14 grid gap-px border border-mint/12 bg-mint/12 md:grid-cols-2 lg:grid-cols-6"
        >
          {TILES.map((tile, index) => {
            const waiting = mounted && !started;

            return (
              <article
                key={tile.index}
                style={{
                  transitionDelay: started ? `${index * 55}ms` : "0ms",
                }}
                className={`flex min-h-[190px] flex-col bg-void p-6 transition-[opacity,transform] duration-700 ease-out ${
                  tile.span
                } ${waiting ? "translate-y-3 opacity-0" : "translate-y-0 opacity-100"}`}
              >
                <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.18em] text-mint/30">
                  <span>{tile.index}</span>
                  <span className="normal-case tracking-[0.04em] text-mint/25">
                    {tile.method}
                  </span>
                </div>

                <div className="mt-8">
                  <TileVisual id={tile.index} started={started} />
                </div>

                <p className="mt-5 font-mono text-[11px] tracking-[0.04em] text-accent">
                  {tile.proof}
                </p>

                <p className="mt-auto pt-6 text-[15px] leading-snug text-mint">
                  {tile.claim}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
