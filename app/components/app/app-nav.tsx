"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { shorten } from "@/lib/near/format";
import { useWallet } from "@/lib/near/wallet";

const LINKS = [
  {
    href: "/app",
    label: "AGENTS",
    match: (pathname: string) =>
      pathname === "/app" || pathname.startsWith("/app/agent"),
  },
  {
    href: "/app/market",
    label: "MARKET",
    match: (pathname: string) => pathname.startsWith("/app/market"),
  },
];

export function AppNav() {
  const pathname = usePathname() ?? "";
  const { accountId, connecting, connect, disconnect } = useWallet();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <nav
        aria-label="App"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8"
      >
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span aria-hidden className="h-2 w-2 bg-accent" />
            <span className="font-mono text-[12px] tracking-[0.22em] text-ink">
              NIVRY
            </span>
          </Link>

          <div className="flex items-center gap-4">
            {LINKS.map((link) => {
              const active = link.match(pathname);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`font-mono text-[10px] tracking-[0.18em] transition-colors ${
                    active ? "text-ink" : "text-dim hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden border border-sand/35 px-2 py-1 font-mono text-[9px] tracking-[0.2em] text-sand sm:inline">
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
