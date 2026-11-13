"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { AgentCard } from "./agent-card";
import { PFP_SIZE, pfpCells } from "./pfp";

type Particle = {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  delay: number;
  wob: number;
  size: number;
  mark: boolean;
};

const SUBDIVISIONS = 2;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function smoothstep(from: number, to: number, value: number) {
  return clamp((value - from) / (to - from)) ** 2 * (3 - 2 * clamp((value - from) / (to - from)));
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Scroll-driven morph: the pixel portrait breaks into particles and reassembles
 * as the card outline. Canvas only — no video, no images, no gradients.
 *
 * Progress is read from the enclosing scroll track, so the hero can stay pinned
 * while the animation plays.
 */
export function PixelMorph({
  trackRef,
}: {
  trackRef: RefObject<HTMLElement | null>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cardVisible, setCardVisible] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cells = pfpCells();

    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastProgress = -1;
    let cardShown = false;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const side = Math.min(width, height) * 0.56;
      const cell = side / PFP_SIZE;
      const originX = (width - side) / 2;
      const originY = (height - side) / 2;

      const cardW = width * 0.88;
      const cardH = height * 0.62;
      const centerX = width / 2;
      const centerY = height / 2;

      const next: Particle[] = [];

      for (const source of cells) {
        for (let subY = 0; subY < SUBDIVISIONS; subY += 1) {
          for (let subX = 0; subX < SUBDIVISIONS; subX += 1) {
            const sx =
              originX + (source.x + (subX + 0.5) / SUBDIVISIONS) * cell;
            const sy =
              originY + (source.y + (subY + 0.5) / SUBDIVISIONS) * cell;

            const angle = Math.atan2(sy - centerY, sx - centerX);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const toSide =
              Math.abs(cos) < 1e-4
                ? Number.POSITIVE_INFINITY
                : cardW / 2 / Math.abs(cos);
            const toTop =
              Math.abs(sin) < 1e-4
                ? Number.POSITIVE_INFINITY
                : cardH / 2 / Math.abs(sin);
            const distance = Math.min(toSide, toTop);

            next.push({
              sx,
              sy,
              tx: centerX + cos * distance + (Math.random() - 0.5) * 3,
              ty: centerY + sin * distance + (Math.random() - 0.5) * 3,
              delay: Math.random() * 0.45,
              wob: (Math.random() - 0.5) * 14,
              size: cell / SUBDIVISIONS + 0.4,
              mark: source.tone === "mark",
            });
          }
        }
      }

      particles = next;
    };

    const draw = (progress: number) => {
      ctx.clearRect(0, 0, width, height);

      const side = Math.min(width, height) * 0.56;
      const cell = side / PFP_SIZE;
      const originX = (width - side) / 2;
      const originY = (height - side) / 2;

      const cardW = width * 0.88;
      const cardH = height * 0.62;
      const centerX = width / 2;
      const centerY = height / 2;

      // 1. The portrait, before it dissolves.
      const portraitAlpha = 1 - smoothstep(0.03, 0.26, progress);
      if (portraitAlpha > 0.01) {
        ctx.globalAlpha = portraitAlpha;
        for (const source of cells) {
          ctx.fillStyle = source.tone === "mark" ? "#064e3b" : "#34d399";
          ctx.fillRect(
            originX + source.x * cell,
            originY + source.y * cell,
            cell,
            cell,
          );
        }
        ctx.globalAlpha = 1;
      }

      // 2. The particles, in flight.
      const particleAlpha =
        smoothstep(0.05, 0.24, progress) * (1 - smoothstep(0.86, 1, progress));
      if (particleAlpha > 0.01) {
        for (const particle of particles) {
          const local = clamp(
            (progress - particle.delay) / (1 - particle.delay),
          );
          const eased = easeInOutCubic(local);
          const x =
            particle.sx +
            (particle.tx - particle.sx) * eased +
            Math.sin(local * Math.PI) * particle.wob;
          const y =
            particle.sy +
            (particle.ty - particle.sy) * eased +
            Math.cos(local * Math.PI) * particle.wob;
          const size = particle.size + (1.2 - particle.size) * eased;

          ctx.globalAlpha = particleAlpha * (particle.mark ? 0.5 : 1);
          ctx.fillStyle = particle.mark ? "#d1fae5" : "#34d399";
          ctx.fillRect(x, y, size, size);
        }
        ctx.globalAlpha = 1;
      }

      // 3. The card outline that replaces them.
      const outlineAlpha = smoothstep(0.76, 0.96, progress);
      if (outlineAlpha > 0.01) {
        ctx.globalAlpha = outlineAlpha;
        ctx.strokeStyle = "#34d399";
        ctx.lineWidth = 1;
        ctx.strokeRect(
          centerX - cardW / 2 + 0.5,
          centerY - cardH / 2 + 0.5,
          cardW - 1,
          cardH - 1,
        );
        ctx.globalAlpha = 1;
      }
    };

    const readProgress = () => {
      const track = trackRef.current;
      if (!track) return 0;

      const rect = track.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      if (scrollable <= 0) return 0;

      return clamp(-rect.top / scrollable);
    };

    build();

    if (reduced) {
      draw(1);
      setCardVisible(true);
      return;
    }

    const tick = () => {
      const progress = readProgress();

      if (Math.abs(progress - lastProgress) > 0.0015) {
        lastProgress = progress;
        draw(progress);

        const shouldShow = progress >= 0.84;
        if (shouldShow !== cardShown) {
          cardShown = shouldShow;
          setCardVisible(shouldShow);
        }
      }

      frame = requestAnimationFrame(tick);
    };

    draw(readProgress());
    frame = requestAnimationFrame(tick);

    const observer = new ResizeObserver(() => {
      build();
      lastProgress = -1;
      draw(readProgress());
    });
    observer.observe(wrap);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [trackRef]);

  return (
    <div
      ref={wrapRef}
      className="relative mx-auto aspect-square w-full max-w-[260px] sm:max-w-[340px] lg:max-w-[420px]"
    >
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0" />
      <AgentCard visible={cardVisible} />
    </div>
  );
}
