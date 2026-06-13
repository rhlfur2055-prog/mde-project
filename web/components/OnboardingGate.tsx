"use client";

import Link from "next/link";
import { useOnboardingGuard } from "@/lib/profile/useOnboardingGuard";

// 보호 래퍼: 프로필이 있으면 children, 없으면 /onboarding 으로 이동(이동 중 안내).
// 서버 컴포넌트 페이지(/capture)가 클라이언트 가드를 쓰도록 감싸는 용도.
export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const ready = useOnboardingGuard();
  if (!ready) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-sm text-zinc-500">
        <span>온보딩으로 이동 중…</span>
        {/* 전환이 지연돼도 직접 이동할 수 있게(절대 갇히지 않게) */}
        <Link href="/onboarding" className="text-lime-600 underline hover:opacity-80">
          안 넘어가면 여기를 누르세요 →
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
