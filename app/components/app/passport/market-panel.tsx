"use client";

import { useState } from "react";

import { Data, INPUT, Label, Panel, Reason, type RunAction } from "@/components/app/passport/panel";
import {
  cancelListing,
  listAgent,
  setFrozen,
  transferTitle,
  withdrawSaleProceeds,
} from "@/lib/near/actions";
import { formatNear, parseNear, shorten } from "@/lib/near/format";
import type { AgentInfo, SellerCreditView } from "@/lib/near/types";

export function MarketPanel({
  info,
  isOwner,
  busy,
  run,
  listingDeposit,
  credit,
}: {
  info: AgentInfo;
  isOwner: boolean;
  busy: string | null;
  run: RunAction;
  listingDeposit: string | null;
  credit: SellerCreditView | null;
}) {
  const [price, setPrice] = useState("");
  const [receiver, setReceiver] = useState("");

  const listing = info.listing;
  const priceYocto = parseNear(price);
  const available = credit ? BigInt(credit.available_yocto) : BigInt(0);

  return (
    <Panel
      title="MARKET"
      aside={
        <span className="font-mono text-[9px] tracking-[0.16em] text-dim">
          VERSION {info.version}
        </span>
      }
    >
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Data label="VERSION" value={String(info.version)} />
        <Data
          label="LOCK"
          value={info.frozen ? "LOCKED" : "OPEN"}
          tone={info.frozen ? "sand" : "dim"}
        />
        <Data label="LISTING" value={listing ? `#${listing.listing_id}` : "—"} />
        <Data
          label="OWNERSHIPS"
          value={String(info.ownership_change_count)}
        />
      </dl>

      {listing ? (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] tracking-[0.18em] text-dim/80">
                PRICE
              </p>
              <p className="mt-1 font-mono text-[24px] leading-none text-sand">
                {formatNear(listing.price_yocto)}
                <span className="ml-2 text-[11px] text-dim">NEAR</span>
              </p>
            </div>
            <p className="font-mono text-[10px] text-dim">
              SELLER {shorten(listing.seller, 10, 6)}
            </p>
          </div>

          {isOwner ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  "Delist",
                  cancelListing(info.token_id, listing.listing_id),
                )
              }
              className="btn btn-secondary btn-sm mt-3"
            >
              {busy === "Delist" ? "Delisting" : "Delist and resume spending"}
            </button>
          ) : (
            <Reason>
              Buy from the market so the price, version and manifest are checked
              against this listing in one receipt.
            </Reason>
          )}
        </div>
      ) : (
        <div className="mt-4 border-t border-line pt-4">
          {info.frozen ? (
            <>
              <Label>LIST PRICE</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="2.5"
                  inputMode="decimal"
                  className={INPUT}
                />
                <button
                  type="button"
                  disabled={!priceYocto || !listingDeposit || busy !== null}
                  onClick={() =>
                    void run(
                      "List agent",
                      listAgent(
                        info.token_id,
                        info.version,
                        priceYocto ?? "0",
                        listingDeposit ?? "0",
                      ),
                    )
                  }
                  className="btn btn-secondary btn-sm shrink-0"
                >
                  {busy === "List agent" ? "Listing" : "List agent"}
                </button>
              </div>
              <Reason>
                Attaches the published listing deposit of{" "}
                {listingDeposit ? `${formatNear(listingDeposit, 3)} NEAR` : "…"}. The
                treasury travels with the token.
              </Reason>

              {isOwner ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("Unlock", setFrozen(info.token_id, info.version, false))
                  }
                  className="btn btn-secondary btn-sm mt-3"
                >
                  {busy === "Unlock" ? "Unlocking" : "Unlock"}
                </button>
              ) : null}
            </>
          ) : (
            <>
              {isOwner ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("Lock", setFrozen(info.token_id, info.version, true))
                  }
                  className="btn btn-secondary btn-sm"
                >
                  {busy === "Lock" ? "Locking" : "Lock for sale"}
                </button>
              ) : null}
              <Reason>
                {isOwner
                  ? "Lock before listing: outflows stop, deposits still land, and the buyer sees a treasury that cannot be drained mid-sale."
                  : "This agent is not listed. Locking is the owner's step before listing."}
              </Reason>
            </>
          )}
        </div>
      )}

      {isOwner && !listing ? (
        <div className="mt-5 border-t border-line pt-4">
          <Label>TRANSFER TITLE</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={receiver}
              onChange={(event) => setReceiver(event.target.value)}
              placeholder="newowner.testnet"
              className={INPUT}
              spellCheck={false}
            />
            <button
              type="button"
              disabled={receiver.trim().length === 0 || busy !== null}
              onClick={() =>
                void run(
                  "Transfer title",
                  transferTitle(info.token_id, receiver.trim()),
                )
              }
              className="btn btn-secondary btn-sm shrink-0"
            >
              {busy === "Transfer title" ? "Transferring" : "Transfer"}
            </button>
          </div>
          <Reason>
            Moves the title and burns the current authority generation. A listing
            must be cancelled first.
          </Reason>
        </div>
      ) : null}

      {available > BigInt(0) ? (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] tracking-[0.18em] text-dim/80">
                SALE PROCEEDS
              </p>
              <p className="mt-1 font-mono text-[18px] leading-none text-sand">
                {formatNear(credit?.available_yocto ?? "0")} NEAR
              </p>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run(
                  "Withdraw proceeds",
                  withdrawSaleProceeds(credit?.available_yocto ?? "0"),
                )
              }
              className="btn btn-secondary btn-sm"
            >
              {busy === "Withdraw proceeds" ? "Withdrawing" : "Withdraw proceeds"}
            </button>
          </div>
          <Reason>
            Paid from a registry liability, never from a treasury.
          </Reason>
        </div>
      ) : null}
    </Panel>
  );
}
