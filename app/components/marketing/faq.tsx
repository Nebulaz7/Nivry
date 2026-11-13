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
    question: "Is this mainnet?",
    answer:
      "No. nivry.testnet runs unaudited code against a draft standard. Do not put real value in a testnet treasury.",
  },
  {
    question: "What if there is a bug?",
    answer:
      "Assume there is one. The contracts are unaudited, the standard is a draft, and the treasury code hash is published so you can check exactly what you are interacting with.",
  },
];

/** Native disclosure elements: keyboard accessible without a line of JS. */
export function Faq() {
  return (
    <section id="faq" className="border-t border-mint/10 bg-void">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <p className="font-mono text-[11px] tracking-[0.2em] text-accent">
          || faq
        </p>

        <h2 className="mt-6 max-w-2xl text-[clamp(1.75rem,3.4vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] text-mint">
          Six questions worth asking.
        </h2>

        <div className="mt-14 grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <aside className="h-fit border border-mint/15 p-6">
            <p className="font-mono text-[11px] tracking-[0.2em] text-accent">
              || notice
            </p>

            <p className="mt-5 text-[15px] leading-snug text-mint">
              Testnet only.
            </p>

            <p className="mt-3 text-[13px] leading-relaxed text-mint/55">
              Unaudited contracts, a draft standard, and one deployed agent.
              Treat every number on this page as a demonstration, not a promise.
            </p>
          </aside>

          <div>
            {QUESTIONS.map((item, index) => (
              <details
                key={item.question}
                open={index === 0}
                className="faq-item border-b border-mint/10 first:border-t"
              >
                <summary className="flex cursor-pointer items-start justify-between gap-6 py-5 text-[15px] leading-snug text-mint">
                  <span>{item.question}</span>
                  <span
                    aria-hidden
                    className="faq-marker mt-0.5 shrink-0 font-mono text-[14px] text-accent transition-transform duration-200"
                  >
                    +
                  </span>
                </summary>

                <p className="max-w-md pb-6 text-[14px] leading-relaxed text-mint/60">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
