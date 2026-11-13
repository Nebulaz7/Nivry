"use client";

import Link from "next/link";
import { useRef } from "react";

import { SITE } from "@/lib/site";

import { HorizonGrid } from "./horizon-grid";
import { PixelMorph } from "./pixel-morph";
import { Starfield } from "./starfield";

export function Hero() {
  const trackRef = useRef<HTMLElement | null>(null);

  return (
    <section ref={trackRef} className="relative h-[190svh]">
      <div className="sticky top-0 h-svh overflow-hidden">
        <Starfield />
        <HorizonGrid />

        <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col justify-center px-5 pt-14 sm:px-8">
          <div className="grid items-center gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
            <div className="max-w-xl">
              <div className="flex items-center gap-2.5">
                <span aria-hidden className="h-2 w-2 bg-accent" />
                <span className="font-mono text-[11px] tracking-[0.2em] text-accent">
                  {SITE.nep}
                </span>
              </div>

              <h1 className="mt-6 text-[clamp(2.5rem,6vw,4.25rem)] font-medium leading-[0.95] tracking-[-0.03em] text-mint">
                {SITE.headline}
              </h1>

              <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-mint/60">
                {SITE.subline}
              </p>

              <div className="mt-9 flex items-center gap-3">
                <Link
                  href="/app"
                  className="bg-accent px-6 py-3 text-[13px] font-medium text-void transition-colors duration-150 hover:bg-mint"
                >
                  Launch app
                </Link>
                <a
                  href={SITE.github}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-mint/20 px-6 py-3 text-[13px] text-mint transition-colors duration-150 hover:border-accent"
                >
                  Read the NEP
                </a>
              </div>
            </div>

            <PixelMorph trackRef={trackRef} />
          </div>
        </div>
      </div>
    </section>
  );
}
