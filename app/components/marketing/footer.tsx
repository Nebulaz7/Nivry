import Link from "next/link";

import { Blaze } from "@/components/animations/Blaze";
import { SITE } from "@/lib/site";

import { CopyButton } from "./copy-button";

const COLUMNS = [
  {
    title: "protocol",
    links: [
      { label: "Overview", href: "/#action" },
      { label: "Guarantees", href: "/#guarantees" },
      { label: "The standard", href: "/#standard" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "build",
    links: [
      { label: "GitHub", href: SITE.github },
      { label: "Pull request", href: SITE.nepPr },
      {
        label: "Deployment record",
        href: `${SITE.github}/blob/main/docs/deployment.md`,
      },
    ],
  },
];

const CONTRACTS = [
  { label: "registry", value: SITE.registry },
  { label: "treasury", value: SITE.treasury },
];

const SPARK: [number, number, number] = [0.204, 0.827, 0.6];
const SMOKE: [number, number, number] = [0.09, 0.45, 0.34];

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-mint/10 bg-black">
      {/* Decorative: giant wordmark, heat-distorted by the Blaze layer. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[clamp(260px,34vw,420px)]">
        <Blaze
          className="h-full w-full"
          height={0.55}
          distortion={0.35}
          distortionScale={0.55}
          speed={0.9}
          sparks={0.6}
          sparkDensity={1.4}
          sparkSize={1}
          layers={4}
          smoke={0.3}
          glow={1.1}
          sparkColor={SPARK}
          smokeColor={SMOKE}
        >
          <div className="flex h-full items-end justify-end overflow-hidden">
            <span className="translate-y-[14%] select-none whitespace-nowrap font-bold leading-[0.75] tracking-[-0.05em] text-mint/[0.06] text-[clamp(6rem,26vw,22rem)]">
              Nivry
            </span>
          </div>
        </Blaze>
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-5 pb-10 pt-24 sm:px-8">
        <div className="grid gap-12 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <span aria-hidden className="h-2 w-2 bg-accent" />
              <span className="font-mono text-[12px] tracking-[0.22em] text-mint">
                NIVRY
              </span>
            </Link>

            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-mint/50">
              An agent NFT that holds its own treasury, and keeps its guarantees
              when it changes hands.
            </p>

            {/*<span className="mt-6 inline-block border border-accent/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              testnet
            </span>*/}
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mint/30">
                {column.title}
              </p>

              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      {...(link.href.startsWith("http")
                        ? { target: "_blank", rel: "noreferrer" }
                        : {})}
                      className="text-[13px] text-mint/60 transition-colors duration-150 hover:text-mint"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
{/*
        <div className="mt-16 grid gap-6 sm:grid-cols-2">
          {CONTRACTS.map((contract) => (
            <div key={contract.label} className="border-t border-mint/12 pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-mint/30">
                {contract.label}
              </p>

              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="truncate font-mono text-[12px] text-mint/70">
                  {contract.value}
                </span>
                <CopyButton value={contract.value} label={contract.label} />
              </div>
            </div>
          ))}
        </div>*/}

        <div className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-mint/12 pt-6">
          <p className="font-mono text-[11px] text-mint/30">
            © 2026 Nivry · built on NEAR
          </p>
          <p className="font-mono text-[11px] text-mint/30">
            {SITE.nep} · draft
          </p>
        </div>
      </div>
    </footer>
  );
}
