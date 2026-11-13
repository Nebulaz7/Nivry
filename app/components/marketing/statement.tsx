"use client";

import { useEffect, useRef } from "react";

import { readTrackProgress, smoothstep } from "@/lib/scroll";
import { SITE } from "@/lib/site";

const NIGHT: [number, number, number] = [0, 0, 0];
const EMERALD: [number, number, number] = [6, 78, 59];

/**
 * Pinned statement: the problem arrives line by line, then the answer, while the
 * background shifts from black to emerald. The colour is a single solid value
 * written per frame, so it stays a flat fill rather than a gradient.
 */
export function Statement() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const problemRef = useRef<(HTMLSpanElement | null)[]>([]);
  const solutionRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    const solution = solutionRef.current;
    const problem = problemRef.current.filter(
      (node): node is HTMLSpanElement => node !== null,
    );

    if (!section || !track || !solution || problem.length === 0) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      section.style.backgroundColor = `rgb(${EMERALD.join(", ")})`;
      problem.forEach((line) => {
        line.style.opacity = "1";
        line.style.transform = "none";
      });
      solution.style.opacity = "1";
      solution.style.transform = "none";
      return;
    }

    const paint = (progress: number) => {
      const warmth = smoothstep(0.06, 0.9, progress);
      const channels = NIGHT.map((from, index) =>
        Math.round(from + (EMERALD[index] - from) * warmth),
      );
      section.style.backgroundColor = `rgb(${channels.join(", ")})`;

      problem.forEach((line, index) => {
        const start = 0.06 + index * 0.1;
        const local = smoothstep(start, start + 0.26, progress);

        line.style.opacity = `${0.18 + 0.82 * local}`;
        line.style.transform = `translateY(${(1 - local) * 16}px)`;
      });

      const answer = smoothstep(0.5, 0.78, progress);
      solution.style.opacity = `${0.12 + 0.88 * answer}`;
      solution.style.transform = `translateY(${(1 - answer) * 14}px)`;
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

  return (
    <section
      ref={sectionRef}
      id="how"
      className="relative border-t border-mint/10"
      style={{ backgroundColor: "#000000" }}
    >
      <div ref={trackRef} className="relative h-[200svh]">
        <div className="sticky top-0 flex h-svh items-center">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <p className="font-mono text-[11px] tracking-[0.2em] text-accent">
              || gap
            </p>

            <div className="mt-8 max-w-3xl space-y-1.5">
              {SITE.statement.problem.map((line, index) => (
                <span
                  key={line}
                  ref={(node) => {
                    problemRef.current[index] = node;
                  }}
                  style={{ opacity: 0.18 }}
                  className="block text-[clamp(1.5rem,4.2vw,2.9rem)] font-medium leading-[1.16] tracking-[-0.02em] text-mint will-change-[opacity,transform]"
                >
                  {line}
                </span>
              ))}
            </div>

            <p
              ref={solutionRef}
              style={{ opacity: 0.12 }}
              className="mt-10 max-w-2xl text-[clamp(0.95rem,1.4vw,1.0625rem)] leading-relaxed text-mint/80 will-change-[opacity,transform]"
            >
              {SITE.statement.solution}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
