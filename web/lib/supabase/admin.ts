import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 서버 전용 관리자 클라이언트 — service_role 키로 RLS 우회(웹훅에서 다른 유저 plan 갱신용).
// SUPABASE_SECRET_KEY 는 .env.local(gitignore)에만. 절대 NEXT_PUBLIC_ 접두어 금지·커밋 금지.
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
