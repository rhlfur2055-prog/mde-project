import { createClient } from "@supabase/supabase-js";

// 브라우저용 Supabase 클라이언트. publishable(anon) 키만 사용 — RLS로 보호.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // 빌드/런타임에 환경변수 누락을 조용히 넘기지 않게(가짜 동작 금지)
  console.warn("Supabase 환경변수 누락 — web/.env.local 확인");
}

export const supabase = createClient(url ?? "", key ?? "");
