// posera 다중 프레임 집계 + 경량 게이팅 — 순수 함수(의존성 0, 결정적, 테스트 가능).
// 단일 프레임 점수 튐을 제거: 게이트 통과 프레임만 모아 랜드마크 median 집계 → 1회 점수 산출.
// 본 모듈의 산출 계약 AggregatedMetrics 는 SSOT — detectPostureIssues/program/UI 는 오직 이 타입으로만 metrics 에 접근한다.
import { LM, AGGREGATE } from "./poseConfig";
import {
  computeBodyMetrics,
  isSideView,
  forwardHeadCvaDeg,
  shoulderProtractionDeg,
  kneeVarusDeg,
  type BodyMetrics,
  type Pt,
} from "./score";
import { assessFrameQuality } from "./frameQuality";

// ── 산출 계약(LOCK) ── 임의 필드 추가·이름 변경 금지(변경 시 사전 승인).
export type AggregatedMetrics = {
  metrics: BodyMetrics; // 부호 tilt 필드 포함(score.ts)
  posture: {
    // 측면/무릎 보조지표 — 집계 median 랜드마크에서 산출(단일 프레임 금지)
    cvaDeg: number;
    cvaAvailable: boolean; // 거북목(측면 전용)
    protractionDeg: number;
    protractionAvailable: boolean; // 라운드숄더(측면 전용)
    varusDeg: number;
    valgusDeg: number;
    kneeAvailable: boolean; // 오/X다리(정면 전용)
  };
  stability: { cvByMetric: Record<string, number> }; // 메트릭별 변동계수(CV)
  gatePassed: boolean; // frameQuality + 경량 정면도/거리 게이트 통과
  confidence: number; // 0~1 (안정성·가시성 기반)
  framesUsed: number; // 집계에 쓰인 게이트 통과 프레임 수
};

// ── 통계 헬퍼(결정적) ──
function median(a: number[]): number {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mean = (a: number[]): number =>
  a.length ? a.reduce((p, q) => p + q, 0) / a.length : 0;
function std(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
}
// 변동계수: 평균이 ~0이면 0(무의미한 발산 방지)
function cv(a: number[]): number {
  const m = Math.abs(mean(a));
  return m < 1e-6 ? 0 : std(a) / m;
}
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;

// 프레임들의 per-landmark median 좌표(이상치 강건). 길이는 최대 프레임 기준.
export function aggregateLandmarks(frames: Pt[][]): Pt[] {
  if (frames.length === 0) return [];
  const n = Math.max(...frames.map((f) => f.length));
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    const vs: number[] = [];
    for (const f of frames) {
      const p = f[i];
      if (!p) continue;
      xs.push(p.x);
      ys.push(p.y);
      if (p.z !== undefined) zs.push(p.z);
      vs.push(p.visibility ?? 1);
    }
    out[i] = {
      x: median(xs),
      y: median(ys),
      z: zs.length ? median(zs) : undefined,
      visibility: median(vs),
    };
  }
  return out;
}

// 경량 정면도(yaw) 게이트: 측면이 아니고, 좌/우 체간 길이 대칭비가 임계 이상이면 정면으로 인정.
function frontalOk(lm: Pt[]): boolean {
  const lSh = lm[LM.LEFT_SHOULDER];
  const rSh = lm[LM.RIGHT_SHOULDER];
  const lHip = lm[LM.LEFT_HIP];
  const rHip = lm[LM.RIGHT_HIP];
  if (!lSh || !rSh || !lHip || !rHip) return false;
  if (isSideView(lm)) return false; // 측면이면 정면 지표(대칭/황금비) 불가
  const lTorso = Math.hypot(lSh.x - lHip.x, lSh.y - lHip.y);
  const rTorso = Math.hypot(rSh.x - rHip.x, rSh.y - rHip.y);
  const denom = Math.max(lTorso, rTorso) || 1e-6;
  return Math.min(lTorso, rTorso) / denom >= AGGREGATE.FRONTAL_SYMMETRY_MIN;
}

