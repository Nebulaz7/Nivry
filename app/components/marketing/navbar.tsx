import Link from "next/link";

import { SITE } from "@/lib/site";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "FAQ", href: "#faq" },
  { label: "GitHub", href: SITE.github, external: true },
];

export function Navbar() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-mint/10 bg-void/80 backdrop-blur-md">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8"
      >
        {/* Placeholder lockup. Replace the square + wordmark once the real mark lands. */}
        <Link href="/" className="flex items-center gap-2.5">
          <span aria-hidden className="h-2 w-2 bg-accent" />
          <span className="font-mono text-[12px] tracking-[0.22em] text-mint">
            NIVRY
          </span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              {...(link.external
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
              className="text-[13px] text-mint/60 transition-colors duration-100 hover:text-mint"
            >
              {link.label}
            </a>
          ))}
        </div>

        <Link
          href="/app"
          className="bg-accent px-4 py-2 text-[13px] font-medium text-void transition-colors duration-100 hover:bg-mint"
        >
          Launch app
        </Link>
      </nav>
    </header>
  );
}
