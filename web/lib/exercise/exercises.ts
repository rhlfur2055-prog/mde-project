// posera 교정운동 코칭 — 운동 정의 + 프레임 판정(순수 함수, 테스트 가능).
// 측정 결과의 약점(거북목·어깨 기울기 등)을 교정하는 운동을 카메라로 따라하기 체크한다.
import type { Pt } from "@/lib/golden/score";
import { LM } from "@/lib/golden/poseConfig";

const VIS_MIN = 0.5;
const vis = (p: Pt | undefined): p is Pt =>
  !!p && (p.visibility === undefined || p.visibility >= VIS_MIN);

// 관절 b에서의 a-b-c 각도(도)
export function jointAngleDeg(a: Pt, b: Pt, c: Pt): number {
  const v1x = a.x - b.x,
    v1y = a.y - b.y,
    v2x = c.x - b.x,
    v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1e-6;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

export type Phase = string;
export type EvalResult = {
  inPosition: boolean; // 목표 자세(피크) 충족
  released?: boolean; // 명확히 풀린 상태(rep 카운트 디바운스용)
  feedback: string;
  ok: boolean; // 필요한 랜드마크가 보이는지
};
export type ExerciseMode = "hold" | "rep";

export type Exercise = {
  id: string;
  name: string;
  emoji: string;
  helps: string; // 어떤 약점 교정
  mode: ExerciseMode;
  phases?: Phase[]; // 양쪽 등 단계(hold)
  phaseLabels?: Record<Phase, string>;
  holdSec?: number; // 단계별 유지 시간(hold)
  reps?: number; // 목표 횟수(rep)
  instructions: string;
  evaluate: (lm: Pt[], phase?: Phase) => EvalResult;
};

// 머리 좌우 기울기 신호: + = 오른쪽 귀가 아래(머리 오른쪽으로 기울임)
function headTiltSignal(lm: Pt[]): number | null {
  const lEar = lm[LM.LEFT_EAR];
  const rEar = lm[LM.RIGHT_EAR];
  if (!vis(lEar) || !vis(rEar)) return null;
  const span = Math.abs(rEar.x - lEar.x) + 1e-6;
  return (rEar.y - lEar.y) / span;
}

export const EXERCISES: Exercise[] = [
  {
    id: "neck-side-stretch",
    name: "목 옆 스트레칭",
    emoji: "🧎",
    helps: "거북목·목 기울기",
    mode: "hold",
    phases: ["right", "left"],
    phaseLabels: { right: "오른쪽으로", left: "왼쪽으로" },
    holdSec: 12,
    instructions: "머리를 한쪽으로 기울여 목 옆을 늘립니다. 어깨는 내린 채 유지하세요.",
    evaluate(lm, phase) {
      const s = headTiltSignal(lm);
      if (s == null) return { ok: false, inPosition: false, feedback: "얼굴이 보이게 해주세요" };
      const want = phase === "left" ? -1 : 1;
      const inPos = want > 0 ? s > 0.4 : s < -0.4;
      const dir = phase === "left" ? "왼쪽" : "오른쪽";
      return {
        ok: true,
        inPosition: inPos,
        feedback: inPos ? "좋아요, 유지!" : `머리를 ${dir}으로 더 기울이세요`,
      };
    },
  },
  {
    id: "arm-raise",
    name: "팔 옆으로 들기",
    emoji: "🙆",
    helps: "굽은 어깨·라운드숄더",
    mode: "rep",
    reps: 10,
    instructions: "양팔을 옆으로 어깨 높이 이상까지 들었다 내립니다.",
    evaluate(lm) {
      const lSh = lm[LM.LEFT_SHOULDER];
      const rSh = lm[LM.RIGHT_SHOULDER];
      const lWr = lm[LM.LEFT_WRIST];
      const rWr = lm[LM.RIGHT_WRIST];
      if (!vis(lSh) || !vis(rSh) || !vis(lWr) || !vis(rWr))
        return { ok: false, inPosition: false, feedback: "상체와 양팔이 보이게 해주세요" };
      // y는 아래로 증가 → 손목이 어깨보다 위 = 더 작은 y
      const up = lWr.y <= lSh.y && rWr.y <= rSh.y;
      const released = lWr.y > lSh.y + 0.12 && rWr.y > rSh.y + 0.12;
      return {
        ok: true,
        inPosition: up,
        released,
        feedback: up ? "끝까지 올렸어요!" : "팔을 어깨 위로 올리세요",
      };
    },
  },
  {
    id: "squat",
    name: "스쿼트",
    emoji: "🏋️",
    helps: "하체 근력·전신 정렬",
    mode: "rep",
    reps: 10,
    instructions: "전신이 보이게 선 뒤, 무릎을 굽혀 앉았다 일어섭니다.",
    evaluate(lm) {
      const sides: number[] = [];
      const L = [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE];
      const R = [LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE];
      for (const [h, k, a] of [L, R]) {
        if (vis(lm[h]) && vis(lm[k]) && vis(lm[a]))
          sides.push(jointAngleDeg(lm[h], lm[k], lm[a]));
      }
      if (sides.length === 0)
        return { ok: false, inPosition: false, feedback: "전신(다리)이 보이게 뒤로 물러서세요" };
      const knee = sides.reduce((x, y) => x + y, 0) / sides.length;
      const down = knee < 110;
      const released = knee > 155;
      return {
        ok: true,
        inPosition: down,
        released,
        feedback: down ? "좋아요!" : knee < 140 ? "조금 더 앉으세요" : "무릎을 굽혀 앉으세요",
      };
    },
  },
];

export function exerciseById(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}

// 측정 약점 → 추천 운동 id (간단 규칙)
export function recommendExerciseIds(opts: {
  headTiltDeg?: number;
  shoulderTiltDeg?: number;
}): string[] {
  const ids: string[] = [];
  if ((opts.headTiltDeg ?? 0) >= 5) ids.push("neck-side-stretch");
  if ((opts.shoulderTiltDeg ?? 0) >= 4) ids.push("arm-raise");
  if (ids.length === 0) ids.push("arm-raise");
  return ids;
}
