"use client";

import { SITE } from "@/lib/site";
import { useInView } from "@/lib/use-in-view";

import { TwinkleStars } from "./twinkle-stars";

const STAGES = ["draft", "discussion", "pull request", "review", "accepted"];

const FACTS = [
  {
    index: "01",
    method: "agent_info()",
    body: "One view tells a wallet who controls the agent and what it may spend.",
  },
  {
    index: "02",
    method: "expected_version",
    body: "A buyer verifies the state they inspected before signing anything.",
  },
  {
    index: "03",
    method: "agent_owner_changed",
    body: "NEP-297 events give indexers the full ownership history.",
  },
];

/** The standard itself: black sky, no chrome, and a live review bar. */
export function Standard() {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const last = STAGES.length - 1;
  const reached = Math.min(SITE.nepStage, last);

  return (
    <section
      id="standard"
      data-hide-nav
      className="relative overflow-hidden bg-black"
    >
      <TwinkleStars count={240} drift={6} />

      <div
        ref={ref}
        className="relative z-10 mx-auto max-w-6xl px-5 py-28 sm:px-8 sm:py-32"
      >
        <p className="font-mono text-[11px] tracking-[0.2em] text-accent">
          || standard
        </p>

        <h2 className="mt-6 max-w-2xl text-[clamp(1.75rem,3.4vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] text-mint">
          A standard anyone can adopt.
        </h2>

        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-mint/60">
          {SITE.nep} extends NEP-171 instead of replacing it. Any agent NFT can
          expose the same interface and emit the same events, and existing
          wallets and marketplaces keep working.
        </p>

        <div className="mt-16 grid gap-px border border-mint/12 bg-mint/12 md:grid-cols-3">
          {FACTS.map((fact) => (
            <div key={fact.index} className="bg-black p-6">
              <span className="font-mono text-[10px] tracking-[0.18em] text-mint/30">
                {fact.index}
              </span>
              <p className="mt-6 font-mono text-[12px] text-accent">
                {fact.method}
              </p>
              <p className="mt-3 text-[14px] leading-snug text-mint/65">
                {fact.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-20 border-t border-mint/12 pt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] text-accent">
                || status
              </p>
              <p className="mt-2 font-mono text-[11px] text-mint/40">
                near/NEPs · {SITE.nep}
              </p>
            </div>

            <a
              href={SITE.nepPr}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
            >
              Read the pull request
            </a>
          </div>

          <div className="relative mt-10 h-[2px] w-full bg-mint/12">
            <div
              className="absolute inset-0 origin-left bg-accent"
              style={{
                transform: inView
                  ? `scaleX(${reached / last})`
                  : "scaleX(0)",
                transition: "transform 900ms cubic-bezier(.2,.8,.2,1)",
              }}
            />

            {STAGES.map((stage, index) => (
              <span
                key={stage}
                className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  index === reached ? "animate-pulse motion-reduce:animate-none" : ""
                }`}
                style={{
                  left: `${(index / last) * 100}%`,
                  backgroundColor:
                    index <= reached ? "#34d399" : "rgba(209, 250, 229, 0.18)",
                }}
              />
            ))}
          </div>

          <div className="mt-5 grid grid-cols-5 gap-2 font-mono text-[9px] uppercase tracking-[0.12em] sm:text-[10px]">
            {STAGES.map((stage, index) => (
              <span
                key={stage}
                className={
                  index === reached
                    ? "text-accent"
                    : index < reached
                      ? "text-mint/55"
                      : "text-mint/25"
                }
              >
                {stage}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
