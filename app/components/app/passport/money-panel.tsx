"use client";

import { useState } from "react";

import { CopyValue } from "@/components/app/copy-value";
import { Data, INPUT, Label, Panel, Reason, type RunAction } from "@/components/app/passport/panel";
import { ownerWithdraw } from "@/lib/near/actions";
import { formatNear, parseNear } from "@/lib/near/format";
import type { AgentInfo, TreasuryInfo } from "@/lib/near/types";

/** Money read, the owner's only outflow, and an inbound top-up anyone can sign. */
export function MoneyPanel({
  info,
  treasury,
  isOwner,
  busy,
  run,
  runTransfer,
}: {
  info: AgentInfo;
  treasury: TreasuryInfo | null;
  isOwner: boolean;
  busy: string | null;
  run: RunAction;
  runTransfer: (label: string, receiverId: string, deposit: string) => Promise<void>;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [deposit, setDeposit] = useState("");

  const yocto = parseNear(amount);
  const depositYocto = parseNear(deposit);
  const target = recipient.trim() || info.owner_id || "";

  const blocked =
    info.lifecycle !== "ready"
      ? "Provisioning has not settled."
      : info.listing
        ? "Delist before moving funds."
        : info.frozen
          ? "The agent is locked for sale."
          : info.pending_operation
            ? "A payout is still settling."
            : null;

  return (
    <Panel
      title="MONEY"
      aside={<span className="font-mono text-[9px] tracking-[0.16em] text-dim">TREASURY</span>}
    >
      <p className="font-mono text-[30px] leading-none text-accent">
        {treasury ? formatNear(treasury.balance_yocto, 4) : "—"}
        <span className="ml-2 text-[11px] text-dim">NEAR</span>
      </p>

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        <span className="truncate font-mono text-[10px] text-dim">
          {info.treasury_account_id}
        </span>
        <CopyValue value={info.treasury_account_id} label="treasury account" />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Data
          label="SPENDABLE"
          value={treasury ? formatNear(treasury.spendable_yocto, 3) : "—"}
        />
        <Data
          label="RESERVED"
          value={treasury ? formatNear(treasury.storage_reserve_yocto, 3) : "—"}
        />
        <Data
          label="STATE"
          value={treasury?.pending ? "SETTLING" : "IDLE"}
          tone={treasury?.pending ? "sand" : "dim"}
        />
      </dl>

      <div className="mt-5 border-t border-line pt-4">
        <Label>DEPOSIT</Label>
        <div className="flex gap-2">
          <input
            value={deposit}
            onChange={(event) => setDeposit(event.target.value)}
            placeholder="1.0"
            inputMode="decimal"
            className={INPUT}
          />
          <button
            type="button"
            disabled={!depositYocto || busy !== null}
            onClick={() =>
              void runTransfer(
                "Deposit",
                info.treasury_account_id,
                depositYocto ?? "0",
              )
            }
            className="btn btn-secondary btn-sm shrink-0"
          >
            {busy === "Deposit" ? "Sending" : "Deposit"}
          </button>
        </div>
        <Reason>
          Anyone can fund an agent. Inflows never bump the version, so they cannot
          invalidate a sale.
        </Reason>
      </div>

      {isOwner ? (
        <div className="mt-5 border-t border-line pt-4">
          <Label>WITHDRAW</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder={info.owner_id ?? "recipient.near"}
              className={INPUT}
              spellCheck={false}
            />
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.5"
              inputMode="decimal"
              className={INPUT}
            />
          </div>

          <button
            type="button"
            disabled={!yocto || blocked !== null || busy !== null || !target}
            onClick={() =>
              void run(
                "Withdraw",
                ownerWithdraw(
                  info.token_id,
                  info.authority_epoch,
                  info.next_command_nonce,
                  target,
                  yocto ?? "0",
                ),
              )
            }
            className="btn btn-secondary btn-sm mt-2 w-full"
          >
            {busy === "Withdraw" ? "Withdrawing" : "Withdraw"}
          </button>

          <Reason>
            {blocked ??
              "Settles through the treasury, so it follows the same dispatch rules as an executor payment."}
          </Reason>
        </div>
      ) : (
        <Reason>Read-only. Only the owner can move treasury funds.</Reason>
      )}
    </Panel>
  );
}
