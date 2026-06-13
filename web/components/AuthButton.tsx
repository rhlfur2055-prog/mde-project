"use client";

import { useSession, signInWithGoogle, signOut } from "@/lib/supabase/session";

// 로그인 상태 버튼 — 비로그인: 구글 로그인 / 로그인: 이메일 + 로그아웃.
export default function AuthButton() {
  const { session, loading } = useSession();
  if (loading) {
    return <span className="text-xs text-zinc-400">…</span>;
  }
  if (!session) {
    return (
      <button
        onClick={signInWithGoogle}
        className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        <span aria-hidden>🇬</span> 구글로 로그인
      </button>
    );
  }
  const email = session.user.email ?? "로그인됨";
  return (
    <span className="flex items-center gap-2 text-xs text-zinc-500">
      <span className="max-w-[140px] truncate">{email}</span>
      <button onClick={signOut} className="underline hover:text-zinc-700 dark:hover:text-zinc-300">
        로그아웃
      </button>
    </span>
  );
}
