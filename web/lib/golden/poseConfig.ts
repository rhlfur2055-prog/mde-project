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

// ── 프레임 품질 게이트(frameQuality.ts) ── 단일 출처 상수. 매직넘버 금지.
export const QUALITY = {
  VIS_MIN: 0.5, // 랜드마크 신뢰 최소 visibility (이 미만 = 저신뢰)
  MAX_LOW_VIS_RATIO: 0.5, // 추적 랜드마크 중 저신뢰 비율이 이 값 초과면 프레임 제외
} as const;

// ── 다중 프레임 집계/게이팅(aggregate.ts) ── 단일 출처 상수.
export const AGGREGATE = {
  WINDOW: 24, // PoseCamera 롤링 버퍼 최대 프레임 수
  MIN_FRAMES: 8, // 게이트 통과 프레임이 이 미만이면 gatePassed=false
  FRONTAL_SYMMETRY_MIN: 0.8, // 정면도(yaw) 게이트: 좌/우 체간 길이 대칭비 min(L,R)/max(L,R) ≥
  TORSO_H_MIN: 0.12, // 거리 게이트: 정규화 체간높이(어깨~골반 y) 하한(너무 멂)
  TORSO_H_MAX: 0.55, // 거리 게이트: 상한(너무 가까움)
  CV_FULL_PENALTY: 0.15, // overall 점수 변동계수가 이 값이면 안정성 0(이하면 비례 가점)
  MIN_CONFIDENCE: 0.5, // 진단/추천 산출 허용 최소 confidence (미만이면 보류)
  AUTO_CONFIRM_HOLD_MS: 1500, // 게이트+신뢰도 조건이 이만큼 연속 유지되면 자동 확인완료·1회 자동저장(반자동)
} as const;

// 자세편차 → 추천/판정 임계값 단일 출처(도). 기존 recommend 매직넘버(5/4)도 여기로 통합.
export const POSTURE = {
  HEAD_TILT_DEG: 5, // 머리 좌우 기울기 ≥ → 목 옆 스트레칭
  SHOULDER_TILT_DEG: 4, // 어깨 좌우 기울기 ≥ → 팔 들기
  CVA_FHP_DEG: 50, // 거북목: 측면 CVA가 이 값 미만이면 전방두부(FHP) 의심
  ROUND_SHOULDER_DEG: 22, // 라운드숄더: 측면에서 골반→어깨 선의 전방경사 ≥ → 말린 어깨 의심
  KNEE_VARUS_DEG: 6, // 오다리(varus): hip-knee-ankle 직선편차(무릎 바깥) ≥ → 내반 의심
  KNEE_VALGUS_DEG: 6, // X다리(valgus): 직선편차(무릎 안쪽) ≥ → 외반 의심
  LATERAL_ASYM_DEG: 5, // 측만 의심: 어깨/골반 좌우 높이차 ≥ → 전문가 평가 소프트 플래그
  SIDE_VIEW_SHOULDER_RATIO: 0.35, // 측면 자동감지: 어깨폭/몸통높이 < 이 값이면 측면으로 간주
} as const;
