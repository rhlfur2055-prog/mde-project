import { supabase } from "./client";
import { getDeviceId } from "./device";
import type { BodyMetrics } from "@/lib/golden/score";

export type ScanRow = {
  id: string;
  device_id: string;
  taken_at: string;
  overall_score: number | null;
  overall_grade: string | null;
  symmetry_score: number | null;
  golden_score: number | null;
  lower_upper_ratio: number | null;
  shoulder_tilt_deg: number | null;
  hip_tilt_deg: number | null;
  head_tilt_deg: number | null;
};

// 측정 1건 저장 — 점수 + 전체 metrics + 랜드마크(재학습용)
export async function saveScan(
  metrics: BodyMetrics,
  landmarks: unknown,
): Promise<ScanRow> {
  const row = {
    device_id: getDeviceId(),
    overall_score: metrics.overall.score,
    overall_grade: metrics.overall.grade,
    symmetry_score: metrics.symmetry.available ? metrics.symmetry.score : null,
    golden_score: metrics.golden.available ? metrics.golden.score : null,
    lower_upper_ratio: metrics.golden.available
      ? metrics.golden.lowerUpperRatio
      : null,
    shoulder_tilt_deg: metrics.symmetry.shoulderTiltDeg,
    hip_tilt_deg: metrics.symmetry.hipTiltDeg,
    head_tilt_deg: metrics.symmetry.headTiltDeg,
    metrics,
    landmarks,
  };
  const { data, error } = await supabase
    .from("scans")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as ScanRow;
}

// 이 기기의 스캔 이력(최신순)
export async function listScans(limit = 100): Promise<ScanRow[]> {
  const { data, error } = await supabase
    .from("scans")
    .select(
      "id,device_id,taken_at,overall_score,overall_grade,symmetry_score,golden_score,lower_upper_ratio,shoulder_tilt_deg,hip_tilt_deg,head_tilt_deg",
    )
    .eq("device_id", getDeviceId())
    .order("taken_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ScanRow[];
}
