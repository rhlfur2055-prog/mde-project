"use client";

import { useState } from "react";

// 측정 자세 가이드 — "어디서 / 어떤 각도 / 어떻게 서야 하는지" 예시.
// 남/여 표본 사진(정면·측면) + 폰 거치 영상 + 단계 프롬프트. 자산: public/guide/.

type Gender = "woman" | "man";

function ModelShot({
  src,
  label,
  alignLine = false,
}: {
  src: string;
  label: string;
  alignLine?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-48 w-32 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} className="h-full w-full object-contain" />
        <div className="pointer-events-none absolute inset-1 rounded-md border border-dashed border-zinc-400/60" />
        {alignLine && (
          <div className="pointer-events-none absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-cyan-400/70" />
        )}
      </div>
      <span className="mt-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
    </div>
  );
}

export default function CaptureGuide() {
  const [gender, setGender] = useState<Gender>("woman");
  // 남자 측면 표본이 아직 없어 정렬 기준 동일한 여자 측면을 공용으로 사용.
  const front = gender === "man" ? "/guide/man-front.jpg" : "/guide/woman-front.jpg";
  const side = "/guide/woman-side.jpg";

  const steps = [
    "📱 폰을 벽·거치대에 세워 고정 — 카메라 높이는 배꼽~허리(약 1m)",
    "📏 머리부터 발끝까지 다 보이게 2~3걸음(약 2m) 물러서기",
    "💡 밝고 단순한 배경, 몸 윤곽이 보이는 옷(레깅스·딱 붙는 상의)",
    "🧍 정면: 차렷 자세로 카메라를 보고 서기 → 신뢰도가 차면 자동 확인",
    "↪️ 측면(거북목·라운드숄더): 옆으로 90° 돌아 같은 자세로 한 번 더",
  ];

  return (
    <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-black dark:text-zinc-50">📐 이렇게 서주세요 (측정 가이드)</h2>
        <div className="flex overflow-hidden rounded-full border border-zinc-300 text-xs dark:border-zinc-700">
          {(["woman", "man"] as Gender[]).map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`px-3 py-1 ${
                gender === g ? "bg-foreground text-background" : "text-zinc-600 dark:text-zinc-300"
              }`}
            >
              {g === "woman" ? "여성" : "남성"}
            </button>
          ))}
        </div>
      </div>

      {/* 폰 거치 · 거리 다이어그램(영상) */}
      <div className="mt-4 flex flex-col items-center">
        <video
          src="/guide/phone-setup.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="h-40 w-full max-w-sm rounded-lg bg-zinc-100 object-contain dark:bg-zinc-800"
        />
        <span className="mt-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
          폰 거치 · 거리 (약 1m 높이 · 2m 거리)
        </span>
      </div>

      <div className="mt-4 flex items-center justify-center gap-6">
        <ModelShot src={front} label="① 정면" />
        <ModelShot src={side} label="② 측면 (옆모습)" alignLine />
      </div>

      <ol className="mt-4 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-semibold text-lime-600">{i + 1}.</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        거북목·라운드숄더는 <strong>측면(옆모습)</strong>에서만 측정됩니다. 정면만 찍으면 좌우 대칭·황금비만 나와요.
      </p>

      <details className="mt-2 text-xs text-zinc-500">
        <summary className="cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-300">
          측정 방식과 한계 (꼭 읽어주세요)
        </summary>
        <p className="mt-2 leading-5">
          2D 카메라 + MediaPipe 온디바이스 골격 추정으로 각도·비율을 계산합니다. <strong>임상 진단·절대 측정값이
          아니라 상대 지표</strong>이며, 조명·복장·촬영 각도에 따라 값이 달라질 수 있습니다. 가장 정확한 사용법은
          <strong> 같은 환경에서 주기적으로 재측정해 “변화(추세)”를 추적</strong>하는 것입니다. 통증·질환이
          의심되면 전문가 평가를 먼저 받으세요.
        </p>
      </details>
    </div>
  );
}
