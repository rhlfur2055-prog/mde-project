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

        // 1) 정렬 가이드 — 자세교정 톤(수직 기준선 + 어깨·골반 수평선)
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "rgba(148,163,184,0.55)";
        ctx.lineWidth = 1.5;
        const cx = (p.lSh[0] + p.rSh[0]) / 2;
        ctx.beginPath();
        ctx.moveTo(X(cx), Y(0.05));
        ctx.lineTo(X(cx), Y(0.99));
        ctx.stroke();
        for (const [l, r] of [
          [p.lSh, p.rSh],
          [p.lHip, p.rHip],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(X(l[0]) - 12, Y(l[1]));
          ctx.lineTo(X(r[0]) + 12, Y(r[1]));
          ctx.stroke();
        }
        ctx.restore();

        // 2) 몸통 채움(연한 청록 = 웰니스 톤)
        ctx.fillStyle = "rgba(45,212,191,0.16)";
        ctx.beginPath();
        ctx.moveTo(X(p.lSh[0]), Y(p.lSh[1]));
        ctx.lineTo(X(p.rSh[0]), Y(p.rSh[1]));
        ctx.lineTo(X(p.rHip[0]), Y(p.rHip[1]));
        ctx.lineTo(X(p.lHip[0]), Y(p.lHip[1]));
        ctx.closePath();
        ctx.fill();

        // 3) 팔다리(굵은 라인 = 몸 느낌)
        ctx.strokeStyle = "#2dd4bf";
        ctx.lineWidth = 8;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const [a, b] of DEMO_CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo(X(p[a][0]), Y(p[a][1]));
          ctx.lineTo(X(p[b][0]), Y(p[b][1]));
          ctx.stroke();
        }

        // 4) 관절 + 머리
        ctx.fillStyle = "#0f766e";
        for (const k of Object.keys(p) as (keyof typeof p)[]) {
          ctx.beginPath();
          ctx.arc(X(p[k][0]), Y(p[k][1]), 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(X(p.head[0]), Y(p.head[1]), 14, 0, Math.PI * 2);
        ctx.fillStyle = "#2dd4bf";
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
