"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listScans, type ScanRow } from "@/lib/supabase/scans";
import { useSession, signInWithGoogle } from "@/lib/supabase/session";
import AuthButton from "@/components/AuthButton";
import TrendChart from "@/components/TrendChart";

function daysAgo(ts: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000));
}

function fmt(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate(),
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

function ScoreBadge({ score, grade }: { score: number | null; grade: string | null }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-2xl font-bold tabular-nums">{score ?? "—"}</span>
      {grade && (
        <span className="rounded bg-foreground px-1.5 text-xs font-semibold text-background">
          {grade}
        </span>
      )}
    </span>
  );
}

export default function ProgressPage() {
  const { session, loading: authLoading } = useSession();
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("ready"); // 비로그인 → 로그인 안내 표시(아래)
      return;
    }
    listScans()
      .then((rows) => {
        setScans(rows);
        setStatus("ready");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      });
  }, [session, authLoading]);

  // 비로그인 → 진척은 계정 데이터라 로그인 필요
  if (!authLoading && !session) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 py-24 text-center dark:bg-black">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">내 진척</h1>
        <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
          진척 기록은 계정에 안전하게 저장됩니다(본인만 열람). 구글로 로그인하면 전·후 비교를 볼 수 있어요.
        </p>
        <button
          onClick={signInWithGoogle}
          className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90"
        >
          구글로 로그인
        </button>
        <Link href="/capture" className="text-sm text-zinc-500 underline">
          먼저 측정해 보기
        </Link>
      </div>
    );
  }

  // 전/후 비교: 가장 오래된 vs 가장 최근
  const newest = scans[0];
  const oldest = scans[scans.length - 1];
  const showCompare = scans.length >= 2;
  const delta =
    showCompare && newest.overall_score != null && oldest.overall_score != null
      ? newest.overall_score - oldest.overall_score
      : null;

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 px-4 py-10 dark:bg-black">
      <header className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          내 진척
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

      <div className="w-full max-w-2xl">
        {status === "loading" && (
          <p className="text-sm text-zinc-500">불러오는 중…</p>
        )}
        {status === "error" && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            불러오기 실패: {error}
            <br />
            <span className="text-xs">
              Supabase에 scans 테이블이 없으면 supabase/schema.sql을 먼저 실행하세요.
            </span>
          </p>
        )}
        {status === "ready" && scans.length === 0 && (
          <p className="text-sm text-zinc-500">
            아직 저장된 측정이 없습니다.{" "}
            <Link href="/capture" className="underline">
              측정하러 가기
            </Link>
          </p>
        )}

        {status === "ready" && scans.length >= 1 && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-zinc-100 px-4 py-2 text-xs text-zinc-500 dark:bg-zinc-800">
            <span>
              마지막 측정 {daysAgo(scans[0].taken_at) === 0 ? "오늘" : `${daysAgo(scans[0].taken_at)}일 전`}
            </span>
            <Link href="/routine" className="font-medium text-lime-600 underline">
              오늘의 루틴 →
            </Link>
          </div>
        )}

        {status === "ready" && scans.length >= 2 && (
          <div className="mb-6">
            <TrendChart scans={scans} />
          </div>
        )}

        {showCompare && (
          <div className="mb-6 rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
            <h2 className="mb-3 text-sm text-zinc-500">전 / 후 비교</h2>
            <div className="flex items-center justify-between gap-4">
              <div className="text-center">
                <div className="text-xs text-zinc-500">{fmt(oldest.taken_at)}</div>
                <ScoreBadge score={oldest.overall_score} grade={oldest.overall_grade} />
              </div>
              <div className="text-center">
                <div className="text-xs text-zinc-500">변화</div>
                <div
                  className={`text-xl font-bold tabular-nums ${
                    delta == null
                      ? "text-zinc-400"
                      : delta > 0
                        ? "text-lime-600"
                        : delta < 0
                          ? "text-red-500"
                          : "text-zinc-500"
                  }`}
                >
                  {delta == null ? "—" : delta > 0 ? `+${delta}` : delta}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-zinc-500">{fmt(newest.taken_at)}</div>
                <ScoreBadge score={newest.overall_score} grade={newest.overall_grade} />
              </div>
            </div>
          </div>
        )}

        {scans.length > 0 && (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-300 dark:divide-zinc-800 dark:border-zinc-700">
            {scans.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="text-zinc-600 dark:text-zinc-300">
                  {fmt(s.taken_at)}
                </span>
                <span className="flex items-center gap-4 font-mono text-xs text-zinc-500">
                  <span>대칭 {s.symmetry_score ?? "—"}</span>
                  <span>황금비 {s.golden_score ?? "—"}</span>
                  <ScoreBadge score={s.overall_score} grade={s.overall_grade} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
