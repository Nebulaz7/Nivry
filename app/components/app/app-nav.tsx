"use client";

import Link from "next/link";

import { shorten } from "@/lib/near/format";
import { useWallet } from "@/lib/near/wallet";

export function AppNav() {
  const { accountId, connecting, connect, disconnect } = useWallet();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <nav
        aria-label="App"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8"
      >
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span aria-hidden className="h-2 w-2 bg-accent" />
            <span className="font-mono text-[12px] tracking-[0.22em] text-ink">
              NIVRY
            </span>
          </Link>
          <span className="hidden font-mono text-[10px] tracking-[0.18em] text-dim sm:inline">
            / AGENTS
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="border border-sand/35 px-2 py-1 font-mono text-[9px] tracking-[0.2em] text-sand">
            TESTNET
          </span>

          {accountId ? (
            <>
              <span className="hidden border border-line px-2.5 py-1.5 font-mono text-[11px] text-ink/85 sm:inline">
                {shorten(accountId, 8, 5)}
              </span>
              <button
                type="button"
                onClick={() => void disconnect()}
                className="font-mono text-[10px] tracking-[0.16em] text-dim transition-colors hover:text-ink"
              >
                DISCONNECT
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={connecting}
              className="btn btn-primary btn-sm"
            >
              {connecting ? "Connecting" : "Connect"}
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}
