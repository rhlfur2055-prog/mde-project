"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_CONNECTIONS, poseAt } from "@/lib/exercise/demos";

export type Gender = "man" | "woman";

// 운동 시범 — 3단 폴백:
//  ① public/exercises/{id}-{gender}.mp4 (영상, 표본)
//  ② .gif (GIF)
//  ③ 우리 마네킹 캐릭터(코드, 무료)
export default function ExerciseDemo({
  exerciseId,
  gender = "man",
}: {
  exerciseId: string;
  gender?: Gender;
}) {
  // 네가 둔 형식 그대로: exercises/{운동}/{운동}-{man|woman}.mp4
  const base = `/exercises/${exerciseId}/${exerciseId}-${gender}`;
  const [tier, setTier] = useState<"video" | "gif" | "avatar">("video");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  // 운동/성별 바뀌면 영상부터 다시 시도
  useEffect(() => {
    setTier("video");
  }, [exerciseId, gender]);

  // 마네킹(폴백) — tier가 avatar일 때만 그림
  useEffect(() => {
    if (tier !== "avatar") return;
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
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const body = ctx.createLinearGradient(0, 0, 0, h);
        body.addColorStop(0, "#b8c2d4");
        body.addColorStop(1, "#5b6b85");
        const ARM = w * 0.055;
        const LEG = w * 0.07;
        const stroke = (a: typeof p.head, b: typeof p.head, lw: number) => {
          ctx.strokeStyle = body;
          ctx.lineWidth = lw;
          ctx.beginPath();
          ctx.moveTo(X(a[0]), Y(a[1]));
          ctx.lineTo(X(b[0]), Y(b[1]));
          ctx.stroke();
        };
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(X(p.lSh[0]), Y(p.lSh[1]));
        ctx.lineTo(X(p.rSh[0]), Y(p.rSh[1]));
        ctx.lineTo(X(p.rHip[0]), Y(p.rHip[1]));
        ctx.lineTo(X(p.lHip[0]), Y(p.lHip[1]));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = body;
        ctx.lineWidth = w * 0.05;
        ctx.stroke();
        stroke(p.lHip, p.lKn, LEG);
        stroke(p.lKn, p.lAnk, LEG * 0.85);
        stroke(p.rHip, p.rKn, LEG);
        stroke(p.rKn, p.rAnk, LEG * 0.85);
        stroke(p.lSh, p.lEl, ARM);
        stroke(p.lEl, p.lWr, ARM * 0.85);
        stroke(p.rSh, p.rEl, ARM);
        stroke(p.rEl, p.rWr, ARM * 0.85);
        const neck: [number, number] = [
          (p.lSh[0] + p.rSh[0]) / 2,
          (p.lSh[1] + p.rSh[1]) / 2,
        ];
        stroke(neck, p.head, w * 0.045);
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(X(p.head[0]), Y(p.head[1]), w * 0.08, 0, Math.PI * 2);
        ctx.fill();
        for (const k of ["lWr", "rWr", "lAnk", "rAnk"] as const) {
          ctx.beginPath();
          ctx.arc(X(p[k][0]), Y(p[k][1]), ARM * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tier, exerciseId]);

  const cls = "h-[300px] w-[240px] rounded-lg bg-zinc-100 object-contain dark:bg-zinc-800";

  if (tier === "video") {
    // 투명 webm(배경 제거본) 우선, 없으면 mp4. 배경 박스 없이 캐릭터만.
    return (
      <video
        autoPlay
        loop
        muted
        playsInline
        onError={() => setTier("gif")}
        className="h-[300px] w-[240px] object-contain"
      >
        <source src={`${base}.webm`} type="video/webm" />
        <source src={`${base}.mp4`} type="video/mp4" />
      </video>
    );
  }
  if (tier === "gif") {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={`${base}.gif`}
        alt="운동 시범"
        width={240}
        height={300}
        onError={() => setTier("avatar")}
        className={cls}
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
