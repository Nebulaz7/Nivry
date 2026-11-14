"use client";

import Link from "next/link";

import { shorten } from "@/lib/near/format";
import { useWallet } from "@/lib/near/wallet";

export function AppNav() {
  const { accountId, connecting, connect, disconnect } = useWallet();

  return (
    <header className="sticky top-0 z-40 border-b border-mint/10 bg-void/85 backdrop-blur-md">
      <nav
        aria-label="App"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8"
      >
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span aria-hidden className="h-2 w-2 bg-accent" />
            <span className="font-mono text-[12px] tracking-[0.22em] text-mint">
              NIVRY
            </span>
          </Link>
          <span className="hidden font-mono text-[10px] tracking-[0.18em] text-mint/35 sm:inline">
            / AGENTS
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="border border-accent/25 px-2 py-1 font-mono text-[9px] tracking-[0.2em] text-accent">
            TESTNET
          </span>

          {accountId ? (
            <>
              <span className="hidden border border-mint/15 px-2.5 py-1.5 font-mono text-[11px] text-mint/65 sm:inline">
                {shorten(accountId, 8, 5)}
              </span>
              <button
                type="button"
                onClick={() => void disconnect()}
                className="font-mono text-[10px] tracking-[0.16em] text-mint/40 transition-colors hover:text-mint"
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
