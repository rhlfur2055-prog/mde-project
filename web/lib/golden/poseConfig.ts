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
