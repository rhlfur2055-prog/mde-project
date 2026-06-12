import { describe, it, expect } from "vitest";
import {
  computeBodyMetrics,
  lineTiltDeg,
  isSideView,
  forwardHeadCvaDeg,
  kneeVarusDeg,
  type Pt,
} from "./score";
import { LM, POSTURE } from "./poseConfig";

// 33개 기본 랜드마크(모두 보임) 생성 후 일부만 덮어쓰기
function makeLandmarks(overrides: Record<number, Pt>): Pt[] {
  const lm: Pt[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 1,
  }));
  for (const [i, p] of Object.entries(overrides)) lm[Number(i)] = p;
  return lm;
}

// 수평·정렬·하체:상체≈φ 인 "이상적" 자세
function idealPose(): Pt[] {
  return makeLandmarks({
    [LM.LEFT_EAR]: { x: 0.45, y: 0.2, visibility: 1 },
    [LM.RIGHT_EAR]: { x: 0.55, y: 0.2, visibility: 1 },
    [LM.LEFT_SHOULDER]: { x: 0.4, y: 0.4, visibility: 1 },
    [LM.RIGHT_SHOULDER]: { x: 0.6, y: 0.4, visibility: 1 },
    [LM.LEFT_HIP]: { x: 0.42, y: 0.7, visibility: 1 },
    [LM.RIGHT_HIP]: { x: 0.58, y: 0.7, visibility: 1 },
    // 상체(어깨~골반)=0.3, 하체=0.3*φ≈0.485 → 발목 y=1.185
    [LM.LEFT_ANKLE]: { x: 0.45, y: 1.185, visibility: 1 },
    [LM.RIGHT_ANKLE]: { x: 0.55, y: 1.185, visibility: 1 },
  });
}

