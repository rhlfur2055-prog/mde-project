// posera 교정운동 코칭 — 운동 정의 + 프레임 판정(순수 함수, 테스트 가능).
// 측정 결과의 약점(거북목·어깨 기울기 등)을 교정하는 운동을 카메라로 따라하기 체크한다.
import { jointAngleDeg, forwardHeadCvaDeg, type Pt } from "@/lib/golden/score";
import { LM, POSTURE } from "@/lib/golden/poseConfig";

// 공용 기하는 score.ts 가 소유 — 기존 import 경로(./exercises) 호환 위해 재export.
export { jointAngleDeg };

const VIS_MIN = 0.5;
const vis = (p: Pt | undefined): p is Pt =>
  !!p && (p.visibility === undefined || p.visibility >= VIS_MIN);

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
    helps: "어깨 가동성(일반)", // 라운드숄더 감지는 shoulderProtractionDeg → scapular-retraction 등으로 분리
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
  {
    id: "chin-tuck",
    name: "턱 당기기",
    emoji: "🙂",
    helps: "거북목(전방두부)",
    mode: "rep",
    reps: 10,
    instructions: "옆으로 서서, 턱을 뒤로 당겨 귀가 어깨 위에 오게 했다 풉니다.",
    evaluate(lm) {
      const cva = forwardHeadCvaDeg(lm);
      if (!cva.available)
        return { ok: false, inPosition: false, feedback: "옆모습이 보이게 서주세요" };
      const tucked = cva.cvaDeg >= POSTURE.CVA_FHP_DEG;
      const released = cva.cvaDeg < POSTURE.CVA_FHP_DEG - 6;
      return {
        ok: true,
        inPosition: tucked,
        released,
        feedback: tucked ? "좋아요, 귀가 어깨 위!" : "턱을 더 뒤로 당기세요",
      };
    },
  },
  {
    id: "hip-abduction",
    name: "옆으로 다리 들기",
    emoji: "🦵",
    helps: "오다리·고관절 안정(둔근·외전근)",
    mode: "rep",
    reps: 10,
    instructions: "정면으로 서서 한쪽 다리를 옆으로 들어올렸다 내립니다. 상체는 곧게.",
    evaluate(lm) {
      const lHip = lm[LM.LEFT_HIP];
      const rHip = lm[LM.RIGHT_HIP];
      const lAnk = lm[LM.LEFT_ANKLE];
      const rAnk = lm[LM.RIGHT_ANKLE];
      if (!vis(lHip) || !vis(rHip) || (!vis(lAnk) && !vis(rAnk)))
        return { ok: false, inPosition: false, feedback: "전신이 보이게 서주세요" };
      const hipW = Math.abs(lHip.x - rHip.x) + 1e-6;
      const hipMidX = (lHip.x + rHip.x) / 2;
      const spread =
        Math.max(
          vis(lAnk) ? Math.abs(lAnk.x - hipMidX) : 0,
          vis(rAnk) ? Math.abs(rAnk.x - hipMidX) : 0,
        ) / hipW;
      const up = spread > 1.1; // 발목이 골반폭의 ~1.1배 밖으로
      const released = spread < 0.7;
      return {
        ok: true,
        inPosition: up,
        released,
        feedback: up ? "좋아요!" : "다리를 옆으로 더 드세요",
      };
    },
  },
  {
    id: "levator-scapulae-stretch",
    name: "견갑거근 스트레칭",
    emoji: "🙇",
    helps: "거북목 보강(견갑거근·상부 승모근)",
    mode: "hold",
    phases: ["right", "left"],
    phaseLabels: { right: "오른쪽 겨드랑이 보기", left: "왼쪽 겨드랑이 보기" },
    holdSec: 12,
    instructions: "머리를 한쪽으로 돌려 비스듬히 숙여 겨드랑이를 봅니다. 반대 어깨는 내린 채 유지.",
    evaluate(lm, phase) {
      const s = headTiltSignal(lm);
      const nose = lm[LM.NOSE];
      const lEar = lm[LM.LEFT_EAR];
      const rEar = lm[LM.RIGHT_EAR];
      if (s == null || !vis(nose) || !vis(lEar) || !vis(rEar))
        return { ok: false, inPosition: false, feedback: "얼굴이 보이게 해주세요" };
      const earMidY = (lEar.y + rEar.y) / 2;
      const lookDown = nose.y > earMidY + 0.03; // 코가 귀선보다 아래 = 숙임
      const want = phase === "left" ? -1 : 1;
      const tilted = want > 0 ? s > 0.3 : s < -0.3;
      const inPos = tilted && lookDown;
      return {
        ok: true,
        inPosition: inPos,
        feedback: inPos ? "좋아요, 유지!" : "머리를 비스듬히 숙여 겨드랑이를 보세요",
      };
    },
  },
  {
    id: "scapular-retraction",
    name: "견갑 후인",
    emoji: "🤸",
    helps: "라운드숄더(견갑 후인·중하부 승모근)",
    mode: "rep",
    reps: 12,
    instructions: "팔을 앞으로 든 뒤 팔꿈치를 뒤로 당겨 양 날개뼈를 모읍니다.",
    evaluate(lm) {
      const lSh = lm[LM.LEFT_SHOULDER];
      const rSh = lm[LM.RIGHT_SHOULDER];
      const lWr = lm[LM.LEFT_WRIST];
      const rWr = lm[LM.RIGHT_WRIST];
      if (!vis(lSh) || !vis(rSh) || !vis(lWr) || !vis(rWr))
        return { ok: false, inPosition: false, feedback: "상체와 양팔이 보이게 해주세요" };
      const shW = Math.abs(lSh.x - rSh.x) + 1e-6;
      const wristW = Math.abs(lWr.x - rWr.x);
      const atChest = Math.abs((lWr.y + rWr.y) / 2 - (lSh.y + rSh.y) / 2) < 0.2;
      const pulled = wristW > shW * 1.1 && atChest; // 손목이 어깨보다 넓게 벌어짐
      const released = wristW < shW * 0.8;
      return {
        ok: true,
        inPosition: pulled,
        released,
        feedback: pulled ? "날개뼈를 모았어요!" : "팔꿈치를 뒤로 당겨 가슴을 펴세요",
      };
    },
  },
  {
    id: "pec-stretch",
    name: "흉근 스트레칭",
    emoji: "🧍",
    helps: "라운드숄더(흉근 이완)",
    mode: "hold",
    holdSec: 20,
    instructions: "문틀에 팔을 대듯 팔꿈치를 어깨 높이로 올리고 가슴을 앞으로 내밀어 가슴을 늘립니다.",
    evaluate(lm) {
      const arm = (sh: number, el: number, wr: number) => {
        if (!vis(lm[sh]) || !vis(lm[el]) || !vis(lm[wr])) return false;
        const elbowAtShoulder = Math.abs(lm[el].y - lm[sh].y) < 0.12;
        const forearmUp = lm[wr].y < lm[el].y - 0.05;
        return elbowAtShoulder && forearmUp;
      };
      if (!vis(lm[LM.LEFT_SHOULDER]) && !vis(lm[LM.RIGHT_SHOULDER]))
        return { ok: false, inPosition: false, feedback: "상체와 팔이 보이게 해주세요" };
      const inPos =
        arm(LM.LEFT_SHOULDER, LM.LEFT_ELBOW, LM.LEFT_WRIST) ||
        arm(LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW, LM.RIGHT_WRIST);
      return {
        ok: true,
        inPosition: inPos,
        feedback: inPos ? "좋아요, 가슴을 더 내미세요" : "팔꿈치를 어깨 높이로 올리세요",
      };
    },
  },
  {
    id: "lower-trap-raise",
    name: "하부 승모근 Y레이즈",
    emoji: "🙌",
    helps: "라운드숄더(하부 승모근 강화)",
    mode: "rep",
    reps: 12,
    instructions: "엄지를 위로 한 채 양팔을 머리 위 Y자로 비스듬히 올렸다 내립니다.",
    evaluate(lm) {
      const lSh = lm[LM.LEFT_SHOULDER];
      const rSh = lm[LM.RIGHT_SHOULDER];
      const lWr = lm[LM.LEFT_WRIST];
      const rWr = lm[LM.RIGHT_WRIST];
      if (!vis(lSh) || !vis(rSh) || !vis(lWr) || !vis(rWr))
        return { ok: false, inPosition: false, feedback: "상체와 양팔이 보이게 해주세요" };
      const shW = Math.abs(lSh.x - rSh.x) + 1e-6;
      const wristW = Math.abs(lWr.x - rWr.x);
      const overhead = lWr.y < lSh.y - 0.1 && rWr.y < rSh.y - 0.1; // 손목이 어깨 위로
      const up = overhead && wristW > shW; // 머리 위에서 벌어진 Y
      const released = lWr.y > lSh.y && rWr.y > rSh.y;
      return {
        ok: true,
        inPosition: up,
        released,
        feedback: up ? "좋아요, Y자!" : "양팔을 머리 위 Y자로 올리세요",
      };
    },
  },
  {
    id: "single-leg-balance",
    name: "한 발 균형",
    emoji: "🦩",
    helps: "X다리·고관절 안정(외전·외회전)",
    mode: "hold",
    holdSec: 15,
    instructions: "정면으로 서서 한 발을 들고 무릎이 안으로 모이지 않게 균형을 유지합니다.",
    evaluate(lm) {
      const lAnk = lm[LM.LEFT_ANKLE];
      const rAnk = lm[LM.RIGHT_ANKLE];
      if (!vis(lAnk) || !vis(rAnk))
        return { ok: false, inPosition: false, feedback: "양 발이 보이게 전신으로 서주세요" };
      const lifted = Math.abs(lAnk.y - rAnk.y) > 0.1; // 한 발이 확실히 들림
      return {
        ok: true,
        inPosition: lifted,
        feedback: lifted ? "좋아요, 균형 유지!" : "한 발을 들어 균형을 잡으세요",
      };
    },
  },
];

