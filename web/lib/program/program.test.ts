import { describe, it, expect } from "vitest";
import type { AggregatedMetrics } from "@/lib/golden/aggregate";
import { exerciseById } from "@/lib/exercise/exercises";
import type { UserProfile } from "@/lib/profile/types";
import { detectPostureIssues } from "./detect";
import { buildRoutine } from "./engine";
import { PROGRAM } from "./programConfig";

const profile: UserProfile = {
  sex: "male",
  heightCm: 175,
  weightKg: 70,
  onboardedAt: "2026-06-13T00:00:00.000Z",
  schemaVersion: 1,
};

// 기본 agg(이슈 없음, 게이트 통과, 높은 confidence). 부분 덮어쓰기로 변형.
function mkAgg(over: {
  sym?: Partial<AggregatedMetrics["metrics"]["symmetry"]>;
  posture?: Partial<AggregatedMetrics["posture"]>;
  gatePassed?: boolean;
  confidence?: number;
} = {}): AggregatedMetrics {
  return {
    metrics: {
      symmetry: {
        available: true,
        score: 95,
        shoulderTiltDeg: 0,
        hipTiltDeg: 0,
        headTiltDeg: 0,
        shoulderTiltSigned: 0,
        hipTiltSigned: 0,
        headTiltSigned: 0,
        ...over.sym,
      },
      golden: { available: true, score: 90, lowerUpperRatio: 1.6, phi: 1.618 },
      overall: { score: 92, grade: "A" },
      deviations: [],
    },
    posture: {
      cvaDeg: 90,
      cvaAvailable: false,
      protractionDeg: 0,
      protractionAvailable: false,
      varusDeg: 0,
      valgusDeg: 0,
      kneeAvailable: false,
      ...over.posture,
    },
    stability: { cvByMetric: { overall: 0, symmetry: 0, golden: 0 } },
    gatePassed: over.gatePassed ?? true,
    confidence: over.confidence ?? 0.9,
    framesUsed: 12,
  };
}

describe("detectPostureIssues — AggregatedMetrics 만 소비", () => {
  it("이상 없음(정면) → 측면 미측정 2종(available=false)만, 처방대상 이슈 0", () => {
    const issues = detectPostureIssues(mkAgg(), profile);
    const present = issues.filter((i) => i.available && i.severity > 0);
    expect(present).toHaveLength(0);
    // 측면 전용은 정면 스캔에서 available=false 로 보고
    expect(issues.find((i) => i.issueId === "forward_head")?.available).toBe(false);
    expect(issues.find((i) => i.issueId === "rounded_shoulder")?.available).toBe(false);
  });

  it("왼쪽 어깨 낮음(부호 +) → shoulder_asymmetry side 'L', severity>0", () => {
    const issues = detectPostureIssues(
      mkAgg({ sym: { shoulderTiltDeg: 9, shoulderTiltSigned: 9 } }),
      profile,
    );
    const sh = issues.find((i) => i.issueId === "shoulder_asymmetry");
    expect(sh?.side).toBe("L");
    expect(sh!.severity).toBeGreaterThan(0);
  });

  it("오른쪽 머리 낮음(부호 −) → neck_tilt side 'R'", () => {
    const issues = detectPostureIssues(
      mkAgg({ sym: { headTiltDeg: 8, headTiltSigned: -8 } }),
      profile,
    );
    expect(issues.find((i) => i.issueId === "neck_tilt")?.side).toBe("R");
  });

  it("측면 측정 가능 + CVA 낮음 → forward_head available severity>0", () => {
    const issues = detectPostureIssues(
      mkAgg({ posture: { cvaAvailable: true, cvaDeg: 40 } }),
      profile,
    );
    const fh = issues.find((i) => i.issueId === "forward_head");
    expect(fh?.available).toBe(true);
    expect(fh!.severity).toBeGreaterThan(0);
  });

  it("무릎 varus → bow_legs", () => {
    const issues = detectPostureIssues(
      mkAgg({ posture: { kneeAvailable: true, varusDeg: 12 } }),
      profile,
    );
    expect(issues.find((i) => i.issueId === "bow_legs")?.severity).toBeGreaterThan(0);
  });

  it("결정적 — 동일 입력 동일 출력", () => {
    const a = mkAgg({ sym: { shoulderTiltDeg: 9, shoulderTiltSigned: 9 } });
    expect(detectPostureIssues(a, profile)).toEqual(detectPostureIssues(a, profile));
  });
});

