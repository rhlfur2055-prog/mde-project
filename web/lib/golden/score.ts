// posera 체형·자세 점수 엔진 — 순수 함수(의존성 0, 테스트 가능).
// 입력: MediaPipe 자세 랜드마크(정규화 좌표, y는 아래로 증가).
// MediaPipe import를 피하려고 최소 타입만 정의 → core 순수성 유지(spec §2.8 정신).
import { GOLDEN, LM } from "./poseConfig";

export type Pt = { x: number; y: number; z?: number; visibility?: number };

export type BodyMetrics = {
  symmetry: {
    available: boolean;
    score: number; // 0~100
    shoulderTiltDeg: number;
    hipTiltDeg: number;
    headTiltDeg: number;
  };
  golden: {
    available: boolean;
    score: number; // 0~100
    lowerUpperRatio: number; // 하체:상체
    phi: number;
  };
  overall: { score: number; grade: "A" | "B" | "C" | "D" | "-" };
  deviations: string[]; // 사람이 읽는 코멘트
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

// 두 점을 잇는 선이 수평에서 벗어난 각도 [0,90]
export function lineTiltDeg(a: Pt, b: Pt): number {
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  let d = Math.abs(ang) % 180;
  if (d > 90) d = 180 - d;
  return d;
}

const visible = (p: Pt | undefined): p is Pt =>
  !!p && (p.visibility === undefined || p.visibility >= GOLDEN.VISIBILITY_MIN);

const round1 = (v: number) => Math.round(v * 10) / 10;

function gradeOf(score: number): "A" | "B" | "C" | "D" {
  if (score >= GOLDEN.GRADE.A) return "A";
  if (score >= GOLDEN.GRADE.B) return "B";
  if (score >= GOLDEN.GRADE.C) return "C";
  return "D";
}

// "낮은 쪽" 판정: y가 큰 쪽이 화면 아래(낮음). subject 기준 좌/우 라벨.
function lowerSideNote(label: string, left: Pt, right: Pt, deg: number): string {
  const side = left.y > right.y ? "왼쪽" : "오른쪽";
  return `${label} 기울기 ${round1(deg)}° (${side}이 낮음)`;
}

export function computeBodyMetrics(lm: Pt[]): BodyMetrics {
  const get = (i: number): Pt | undefined => lm[i];
  const lSh = get(LM.LEFT_SHOULDER);
  const rSh = get(LM.RIGHT_SHOULDER);
  const lHip = get(LM.LEFT_HIP);
  const rHip = get(LM.RIGHT_HIP);
  const lEar = get(LM.LEFT_EAR);
  const rEar = get(LM.RIGHT_EAR);
  const lAnk = get(LM.LEFT_ANKLE);
  const rAnk = get(LM.RIGHT_ANKLE);

  const deviations: string[] = [];

  // ── 좌우 대칭 ──
  const shOk = visible(lSh) && visible(rSh);
  const hipOk = visible(lHip) && visible(rHip);
  const headOk = visible(lEar) && visible(rEar);

  const shoulderTiltDeg = shOk ? lineTiltDeg(lSh!, rSh!) : 0;
  const hipTiltDeg = hipOk ? lineTiltDeg(lHip!, rHip!) : 0;
  const headTiltDeg = headOk ? lineTiltDeg(lEar!, rEar!) : 0;

  const symAvailable = shOk; // 최소 어깨가 보이면 대칭 평가
  let symmetryScore = 0;
  if (symAvailable) {
    symmetryScore = clamp(
      100 -
        (shoulderTiltDeg * GOLDEN.W_SHOULDER_TILT +
          hipTiltDeg * GOLDEN.W_HIP_TILT +
          headTiltDeg * GOLDEN.W_HEAD_TILT),
    );
    const T = GOLDEN.TILT_NOTE_THRESHOLD_DEG;
    if (shOk && shoulderTiltDeg >= T)
      deviations.push(lowerSideNote("어깨", lSh!, rSh!, shoulderTiltDeg));
    if (hipOk && hipTiltDeg >= T)
      deviations.push(lowerSideNote("골반", lHip!, rHip!, hipTiltDeg));
    if (headOk && headTiltDeg >= T)
      deviations.push(lowerSideNote("머리", lEar!, rEar!, headTiltDeg));
  }

  // ── 황금비 (하체:상체) ──
  const goldenOk = shOk && hipOk && visible(lAnk) && visible(rAnk);
  let lowerUpperRatio = 0;
  let goldenScore = 0;
  if (goldenOk) {
    const shMid = mid(lSh!, rSh!);
    const hipMid = mid(lHip!, rHip!);
    const ankMid = mid(lAnk!, rAnk!);
    const upper = dist(shMid, hipMid); // 상체(어깨~골반)
    const lower = dist(hipMid, ankMid); // 하체(골반~발목)
    if (upper > 1e-6) {
      lowerUpperRatio = lower / upper;
      const relDev = Math.abs(lowerUpperRatio - GOLDEN.PHI) / GOLDEN.PHI;
      goldenScore = clamp(100 - relDev * GOLDEN.GOLDEN_DEV_PENALTY);
    }
  } else {
    deviations.push("황금비는 전신(발목까지)이 보일 때 측정됩니다");
  }

  // ── 종합 ──
  const parts: number[] = [];
  if (symAvailable) parts.push(symmetryScore);
  if (goldenOk) parts.push(goldenScore);
  const overallScore = parts.length
    ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length)
    : 0;

  return {
    symmetry: {
      available: symAvailable,
      score: Math.round(symmetryScore),
      shoulderTiltDeg: round1(shoulderTiltDeg),
      hipTiltDeg: round1(hipTiltDeg),
      headTiltDeg: round1(headTiltDeg),
    },
    golden: {
      available: goldenOk,
      score: Math.round(goldenScore),
      lowerUpperRatio: round1(lowerUpperRatio),
      phi: GOLDEN.PHI,
    },
    overall: {
      score: overallScore,
      grade: parts.length ? gradeOf(overallScore) : "-",
    },
    deviations,
  };
}
