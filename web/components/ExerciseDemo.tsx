"use client";

import { useEffect, useRef } from "react";
import { DEMO_CONNECTIONS, poseAt } from "@/lib/exercise/demos";

// 운동 시범 아바타 — 키프레임을 보간해 반복 재생하는 스틱피겨(카메라 불필요).
export default function ExerciseDemo({ exerciseId }: { exerciseId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const p = poseAt(exerciseId, ts - startRef.current);
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      if (p) {
        const X = (v: number) => v * w;
        const Y = (v: number) => v * h;
        // 뼈대
        ctx.strokeStyle = "#a3e635";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        for (const [a, b] of DEMO_CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo(X(p[a][0]), Y(p[a][1]));
          ctx.lineTo(X(p[b][0]), Y(p[b][1]));
          ctx.stroke();
        }
        // 관절점
        ctx.fillStyle = "#22d3ee";
        for (const k of Object.keys(p) as (keyof typeof p)[]) {
          ctx.beginPath();
          ctx.arc(X(p[k][0]), Y(p[k][1]), 4, 0, Math.PI * 2);
          ctx.fill();
        }
        // 머리 원
        ctx.beginPath();
        ctx.arc(X(p.head[0]), Y(p.head[1]), 12, 0, Math.PI * 2);
        ctx.fillStyle = "#22d3ee";
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [exerciseId]);

  return (
    <canvas
      ref={canvasRef}
      width={240}
      height={300}
      className="rounded-lg bg-zinc-100 dark:bg-zinc-800"
    />
  );
}
