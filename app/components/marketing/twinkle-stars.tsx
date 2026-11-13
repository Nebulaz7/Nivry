"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  radius: number;
  phase: number;
  speed: number;
  base: number;
};

type Props = {
  count?: number;
  /** Vertical drift in px per second. 0 keeps the field static. */
  drift?: number;
};

/** Solid dots whose alpha pulses. Optionally drifts, so it reads as a sky. */
export function TwinkleStars({ count = 90, drift = 0 }: Props) {
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
    let lastTime = 0;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      stars = Array.from({ length: count }, () => {
        const tier = Math.random();
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          radius: tier > 0.92 ? 1.7 : tier > 0.6 ? 1.1 : 0.7,
          phase: Math.random() * Math.PI * 2,
          speed: 0.0005 + Math.random() * 0.0013,
          base: 0.16 + Math.random() * 0.42,
        };
      });
    };

    const paint = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        const pulse = reduced
          ? 0.62
          : 0.5 + 0.5 * Math.sin(time * star.speed + star.phase);
        const alpha = star.base * (0.3 + 0.7 * pulse);
        ctx.fillStyle = `rgba(209, 250, 229, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = (time: number) => {
      const delta = lastTime === 0 ? 0 : time - lastTime;
      lastTime = time;

      if (drift !== 0 && delta > 0) {
        for (const star of stars) {
          star.y += (drift * delta) / 1000;
          if (star.y > height + 2) {
            star.y = -2;
            star.x = Math.random() * width;
          }
        }
      }

      paint(time);
      frame = requestAnimationFrame(loop);
    };

    build();
    if (reduced) {
      paint(0);
    } else {
      frame = requestAnimationFrame(loop);
    }

    const onResize = () => {
      build();
      paint(performance.now());
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [count, drift]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