describe("lineTiltDeg", () => {
  it("수평선은 0°", () => {
    expect(lineTiltDeg({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0);
  });
  it("45° 대각선", () => {
    expect(lineTiltDeg({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeCloseTo(45);
  });
  it("수직선은 90°", () => {
    expect(lineTiltDeg({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
  });
});

describe("computeBodyMetrics", () => {
  it("이상적 자세 → 대칭·황금비 모두 높은 점수, 등급 A", () => {
    const m = computeBodyMetrics(idealPose());
    expect(m.symmetry.available).toBe(true);
    expect(m.symmetry.score).toBeGreaterThanOrEqual(98);
    expect(m.symmetry.shoulderTiltDeg).toBeCloseTo(0);
    expect(m.golden.available).toBe(true);
    expect(m.golden.lowerUpperRatio).toBeCloseTo(1.6, 1);
    expect(m.golden.score).toBeGreaterThanOrEqual(90);
    expect(m.overall.grade).toBe("A");
    // 기울기 없음 → 자세편차 코멘트 없음
    expect(m.deviations).toHaveLength(0);
  });

  it("어깨가 기울면 대칭 점수 하락 + 낮은쪽 코멘트", () => {
    const pose = idealPose();
    pose[LM.RIGHT_SHOULDER] = { x: 0.6, y: 0.45, visibility: 1 }; // 오른쪽이 내려감
    const m = computeBodyMetrics(pose);
    expect(m.symmetry.shoulderTiltDeg).toBeGreaterThan(10);
    expect(m.symmetry.score).toBeLessThan(70);
    expect(m.deviations.some((d) => d.includes("어깨") && d.includes("오른쪽"))).toBe(
      true,
    );
  });

  it("발목 미검출 → 황금비 측정 불가, 종합은 대칭만 사용", () => {
    const pose = idealPose();
    pose[LM.LEFT_ANKLE] = { x: 0.45, y: 1.185, visibility: 0 };
    pose[LM.RIGHT_ANKLE] = { x: 0.55, y: 1.185, visibility: 0 };
    const m = computeBodyMetrics(pose);
    expect(m.golden.available).toBe(false);
    expect(m.symmetry.available).toBe(true);
    expect(m.deviations.some((d) => d.includes("황금비"))).toBe(true);
  });

  it("결정적 — 같은 입력 두 번이면 동일 결과", () => {
    const a = computeBodyMetrics(idealPose());
    const b = computeBodyMetrics(idealPose());
    expect(a).toEqual(b);
  });
});

// 측면이면 양어깨 x가 거의 겹친다(어깨폭↓). 정면 idealPose 는 어깨폭 0.2/몸통 0.3.
function sidePose(overrides: Record<number, Pt> = {}): Pt[] {
  return makeLandmarks({
    [LM.LEFT_SHOULDER]: { x: 0.5, y: 0.4, visibility: 1 },
    [LM.RIGHT_SHOULDER]: { x: 0.52, y: 0.4, visibility: 1 },
    [LM.LEFT_HIP]: { x: 0.5, y: 0.7, visibility: 1 },
    [LM.RIGHT_HIP]: { x: 0.52, y: 0.7, visibility: 1 },
    [LM.LEFT_EAR]: { x: 0.55, y: 0.25, visibility: 1 },
    [LM.RIGHT_EAR]: { x: 0.55, y: 0.25, visibility: 1 },
    ...overrides,
  });
}

describe("isSideView", () => {
  it("정면(어깨 넓음)은 false", () => {
    expect(isSideView(idealPose())).toBe(false);
  });
  it("측면(어깨 겹침)은 true", () => {
    expect(isSideView(sidePose())).toBe(true);
  });
});

describe("forwardHeadCvaDeg", () => {
  it("정면이면 보류(need-side)", () => {
    const r = forwardHeadCvaDeg(idealPose());
    expect(r.available).toBe(false);
    expect(r.reason).toBe("need-side");
  });
  it("측면 — 귀가 앞으로 많이 나가면 CVA가 작다(전방두부)", () => {
    // 귀를 어깨보다 크게 앞(x↑)으로 → dx 큼 → 각 작음
    const fwd = forwardHeadCvaDeg(sidePose({ [LM.RIGHT_EAR]: { x: 0.75, y: 0.35, visibility: 1 } }));
    const upright = forwardHeadCvaDeg(sidePose({ [LM.RIGHT_EAR]: { x: 0.53, y: 0.2, visibility: 1 } }));
    expect(fwd.available).toBe(true);
    expect(upright.available).toBe(true);
    expect(fwd.cvaDeg).toBeLessThan(upright.cvaDeg);
  });
});

describe("kneeVarusDeg", () => {
  // 정면 판정 위해 어깨를 넓게(기본 0.5,0.5면 측면으로 오판)
  const frontShoulders = {
    [LM.LEFT_SHOULDER]: { x: 0.4, y: 0.4, visibility: 1 },
    [LM.RIGHT_SHOULDER]: { x: 0.6, y: 0.4, visibility: 1 },
  };
  it("다리 곧게 펴면 내반각≈0", () => {
    const pose = makeLandmarks({
      ...frontShoulders,
      [LM.LEFT_HIP]: { x: 0.45, y: 0.5, visibility: 1 },
      [LM.LEFT_KNEE]: { x: 0.45, y: 0.7, visibility: 1 },
      [LM.LEFT_ANKLE]: { x: 0.45, y: 0.9, visibility: 1 },
      [LM.RIGHT_HIP]: { x: 0.55, y: 0.5, visibility: 1 },
      [LM.RIGHT_KNEE]: { x: 0.55, y: 0.7, visibility: 1 },
      [LM.RIGHT_ANKLE]: { x: 0.55, y: 0.9, visibility: 1 },
    });
    const r = kneeVarusDeg(pose);
    expect(r.available).toBe(true);
    expect(r.varusDeg).toBeCloseTo(0, 0);
  });
  it("무릎이 바깥으로 휘면 내반각이 커진다", () => {
    const pose = makeLandmarks({
      ...frontShoulders,
      [LM.LEFT_HIP]: { x: 0.45, y: 0.5, visibility: 1 },
      [LM.LEFT_KNEE]: { x: 0.38, y: 0.7, visibility: 1 }, // 무릎이 바깥(x↓)으로
      [LM.LEFT_ANKLE]: { x: 0.45, y: 0.9, visibility: 1 },
      [LM.RIGHT_HIP]: { x: 0.55, y: 0.5, visibility: 1 },
      [LM.RIGHT_KNEE]: { x: 0.62, y: 0.7, visibility: 1 },
      [LM.RIGHT_ANKLE]: { x: 0.55, y: 0.9, visibility: 1 },
    });
    expect(kneeVarusDeg(pose).varusDeg).toBeGreaterThan(POSTURE.KNEE_VARUS_DEG);
  });
});
