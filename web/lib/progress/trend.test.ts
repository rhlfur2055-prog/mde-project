import { describe, it, expect } from "vitest";
import { toTrendPoints, trendGeometry, polylinePoints } from "./trend";

describe("진척 추세 변환", () => {
  it("null 점수 제외 + 시간 오름차순 정렬", () => {
    const pts = toTrendPoints([
      { taken_at: "2026-06-13T00:00:00Z", overall_score: 80 },
      { taken_at: "2026-06-10T00:00:00Z", overall_score: 70 },
      { taken_at: "2026-06-12T00:00:00Z", overall_score: null },
    ]);
    expect(pts.map((p) => p.score)).toEqual([70, 80]); // 6/10 → 6/13
  });

  it("기하: 첫 점=좌단(pad), 끝 점=우단(w-pad), score↑=상단", () => {
    const pts = toTrendPoints([
      { taken_at: "2026-06-10T00:00:00Z", overall_score: 0 },
      { taken_at: "2026-06-20T00:00:00Z", overall_score: 100 },
    ]);
    const dots = trendGeometry(pts, 100, 50, 10);
    expect(dots[0].x).toBe(10); // 좌단 pad
    expect(dots[1].x).toBe(90); // 우단 w-pad
    expect(dots[0].y).toBe(40); // score 0 → 하단(h-pad)
    expect(dots[1].y).toBe(10); // score 100 → 상단(pad)
  });

  it("점 1개는 가로 중앙", () => {
    const dots = trendGeometry([{ t: 1, score: 50 }], 100, 50, 10);
    expect(dots[0].x).toBe(50); // pad + innerW/2 = 10 + 80/2
  });

  it("polyline 문자열", () => {
    const s = polylinePoints([
      { x: 10, y: 40, score: 0, t: 1 },
      { x: 90, y: 10, score: 100, t: 2 },
    ]);
    expect(s).toBe("10,40 90,10");
  });

  it("빈 입력 안전", () => {
    expect(toTrendPoints([])).toEqual([]);
    expect(trendGeometry([], 100, 50, 10)).toEqual([]);
  });
});
