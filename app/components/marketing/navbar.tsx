"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { SITE } from "@/lib/site";

const LINKS = [
  { label: "How it works", href: "#how" },
  { label: "FAQ", href: "#faq" },
  { label: "GitHub", href: SITE.github, external: true },
];

/**
 * Fixed bar that steps out of the way while the pinned statement fills the
 * viewport, so the section runs full-bleed.
 */
export function Navbar() {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    let frame = 0;
    let hidden = false;

    const sync = () => {
      const section = document.getElementById("how");

      let shouldHide = false;
      if (section) {
        const rect = section.getBoundingClientRect();
        shouldHide = rect.top <= 0 && rect.bottom >= window.innerHeight;
      }

      if (shouldHide === hidden) return;
      hidden = shouldHide;

      header.style.opacity = hidden ? "0" : "1";
      header.style.transform = hidden ? "translateY(-100%)" : "translateY(0)";
      header.style.pointerEvents = hidden ? "none" : "auto";
      header.toggleAttribute("inert", hidden);
      header.setAttribute("aria-hidden", String(hidden));
    };

    const tick = () => {
      sync();
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <header
      ref={headerRef}
      className="fixed inset-x-0 top-0 z-50 border-b border-mint/10 bg-void/80 backdrop-blur-md transition-[opacity,transform] duration-300 ease-out"
    >
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

        <Link href="/app" className="btn btn-primary btn-sm">
          Launch app
        </Link>
      </nav>
    </header>
  );
}
