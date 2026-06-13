"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { EXERCISES, exerciseById } from "@/lib/exercise/exercises";
import CoachCamera from "@/components/CoachCamera";
import type { Gender } from "@/components/ExerciseDemo";
import { useOnboardingGuard } from "@/lib/profile/useOnboardingGuard";

// 측정 화면에서 넘어온 운동을 연다.
//   /coach?plan=squat,scapular-retraction,chin-tuck → 추천 코스 연속 진행
//   /coach?ex=squat                                  → 단일 운동
function CoachInner() {
  const ready = useOnboardingGuard(); // 온보딩 미완료 시 /onboarding 으로 강제 이동
  const params = useSearchParams();
  const [course, setCourse] = useState<string[]>(() => {
    const plan = params.get("plan");
    return plan ? plan.split(",").filter((id) => exerciseById(id)) : [];
  }); // 측정 추천 코스(순서대로)
  const [courseIdx, setCourseIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(() => {
    if (params.get("plan")) return null;
    const ex = params.get("ex");
    return ex && exerciseById(ex) ? ex : null;
  }); // 목록에서 직접 고른 단일 운동
  const [gender, setGender] = useState<Gender>("man");

  const inCourse = course.length > 0;
  const courseDone = inCourse && courseIdx >= course.length;
  const currentId = inCourse ? course[courseIdx] : selected;
  const ex = !courseDone && currentId ? exerciseById(currentId) : null;

  const exitAll = () => {
    setCourse([]);
    setCourseIdx(0);
    setSelected(null);
  };

  if (!ready) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-sm text-zinc-500">
        <span>온보딩으로 이동 중…</span>
        <Link href="/onboarding" className="text-lime-600 underline hover:opacity-80">
          안 넘어가면 여기를 누르세요 →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 px-4 py-10 dark:bg-black">
      <header className="flex w-full max-w-2xl items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            교정운동 코칭
          </h1>
          <p className="text-sm text-zinc-500">
            카메라가 자세를 보며 횟수·유지시간을 직접 체크합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-full border border-zinc-300 text-sm dark:border-zinc-700">
            {(["man", "woman"] as Gender[]).map((g) => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className={`px-3 py-1.5 ${
                  gender === g
                    ? "bg-foreground text-background"
                    : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                {g === "man" ? "남" : "여"}
              </button>
            ))}
          </div>
          <Link
            href="/capture"
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-black/4 dark:border-zinc-700 dark:text-zinc-200"
          >
            측정으로
          </Link>
        </div>
      </header>

      {courseDone ? (
        // 추천 코스 끝 — 다음 동선으로 유기적으로 이어줌
        <div className="flex w-full max-w-2xl flex-col items-center gap-4 rounded-2xl border border-zinc-300 p-8 text-center dark:border-zinc-700">
          <span className="text-4xl">🎉</span>
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
            추천 코스 {course.length}개 완료!
          </h2>
          <p className="text-sm text-zinc-500">
            오늘 자세 교정운동을 모두 마쳤어요. 진척을 기록하거나 다시 측정해 보세요.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/progress"
              className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              진척 보기
            </Link>
            <Link
              href="/capture"
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm text-zinc-700 hover:bg-black/4 dark:border-zinc-700 dark:text-zinc-200"
            >
              다시 측정
            </Link>
            <button
              onClick={() => setCourseIdx(0)}
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm text-zinc-700 hover:bg-black/4 dark:border-zinc-700 dark:text-zinc-200"
            >
              코스 다시
            </button>
            <button
              onClick={exitAll}
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm text-zinc-700 hover:bg-black/4 dark:border-zinc-700 dark:text-zinc-200"
            >
              운동 목록
            </button>
          </div>
        </div>
      ) : ex ? (
        <CoachCamera
          key={currentId ?? ex.id}
          exercise={ex}
          gender={gender}
          onExit={exitAll}
          courseLabel={inCourse ? `추천 코스 ${courseIdx + 1}/${course.length}` : undefined}
          autoStart={inCourse && courseIdx > 0}
          onNext={inCourse ? () => setCourseIdx((i) => i + 1) : undefined}
          nextLabel={
            inCourse
              ? courseIdx < course.length - 1
                ? `다음: ${exerciseById(course[courseIdx + 1])?.name ?? "운동"}`
                : "코스 완료 🎉"
              : undefined
          }
        />
      ) : (
        <ul className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          {EXERCISES.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => setSelected(e.id)}
                className="flex w-full flex-col items-start gap-1 rounded-xl border border-zinc-300 p-4 text-left transition-colors hover:border-zinc-500 dark:border-zinc-700"
              >
                <span className="text-2xl">{e.emoji}</span>
                <span className="font-medium text-black dark:text-zinc-50">{e.name}</span>
                <span className="text-xs text-zinc-500">교정: {e.helps}</span>
                <span className="mt-1 text-xs font-medium text-zinc-400">
                  {e.mode === "rep"
                    ? `${e.reps}회`
                    : `${e.phases?.length ?? 1}단계 · ${e.holdSec}초 유지`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CoachPage() {
  return (
    <Suspense fallback={null}>
      <CoachInner />
    </Suspense>
  );
}
