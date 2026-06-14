import { describe, it, expect, beforeEach } from "vitest";
import { getLastScan, saveLastScan, clearLastScan } from "./store";
import type { AggregatedMetrics } from "@/lib/golden/aggregate";

// node 환경(localStorage 없음) → 최소 mock 주입(profile store.test 와 동일 패턴)
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage = new MemStorage();
});

// 최소 형태의 agg(스토어는 형태만 검사 — 점수 로직은 aggregate.test 가 담당)
const agg = {
  metrics: { symmetry: { available: true }, golden: {}, overall: { score: 80, grade: "B" }, deviations: [] },
  posture: { cvaDeg: 0, cvaAvailable: false, protractionDeg: 0, protractionAvailable: false, varusDeg: 0, valgusDeg: 0, kneeAvailable: false },
  stability: { cvByMetric: {} },
  gatePassed: true,
  confidence: 0.8,
  framesUsed: 12,
} as unknown as AggregatedMetrics;

const TS = "2026-06-14T00:00:00.000Z";

describe("program 최신 측정 스냅샷 스토어", () => {
  it("없으면 null", () => {
    expect(getLastScan()).toBeNull();
  });

  it("save → load 결정적 라운드트립", () => {
    saveLastScan(agg, TS);
    const got = getLastScan();
    expect(got?.takenAt).toBe(TS);
    expect(got?.agg.confidence).toBe(0.8);
    expect(got?.schemaVersion).toBe(1);
    expect(getLastScan()).toEqual(getLastScan()); // 반복 로드 동일
  });

  it("clear 후 다시 null", () => {
    saveLastScan(agg, TS);
    clearLastScan();
    expect(getLastScan()).toBeNull();
  });

  it("손상된 JSON·형태 불일치는 null 로 무시", () => {
    (globalThis as unknown as { localStorage: MemStorage }).localStorage.setItem(
      "posera_last_scan_v1",
      "{not json",
    );
    expect(getLastScan()).toBeNull();
    (globalThis as unknown as { localStorage: MemStorage }).localStorage.setItem(
      "posera_last_scan_v1",
      JSON.stringify({ schemaVersion: 1, takenAt: TS }), // agg 없음
    );
    expect(getLastScan()).toBeNull();
  });
});
