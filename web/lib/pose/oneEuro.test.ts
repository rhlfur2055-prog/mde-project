import { describe, it, expect } from "vitest";
import { LandmarkSmoother } from "./oneEuro";

describe("LandmarkSmoother (One Euro)", () => {
  it("입력 개수와 부가 필드(z·visibility)를 보존한다", () => {
    const s = new LandmarkSmoother();
    const out = s.apply([{ x: 0.5, y: 0.5, z: 0.1, visibility: 0.9 }], 1 / 30);
    expect(out).toHaveLength(1);
    expect(out[0].z).toBe(0.1);
    expect(out[0].visibility).toBe(0.9);
  });

  it("떨림(노이즈)을 줄인다 — 평활 신호 분산 < 원본 분산", () => {
    const s = new LandmarkSmoother(1.0, 0.0); // beta=0 → 일정 강한 평활
    const noisy = [
      0.5, 0.55, 0.46, 0.53, 0.47, 0.54, 0.48, 0.52, 0.49, 0.51, 0.5, 0.53, 0.47, 0.52, 0.48,
    ];
    const filtered = noisy.map((x) => s.apply([{ x, y: 0.5 }], 1 / 30)[0].x);
    const tail = (a: number[]) => a.slice(5); // 워밍업 제외
    const variance = (a: number[]) => {
      const m = a.reduce((p, c) => p + c, 0) / a.length;
      return a.reduce((p, c) => p + (c - m) ** 2, 0) / a.length;
    };
    expect(variance(tail(filtered))).toBeLessThan(variance(tail(noisy)));
  });

  it("reset 후 첫 샘플은 그대로 통과(상태 초기화)", () => {
    const s = new LandmarkSmoother();
    s.apply([{ x: 0.2, y: 0.2 }], 1 / 30);
    s.reset();
    const out = s.apply([{ x: 0.8, y: 0.9 }], 1 / 30);
    expect(out[0].x).toBeCloseTo(0.8, 5);
    expect(out[0].y).toBeCloseTo(0.9, 5);
  });
});
