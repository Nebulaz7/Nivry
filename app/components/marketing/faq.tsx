"use client";

import Link from "next/link";
import { useId, useState } from "react";

const QUESTIONS = [
  {
    question: "What do I actually own when I buy one?",
    answer:
      "The token, and through it the treasury account. That is the on-chain identity, the balance and the payment history. It is not the runtime that produced the work.",
  },
  {
    question: "Does the buyer get my prompts and memory?",
    answer:
      "No. The token transfers the title and the treasury. Prompts, memory and the seller's environment never leave their machine, and nothing on-chain can revoke a copy someone already holds.",
  },
  {
    question: "Can I still use the agent after listing it?",
    answer:
      "No. Listing requires the agent to be frozen first, and freezing blocks every outflow. Incoming payments still land, but the wallet cannot spend until you unfreeze.",
  },
  {
    question: "Can I withdraw while a sale is in flight?",
    answer:
      "No. A new withdrawal is rejected while the agent has an unresolved command or transfer call. Wait for it to settle, or delist before starting one.",
  },
  {
    question: "When does this reach mainnet?",
    answer:
      "After the standard is reviewed. Until then the contract runs on testnet, where every agent minted is a live case for the proposal.",
  },
  {
    question: "What if there is a bug?",
    answer:
      "The contracts are unaudited and the treasury code hash is published, so you can check exactly what you are interacting with before you fund anything.",
  },
];

/** One panel open at a time, driven by state so the behaviour is identical everywhere. */
export function Faq() {
  const [open, setOpen] = useState(0);
  const baseId = useId();

  return (
    <section id="faq" className="border-t border-mint/10 bg-void">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <p className="font-mono text-[11px] tracking-[0.2em] text-accent">
          || faq
        </p>

        <h2 className="mt-6 max-w-2xl text-[clamp(1.75rem,3.4vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] text-mint">
        Frequently asked questions
        </h2>

        <div className="mt-14 grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <aside className="h-fit border border-mint/15 p-6">
            <p className="font-mono text-[11px] tracking-[0.2em] text-accent">
              || live now
            </p>

            <p className="mt-5 text-[15px] leading-snug text-mint">
              Live on testnet.
            </p>

            <p className="mt-3 text-[13px] leading-relaxed text-mint/55">
              The standard is still in draft, but the contract is deployed and
              agents can be minted, funded and sold today. What gets built on it
              now is what shapes what ships on mainnet.
            </p>

            <Link
              href="/app"
              className="btn btn-primary btn-sm mt-6 inline-flex"
            >
              Mint an agent
            </Link>
          </aside>

          <div>
            {QUESTIONS.map((item, index) => {
              const isOpen = open === index;
              const buttonId = `${baseId}-q-${index}`;
              const panelId = `${baseId}-a-${index}`;

              return (
                <div
                  key={item.question}
                  className="border-b border-mint/10 first:border-t"
                >
                  <h3>
                    <button
                      type="button"
                      id={buttonId}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpen(isOpen ? -1 : index)}
                      className="flex w-full cursor-pointer items-start justify-between gap-6 py-5 text-left text-[15px] leading-snug text-mint"
                    >
                      <span>{item.question}</span>
                      <span
                        aria-hidden
                        className={`mt-0.5 shrink-0 font-mono text-[14px] text-accent transition-transform duration-200 ${
                          isOpen ? "rotate-45" : ""
                        }`}
                      >
                        +
                      </span>
                    </button>
                  </h3>

                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    inert={!isOpen}
                    className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="max-w-md pb-6 text-[14px] leading-relaxed text-mint/60">
                        {item.answer}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
