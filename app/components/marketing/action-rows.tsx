"use client";

import type { ComponentType } from "react";

import { useInView } from "@/lib/use-in-view";

import { GrantBudget, MintFlow, VersionCheck } from "./action-visuals";

type Row = {
  step: string;
  title: string;
  body: string;
  detail: string;
  Visual: ComponentType<{ started: boolean }>;
};

const ROWS: Row[] = [
  {
    step: "01 / mint",
    title: "Mint the agent.",
    body: "One payable call creates the account, deploys the treasury and mints the title. The token id exists before the title does, so it shows as provisioning until the receipt lands.",
    detail: "3.03 NEAR · one receipt · no key actions",
    Visual: MintFlow,
  },
  {
    step: "02 / operate",
    title: "Give it a budget.",
    body: "An executor spends inside a cap, an allowlist and an expiry. Revoking it bumps the authority epoch, so nothing outstanding survives the change.",
    detail: "cap · allowlist · expiry",
    Visual: GrantBudget,
  },
  {
    step: "03 / sell",
    title: "Sell without a backdoor.",
    body: "The listing pins the version and the manifest hash. If either of them moved before the buyer signs, the purchase aborts instead of settling.",
    detail: "expected_version · expected_manifest_hash",
    Visual: VersionCheck,
  },
];

function ActionRow({ row, index }: { row: Row; index: number }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);
  const reversed = index % 2 === 1;
  const { Visual } = row;

  return (
    <div
      ref={ref}
      className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
    >
      <div className={reversed ? "lg:order-2" : ""}>
        <p className="font-mono text-[11px] tracking-[0.2em] text-accent">
          {row.step}
        </p>

        <h3 className="mt-4 text-[clamp(1.5rem,3vw,2.1rem)] font-medium leading-[1.1] tracking-[-0.02em] text-mint">
          {row.title}
        </h3>

        <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-mint/60">
          {row.body}
        </p>

        <p className="mt-6 font-mono text-[11px] tracking-[0.04em] text-mint/35">
          {row.detail}
        </p>
      </div>

      <div
        className={`relative border border-mint/12 p-6 sm:p-8 ${
          reversed ? "lg:order-1" : ""
        }`}
      >
        <Visual started={inView} />
      </div>
    </div>
  );
}

/** Three verbs, alternating sides, each paired with the state it produces. */
export function ActionRows() {
  return (
    <section id="action" className="border-t border-mint/10 bg-void">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
        <p className="font-mono text-[11px] tracking-[0.2em] text-accent">
          || in practice
        </p>

        <h2 className="mt-6 max-w-2xl text-[clamp(1.75rem,3.4vw,2.5rem)] font-medium leading-[1.1] tracking-[-0.02em] text-mint">
          Three calls. That is the whole lifecycle.
        </h2>

        <div className="mt-16 space-y-24 sm:mt-20 sm:space-y-32">
          {ROWS.map((row, index) => (
            <ActionRow key={row.step} row={row} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
