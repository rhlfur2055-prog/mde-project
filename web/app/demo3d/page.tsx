"use client";

import dynamic from "next/dynamic";

// R3F Canvas는 브라우저 전용 → ssr 끔
const Avatar3D = dynamic(() => import("@/components/Avatar3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] items-center justify-center rounded-xl bg-zinc-900 text-sm text-zinc-400">
      3D 로딩…
    </div>
  ),
});

export default function Demo3DPage() {
  return (
    <div className="flex flex-1 flex-col items-center gap-4 bg-zinc-50 px-4 py-10 dark:bg-black">
      <header className="text-center">
        <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-700">
          데모 · 3D 캐릭터 (React Three Fiber)
        </span>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          진짜 사람형 3D 시범 (proof)
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          마우스로 회전·확대. 우리 앱 안에서 3D 캐릭터가 동작하는지 확인용.
        </p>
      </header>

      <div className="w-full max-w-2xl">
        <Avatar3D url="/models/soldier.glb" />
      </div>

      <p className="max-w-md text-center text-xs text-zinc-400">
        ※ 데모용 샘플 모델(threejs MIT). 실제론 Mixamo 운동 캐릭터(남/여)로 교체 →
        교정운동 동작 재생. "현실감" 가능성 확인용 proof입니다.
      </p>
    </div>
  );
}
