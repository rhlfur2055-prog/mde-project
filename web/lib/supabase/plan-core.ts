// 플랜 순수 로직 — supabase client 를 import 하지 않는다(테스트가 env 없이 import 가능하도록).
export type Plan = "free" | "pro";

// "pro" 정확히 일치할 때만 pro. 그 외 모든 값(null·undefined·미지정)은 free. (거짓 Pro 금지)
export function normalizePlan(raw: unknown): Plan {
  return raw === "pro" ? "pro" : "free";
}