describe("buildRoutine — 게이팅·결정성·clamp·카탈로그", () => {
  const issuesNeck = () =>
    detectPostureIssues(mkAgg({ sym: { headTiltDeg: 9, headTiltSigned: 9 } }), profile);

  it("gatePassed=false → 처방 0 + 재촬영 권고", () => {
    const r = buildRoutine(issuesNeck(), profile, { gatePassed: false, confidence: 0.9 });
    expect(r.prescriptions).toHaveLength(0);
    expect(r.advisories.some((a) => a.includes("다시 측정"))).toBe(true);
    expect(r.generatedFrom.gatePassed).toBe(false);
  });

  it("confidence < MIN → 처방 0", () => {
    const r = buildRoutine(issuesNeck(), profile, {
      gatePassed: true,
      confidence: PROGRAM.MIN_CONFIDENCE - 0.01,
    });
    expect(r.prescriptions).toHaveLength(0);
  });

  it("neck_tilt → neck-side-stretch 처방, 카탈로그 실재 ID만", () => {
    const r = buildRoutine(issuesNeck(), profile, { gatePassed: true, confidence: 0.9 });
    expect(r.prescriptions.length).toBeGreaterThan(0);
    expect(r.prescriptions.map((p) => p.exerciseId)).toContain("neck-side-stretch");
    for (const p of r.prescriptions) expect(exerciseById(p.exerciseId)).toBeTruthy();
  });

  it("shoulder_asymmetry 단독 → 처방 없음 + 전문가 평가 advisory", () => {
    const issues = detectPostureIssues(
      mkAgg({ sym: { shoulderTiltDeg: 9, shoulderTiltSigned: 9 } }),
      profile,
    );
    const r = buildRoutine(issues, profile, { gatePassed: true, confidence: 0.9 });
    expect(r.prescriptions).toHaveLength(0);
    expect(r.advisories.some((a) => a.includes("전문가 평가"))).toBe(true);
  });

  it("처방량 clamp 범위 + 비진단 카피 상시 포함", () => {
    const r = buildRoutine(issuesNeck(), profile, { gatePassed: true, confidence: 0.9 });
    for (const p of r.prescriptions) {
      expect(p.sets).toBeGreaterThanOrEqual(PROGRAM.CLAMP.setsMin);
      expect(p.sets).toBeLessThanOrEqual(PROGRAM.CLAMP.setsMax);
      if (p.reps !== undefined) {
        expect(p.reps).toBeGreaterThanOrEqual(PROGRAM.CLAMP.repsMin);
        expect(p.reps).toBeLessThanOrEqual(PROGRAM.CLAMP.repsMax);
      }
      if (p.holdSec !== undefined) {
        expect(p.holdSec).toBeGreaterThanOrEqual(PROGRAM.CLAMP.holdMin);
        expect(p.holdSec).toBeLessThanOrEqual(PROGRAM.CLAMP.holdMax);
      }
    }
    expect(r.advisories.some((a) => a.includes("의료 진단이 아니며"))).toBe(true);
    expect(r.advisories.some((a) => a.includes("전문가"))).toBe(true);
  });

  it("결정적 — 동일 issues+profile+scan → 동일 Routine", () => {
    const i = issuesNeck();
    const scan = { gatePassed: true, confidence: 0.9 };
    expect(buildRoutine(i, profile, scan)).toEqual(buildRoutine(i, profile, scan));
  });

  it("고체중 프로필 → 세트 보수적 하향(<= 기본)", () => {
    const heavy: UserProfile = { ...profile, weightKg: PROGRAM.VOLUME.highWeightKg + 5 };
    const r = buildRoutine(issuesNeck(), heavy, { gatePassed: true, confidence: 0.9 });
    for (const p of r.prescriptions) expect(p.sets).toBeLessThanOrEqual(PROGRAM.BASE.sets);
  });
});
