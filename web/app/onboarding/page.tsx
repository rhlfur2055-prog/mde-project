"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/lib/profile/store";
import {
  GOAL_OPTIONS,
  PROFILE_LIMITS,
  SEX_OPTIONS,
  type Goal,
  type Sex,
  type UserProfile,
} from "@/lib/profile/types";

export default function OnboardingPage() {
  const router = useRouter();
  const [sex, setSex] = useState<Sex>("unspecified");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [goal, setGoal] = useState<Goal | "">("");
  const [error, setError] = useState("");

  const submit = () => {
    setError("");
    const heightCm = Number(height);
    const weightKg = Number(weight);
    if (
      !Number.isFinite(heightCm) ||
      heightCm < PROFILE_LIMITS.HEIGHT_CM_MIN ||
      heightCm > PROFILE_LIMITS.HEIGHT_CM_MAX
    ) {
      setError(`키는 ${PROFILE_LIMITS.HEIGHT_CM_MIN}~${PROFILE_LIMITS.HEIGHT_CM_MAX}cm 범위로 입력하세요.`);
      return;
    }
    if (
      !Number.isFinite(weightKg) ||
      weightKg < PROFILE_LIMITS.WEIGHT_KG_MIN ||
      weightKg > PROFILE_LIMITS.WEIGHT_KG_MAX
    ) {
      setError(`체중은 ${PROFILE_LIMITS.WEIGHT_KG_MIN}~${PROFILE_LIMITS.WEIGHT_KG_MAX}kg 범위로 입력하세요.`);
      return;
    }
    const ageYears = age ? Number(age) : undefined;
    if (
      ageYears !== undefined &&
      (!Number.isFinite(ageYears) ||
        ageYears < PROFILE_LIMITS.AGE_MIN ||
        ageYears > PROFILE_LIMITS.AGE_MAX)
    ) {
      setError(`연령은 ${PROFILE_LIMITS.AGE_MIN}~${PROFILE_LIMITS.AGE_MAX} 범위로 입력하세요.`);
      return;
    }

    const profile: UserProfile = {
      sex,
      heightCm,
      weightKg,
      ...(ageYears !== undefined ? { ageYears } : {}),
      ...(goal ? { goal } : {}),
      onboardedAt: new Date().toISOString(),
      schemaVersion: 1,
    };
    try {
      saveProfile(profile);
      router.replace("/capture"); // 완료 직후 첫 스캔 유도
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const inputCls =
    "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 px-4 py-10 dark:bg-black">
      <header className="flex w-full max-w-md flex-col items-center gap-2 text-center">
        <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-700">
          시작하기
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          기본 정보 입력
        </h1>
        <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
          더 정확한 자세 분석과 운동 추천을 위해 기본 정보를 입력해 주세요. 입력값은 기기 안에만
          저장되며 서버로 전송되지 않습니다.
        </p>
      </header>

      <div className="flex w-full max-w-md flex-col gap-5">
        {/* 성별 */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black dark:text-zinc-50">성별</label>
          <div className="flex overflow-hidden rounded-full border border-zinc-300 text-sm dark:border-zinc-700">
            {SEX_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setSex(o.value)}
                className={`flex-1 px-3 py-2 ${
                  sex === o.value
                    ? "bg-foreground text-background"
                    : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 키 / 체중 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-black dark:text-zinc-50">키 (cm)</label>
            <input
              type="number"
              inputMode="numeric"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="170"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-black dark:text-zinc-50">체중 (kg)</label>
            <input
              type="number"
              inputMode="numeric"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="65"
              className={inputCls}
            />
          </div>
        </div>

        {/* 연령(선택) */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black dark:text-zinc-50">
            연령 <span className="text-zinc-400">(선택)</span>
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="30"
            className={inputCls}
          />
        </div>

        {/* 목표(선택) */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-black dark:text-zinc-50">
            목표 <span className="text-zinc-400">(선택)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {GOAL_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setGoal(goal === o.value ? "" : o.value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  goal === o.value
                    ? "border-zinc-500 bg-foreground text-background"
                    : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          onClick={submit}
          className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background hover:opacity-90"
        >
          시작하기 → 자세 측정
        </button>

        <p className="text-center text-xs text-zinc-400">
          본 서비스는 의료 진단이 아니며, 일반적인 자세 개선 참고용입니다.
        </p>
      </div>
    </div>
  );
}
