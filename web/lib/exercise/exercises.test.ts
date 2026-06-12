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

describe("추천 운동", () => {
  it("머리 기울기 크면 목 스트레칭 추천", () => {
    expect(recommendExerciseIds({ headTiltDeg: 12 })).toContain("neck-side-stretch");
  });
  it("어깨 기울기 크면 팔 들기 추천", () => {
    expect(recommendExerciseIds({ shoulderTiltDeg: 8 })).toContain("arm-raise");
  });
  it("측면 CVA 작으면 턱 당기기 추천", () => {
    expect(
      recommendExerciseIds({ cvaAvailable: true, cvaDeg: POSTURE.CVA_FHP_DEG - 10 }),
    ).toContain("chin-tuck");
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
