"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OnboardingGate from "@/components/OnboardingGate";
import AuthButton from "@/components/AuthButton";
import { getLastScan } from "@/lib/program/store";
import { getProfile } from "@/lib/profile/store";
import { detectPostureIssues } from "@/lib/program/detect";
import { buildRoutine } from "@/lib/program/engine";
import type { ExercisePrescription, Routine, Side } from "@/lib/program/types";
import { exerciseById } from "@/lib/exercise/exercises";
import { usePlan } from "@/lib/supabase/plan";
import ProLock from "@/components/ProLock";

function daysAgo(iso: string): number {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function sideLabel(side?: Side): string {
  return side === "L" ? " · 왼쪽" : side === "R" ? " · 오른쪽" : "";
}

function doseText(p: ExercisePrescription): string {
  const parts = [`${p.sets}세트`];
  if (p.reps != null) parts.push(`${p.reps}회`);
  else if (p.holdSec != null) parts.push(`${p.holdSec}초 유지`);
  return parts.join(" × ");
}

// "오늘 완료" — 날짜별 localStorage 키(자동 만료). 습관 고리.
function todayKey(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  return `posera_routine_done_${ymd}`;
}

function PrescriptionCard({ p }: { p: ExercisePrescription }) {
  const ex = exerciseById(p.exerciseId);
  if (!ex) return null;
  return (
    <Link
      href={`/coach?ex=${p.exerciseId}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-zinc-300 px-4 py-3 hover:border-zinc-500 dark:border-zinc-700"
    >
      <span className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>
          {ex.emoji}
        </span>
        <span>
          <span className="block text-sm font-medium text-black dark:text-zinc-50">
            {ex.name}
            <span className="text-zinc-400">{sideLabel(p.side)}</span>
          </span>
          <span className="block text-xs text-zinc-500">{ex.helps}</span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-sm tabular-nums text-zinc-700 dark:text-zinc-200">
          {doseText(p)}
        </span>
        <span className="text-xs text-lime-600">따라하기 →</span>
      </span>
    </Link>
  );
}

function RoutineGroup({
  title,
  emoji,
  items,
}: {
  title: string;
  emoji: string;
  items: ExercisePrescription[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="w-full">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
        <span aria-hidden>{emoji}</span> {title}
        <span className="text-xs font-normal text-zinc-400">{items.length}개</span>
      </h2>
      <div className="flex flex-col gap-2">
        {items.map((p, i) => (
          <PrescriptionCard key={`${p.exerciseId}-${i}`} p={p} />
        ))}
      </div>
    </section>
  );
}

type LoadState = { takenAt: string | null; routine: Routine | null; done: boolean };

function RoutineView() {
  // localStorage 는 클라이언트 전용 → 마운트 후 1회 로드(SSR/하이드레이션 안전).
  const [state, setState] = useState<LoadState | null>(null);
  const { plan } = usePlan(); // 루틴 상세는 Pro 전용. loading 중에도 free 취급(Pro 콘텐츠 플래시 방지).

  useEffect(() => {
    const snap = getLastScan();
    const profile = getProfile();
    let routine: Routine | null = null;
    let takenAt: string | null = null;
    if (snap && profile) {
      const issues = detectPostureIssues(snap.agg, profile);
      routine = buildRoutine(issues, profile, {
        gatePassed: snap.agg.gatePassed,
        confidence: snap.agg.confidence,
      });
      takenAt = snap.takenAt;
    }
    let done = false;
    try {
      done = localStorage.getItem(todayKey()) === "1";
    } catch {
      /* localStorage 차단 환경 */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 외부 시스템(localStorage) 1회 동기화
    setState({ takenAt, routine, done });
  }, []);

  const toggleDone = () => {
    setState((prev) => {
      if (!prev) return prev;
      const next = !prev.done;
      try {
        if (next) localStorage.setItem(todayKey(), "1");
        else localStorage.removeItem(todayKey());
      } catch {
        /* 무시 */
      }
      return { ...prev, done: next };
    });
  };

  const loaded = state !== null;
  const takenAt = state?.takenAt ?? null;
  const routine = state?.routine ?? null;
  const done = state?.done ?? false;

  if (!loaded) {
    return <p className="py-24 text-sm text-zinc-500">불러오는 중…</p>;
  }

  // 측정 스냅샷 없음 → 먼저 측정 유도
  if (!routine) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          오늘의 루틴
        </h1>
        <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
          개인화 루틴은 측정 결과로 만들어져요. 먼저 자세를 측정하면 약점에 맞춘 교정 루틴이
          여기에 생깁니다.
        </p>
        <Link
          href="/capture"
          className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
        >
          자세 측정하기
        </Link>
      </div>
    );
  }

  const morning = routine.prescriptions.filter((p) => p.timeOfDay === "morning");
  const evening = routine.prescriptions.filter((p) => p.timeOfDay === "evening");
  const planIds = [...new Set(routine.prescriptions.map((p) => p.exerciseId))];
  const hasRoutine = routine.prescriptions.length > 0;

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6">
      <header className="flex w-full items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          오늘의 루틴
        </h1>
        <div className="flex items-center gap-3">
          <AuthButton />
          <Link
            href="/capture"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            + 새 측정
          </Link>
        </div>
      </header>

      {takenAt && (
        <div className="flex w-full items-center justify-between rounded-lg bg-zinc-100 px-4 py-2 text-xs text-zinc-500 dark:bg-zinc-800">
          <span>
            마지막 측정 {daysAgo(takenAt) === 0 ? "오늘" : `${daysAgo(takenAt)}일 전`} · 신뢰도{" "}
            {Math.round(routine.generatedFrom.confidence * 100)}%
          </span>
          {daysAgo(takenAt) >= 3 && (
            <Link href="/capture" className="font-medium text-lime-600 underline">
              다시 측정하기
            </Link>
          )}
        </div>
      )}

      {!hasRoutine ? (
        <p className="w-full rounded-xl border border-zinc-300 px-4 py-6 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          이번 측정에서는 처방할 교정운동이 잡히지 않았어요. 아래 안내를 확인하거나 측면/전신이
          또렷하게 보이도록 다시 측정해 보세요.
        </p>
      ) : plan === "pro" ? (
        <>
          <div className="flex w-full flex-col gap-6">
            <RoutineGroup title="아침 · 근력·활성" emoji="🌅" items={morning} />
            <RoutineGroup title="저녁 · 스트레칭·이완" emoji="🌙" items={evening} />
          </div>

          <div className="flex w-full flex-col gap-3">
            <Link
              href={`/coach?plan=${planIds.join(",")}`}
              className="w-full rounded-full bg-foreground py-3 text-center text-sm font-medium text-background hover:opacity-90"
            >
              전체 코스 따라하기 ({planIds.length}개) →
            </Link>
            <button
              onClick={toggleDone}
              className={`w-full rounded-full py-3 text-sm font-medium ${
                done
                  ? "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300"
                  : "border border-zinc-300 text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              }`}
            >
              {done ? "✓ 오늘 완료함" : "오늘 루틴 완료 표시"}
            </button>
          </div>
        </>
      ) : (
        // 무료 → 티저(처방 개수만 공개) + Pro 잠금. 실제 처방·세트/렙은 가린다.
        <div className="flex w-full flex-col gap-3">
          <div className="w-full rounded-xl border border-zinc-300 px-4 py-5 text-center dark:border-zinc-700">
            <p className="text-sm text-zinc-700 dark:text-zinc-200">
              측정 결과로 <b className="text-lime-600">맞춤 교정운동 {planIds.length}개</b>가
              준비됐어요.
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              아침/저녁 처방(세트·횟수)과 따라하기 코칭은 Pro에서 열립니다.
            </p>
          </div>
          <ProLock
            title="개인화 교정 루틴"
            desc="네 약점에 맞춘 아침·저녁 처방과 단계별 따라하기 코칭을 받아보세요."
          />
        </div>
      )}

      {routine.advisories.length > 0 && (
        <ul className="w-full space-y-1.5 rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-500 dark:bg-zinc-900">
          {routine.advisories.map((a, i) => (
            <li key={i}>· {a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RoutinePage() {
  return (
    <OnboardingGate>
      <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 dark:bg-black">
        <RoutineView />
      </div>
    </OnboardingGate>
  );
}
