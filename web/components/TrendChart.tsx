"use client";

import { toTrendPoints, trendGeometry, polylinePoints } from "@/lib/progress/trend";
import type { ScanRow } from "@/lib/supabase/scans";

const W = 320;
const H = 96;
const PAD = 12;

// 점수 추세 라인(0~100 고정축). 의존성 없는 인라인 SVG — 차트 라이브러리 미도입(spec: 의존성 최소).
export default function TrendChart({ scans }: { scans: ScanRow[] }) {
  const points = toTrendPoints(scans);
  if (points.length < 2) return null; // 2점 이상부터 추세 의미

  const dots = trendGeometry(points, W, H, PAD);
  const line = polylinePoints(dots);
  const first = points[0].score;
  const last = points[points.length - 1].score;
  const delta = last - first;
  const lastDot = dots[dots.length - 1];

  return (
    <div className="w-full rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm text-zinc-500">점수 추세 · {points.length}회</h2>
        <span
          className={`text-sm font-semibold tabular-nums ${
            delta > 0 ? "text-lime-600" : delta < 0 ? "text-red-500" : "text-zinc-500"
          }`}
        >
          {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "± 0"}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="점수 추세 그래프">
        {/* 50점 기준선 */}
        <line
          x1={PAD}
          y1={PAD + (H - PAD * 2) / 2}
          x2={W - PAD}
          y2={PAD + (H - PAD * 2) / 2}
          stroke="currentColor"
          className="text-zinc-200 dark:text-zinc-700"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <polyline
          points={line}
          fill="none"
          stroke="#65a30d"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={i === dots.length - 1 ? 4 : 2.5}
            fill={i === dots.length - 1 ? "#65a30d" : "#a3e635"}
          />
        ))}
        <text x={lastDot.x} y={Math.max(10, lastDot.y - 7)} textAnchor="middle" className="fill-zinc-500 text-[10px]">
          {last}
        </text>
      </svg>
    </div>
  );
}
