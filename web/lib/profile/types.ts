// posera 사용자 프로필 — SSOT 계약(LOCK). 임의 필드 추가·이름 변경 금지(필요 시 보고 후 승인).
// 비진단 원칙: 체중/성별은 "미용적 이상체형 목표" 산출에 사용 금지.
//   다음 Phase(program 엔진)의 보수적 운동 볼륨 조정 입력으로만 사용한다.
export type Sex = "male" | "female" | "other" | "unspecified";

export type Goal = "posture" | "symmetry" | "mobility" | "general";

export type UserProfile = {
  sex: Sex;
  heightCm: number;
  weightKg: number;
  ageYears?: number;
  goal?: Goal;
  onboardedAt: string; // ISO
  schemaVersion: 1;
};

// 입력 검증 경계(매직넘버 금지 — 단일 출처). UI 입력 범위 + 저장 유효성 공용.
export const PROFILE_LIMITS = {
  HEIGHT_CM_MIN: 100,
  HEIGHT_CM_MAX: 230,
  WEIGHT_KG_MIN: 25,
  WEIGHT_KG_MAX: 250,
  AGE_MIN: 5,
  AGE_MAX: 120,
} as const;

export const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "male", label: "남성" },
  { value: "female", label: "여성" },
  { value: "other", label: "기타" },
  { value: "unspecified", label: "선택 안 함" },
];

export const GOAL_OPTIONS: { value: Goal; label: string }[] = [
  { value: "posture", label: "자세 교정" },
  { value: "symmetry", label: "좌우 균형" },
  { value: "mobility", label: "가동성" },
  { value: "general", label: "전반적 관리" },
];
