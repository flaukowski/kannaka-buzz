/**
 * The Hive's signature: a two-source interference field, Kannaka's
 * wave-interference memory model rendered as ambience behind the login.
 * Two point sources emit circular waves; where they agree the field
 * glows honey, where they oppose it cools toward phase-teal.
 * Respects prefers-reduced-motion by rendering a single static frame.
 */

import { useEffect, useRef } from "react";

const CELL = 14; // coarse grid keeps it ambient (and cheap)

export function WaveField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (t: number) => {
      const { width: w, height: h } = canvas;
      if (w === 0 || h === 0) return;
      ctx.clearRect(0, 0, w, h);
      const s1 = { x: w * 0.32, y: h * 0.38 };
      const s2 = { x: w * 0.68, y: h * 0.62 };
      const k = 0.045; // spatial frequency
      const phase = t * 0.0006;
      for (let y = 0; y < h; y += CELL) {
        for (let x = 0; x < w; x += CELL) {
          const d1 = Math.hypot(x - s1.x, y - s1.y);
          const d2 = Math.hypot(x - s2.x, y - s2.y);
          const a = Math.sin(d1 * k - phase) + Math.sin(d2 * k - phase);
          const strength = Math.abs(a) / 2; // 0..1
          if (strength < 0.42) continue;
          const constructive = a > 0;
          const alpha = (strength - 0.42) * 0.5;
          ctx.fillStyle = constructive
            ? `rgba(232, 184, 75, ${alpha})` // honey
            : `rgba(94, 224, 198, ${alpha * 0.55})`; // phase-teal, quieter
          const r = 1 + strength * 1.6;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    if (reduceMotion) {
      draw(400);
    } else {
      const loop = (t: number) => {
        if (!running) return;
        draw(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
    />
  );
}
