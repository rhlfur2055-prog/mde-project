// posera 진척 추세 — 점수 이력을 시계열 좌표로 변환(순수·결정적, 테스트 가능).
// 차트 컴포넌트는 본 기하만 그린다(로직/그리기 분리). y축은 0~100 고정(스케일 안정).

export type TrendPoint = { t: number; score: number };
export type TrendDot = { x: number; y: number; score: number; t: number };

// 스캔 이력(정렬 무관) → 점수 있는 점만 시간 오름차순.
export function toTrendPoints(
  scans: { taken_at: string; overall_score: number | null }[],
): TrendPoint[] {
  return scans
    .filter((s) => s.overall_score != null)
    .map((s) => ({ t: new Date(s.taken_at).getTime(), score: s.overall_score as number }))
    .sort((a, b) => a.t - b.t);
}

// 점들을 [pad, w-pad] × [pad, h-pad] 박스로 매핑. score 100=상단(y=pad), 0=하단.
// 점이 1개면 가로 중앙에 둔다(시간 span 0 방지).
export function trendGeometry(
  points: TrendPoint[],
  w: number,
  h: number,
  pad: number,
): TrendDot[] {
  if (points.length === 0) return [];
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const tmin = points[0].t;
  const tmax = points[points.length - 1].t;
  const tspan = tmax - tmin;
  return points.map((p) => ({
    x: tspan === 0 ? pad + innerW / 2 : pad + ((p.t - tmin) / tspan) * innerW,
    y: pad + (1 - clamp01(p.score / 100)) * innerH,
    score: p.score,
    t: p.t,
  }));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// SVG polyline points 속성 문자열("x,y x,y …").
export function polylinePoints(dots: TrendDot[]): string {
  return dots.map((d) => `${round1(d.x)},${round1(d.y)}`).join(" ");
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
