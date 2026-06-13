"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasProfile } from "./store";

// 온보딩 강제 가드: 프로필 없으면 /onboarding 으로 강제 이동.
// 반환 ready=true 일 때만 보호 화면을 그린다(프로필 확인은 클라이언트 마운트 후).
export function useOnboardingGuard(): boolean {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // localStorage는 클라이언트 전용 → 마운트 후 확인이 정석(lazy 초기화는 hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (hasProfile()) {
      setReady(true);
      return;
    }
    // dev(Turbopack)는 대상 라우트를 처음 갈 때 컴파일 → transition이 "이동 중"에 멈춰 보일 수 있음.
    // 프리패치로 미리 컴파일 + 소프트 전환.
    try {
      router.prefetch("/onboarding");
    } catch {
      /* prefetch 미지원 무시 */
    }
    router.replace("/onboarding");
    // 안전장치: 2초 내 실제 이동이 안 됐으면 하드 네비게이션으로 강제(절대 갇히지 않게).
    const t = setTimeout(() => {
      if (typeof window !== "undefined" && window.location.pathname !== "/onboarding") {
        window.location.assign("/onboarding");
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [router]);
  return ready;
}
