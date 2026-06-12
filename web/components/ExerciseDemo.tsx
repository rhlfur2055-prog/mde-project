"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_CONNECTIONS, poseAt } from "@/lib/exercise/demos";

export type Gender = "male" | "female";

// 운동 시범. public/exercises/{id}-{gender}.gif 가 있으면 그 GIF(Gym Visual 등 라이선스
// 자산)를 보여주고, 없으면 우리 스틱피겨 애니메이션으로 폴백한다.
export default function ExerciseDemo({
  exerciseId,
  gender = "male",
}: {
  exerciseId: string;
  gender?: Gender;
}) {
  const gifSrc = `/exercises/${exerciseId}-${gender}.gif`;
  const [gifOk, setGifOk] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  // 운동/성별 바뀌면 GIF 다시 시도
  useEffect(() => {
    setGifOk(true);
  }, [exerciseId, gender]);

  // 폴백 스틱피겨(=GIF 실패 시에만 그림)
  useEffect(() => {
    if (gifOk) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    startRef.current = 0;
    const draw = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const p = poseAt(exerciseId, ts - startRef.current);
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      if (p) {
        const X = (v: number) => v * w;
        const Y = (v: number) => v * h;
        ctx.strokeStyle = "#a3e635";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        for (const [a, b] of DEMO_CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo(X(p[a][0]), Y(p[a][1]));
          ctx.lineTo(X(p[b][0]), Y(p[b][1]));
          ctx.stroke();
        }
        ctx.fillStyle = "#22d3ee";
        for (const k of Object.keys(p) as (keyof typeof p)[]) {
          ctx.beginPath();
          ctx.arc(X(p[k][0]), Y(p[k][1]), 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(X(p.head[0]), Y(p.head[1]), 12, 0, Math.PI * 2);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gifOk, exerciseId]);

  if (gifOk) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={gifSrc}
        alt="운동 시범"
        width={240}
        height={300}
        onError={() => setGifOk(false)}
        className="h-[300px] w-[240px] rounded-lg bg-zinc-100 object-contain dark:bg-zinc-800"
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={240}
      height={300}
      className="rounded-lg bg-zinc-100 dark:bg-zinc-800"
    />
  );
}
