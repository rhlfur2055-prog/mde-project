// posera 이슈 검출 — 순수 함수. AggregatedMetrics 만 소비(단일 프레임/랜드마크 직결 금지).
// 방향(side)은 score.ts 부호 tilt 필드 + varus/valgus 로 판정. 측면 전용 지표는 available 로 가용성 표기.
import type { AggregatedMetrics } from "@/lib/golden/aggregate";
import { POSTURE } from "@/lib/golden/poseConfig";
import type { UserProfile } from "@/lib/profile/types";
import { PROGRAM } from "./programConfig";
import type { IssueId, PostureIssue, Side } from "./types";

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const round2 = (v: number): number => Math.round(v * 100) / 100;

// ≥-type: 임계 초과분 / full-scale
const sevOver = (mag: number, thr: number, full: number): number =>
  clamp01((mag - thr) / full);
// <-type(cva): 임계 미달분 / full-scale
const sevUnder = (val: number, thr: number, full: number): number =>
  clamp01((thr - val) / full);

// 부호 → 낮은 쪽. 결정 2 규약: + = 왼쪽이 낮음 → "L", − = 오른쪽이 낮음 → "R".
const sideOf = (signed: number): Side => (signed > 0 ? "L" : signed < 0 ? "R" : null);

export function detectPostureIssues(
  agg: AggregatedMetrics,
  profile: UserProfile,
): PostureIssue[] {
  void profile; // 현재 검출에 미사용(향후 연령/체중 기반 임계 보정 여지) — 계약상 입력 유지
  const sym = agg.metrics.symmetry;
  const p = agg.posture;
  const conf = round2(agg.confidence);
  const issues: PostureIssue[] = [];

  // 정면 대칭 3종 — available 항상 true
  const pushTilt = (id: IssueId, mag: number, signed: number, thr: number) => {
    const sev = sevOver(mag, thr, PROGRAM.SEVERITY_FULL.tiltDeg);
    if (sev <= 0) return;
    issues.push({
      issueId: id,
      side: sideOf(signed),
      severity: round2(sev),
      confidence: conf,
      available: true,
    });
  };
  pushTilt("shoulder_asymmetry", sym.shoulderTiltDeg, sym.shoulderTiltSigned, POSTURE.SHOULDER_TILT_DEG);
  pushTilt("pelvic_tilt", sym.hipTiltDeg, sym.hipTiltSigned, POSTURE.LATERAL_ASYM_DEG);
  pushTilt("neck_tilt", sym.headTiltDeg, sym.headTiltSigned, POSTURE.HEAD_TILT_DEG);

  // 거북목(측면 전용)
  if (p.cvaAvailable) {
    const sev = sevUnder(p.cvaDeg, POSTURE.CVA_FHP_DEG, PROGRAM.SEVERITY_FULL.cvaDeg);
    if (sev > 0)
      issues.push({ issueId: "forward_head", side: null, severity: round2(sev), confidence: conf, available: true });
  } else {
    // 정면 스캔이라 측정 불가 — 단정/처방 금지(available=false). 상위에서 측면 재측정 안내.
    issues.push({ issueId: "forward_head", side: null, severity: 0, confidence: 0, available: false });
  }

  // 라운드숄더(측면 전용)
  if (p.protractionAvailable) {
    const sev = sevOver(p.protractionDeg, POSTURE.ROUND_SHOULDER_DEG, PROGRAM.SEVERITY_FULL.protractionDeg);
    if (sev > 0)
      issues.push({ issueId: "rounded_shoulder", side: null, severity: round2(sev), confidence: conf, available: true });
  } else {
    issues.push({ issueId: "rounded_shoulder", side: null, severity: 0, confidence: 0, available: false });
  }

  // 오/X다리(정면 전용) — 측정 가능할 때만
  if (p.kneeAvailable) {
    const varus = sevOver(p.varusDeg, POSTURE.KNEE_VARUS_DEG, PROGRAM.SEVERITY_FULL.kneeDeg);
    if (varus > 0)
      issues.push({ issueId: "bow_legs", side: null, severity: round2(varus), confidence: conf, available: true });
    const valgus = sevOver(p.valgusDeg, POSTURE.KNEE_VALGUS_DEG, PROGRAM.SEVERITY_FULL.kneeDeg);
    if (valgus > 0)
      issues.push({ issueId: "knock_knees", side: null, severity: round2(valgus), confidence: conf, available: true });
  }

  return issues;
}
