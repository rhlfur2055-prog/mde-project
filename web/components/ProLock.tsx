"use client";

import { useSession, signInWithGoogle } from "@/lib/supabase/session";

// Pro 잠금 업셀 카드. 결제(Paddle)는 정식 도메인 오픈 후 활성화 → 지금은 "출시 예정"으로 정직 표기
// (거짓 결제 약속 금지). 비로그인은 먼저 로그인 유도(Pro 는 계정에 귀속).
export default function ProLock({ title, desc }: { title: string; desc: string }) {
  const { session } = useSession();
  return (
    <div className="w-full rounded-xl border border-dashed border-amber-400 bg-amber-50 p-5 text-center dark:border-amber-600 dark:bg-amber-950/40">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
        🔒 Pro
      </span>
      <h3 className="mt-2 text-sm font-semibold text-amber-900 dark:text-amber-200">{title}</h3>
      <p className="mx-auto mt-1 max-w-xs text-xs text-amber-800/80 dark:text-amber-300/80">{desc}</p>
      {!session ? (
        <button
          onClick={signInWithGoogle}
          className="mt-3 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          구글로 로그인
        </button>
      ) : (
        <button
          disabled
          className="mt-3 cursor-not-allowed rounded-full bg-amber-400/40 px-5 py-2 text-sm font-medium text-amber-900 dark:text-amber-200"
        >
          Pro 업그레이드 — 출시 예정
        </button>
      )}
      <p className="mt-2 text-[10px] text-amber-700/70 dark:text-amber-400/60">
        결제는 정식 도메인 오픈 후 활성화됩니다.
      </p>
    </div>
  );
}
