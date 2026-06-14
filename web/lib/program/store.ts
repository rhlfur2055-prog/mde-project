// posera 최신 측정 스냅샷 스토어 — 온디바이스(localStorage). "오늘의 루틴" 화면이 마지막 측정에서
// detectPostureIssues→buildRoutine 을 결정적으로 재구성하도록 agg(AggregatedMetrics)를 보관한다.
// profile/store.ts·device.ts 와 동일 패턴. DB scans 는 점수 이력(추세)용, 본 스냅샷은 루틴 입력용.
// ⚠️ 신체데이터는 온디바이스 보관(조작 없는 실측 agg). 새 기기에선 없음 → 루틴 화면이 "먼저 측정" 유도.
import type { AggregatedMetrics } from "@/lib/golden/aggregate";

const KEY = "posera_last_scan_v1";

export type ScanSnapshot = {
  agg: AggregatedMetrics;
  takenAt: string; // ISO — 스탬프는 호출측이 부여(스토어는 결정적)
  schemaVersion: 1;
};

// SSR/테스트 안전: localStorage 미존재 환경에선 null.
function ls(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    /* 접근 차단 환경(쿠키 off 등) */
  }
  return null;
}

function isSnapshot(v: unknown): v is ScanSnapshot {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const agg = o.agg as Record<string, unknown> | undefined;
  return (
    o.schemaVersion === 1 &&
    typeof o.takenAt === "string" &&
    !!agg &&
    typeof agg === "object" &&
    "metrics" in agg &&
    "posture" in agg &&
    typeof agg.confidence === "number"
  );
}

// 측정 스냅샷 영속화(takenAt 스탬프는 호출측이 부여 → 스토어는 결정적).
export function saveLastScan(agg: AggregatedMetrics, takenAt: string): ScanSnapshot {
  const snap: ScanSnapshot = { agg, takenAt, schemaVersion: 1 };
  ls()?.setItem(KEY, JSON.stringify(snap));
  return snap;
}

export function getLastScan(): ScanSnapshot | null {
  const s = ls();
  if (!s) return null;
  const raw = s.getItem(KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return isSnapshot(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearLastScan(): void {
  ls()?.removeItem(KEY);
}
