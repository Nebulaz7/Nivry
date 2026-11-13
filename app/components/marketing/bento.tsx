"use client";

import { useEffect, useRef } from "react";

type Tile = {
  index: string;
  method: string;
  claim: string;
  proof: string;
  span: string;
  emphasis?: boolean;
};

const TILES: Tile[] = [
  {
    index: "01",
    method: "create_agent()",
    claim: "The treasury has no keys.",
    proof: "0 ACCESS KEYS",
    span: "md:col-span-2 lg:col-span-3 lg:row-span-2",
    emphasis: true,
  },
  {
    index: "02",
    method: "set_executor()",
    claim: "Spending is capped before it happens.",
    proof: "cap · budget · \u226490d",
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
    proof: "ce3b675e\u2026",
    span: "lg:col-span-2",
  },
  {
    index: "05",
    method: "expected_version",
    claim: "What you inspect is what you buy.",
    proof: "version · manifest",
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
 * Six guarantees, each with the contract call or value that enforces it.
 * Tiles stagger in once, on first intersection.
 */
export function Bento() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const items = Array.from(grid.children) as HTMLElement[];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    items.forEach((item) => {
      item.style.opacity = reduced ? "1" : "0";
      item.style.transform = reduced ? "none" : "translateY(14px)";
      item.style.transition = "opacity 600ms ease-out, transform 600ms ease-out";
    });

    if (reduced) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          items.forEach((item, index) => {
            item.style.transitionDelay = `${index * 55}ms`;
            item.style.opacity = "1";
            item.style.transform = "none";
          });

          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );

    observer.observe(grid);

    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="guarantees"
      className="relative border-t border-mint/10 bg-void"
    >
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
          {TILES.map((tile) => (
            <article
              key={tile.index}
              className={`group flex min-h-[184px] flex-col justify-between bg-void p-6 transition-colors duration-200 hover:bg-mint/[0.03] ${tile.span}`}
            >
              <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.18em] text-mint/30">
                <span>{tile.index}</span>
                <span className="normal-case tracking-[0.04em] text-mint/25">
                  {tile.method}
                </span>
              </div>

              {tile.emphasis ? (
                <div className="my-8">
                  <p className="font-mono text-[clamp(4.5rem,11vw,8rem)] leading-[0.8] text-accent">
                    0
                  </p>
                  <p className="mt-4 font-mono text-[10px] tracking-[0.22em] text-mint/40">
                    {tile.proof}
                  </p>
                </div>
              ) : (
                <p className="mt-8 font-mono text-[12px] tracking-[0.04em] text-accent">
                  {tile.proof}
                </p>
              )}

              <p className="mt-6 text-[15px] leading-snug text-mint">
                {tile.claim}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
