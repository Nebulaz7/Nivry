"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  r: number;
  alpha: number;
  drift: number;
};

const STAR_COUNT = 130;
const MINT: [number, number, number] = [209, 250, 229];

/** Solid dots only. No gradients, no glow, no shader. */
export function Starfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      stars = Array.from({ length: STAR_COUNT }, () => {
        const tier = Math.random();
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: tier > 0.92 ? 1.6 : tier > 0.6 ? 1 : 0.7,
          alpha: tier > 0.92 ? 0.75 : tier > 0.6 ? 0.35 : 0.16,
          drift: 0.04 + Math.random() * 0.12,
        };
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        ctx.fillStyle = `rgba(${MINT[0]}, ${MINT[1]}, ${MINT[2]}, ${star.alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const step = () => {
      if (!visible) return;

      for (const star of stars) {
        star.y += star.drift;
        if (star.y > height + 2) {
          star.y = -2;
          star.x = Math.random() * width;
        }
      }

      draw();
      frame = requestAnimationFrame(step);
    };

    build();
    draw();

    if (!reduced) frame = requestAnimationFrame(step);

    const onResize = () => {
      build();
      draw();
    };

    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      if (visible && !reduced) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(step);
      }
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
