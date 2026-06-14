"use client";

import { useEffect, useState } from "react";
import { supabase } from "./client";
import { normalizePlan, type Plan } from "./plan-core";

// 결제 플랜 — 무료/Pro. 결제 웹훅(/api/paddle/webhook)이 service_role 로 profiles.plan 을 갱신,
// 사용자는 본인 행을 RLS(id=auth.uid())로 읽기만. 읽기 실패/미로그인/행없음 = 안전하게 free.
// 순수 정규화는 plan-core.ts(테스트 대상) — 본 파일은 supabase 연동만.
export { normalizePlan, type Plan };

export async function fetchPlan(): Promise<Plan> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "free"; // 비로그인 → 무료
  const { data, error } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data) return "free"; // 행 없음·에러 → 무료(거짓 Pro 금지)
  return normalizePlan((data as { plan?: unknown }).plan);
}

// 플랜 구독 훅 — 마운트 시 1회 + 로그인 상태 변화에 재조회.
export function usePlan(): { plan: Plan; loading: boolean } {
  const [plan, setPlan] = useState<Plan>("free");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetchPlan()
      .then((p) => active && setPlan(p))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      fetchPlan()
        .then((p) => active && setPlan(p))
        .catch(() => {});
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return { plan, loading };
}
