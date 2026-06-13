import { describe, it, expect } from "vitest";
import { computeBodyMetrics, type Pt } from "./score";
import { assessFrameQuality } from "./frameQuality";
import { aggregateFrames, aggregateLandmarks } from "./aggregate";
import { LM, AGGREGATE, QUALITY } from "./poseConfig";

// 33개 기본 랜드마크(모두 보임) + 일부 덮어쓰기
function makeFrame(overrides: Record<number, Pt> = {}): Pt[] {
  const lm: Pt[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  for (const [i, p] of Object.entries(overrides)) lm[Number(i)] = p;
  return lm;
}

// 정면·거리 적정·대칭 프레임(게이트 통과용). 체간높이 0.3 ∈ [0.12,0.55].
function frontalFrame(): Pt[] {
  return makeFrame({
    [LM.LEFT_EAR]: { x: 0.45, y: 0.2, visibility: 1 },
    [LM.RIGHT_EAR]: { x: 0.55, y: 0.2, visibility: 1 },
    [LM.LEFT_SHOULDER]: { x: 0.4, y: 0.4, visibility: 1 },
    [LM.RIGHT_SHOULDER]: { x: 0.6, y: 0.4, visibility: 1 },
    [LM.LEFT_HIP]: { x: 0.42, y: 0.7, visibility: 1 },
    [LM.RIGHT_HIP]: { x: 0.58, y: 0.7, visibility: 1 },
    [LM.LEFT_ANKLE]: { x: 0.45, y: 1.185, visibility: 1 },
    [LM.RIGHT_ANKLE]: { x: 0.55, y: 1.185, visibility: 1 },
  });
}

describe("부호 포함 tilt (signed)", () => {
  it("왼쪽 어깨가 낮으면 shoulderTiltSigned > 0, 크기는 |Deg|와 같다", () => {
    const lm = frontalFrame();
    lm[LM.LEFT_SHOULDER] = { x: 0.4, y: 0.43, visibility: 1 }; // 왼쪽이 더 아래(y↑)
    const m = computeBodyMetrics(lm);
    expect(m.symmetry.shoulderTiltSigned).toBeGreaterThan(0);
    expect(Math.abs(m.symmetry.shoulderTiltSigned)).toBeCloseTo(m.symmetry.shoulderTiltDeg);
  });
  it("오른쪽 어깨가 낮으면 shoulderTiltSigned < 0", () => {
    const lm = frontalFrame();
    lm[LM.RIGHT_SHOULDER] = { x: 0.6, y: 0.43, visibility: 1 };
    const m = computeBodyMetrics(lm);
    expect(m.symmetry.shoulderTiltSigned).toBeLessThan(0);
  });
  it("수평이면 0", () => {
    const m = computeBodyMetrics(frontalFrame());
    expect(m.symmetry.shoulderTiltSigned).toBe(0);
  });
});

describe("assessFrameQuality", () => {
  it("빈 입력 → no-landmarks", () => {
    expect(assessFrameQuality([])).toEqual({ ok: false, reasons: ["no-landmarks"] });
  });
  it("정상 프레임 → ok", () => {
    expect(assessFrameQuality(frontalFrame()).ok).toBe(true);
  });
  it("핵심 체간(어깨) 저신뢰 → low-visibility-core", () => {
    const lm = frontalFrame();
    lm[LM.LEFT_SHOULDER] = { x: 0.4, y: 0.4, visibility: QUALITY.VIS_MIN - 0.1 };
    const q = assessFrameQuality(lm);
    expect(q.ok).toBe(false);
    expect(q.reasons).toContain("low-visibility-core");
  });
});

describe("aggregateFrames — 결정성·게이팅·안정성", () => {
  it("동일 입력 → 동일 출력(결정적)", () => {
    const frames = Array.from({ length: AGGREGATE.MIN_FRAMES }, () => frontalFrame());
    expect(aggregateFrames(frames)).toEqual(aggregateFrames(frames));
  });

  it("충분한 정면 프레임 → gatePassed=true, framesUsed 정확, CV=0, 높은 confidence", () => {
    const n = AGGREGATE.MIN_FRAMES + 2;
    const frames = Array.from({ length: n }, () => frontalFrame());
    const a = aggregateFrames(frames);
    expect(a.gatePassed).toBe(true);
    expect(a.framesUsed).toBe(n);
    expect(a.stability.cvByMetric.overall).toBe(0); // 동일 프레임 → 변동 없음
    expect(a.confidence).toBeGreaterThanOrEqual(AGGREGATE.MIN_CONFIDENCE);
  });

  it("프레임 부족 → gatePassed=false", () => {
    const frames = Array.from({ length: AGGREGATE.MIN_FRAMES - 1 }, () => frontalFrame());
    expect(aggregateFrames(frames).gatePassed).toBe(false);
  });

  it("측면 프레임 → 정면도 게이트 실패로 gatePassed=false", () => {
    // 어깨폭을 좁혀 측면으로 인식시킴
    const side = (): Pt[] =>
      makeFrame({
        [LM.LEFT_SHOULDER]: { x: 0.49, y: 0.4, visibility: 1 },
        [LM.RIGHT_SHOULDER]: { x: 0.51, y: 0.4, visibility: 1 },
        [LM.LEFT_HIP]: { x: 0.49, y: 0.7, visibility: 1 },
        [LM.RIGHT_HIP]: { x: 0.51, y: 0.7, visibility: 1 },
      });
    const frames = Array.from({ length: AGGREGATE.MIN_FRAMES + 2 }, side);
    expect(aggregateFrames(frames).gatePassed).toBe(false);
  });

  it("posture 서브객체를 집계 랜드마크에서 채운다(정면 → 측면지표 available=false)", () => {
    const frames = Array.from({ length: AGGREGATE.MIN_FRAMES }, () => frontalFrame());
    const a = aggregateFrames(frames);
    expect(a.posture).toBeDefined();
    expect(a.posture.cvaAvailable).toBe(false); // 정면 → 거북목 측정 불가
    expect(a.posture.protractionAvailable).toBe(false); // 정면 → 라운드숄더 측정 불가
    expect(typeof a.posture.varusDeg).toBe("number");
  });

  it("median 집계는 이상치(스파이크) 한 프레임에 강건하다", () => {
    const good = Array.from({ length: AGGREGATE.MIN_FRAMES }, () => frontalFrame());
    const spike = frontalFrame();
    spike[LM.LEFT_SHOULDER] = { x: 0.1, y: 0.1, visibility: 1 }; // 튀는 프레임 1장
    const medLm = aggregateLandmarks([...good, spike]);
    // 다수결(median) → 정상값 0.4 유지
    expect(medLm[LM.LEFT_SHOULDER].x).toBeCloseTo(0.4);
  });
});
