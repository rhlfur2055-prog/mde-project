"use client";

import { useState } from "react";
import Link from "next/link";
import { EXERCISES, exerciseById } from "@/lib/exercise/exercises";
import CoachCamera from "@/components/CoachCamera";
import type { Gender } from "@/components/ExerciseDemo";

export default function CoachPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender>("male");
  const ex = selected ? exerciseById(selected) : null;

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
            {(["male", "female"] as Gender[]).map((g) => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className={`px-3 py-1.5 ${
                  gender === g
                    ? "bg-foreground text-background"
                    : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                {g === "male" ? "남" : "여"}
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

      {ex ? (
        <CoachCamera exercise={ex} gender={gender} onExit={() => setSelected(null)} />
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
