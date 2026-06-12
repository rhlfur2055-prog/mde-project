export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 text-center dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col items-center gap-6 py-24">
        <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-700">
          P0 · 스캐폴드
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
          posera
        </h1>
        <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          사진/영상으로 <strong>실제 자세</strong>를 확인하고, <strong>황금비율(φ) 체형 점수</strong>와{" "}
          <strong>10일 전·후 진척</strong>을 추적하는 셀프 자세코칭.
        </p>
        <ul className="text-sm text-zinc-500 dark:text-zinc-500">
          <li>다음 단계 P1 — 카메라 → MediaPipe 자세추정 → 스켈레톤 오버레이</li>
        </ul>
      </main>
    </div>
  );
}
