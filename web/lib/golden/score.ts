// posera 체형·자세 점수 엔진 — 순수 함수(의존성 0, 테스트 가능).
// 입력: MediaPipe 자세 랜드마크(정규화 좌표, y는 아래로 증가).
// MediaPipe import를 피하려고 최소 타입만 정의 → core 순수성 유지(spec §2.8 정신).
import { GOLDEN, LM, POSTURE } from "./poseConfig";

export type Pt = { x: number; y: number; z?: number; visibility?: number };

export type BodyMetrics = {
  symmetry: {
    available: boolean;
    score: number; // 0~100
    shoulderTiltDeg: number;
    hipTiltDeg: number;
    headTiltDeg: number;
    // 부호 포함 기울기(크기는 위 *Deg와 동일). 부호 규약 = lowerSideNote 와 동일:
    //   + = 왼쪽이 낮음(left.y > right.y), − = 오른쪽이 낮음. 미가용 시 0.
    // 기존 점수·필드 불변, 방향 판정(detectPostureIssues)용으로 "가산"만 한 필드.
    shoulderTiltSigned: number;
    hipTiltSigned: number;
    headTiltSigned: number;
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

// 공용 기하: 정점 b의 a–b–c 사이각(도) [0,180]. exercises.ts 가 재사용(중복 제거).
export function jointAngleDeg(a: Pt, b: Pt, c: Pt): number {
  const v1x = a.x - b.x,
    v1y = a.y - b.y,
    v2x = c.x - b.x,
    v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1e-6;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

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

// 부호 포함 기울기. lowerSideNote 와 동일 규약: 왼쪽이 낮으면(+), 오른쪽이 낮으면(−).
// 크기는 lineTiltDeg(=*Deg)와 동일.
function signedTilt(deg: number, left: Pt, right: Pt): number {
  const v = round1(deg * (left.y > right.y ? 1 : -1));
  return v === 0 ? 0 : v; // -0 정규화
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
      shoulderTiltSigned: shOk ? signedTilt(shoulderTiltDeg, lSh!, rSh!) : 0,
      hipTiltSigned: hipOk ? signedTilt(hipTiltDeg, lHip!, rHip!) : 0,
      headTiltSigned: headOk ? signedTilt(headTiltDeg, lEar!, rEar!) : 0,
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

// ── 촬영 평면 자동감지 ── 측면이면 양어깨가 가로로 겹쳐 어깨폭이 좁아진다.
// (정면/측면 2단 캡처 스텝을 새로 만들지 않고 기하로 추정 — 카메라 흐름 변경 없음.)
export function isSideView(lm: Pt[]): boolean {
  const lSh = lm[LM.LEFT_SHOULDER];
  const rSh = lm[LM.RIGHT_SHOULDER];
  const lHip = lm[LM.LEFT_HIP];
  const rHip = lm[LM.RIGHT_HIP];
  if (!visible(lSh) || !visible(rSh) || !visible(lHip) || !visible(rHip)) return false;
  const shoulderW = Math.abs(lSh.x - rSh.x);
  const torsoH = Math.abs(mid(lSh, rSh).y - mid(lHip, rHip).y) + 1e-6;
  return shoulderW / torsoH < POSTURE.SIDE_VIEW_SHOULDER_RATIO;
}

// ── 거북목 CVA(측면 전용) ── 어깨→귀 선이 수평에서 이루는 각. 작을수록 전방두부(FHP).
// 정면이면 계산 보류(available=false, reason=need-side) → UI가 측면 촬영을 유도.
export type CvaResult = {
  available: boolean;
  cvaDeg: number;
  reason?: "need-side" | "no-landmarks";
};
export function forwardHeadCvaDeg(lm: Pt[]): CvaResult {
  if (!isSideView(lm)) {
    const haveEar = visible(lm[LM.LEFT_EAR]) || visible(lm[LM.RIGHT_EAR]);
    return { available: false, cvaDeg: 0, reason: haveEar ? "need-side" : "no-landmarks" };
  }
  // 더 잘 보이는 쪽 귀/어깨 선택
  const score = (ei: number, si: number) =>
    (visible(lm[ei]) ? (lm[ei].visibility ?? 1) : -1) +
    (visible(lm[si]) ? (lm[si].visibility ?? 1) : -1);
  const useRight = score(LM.RIGHT_EAR, LM.RIGHT_SHOULDER) >= score(LM.LEFT_EAR, LM.LEFT_SHOULDER);
  const ear = useRight ? lm[LM.RIGHT_EAR] : lm[LM.LEFT_EAR];
  const sh = useRight ? lm[LM.RIGHT_SHOULDER] : lm[LM.LEFT_SHOULDER];
  if (!visible(ear) || !visible(sh)) return { available: false, cvaDeg: 0, reason: "no-landmarks" };
  const dx = Math.abs(ear.x - sh.x); // 귀가 어깨보다 앞으로 나갈수록 커짐
  const dy = Math.abs(sh.y - ear.y); // 귀는 어깨보다 위
  const cva = (Math.atan2(dy, dx) * 180) / Math.PI; // 수평 대비 각
  return { available: true, cvaDeg: round1(cva) };
}

// ── 라운드숄더(측면 전용) ── 골반→어깨 선이 수직에서 앞으로 기운 각. 클수록 어깨가 말림.
// 거북목(귀-어깨)과 독립. 단일 어깨점 기반 2D 근사 → 소프트 의심 지표로만 사용.
export type ProtractionResult = {
  available: boolean;
  protractionDeg: number;
  reason?: "need-side" | "no-landmarks";
};
export function shoulderProtractionDeg(lm: Pt[]): ProtractionResult {
  if (!isSideView(lm)) {
    const haveSh = visible(lm[LM.LEFT_SHOULDER]) || visible(lm[LM.RIGHT_SHOULDER]);
    return { available: false, protractionDeg: 0, reason: haveSh ? "need-side" : "no-landmarks" };
  }
  const score = (si: number, hi: number) =>
    (visible(lm[si]) ? (lm[si].visibility ?? 1) : -1) +
    (visible(lm[hi]) ? (lm[hi].visibility ?? 1) : -1);
  const useRight =
    score(LM.RIGHT_SHOULDER, LM.RIGHT_HIP) >= score(LM.LEFT_SHOULDER, LM.LEFT_HIP);
  const sh = useRight ? lm[LM.RIGHT_SHOULDER] : lm[LM.LEFT_SHOULDER];
  const hip = useRight ? lm[LM.RIGHT_HIP] : lm[LM.LEFT_HIP];
  if (!visible(sh) || !visible(hip))
    return { available: false, protractionDeg: 0, reason: "no-landmarks" };
  const dx = Math.abs(sh.x - hip.x); // 어깨가 골반보다 앞으로 나갈수록 커짐
  const dy = Math.abs(sh.y - hip.y) + 1e-6; // 몸통 높이
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI; // 수직 대비 전방경사
  return { available: true, protractionDeg: round1(deg) };
}

// ── 무릎 전두면 편차(정면 전용) ── hip–knee–ankle 직선(180°)에서 벗어난 정도 + 방향.
// 무릎이 바깥(몸 바깥쪽)으로 휘면 varus(오다리), 안쪽으로 모이면 valgus(X다리). 좌우 평균.
// 단일 관절점 2D 근사 → 소프트 의심 지표로만 사용.
export type KneeFrontalResult = { available: boolean; varusDeg: number; valgusDeg: number };
export function kneeVarusDeg(lm: Pt[]): KneeFrontalResult {
  if (isSideView(lm)) return { available: false, varusDeg: 0, valgusDeg: 0 };
  const lHip = lm[LM.LEFT_HIP];
  const rHip = lm[LM.RIGHT_HIP];
  if (!visible(lHip) || !visible(rHip)) return { available: false, varusDeg: 0, valgusDeg: 0 };
  const bodyCenterX = (lHip.x + rHip.x) / 2;
  const legs: [number, number, number][] = [
    [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
    [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  ];
  const varus: number[] = [];
  const valgus: number[] = [];
  let measured = 0;
  for (const [h, k, a] of legs) {
    if (!visible(lm[h]) || !visible(lm[k]) || !visible(lm[a])) continue;
    measured++;
    const dev = 180 - jointAngleDeg(lm[h], lm[k], lm[a]); // 휨 크기
    if (dev < 0.5) continue; // 거의 직선 → 방향 분류 안 함(노이즈 방지)
    // 무릎이 hip–ankle 중점에서 바깥쪽(legSide 방향)이면 varus, 안쪽이면 valgus
    const offset = lm[k].x - (lm[h].x + lm[a].x) / 2;
    const legSide = Math.sign(lm[h].x - bodyCenterX) || 1;
    if (Math.sign(offset) === legSide) varus.push(dev);
    else valgus.push(dev);
  }
  if (measured === 0) return { available: false, varusDeg: 0, valgusDeg: 0 };
  const avg = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : 0);
  return { available: true, varusDeg: round1(avg(varus)), valgusDeg: round1(avg(valgus)) };
}
