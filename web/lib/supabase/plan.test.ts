import { describe, it, expect } from "vitest";
import { normalizePlan } from "./plan-core";

describe("플랜 정규화 — 거짓 Pro 금지", () => {
  it("'pro' 정확히 일치만 pro", () => {
    expect(normalizePlan("pro")).toBe("pro");
  });

  it("그 외 모든 값은 free", () => {
    for (const v of ["free", "PRO", "Pro", "premium", "", null, undefined, 0, 1, {}]) {
      expect(normalizePlan(v)).toBe("free");
    }
  });
});
