// posera 처방/루틴 엔진 — 순수·결정적. AggregatedMetrics 유래 issues + profile + scan 게이트만 소비.
// 이슈→운동은 새 매핑표를 만들지 않고, 각 이슈를 임계 교차 PostureInput 으로 변환해 기존
// recommendExerciseIds() 를 호출하는 "얇은 어댑터"로 재사용한다. exerciseId 는 카탈로그 실재 ID만.
import { POSTURE } from "@/lib/golden/poseConfig";
import {
  exerciseById,
  recommendExerciseIds,
  type PostureInput,
} from "@/lib/exercise/exercises";
import type { UserProfile } from "@/lib/profile/types";
import { PROGRAM } from "./programConfig";
import type { ExercisePrescription, PostureIssue, Routine, Side } from "./types";

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// 비진단 상시 카피 — 우회 불가 가드.
const DISCLAIMER = "본 결과는 의료 진단이 아니며 일반적인 자세 개선 참고용입니다.";
const PAIN_NOTE = "통증이나 불편이 지속되면 전문가(정형외과/물리치료) 상담을 먼저 권장합니다.";
const RETAKE = "정확한 측정을 위해 전신이 정면으로 또렷이 보이도록 다시 측정해 주세요.";

// 검출 순서 고정(결정성).
const ISSUE_ORDER: PostureIssue["issueId"][] = [
  "forward_head",
  "rounded_shoulder",
  "neck_tilt",
  "shoulder_asymmetry",
  "pelvic_tilt",
  "bow_legs",
  "knock_knees",
];

// 얇은 경계 어댑터: issueId → 임계 교차 PostureInput. recommendExerciseIds 로 운동 매핑 재사용.
// shoulder_asymmetry·pelvic_tilt 는 recommendExerciseIds 에 운동 매핑이 없음(측만=advisory 설계) → [].
function exercisesForIssue(issue: PostureIssue): string[] {
  if (!issue.available || issue.severity <= 0) return [];
  const input: PostureInput = {};
  switch (issue.issueId) {
    case "forward_head":
      input.cvaAvailable = true;
      input.cvaDeg = 0; // 임계 미만 보장(거북목 트리거)
      break;
    case "rounded_shoulder":
      input.shoulderProtractionAvailable = true;
      input.shoulderProtractionDeg = POSTURE.ROUND_SHOULDER_DEG; // ≥ 임계
      break;
    case "neck_tilt":
      input.headTiltDeg = POSTURE.HEAD_TILT_DEG;
      break;
    case "bow_legs":
      input.kneeVarusDeg = POSTURE.KNEE_VARUS_DEG;
      break;
    case "knock_knees":
      input.kneeValgusDeg = POSTURE.KNEE_VALGUS_DEG;
      break;
    case "shoulder_asymmetry":
    case "pelvic_tilt":
      return []; // 운동 매핑 없음 → advisory 만
  }
  // 'arm-raise' 는 "특이소견 없음" 폴백 → 이슈 기반 처방에선 제외.
  return recommendExerciseIds(input).filter((id) => id !== "arm-raise" && !!exerciseById(id));
}

// 체중/성별·연령은 미용 목표 산출 금지 — 안전 하향(보수적 볼륨)만.
function volumeSets(profile: UserProfile): number {
  let sets = PROGRAM.BASE.sets;
  const heavy = profile.weightKg >= PROGRAM.VOLUME.highWeightKg;
  const older = profile.ageYears !== undefined && profile.ageYears >= PROGRAM.VOLUME.olderAge;
  if (heavy || older) sets -= PROGRAM.VOLUME.downStep;
  return clamp(sets, PROGRAM.CLAMP.setsMin, PROGRAM.CLAMP.setsMax);
}

function prescribe(
  exerciseId: string,
  side: Side,
  profile: UserProfile,
): ExercisePrescription | null {
  const ex = exerciseById(exerciseId);
  if (!ex) return null;
  const sets = volumeSets(profile);
  if (ex.mode === "rep") {
    const reps = clamp(ex.reps ?? PROGRAM.BASE.reps, PROGRAM.CLAMP.repsMin, PROGRAM.CLAMP.repsMax);
    return { exerciseId, timeOfDay: "morning", sets, reps, side }; // 활성(근력) → 아침
  }
  const holdSec = clamp(ex.holdSec ?? PROGRAM.BASE.holdSec, PROGRAM.CLAMP.holdMin, PROGRAM.CLAMP.holdMax);
  return { exerciseId, timeOfDay: "evening", sets, holdSec, side }; // 스트레칭(유지) → 저녁
}

export function buildRoutine(
  issues: PostureIssue[],
  profile: UserProfile,
  scan: { gatePassed: boolean; confidence: number },
): Routine {
  const generatedFrom = { confidence: scan.confidence, gatePassed: scan.gatePassed };
  const advisories: string[] = [];

  // 게이팅(우회 불가): 미통과/저신뢰 → 처방 없음 + 재촬영 권고만.
  if (!scan.gatePassed || scan.confidence < PROGRAM.MIN_CONFIDENCE) {
    return { generatedFrom, prescriptions: [], advisories: [RETAKE, DISCLAIMER, PAIN_NOTE] };
  }

  const byId = new Map(issues.map((i) => [i.issueId, i] as const));
  const prescriptions: ExercisePrescription[] = [];
  const seen = new Set<string>(); // (exerciseId|timeOfDay) 중복 제거

  for (const id of ISSUE_ORDER) {
    const issue = byId.get(id);
    if (!issue) continue;

    // 측면 전용 미측정 → 처방 금지, 측면 재측정 안내만.
    if (!issue.available) {
      if (id === "forward_head")
        advisories.push("거북목(CVA)은 옆모습으로 다시 측정하면 평가됩니다.");
      if (id === "rounded_shoulder")
        advisories.push("라운드숄더는 옆모습으로 다시 측정하면 평가됩니다.");
      continue;
    }
    if (issue.severity <= 0) continue;

    // 운동 매핑 없는 이슈(좌우 비대칭류) → 처방 금지, 전문가 평가 안내(측만 소프트 플래그).
    if (id === "shoulder_asymmetry" || id === "pelvic_tilt") {
      advisories.push(
        "좌우(어깨/골반) 높이차가 관찰됩니다. 자가 운동보다 전문가 평가를 먼저 권합니다.",
      );
      continue;
    }

    for (const exId of exercisesForIssue(issue)) {
      const pres = prescribe(exId, issue.side, profile);
      if (!pres) continue;
      const key = `${pres.exerciseId}|${pres.timeOfDay}`;
      if (seen.has(key)) continue;
      seen.add(key);
      prescriptions.push(pres);
    }
  }

  advisories.push(DISCLAIMER, PAIN_NOTE);
  return { generatedFrom, prescriptions, advisories };
}
