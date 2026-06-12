// posera 체형·자세 점수 설정 (네임스페이스 상수 패턴 — yolo11 config.py 이식)

// MediaPipe BlazePose 33 랜드마크 중 사용하는 인덱스
export const LM = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

export const GOLDEN = {
  PHI: 1.618, // 황금비 φ — 하체:상체 이상 비율 목표
  VISIBILITY_MIN: 0.5, // 이 미만이면 해당 지표 "측정 불가"

  // 좌우 대칭 감점 가중치 (기울기 1°당 점수)
  W_SHOULDER_TILT: 3,
  W_HIP_TILT: 3,
  W_HEAD_TILT: 2,
  TILT_NOTE_THRESHOLD_DEG: 3, // 이 이상 기울면 코멘트 생성

  // 황금비 상대편차(|ratio-φ|/φ) → 감점 계수
  GOLDEN_DEV_PENALTY: 300,

  // 등급 컷
  GRADE: { A: 85, B: 70, C: 55 },
} as const;

// 자세편차 → 추천/판정 임계값 단일 출처(도). 기존 recommend 매직넘버(5/4)도 여기로 통합.
export const POSTURE = {
  HEAD_TILT_DEG: 5, // 머리 좌우 기울기 ≥ → 목 옆 스트레칭
  SHOULDER_TILT_DEG: 4, // 어깨 좌우 기울기 ≥ → 팔 들기
  CVA_FHP_DEG: 50, // 거북목: 측면 CVA가 이 값 미만이면 전방두부(FHP) 의심
  KNEE_VARUS_DEG: 6, // 오다리: hip-knee-ankle 직선편차 ≥ → 내반 의심
  LATERAL_ASYM_DEG: 5, // 측만 의심: 어깨/골반 좌우 높이차 ≥ → 전문가 평가 소프트 플래그
  SIDE_VIEW_SHOULDER_RATIO: 0.35, // 측면 자동감지: 어깨폭/몸통높이 < 이 값이면 측면으로 간주
} as const;
