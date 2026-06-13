import { describe, it, expect } from "vitest";
import { exerciseById } from "./exercises";
import { LM } from "@/lib/golden/poseConfig";

// 33개 랜드마크 배열을 만들되, 지정한 인덱스만 좌표를 덮어쓴다(나머지는 가시·중앙).
function lm(overrides: Record<number, { x: number; y: number }>) {
  const a = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  for (const k of Object.keys(overrides)) {
    const i = Number(k);
    a[i] = { ...overrides[i], visibility: 1 };
  }
  return a;
}

describe("운동 판정 프리미티브 (evaluate)", () => {
  it("팔 들기: 손목이 어깨 위면 inPosition, 충분히 내리면 released", () => {
    const ex = exerciseById("arm-raise")!;
    const sh = { [LM.LEFT_SHOULDER]: { x: 0.4, y: 0.3 }, [LM.RIGHT_SHOULDER]: { x: 0.6, y: 0.3 } };
    const up = ex.evaluate(
      lm({ ...sh, [LM.LEFT_WRIST]: { x: 0.4, y: 0.1 }, [LM.RIGHT_WRIST]: { x: 0.6, y: 0.1 } }),
    );
    expect(up.ok).toBe(true);
    expect(up.inPosition).toBe(true);

    const down = ex.evaluate(
      lm({ ...sh, [LM.LEFT_WRIST]: { x: 0.4, y: 0.5 }, [LM.RIGHT_WRIST]: { x: 0.6, y: 0.5 } }),
    );
    expect(down.inPosition).toBe(false);
    expect(down.released).toBe(true);
  });

  it("스쿼트: 무릎이 충분히 굽으면 inPosition, 펴면 released", () => {
    const ex = exerciseById("squat")!;
    // 깊게 앉음: 무릎각 작음 (hip·knee·ankle를 굽힌 배치)
    const downPose = ex.evaluate(
      lm({
        [LM.LEFT_HIP]: { x: 0.45, y: 0.55 },
        [LM.LEFT_KNEE]: { x: 0.4, y: 0.6 },
        [LM.LEFT_ANKLE]: { x: 0.45, y: 0.62 },
        [LM.RIGHT_HIP]: { x: 0.55, y: 0.55 },
        [LM.RIGHT_KNEE]: { x: 0.6, y: 0.6 },
        [LM.RIGHT_ANKLE]: { x: 0.55, y: 0.62 },
      }),
    );
    expect(downPose.ok).toBe(true);
    expect(downPose.inPosition).toBe(true);

    // 곧게 섬: 무릎각 큼(거의 일직선)
    const standPose = ex.evaluate(
      lm({
        [LM.LEFT_HIP]: { x: 0.45, y: 0.55 },
        [LM.LEFT_KNEE]: { x: 0.45, y: 0.75 },
        [LM.LEFT_ANKLE]: { x: 0.45, y: 0.95 },
        [LM.RIGHT_HIP]: { x: 0.55, y: 0.55 },
        [LM.RIGHT_KNEE]: { x: 0.55, y: 0.75 },
        [LM.RIGHT_ANKLE]: { x: 0.55, y: 0.95 },
      }),
    );
    expect(standPose.inPosition).toBe(false);
    expect(standPose.released).toBe(true);
  });

  it("필수 랜드마크가 안 보이면 ok=false(판정 보류)", () => {
    const ex = exerciseById("arm-raise")!;
    const hidden = lm({}).map((p) => ({ ...p, visibility: 0 }));
    const r = ex.evaluate(hidden);
    expect(r.ok).toBe(false);
    expect(r.inPosition).toBe(false);
  });
});