export function exerciseById(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}

// 측정 약점 → 판정 입력(각도). 임계값은 poseConfig.POSTURE 단일 출처.
// shoulderTiltDeg/hipTiltDeg(좌우 높이차)는 운동 추천이 아니라 assessPosture 의
// 측만 소프트 플래그용 — 자가운동으로 단정하지 않는다.
export type PostureInput = {
  headTiltDeg?: number;
  shoulderTiltDeg?: number;
  hipTiltDeg?: number;
  cvaDeg?: number;
  cvaAvailable?: boolean;
  shoulderProtractionDeg?: number;
  shoulderProtractionAvailable?: boolean;
  kneeVarusDeg?: number;
  kneeValgusDeg?: number;
};

// 약점 → 추천 교정운동 id. (측만 의심은 여기 넣지 않음 — assessPosture 의 전문가 플래그로.)
export function recommendExerciseIds(opts: PostureInput): string[] {
  const ids: string[] = [];
  // 거북목(측면 CVA) → 턱 당기기 + 견갑거근 스트레칭
  if (opts.cvaAvailable && (opts.cvaDeg ?? 90) < POSTURE.CVA_FHP_DEG)
    ids.push("chin-tuck", "levator-scapulae-stretch");
  // 머리 좌우 기울기 → 목 옆 스트레칭
  if ((opts.headTiltDeg ?? 0) >= POSTURE.HEAD_TILT_DEG) ids.push("neck-side-stretch");
  // 라운드숄더(측면 전인) → 견갑 후인·흉근 이완·하부승모근
  if (opts.shoulderProtractionAvailable && (opts.shoulderProtractionDeg ?? 0) >= POSTURE.ROUND_SHOULDER_DEG)
    ids.push("scapular-retraction", "pec-stretch", "lower-trap-raise");
  // 오다리(varus) / X다리(valgus)
  if ((opts.kneeVarusDeg ?? 0) >= POSTURE.KNEE_VARUS_DEG) ids.push("hip-abduction");
  if ((opts.kneeValgusDeg ?? 0) >= POSTURE.KNEE_VALGUS_DEG) ids.push("single-leg-balance");
  if (ids.length === 0) ids.push("arm-raise"); // 특이소견 없음 → 일반 가동성
  return ids;
}

// 종합 판정: 추천운동 + 주의 문구. 측만 의심은 자가운동 단정 금지 →
// 전문가 평가 우선 소프트 플래그(spec 비진단 원칙·코치 페르소나 규칙).
export function assessPosture(opts: PostureInput): {
  exerciseIds: string[];
  advisories: string[];
} {
  const advisories: string[] = [];
  const lateral = Math.max(opts.shoulderTiltDeg ?? 0, opts.hipTiltDeg ?? 0);
  if (lateral >= POSTURE.LATERAL_ASYM_DEG)
    advisories.push(
      `좌우 높이차 ${Math.round(lateral)}° — 측만 가능성이 시사됩니다. 자가 교정보다 전문가(정형외과/도수치료) 평가를 먼저 권합니다.`,
    );
  if (opts.cvaAvailable === false)
    advisories.push("거북목(CVA)은 옆모습으로 서면 측정됩니다.");
  return { exerciseIds: recommendExerciseIds(opts), advisories };
}
