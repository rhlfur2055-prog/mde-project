import { describe, it, expect } from "vitest";
import {
  jointAngleDeg,
  exerciseById,
  recommendExerciseIds,
  assessPosture,
  type Pt,
} from "./exercises";
import { LM, POSTURE } from "@/lib/golden/poseConfig";

// 측면 자세(어깨 겹침) — chin-tuck evaluate / CVA 경로 테스트용
function sideStance(earX: number, earY: number): Pt[] {
  return lms({
    [LM.LEFT_SHOULDER]: { x: 0.5, y: 0.4, visibility: 1 },
    [LM.RIGHT_SHOULDER]: { x: 0.52, y: 0.4, visibility: 1 },
    [LM.LEFT_HIP]: { x: 0.5, y: 0.7, visibility: 1 },
    [LM.RIGHT_HIP]: { x: 0.52, y: 0.7, visibility: 1 },
    [LM.LEFT_EAR]: { x: earX, y: earY, visibility: 1 },
    [LM.RIGHT_EAR]: { x: earX, y: earY, visibility: 1 },
  });
}

function lms(overrides: Record<number, Pt>): Pt[] {
  const a: Pt[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  for (const [i, p] of Object.entries(overrides)) a[Number(i)] = p;
  return a;
}

describe("jointAngleDeg", () => {
  it("일직선 = 180°", () => {
    expect(
      jointAngleDeg({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }),
    ).toBeCloseTo(180);
  });
  it("직각 = 90°", () => {
    expect(
      jointAngleDeg({ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }),
    ).toBeCloseTo(90);
  });
});

describe("목 옆 스트레칭(hold)", () => {
  const ex = exerciseById("neck-side-stretch")!;
  it("오른쪽으로 기울이면 right 단계 충족", () => {
    const lm = lms({
      [LM.LEFT_EAR]: { x: 0.45, y: 0.2, visibility: 1 },
      [LM.RIGHT_EAR]: { x: 0.55, y: 0.32, visibility: 1 }, // 오른귀가 아래
    });
    expect(ex.evaluate(lm, "right").inPosition).toBe(true);
    expect(ex.evaluate(lm, "left").inPosition).toBe(false);
  });
  it("수평이면 어느 단계도 미충족", () => {
    const lm = lms({
      [LM.LEFT_EAR]: { x: 0.45, y: 0.2, visibility: 1 },
      [LM.RIGHT_EAR]: { x: 0.55, y: 0.2, visibility: 1 },
    });
    expect(ex.evaluate(lm, "right").inPosition).toBe(false);
  });
  it("얼굴 미검출 시 ok=false", () => {
    const lm = lms({
      [LM.LEFT_EAR]: { x: 0.45, y: 0.2, visibility: 0 },
      [LM.RIGHT_EAR]: { x: 0.55, y: 0.2, visibility: 0 },
    });
    expect(ex.evaluate(lm, "right").ok).toBe(false);
  });
});

describe("팔 옆으로 들기(rep)", () => {
  const ex = exerciseById("arm-raise")!;
  it("양 손목이 어깨 위 → inPosition", () => {
    const lm = lms({
      [LM.LEFT_SHOULDER]: { x: 0.4, y: 0.5, visibility: 1 },
      [LM.RIGHT_SHOULDER]: { x: 0.6, y: 0.5, visibility: 1 },
      [LM.LEFT_WRIST]: { x: 0.3, y: 0.4, visibility: 1 },
      [LM.RIGHT_WRIST]: { x: 0.7, y: 0.4, visibility: 1 },
    });
    expect(ex.evaluate(lm).inPosition).toBe(true);
  });
  it("손목이 어깨 한참 아래 → released", () => {
    const lm = lms({
      [LM.LEFT_SHOULDER]: { x: 0.4, y: 0.5, visibility: 1 },
      [LM.RIGHT_SHOULDER]: { x: 0.6, y: 0.5, visibility: 1 },
      [LM.LEFT_WRIST]: { x: 0.4, y: 0.8, visibility: 1 },
      [LM.RIGHT_WRIST]: { x: 0.6, y: 0.8, visibility: 1 },
    });
    const r = ex.evaluate(lm);
    expect(r.inPosition).toBe(false);
    expect(r.released).toBe(true);
  });
});

describe("스쿼트(rep)", () => {
  const ex = exerciseById("squat")!;
  // 반대쪽 다리는 미검출 처리(기본값 뭉침으로 인한 가짜 각도 방지)
  const hideRight = {
    [LM.RIGHT_HIP]: { x: 0.5, y: 0.5, visibility: 0 },
    [LM.RIGHT_KNEE]: { x: 0.5, y: 0.5, visibility: 0 },
    [LM.RIGHT_ANKLE]: { x: 0.5, y: 0.5, visibility: 0 },
  };
  it("무릎 많이 굽히면 inPosition(down)", () => {
    const lm = lms({
      ...hideRight,
      [LM.LEFT_HIP]: { x: 0.5, y: 0.5, visibility: 1 },
      [LM.LEFT_KNEE]: { x: 0.4, y: 0.6, visibility: 1 },
      [LM.LEFT_ANKLE]: { x: 0.5, y: 0.7, visibility: 1 },
    });
    expect(ex.evaluate(lm).inPosition).toBe(true);
  });
  it("다리 펴면 released(standing)", () => {
    const lm = lms({
      ...hideRight,
      [LM.LEFT_HIP]: { x: 0.5, y: 0.4, visibility: 1 },
      [LM.LEFT_KNEE]: { x: 0.5, y: 0.6, visibility: 1 },
      [LM.LEFT_ANKLE]: { x: 0.5, y: 0.8, visibility: 1 },
    });
    expect(ex.evaluate(lm).released).toBe(true);
  });
});

describe("턱 당기기(chin-tuck, 측면 전용)", () => {
  const ex = exerciseById("chin-tuck")!;
  it("정면이면 옆모습 유도(ok=false)", () => {
    const lm = lms({
      [LM.LEFT_SHOULDER]: { x: 0.4, y: 0.4, visibility: 1 },
      [LM.RIGHT_SHOULDER]: { x: 0.6, y: 0.4, visibility: 1 },
      [LM.LEFT_HIP]: { x: 0.42, y: 0.7, visibility: 1 },
      [LM.RIGHT_HIP]: { x: 0.58, y: 0.7, visibility: 1 },
    });
    expect(ex.evaluate(lm).ok).toBe(false);
  });
  it("측면 — 귀가 어깨 위면 inPosition(tucked)", () => {
    expect(ex.evaluate(sideStance(0.51, 0.2)).inPosition).toBe(true); // 거의 수직 → CVA 큼
  });
  it("측면 — 귀가 앞으로 빠지면 미충족", () => {
    expect(ex.evaluate(sideStance(0.85, 0.38)).inPosition).toBe(false); // 전방두부 → CVA 작음
  });
});

describe("옆으로 다리 들기(hip-abduction)", () => {
  const ex = exerciseById("hip-abduction")!;
  it("다리를 옆으로 크게 벌리면 inPosition", () => {
    const lm = lms({
      [LM.LEFT_HIP]: { x: 0.45, y: 0.5, visibility: 1 },
      [LM.RIGHT_HIP]: { x: 0.55, y: 0.5, visibility: 1 },
      [LM.LEFT_ANKLE]: { x: 0.2, y: 0.9, visibility: 1 }, // 골반 중심에서 멀리
      [LM.RIGHT_ANKLE]: { x: 0.55, y: 0.9, visibility: 1 },
    });
    expect(ex.evaluate(lm).inPosition).toBe(true);
  });
  it("다리를 모으면 released", () => {
    const lm = lms({
      [LM.LEFT_HIP]: { x: 0.45, y: 0.5, visibility: 1 },
      [LM.RIGHT_HIP]: { x: 0.55, y: 0.5, visibility: 1 },
      [LM.LEFT_ANKLE]: { x: 0.48, y: 0.9, visibility: 1 },
      [LM.RIGHT_ANKLE]: { x: 0.52, y: 0.9, visibility: 1 },
    });
    expect(ex.evaluate(lm).released).toBe(true);
  });
});

describe("신규 운동 evaluate", () => {
  it("견갑 후인 — 손목이 가슴 높이서 넓게 벌어지면 inPosition", () => {
    const ex = exerciseById("scapular-retraction")!;
    const lm = lms({
      [LM.LEFT_SHOULDER]: { x: 0.4, y: 0.5, visibility: 1 },
      [LM.RIGHT_SHOULDER]: { x: 0.6, y: 0.5, visibility: 1 },
      [LM.LEFT_WRIST]: { x: 0.25, y: 0.52, visibility: 1 },
      [LM.RIGHT_WRIST]: { x: 0.75, y: 0.52, visibility: 1 },
    });
    expect(ex.evaluate(lm).inPosition).toBe(true);
  });
  it("하부 승모근 Y레이즈 — 양팔 머리 위 Y자면 inPosition", () => {
    const ex = exerciseById("lower-trap-raise")!;
    const lm = lms({
      [LM.LEFT_SHOULDER]: { x: 0.4, y: 0.5, visibility: 1 },
      [LM.RIGHT_SHOULDER]: { x: 0.6, y: 0.5, visibility: 1 },
      [LM.LEFT_WRIST]: { x: 0.3, y: 0.35, visibility: 1 },
      [LM.RIGHT_WRIST]: { x: 0.7, y: 0.35, visibility: 1 },
    });
    expect(ex.evaluate(lm).inPosition).toBe(true);
  });
  it("흉근 스트레칭 — 팔꿈치 어깨 높이·전완 위면 inPosition", () => {
    const ex = exerciseById("pec-stretch")!;
    const lm = lms({
      [LM.LEFT_SHOULDER]: { x: 0.4, y: 0.5, visibility: 1 },
      [LM.LEFT_ELBOW]: { x: 0.3, y: 0.5, visibility: 1 },
      [LM.LEFT_WRIST]: { x: 0.3, y: 0.4, visibility: 1 },
    });
    expect(ex.evaluate(lm).inPosition).toBe(true);
  });
  it("한 발 균형 — 한 발이 들리면 inPosition", () => {
    const ex = exerciseById("single-leg-balance")!;
    const lm = lms({
      [LM.LEFT_ANKLE]: { x: 0.45, y: 0.9, visibility: 1 },
      [LM.RIGHT_ANKLE]: { x: 0.5, y: 0.7, visibility: 1 },
    });
    expect(ex.evaluate(lm).inPosition).toBe(true);
  });
  it("견갑거근 스트레칭 — 머리 기울임+숙임이면 inPosition(right)", () => {
    const ex = exerciseById("levator-scapulae-stretch")!;
    const lm = lms({
      [LM.LEFT_EAR]: { x: 0.45, y: 0.2, visibility: 1 },
      [LM.RIGHT_EAR]: { x: 0.55, y: 0.35, visibility: 1 }, // 오른쪽으로 기울임
      [LM.NOSE]: { x: 0.5, y: 0.4, visibility: 1 }, // 코가 귀선보다 아래 = 숙임
    });
    expect(ex.evaluate(lm, "right").inPosition).toBe(true);
  });
});

describe("추천 운동", () => {
  it("머리 기울기 크면 목 스트레칭 추천", () => {
    expect(recommendExerciseIds({ headTiltDeg: 12 })).toContain("neck-side-stretch");
  });
  it("어깨 좌우 기울기는 운동 단정 X — assessPosture 전문가 플래그로 (recommend는 폴백)", () => {
    // 지표-운동 불일치 정리: shoulderTilt 만으로는 특정 운동을 단정하지 않음
    const r = assessPosture({ shoulderTiltDeg: 8 });
    expect(r.advisories.some((a) => a.includes("전문가"))).toBe(true);
  });
  it("측면 CVA 작으면 턱 당기기 + 견갑거근 스트레칭 추천", () => {
    const ids = recommendExerciseIds({ cvaAvailable: true, cvaDeg: POSTURE.CVA_FHP_DEG - 10 });
    expect(ids).toContain("chin-tuck");
    expect(ids).toContain("levator-scapulae-stretch");
  });
  it("측면 전인각 크면 라운드숄더 운동 추천", () => {
    const ids = recommendExerciseIds({
      shoulderProtractionAvailable: true,
      shoulderProtractionDeg: POSTURE.ROUND_SHOULDER_DEG + 5,
    });
    expect(ids).toContain("scapular-retraction");
    expect(ids).toContain("pec-stretch");
  });
  it("정면(전인 측정 불가)이면 라운드숄더 운동 추천 안 함", () => {
    expect(
      recommendExerciseIds({ shoulderProtractionAvailable: false, shoulderProtractionDeg: 40 }),
    ).not.toContain("scapular-retraction");
  });
  it("X다리(valgus) 크면 한 발 균형 추천", () => {
    expect(
      recommendExerciseIds({ kneeValgusDeg: POSTURE.KNEE_VALGUS_DEG + 3 }),
    ).toContain("single-leg-balance");
  });
  it("CVA 측정 불가(정면)면 턱 당기기 추천 안 함", () => {
    expect(
      recommendExerciseIds({ cvaAvailable: false, cvaDeg: 0 }),
    ).not.toContain("chin-tuck");
  });
  it("내반각 크면 옆으로 다리 들기 추천", () => {
    expect(
      recommendExerciseIds({ kneeVarusDeg: POSTURE.KNEE_VARUS_DEG + 2 }),
    ).toContain("hip-abduction");
  });
});

describe("assessPosture — 측만 의심 소프트 플래그", () => {
  it("좌우 높이차 크면 전문가 평가 권유(자가운동 단정 X)", () => {
    const r = assessPosture({ shoulderTiltDeg: POSTURE.LATERAL_ASYM_DEG + 3 });
    expect(r.advisories.some((a) => a.includes("전문가"))).toBe(true);
  });
  it("정면이면 측면 촬영 안내", () => {
    const r = assessPosture({ cvaAvailable: false });
    expect(r.advisories.some((a) => a.includes("옆모습"))).toBe(true);
  });
});
