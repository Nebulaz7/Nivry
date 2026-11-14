"use client";

import { CopyValue } from "@/components/app/copy-value";
import { Panel } from "@/components/app/passport/panel";
import type { AgentInfo } from "@/lib/near/types";

const ROWS: Array<[label: string, pick: (info: AgentInfo) => string]> = [
  ["SCHEMA", (info) => info.manifest.schema_version],
  ["RUNTIME", (info) => info.manifest.runtime_hint],
  ["TASK", (info) => info.manifest.task_kind],
  ["DESCRIPTION", (info) => info.manifest.description || "—"],
  ["BUNDLE", (info) => info.manifest.bundle_sha256],
  ["URI", (info) => info.manifest.manifest_uri],
];

/** The immutable published configuration, plus the commitment that binds a sale. */
export function HistoryPanel({ info }: { info: AgentInfo }) {
  return (
    <Panel
      title="RECORD"
      aside={
        <span className="font-mono text-[9px] tracking-[0.16em] text-dim">
          {info.ownership_change_count} OWNERSHIP CHANGE
          {info.ownership_change_count === 1 ? "" : "S"}
        </span>
      }
    >
      <dl className="divide-y divide-line border border-line">
        {ROWS.map(([label, pick]) => (
          <div
            key={label}
            className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
          >
            <dt className="shrink-0 font-mono text-[9px] tracking-[0.18em] text-dim/80">
              {label}
            </dt>
            <dd className="break-all font-mono text-[11px] text-ink/90 sm:text-right">
              {pick(info)}
            </dd>
          </div>
        ))}

        <div className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <dt className="shrink-0 font-mono text-[9px] tracking-[0.18em] text-dim/80">
            MANIFEST HASH
          </dt>
          <dd className="flex items-center gap-2 sm:justify-end">
            <span className="break-all font-mono text-[11px] text-accent">
              {info.manifest_hash}
            </span>
            <CopyValue value={info.manifest_hash} label="manifest hash" />
          </dd>
        </div>
      </dl>

      <p className="mt-3 font-mono text-[10px] leading-relaxed text-dim/80">
        The manifest is fixed at mint. A buyer can re-read this hash and compare
        it to the listing before signing.
      </p>
    </Panel>
  );
}
