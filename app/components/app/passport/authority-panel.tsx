"use client";

import { useState } from "react";

import { Data, INPUT, Label, Panel, Reason, type RunAction } from "@/components/app/passport/panel";
import { expiryFromDays, revokeExecutor, setExecutor } from "@/lib/near/actions";
import { formatNear, parseNear } from "@/lib/near/format";
import type { AgentInfo } from "@/lib/near/types";

/** Nanoseconds → `YYYY-MM-DD`. Divided before narrowing so nothing overflows. */
function formatExpiry(ns: number): string {
  const ms = Number(BigInt(ns) / BigInt(1_000_000));
  return new Date(ms).toISOString().slice(0, 10);
}

const MAX_RECIPIENTS = 8;

export function AuthorityPanel({
  info,
  isOwner,
  busy,
  run,
}: {
  info: AgentInfo;
  isOwner: boolean;
  busy: string | null;
  run: RunAction;
}) {
  const grant = info.executor_grant;

  const [executorId, setExecutorId] = useState("");
  const [recipients, setRecipients] = useState("");
  const [cap, setCap] = useState("");
  const [budget, setBudget] = useState("");
  const [days, setDays] = useState("7");

  const list = recipients
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const capYocto = parseNear(cap);
  const budgetYocto = parseNear(budget);
  const dayCount = Number(days);

  const invalid =
    executorId.trim().length === 0
      ? "Name an executor account."
      : list.length === 0
        ? "Add at least one recipient."
        : list.length > MAX_RECIPIENTS
          ? `At most ${MAX_RECIPIENTS} recipients.`
          : !capYocto
            ? "Set a per-payment cap."
            : !budgetYocto
              ? "Set a total budget."
              : BigInt(budgetYocto) < BigInt(capYocto)
                ? "The budget must be at least the per-payment cap."
                : !Number.isFinite(dayCount) || dayCount < 1 || dayCount > 89
                  ? "Expiry must be 1 to 89 days."
                  : null;

  return (
    <Panel
      title="AUTHORITY"
      aside={
        <span className="font-mono text-[9px] tracking-[0.16em] text-dim">
          EPOCH {info.authority_epoch}
        </span>
      }
    >
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Data label="EPOCH" value={String(info.authority_epoch)} />
        <Data label="NONCE" value={String(info.next_command_nonce)} />
        <Data label="RECIPIENTS" value={grant ? String(grant.recipients.length) : "—"} />
        <Data
          label="IN FLIGHT"
          value={info.pending_operation ? "SETTLING" : "NONE"}
          tone={info.pending_operation ? "sand" : "dim"}
        />
      </dl>

      {grant ? (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-[13px] text-ink">{grant.executor_id}</p>
            <p className="font-mono text-[9px] tracking-[0.14em] text-dim">
              EXPIRES {formatExpiry(grant.expires_at_ns)}
            </p>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Data label="CAP / PAYMENT" value={formatNear(grant.per_payment_cap_yocto)} />
            <Data label="BUDGET" value={formatNear(grant.total_budget_yocto)} />
            <Data label="SPENT" value={formatNear(grant.spent_yocto)} tone="sand" />
            <Data label="REMAINING" value={formatNear(grant.remaining_budget_yocto)} tone="accent" />
          </dl>

          <div className="mt-3 flex flex-wrap gap-1">
            {grant.recipients.map((account) => (
              <span
                key={account}
                className="border border-line px-1.5 py-0.5 font-mono text-[9px] text-dim"
              >
                {account}
              </span>
            ))}
          </div>

          {isOwner ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  "Revoke executor",
                  revokeExecutor(info.token_id, info.authority_epoch),
                )
              }
              className="btn btn-secondary btn-sm mt-4"
            >
              {busy === "Revoke executor" ? "Revoking" : "Revoke executor"}
            </button>
          ) : null}
        </div>
      ) : (
        <Reason>No executor installed. The treasury cannot spend until one is granted.</Reason>
      )}

      {isOwner ? (
        <div className="mt-5 border-t border-line pt-4">
          <Label>{grant ? "REPLACE GRANT" : "INSTALL EXECUTOR"}</Label>

          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={executorId}
              onChange={(event) => setExecutorId(event.target.value)}
              placeholder="executor.testnet"
              className={INPUT}
              spellCheck={false}
            />
            <input
              value={recipients}
              onChange={(event) => setRecipients(event.target.value)}
              placeholder="a.testnet, b.testnet"
              className={INPUT}
              spellCheck={false}
            />
            <input
              value={cap}
              onChange={(event) => setCap(event.target.value)}
              placeholder="cap per payment · 0.1"
              inputMode="decimal"
              className={INPUT}
            />
            <input
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
              placeholder="total budget · 1.0"
              inputMode="decimal"
              className={INPUT}
            />
            <input
              value={days}
              onChange={(event) => setDays(event.target.value)}
              placeholder="days"
              inputMode="numeric"
              className={INPUT}
            />
            <button
              type="button"
              disabled={invalid !== null || busy !== null}
              onClick={() =>
                void run(
                  grant ? "Replace grant" : "Install executor",
                  setExecutor(info.token_id, info.authority_epoch, {
                    executorId: executorId.trim(),
                    recipients: list,
                    perPaymentCapYocto: capYocto ?? "0",
                    totalBudgetYocto: budgetYocto ?? "0",
                    expiresAtNs: expiryFromDays(dayCount),
                  }),
                )
              }
              className="btn btn-secondary btn-sm"
            >
              {busy === "Install executor" || busy === "Replace grant"
                ? "Signing"
                : grant
                  ? "Replace"
                  : "Install"}
            </button>
          </div>

          <Reason>
            {invalid ??
              "Installing a grant rotates the authority epoch, so the previous generation dies with it."}
          </Reason>
        </div>
      ) : (
        <Reason>Read-only. Only the owner can grant or revoke authority.</Reason>
      )}
    </Panel>
  );
}
