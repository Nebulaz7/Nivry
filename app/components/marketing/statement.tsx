"use client";

import { useEffect, useRef } from "react";

import { readTrackProgress, smoothstep } from "@/lib/scroll";
import { SITE } from "@/lib/site";

import { TwinkleStars } from "./twinkle-stars";

const NIGHT: [number, number, number] = [0, 0, 0];
const EMERALD: [number, number, number] = [6, 78, 59];

/**
 * Pinned statement: the problem arrives line by line, then the answer, while the
 * background shifts from black to emerald. The colour is one solid value written
 * per frame, so it stays a flat fill rather than a gradient.
 */
export function Statement() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    const lines = lineRef.current.filter(
      (node): node is HTMLSpanElement => node !== null,
    );

    if (!section || !track || lines.length === 0) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      section.style.backgroundColor = `rgb(${EMERALD.join(", ")})`;
      lines.forEach((line) => {
        line.style.opacity = "1";
        line.style.transform = "none";
      });
      return;
    }

    const problemCount = SITE.statement.problem.length;

    const paint = (progress: number) => {
      const warmth = smoothstep(0.05, 0.9, progress);
      const channels = NIGHT.map((from, index) =>
        Math.round(from + (EMERALD[index] - from) * warmth),
      );
      section.style.backgroundColor = `rgb(${channels.join(", ")})`;

      lines.forEach((line, index) => {
        const isAnswer = index >= problemCount;
        const order = isAnswer ? index - problemCount : index;
        const start = isAnswer ? 0.42 + order * 0.1 : 0.04 + order * 0.08;
        const local = smoothstep(start, start + 0.22, progress);

        line.style.opacity = `${0.16 + 0.84 * local}`;
        line.style.transform = `translateY(${(1 - local) * 16}px)`;
      });
    };

    let frame = 0;
    let last = -1;

    const tick = () => {
      const progress = readTrackProgress(track);

      if (Math.abs(progress - last) > 0.0015) {
        last = progress;
        paint(progress);
      }

      frame = requestAnimationFrame(tick);
    };

    paint(0);
    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, []);

  const allLines = [
    ...SITE.statement.problem.map((text) => ({ text, answer: false })),
    ...SITE.statement.solution.map((text) => ({ text, answer: true })),
  ];

  return (
    <section
      ref={sectionRef}
      id="how"
      data-hide-nav
      className="relative border-t border-mint/10"
      style={{ backgroundColor: "#000000" }}
    >
      <div ref={trackRef} className="relative h-[200svh]">
        <div className="sticky top-0 h-svh overflow-hidden">
          <TwinkleStars />

          <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col justify-center px-5 sm:px-8">
            <p className="font-mono text-[11px] tracking-[0.2em] text-accent">
              || gap
            </p>

            <div className="mt-8 max-w-3xl space-y-1.5">
              {allLines.map((line, index) => (
                <span
                  key={line.text}
                  ref={(node) => {
                    lineRef.current[index] = node;
                  }}
                  style={{ opacity: 0.16 }}
                  className={`block text-[clamp(1.4rem,3.8vw,2.6rem)] font-medium leading-[1.18] tracking-[-0.02em] will-change-[opacity,transform] ${
                    line.answer ? "text-accent" : "text-mint"
                  }`}
                >
                  {line.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