// 경량 거리 게이트: 정규화 체간높이(어깨중점~골반중점 y)가 허용 밴드 안인가.
function distanceOk(lm: Pt[]): boolean {
  const lSh = lm[LM.LEFT_SHOULDER];
  const rSh = lm[LM.RIGHT_SHOULDER];
  const lHip = lm[LM.LEFT_HIP];
  const rHip = lm[LM.RIGHT_HIP];
  if (!lSh || !rSh || !lHip || !rHip) return false;
  const torsoH = Math.abs((lHip.y + rHip.y) / 2 - (lSh.y + rSh.y) / 2);
  return torsoH >= AGGREGATE.TORSO_H_MIN && torsoH <= AGGREGATE.TORSO_H_MAX;
}

// 핵심 체간 랜드마크 평균 가시성(confidence 가중)
function coreVisibility(lm: Pt[]): number {
  const core = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER, LM.LEFT_HIP, LM.RIGHT_HIP];
  return mean(core.map((i) => (lm[i] ? (lm[i].visibility ?? 1) : 0)));
}

// 롤링 윈도 프레임 → 집계 결과(계약). 동일 입력 → 동일 출력(결정적).
export function aggregateFrames(frames: Pt[][]): AggregatedMetrics {
  const passing = frames.filter((f) => assessFrameQuality(f).ok);
  // 표시용 폴백: 통과 프레임이 없으면 전체로 metrics 라도 산출(단 gatePassed=false)
  const source = passing.length ? passing : frames;
  const medLm = aggregateLandmarks(source);
  const metrics = computeBodyMetrics(medLm);

  // 보조지표(측면/무릎)도 동일한 집계 랜드마크에서 산출 — detect 가 agg 만 소비하도록.
  const cva = medLm.length ? forwardHeadCvaDeg(medLm) : { available: false, cvaDeg: 0 };
  const prot = medLm.length
    ? shoulderProtractionDeg(medLm)
    : { available: false, protractionDeg: 0 };
  const knee = medLm.length
    ? kneeVarusDeg(medLm)
    : { available: false, varusDeg: 0, valgusDeg: 0 };
  const posture = {
    cvaDeg: cva.cvaDeg,
    cvaAvailable: cva.available,
    protractionDeg: prot.protractionDeg,
    protractionAvailable: prot.available,
    varusDeg: knee.available ? knee.varusDeg : 0,
    valgusDeg: knee.available ? knee.valgusDeg : 0,
    kneeAvailable: knee.available,
  };

  // 안정성: 통과 프레임별 점수 분포의 변동계수
  const perFrame = passing.map((f) => computeBodyMetrics(f));
  const cvByMetric: Record<string, number> = {
    overall: round2(cv(perFrame.map((m) => m.overall.score))),
    symmetry: round2(cv(perFrame.map((m) => m.symmetry.score))),
    golden: round2(
      cv(perFrame.filter((m) => m.golden.available).map((m) => m.golden.score)),
    ),
  };

  const enoughFrames = passing.length >= AGGREGATE.MIN_FRAMES;
  const frontal = medLm.length > 0 && frontalOk(medLm);
  const near = medLm.length > 0 && distanceOk(medLm);
  const gatePassed = enoughFrames && frontal && near;

  // confidence: 안정성(overall CV ↓ → ↑) × 핵심 가시성, 프레임 부족 시 비례 감점
  const stabilityFactor = clamp01(1 - cvByMetric.overall / AGGREGATE.CV_FULL_PENALTY);
  const visFactor = clamp01(coreVisibility(medLm));
  const frameFactor = enoughFrames
    ? 1
    : clamp01(passing.length / AGGREGATE.MIN_FRAMES);
  const confidence = round2(stabilityFactor * visFactor * frameFactor);

  return {
    metrics,
    posture,
    stability: { cvByMetric },
    gatePassed,
    confidence,
    framesUsed: passing.length,
  };
}
