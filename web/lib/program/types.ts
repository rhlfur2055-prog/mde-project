// posera 프로그램 엔진 출력 계약 — SSOT(LOCK). 임의 필드 추가·개명 금지(필요 시 보고 후 승인).
export type Side = "L" | "R" | null;

export type IssueId =
  | "forward_head"
  | "rounded_shoulder"
  | "shoulder_asymmetry"
  | "pelvic_tilt"
  | "bow_legs"
  | "knock_knees"
  | "neck_tilt";

export type PostureIssue = {
  issueId: IssueId;
  side: Side; // 부호 tilt 필드/varus·valgus 로 판정(낮은 쪽). 측면·무릎 양측은 null.
  severity: number; // 0~1
  confidence: number; // 0~1 (agg.confidence × 해당 지표 가용성)
  available: boolean; // 측면 전용 지표를 정면 스캔에서 못 잰 경우 false
};

export type ExercisePrescription = {
  exerciseId: string; // 카탈로그 실재 ID만
  timeOfDay: "morning" | "evening";
  sets: number;
  reps?: number; // rep 모드
  holdSec?: number; // hold 모드
  side?: Side;
};

export type Routine = {
  generatedFrom: { confidence: number; gatePassed: boolean };
  prescriptions: ExercisePrescription[];
  advisories: string[]; // 비진단 카피·통증 안내
};
