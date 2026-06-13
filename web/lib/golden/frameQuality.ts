// posera 프레임 품질 게이트 — 순수 함수(의존성 0, 테스트 가능).
// 저품질/비표준 프레임(핵심 랜드마크 누락·저신뢰)을 측정에서 제외하기 위한 판정.
// 점수 산출(score.ts)과 분리 — aggregate.ts 가 통과 프레임만 모아 집계한다.
import { LM, QUALITY } from "./poseConfig";
import type { Pt } from "./score";

// 사유 코드(사람용 카피로의 변환은 상위 레이어 담당 — 여기선 식별자만)
export type FrameQualityReason =
  | "no-landmarks"
  | "low-visibility-core" // 어깨·골반 등 핵심 체간 랜드마크가 저신뢰
  | "too-many-low-visibility"; // 추적 랜드마크 중 저신뢰 비율 초과

export type FrameQuality = { ok: boolean; reasons: FrameQualityReason[] };

// 프레임이 유효하려면 반드시 신뢰 가능해야 하는 핵심 체간 랜드마크(대칭/황금비 공통 기준선)
const REQUIRED: number[] = [
  LM.LEFT_SHOULDER,
  LM.RIGHT_SHOULDER,
  LM.LEFT_HIP,
  LM.RIGHT_HIP,
];

// 점수 계산에 관여하는 전체 추적 랜드마크(저신뢰 비율 판정 모집단)
const TRACKED: number[] = Object.values(LM);

const visOf = (p: Pt | undefined): number =>
  p ? (p.visibility === undefined ? 1 : p.visibility) : 0;

export function assessFrameQuality(lm: Pt[]): FrameQuality {
  if (!lm || lm.length === 0) return { ok: false, reasons: ["no-landmarks"] };
  const reasons: FrameQualityReason[] = [];

  // 1) 핵심 체간 랜드마크 신뢰도
  if (REQUIRED.some((i) => visOf(lm[i]) < QUALITY.VIS_MIN))
    reasons.push("low-visibility-core");

  // 2) 추적 랜드마크 중 저신뢰 비율
  const low = TRACKED.filter((i) => visOf(lm[i]) < QUALITY.VIS_MIN).length;
  if (low / TRACKED.length > QUALITY.MAX_LOW_VIS_RATIO)
    reasons.push("too-many-low-visibility");

  return { ok: reasons.length === 0, reasons };
}
