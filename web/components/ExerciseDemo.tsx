"use client";

import { useEffect, useRef, useState } from "react";
import { poseAt, type DemoPose, type Joint } from "@/lib/exercise/demos";

export type Gender = "man" | "woman";

// 운동 시범 — 외부 영상/이미지 없이 코드로 그리는 SVG 맨몸 피겨.
// lib/exercise/demos.ts 의 키프레임을 보간(poseAt)해 운동별 동작을 반복 재생한다.
// (이전 mp4/gif 폴백 제거 — 모든 운동을 일관된 SVG로, 항상 동작이 정확히 맞게.)
export default function ExerciseDemo({
  exerciseId,
  gender = "man",
}: {
  exerciseId: string;
  gender?: Gender;
}) {
  const [pose, setPose] = useState<DemoPose | null>(() => poseAt(exerciseId, 0));
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const lastRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = 0;
    lastRef.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPose(poseAt(exerciseId, 0));
    const loop = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      if (ts - lastRef.current >= 33) {
        // ~30fps
        lastRef.current = ts;
        setPose(poseAt(exerciseId, ts - startRef.current));
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [exerciseId]);

  const VB_W = 100;
  const VB_H = 125;
  const X = (v: number) => v * VB_W;
  const Y = (v: number) => v * VB_H;
  const cls = "h-[300px] w-[240px] rounded-lg bg-zinc-100 dark:bg-zinc-800";

  if (!pose) {
    return (
      <div className={`${cls} flex items-center justify-center text-xs text-zinc-400`}>
        시범 준비 중
      </div>
    );
  }

  // 성별로 색만 살짝 다르게(토글이 보이게) — 도식 피겨라 형태는 동일.
  const bodyTop = gender === "woman" ? "#b48ec4" : "#8a98b4";
  const bodyBot = gender === "woman" ? "#7d5e94" : "#5b6b85";
  const ARM = 5.5;
  const LEG = 7;
  const neck: [number, number] = [(pose.lSh[0] + pose.rSh[0]) / 2, (pose.lSh[1] + pose.rSh[1]) / 2];

  const limb = (a: [number, number], b: [number, number], w: number) => (
    <line
      x1={X(a[0])}
      y1={Y(a[1])}
      x2={X(b[0])}
      y2={Y(b[1])}
      stroke="url(#bodyGrad)"
      strokeWidth={w}
      strokeLinecap="round"
    />
  );
  const dot = (k: Joint, r: number) => (
    <circle cx={X(pose[k][0])} cy={Y(pose[k][1])} r={r} fill="url(#bodyGrad)" />
  );

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className={cls} role="img" aria-label="운동 시범">
      <defs>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bodyTop} />
          <stop offset="1" stopColor={bodyBot} />
        </linearGradient>
      </defs>

      {/* 다리 */}
      {limb(pose.lHip, pose.lKn, LEG)}
      {limb(pose.lKn, pose.lAnk, LEG * 0.85)}
      {limb(pose.rHip, pose.rKn, LEG)}
      {limb(pose.rKn, pose.rAnk, LEG * 0.85)}

      {/* 몸통 */}
      <polygon
        points={`${X(pose.lSh[0])},${Y(pose.lSh[1])} ${X(pose.rSh[0])},${Y(pose.rSh[1])} ${X(
          pose.rHip[0],
        )},${Y(pose.rHip[1])} ${X(pose.lHip[0])},${Y(pose.lHip[1])}`}
        fill="url(#bodyGrad)"
        stroke="url(#bodyGrad)"
        strokeWidth={5}
        strokeLinejoin="round"
      />

      {/* 팔 */}
      {limb(pose.lSh, pose.lEl, ARM)}
      {limb(pose.lEl, pose.lWr, ARM * 0.85)}
      {limb(pose.rSh, pose.rEl, ARM)}
      {limb(pose.rEl, pose.rWr, ARM * 0.85)}

      {/* 목 + 머리 */}
      {limb(neck, pose.head, 4.5)}
      <circle cx={X(pose.head[0])} cy={Y(pose.head[1])} r={8} fill="url(#bodyGrad)" />

      {/* 손·발 */}
      {dot("lWr", 2.6)}
      {dot("rWr", 2.6)}
      {dot("lAnk", 2.6)}
      {dot("rAnk", 2.6)}
    </svg>
  );
}
