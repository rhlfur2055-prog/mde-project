"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPoseRuntime, type PoseRuntime } from "@/lib/pose/poseLandmarker";
import type { Exercise } from "@/lib/exercise/exercises";
import ExerciseDemo, { type Gender } from "@/components/ExerciseDemo";
import { LandmarkSmoother } from "@/lib/pose/oneEuro";
import { speak, beep, vibrate, resetSpeech } from "@/lib/coach/feedback";

type Status = "idle" | "loading" | "running" | "error";

export default function CoachCamera({
  exercise,
  gender = "man",
  onExit,
  courseLabel,
  onNext,
  nextLabel,
  autoStart = false,
}: {
  exercise: Exercise;
  gender?: Gender;
  onExit: () => void;
  courseLabel?: string; // "추천 코스 2/3" (코스 진행 중일 때만)
  onNext?: () => void; // 코스의 다음 단계로 (없으면 단일 운동)
  nextLabel?: string; // "다음: 견갑 후인" 또는 "코스 완료 🎉"
  autoStart?: boolean; // 코스 연속 진행 시 마운트되면 카메라 자동 시작
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<PoseRuntime | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const lastTsRef = useRef<number>(0);
  const lastUiRef = useRef<number>(0);

  // 운동 진행 상태(루프에서 갱신, refs로 stale 방지)
  const phaseRef = useRef(0);
  const repsRef = useRef(0);
  const holdMsRef = useRef(0);
  const releasedRef = useRef(false);
  const doneRef = useRef(false);
  const autoNextStartedRef = useRef(false); // 자동 전환 카운트다운 1회 가드
  const smootherRef = useRef<LandmarkSmoother | null>(null); // 포즈 떨림 제거(One Euro)

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [reps, setReps] = useState(0);
  const [holdMs, setHoldMs] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState(false);
  const [inPos, setInPos] = useState(false); // 현재 목표 자세 충족 여부(게이지 색)
  const [cuesOn, setCuesOn] = useState(true); // 음성·사운드·진동 큐
  const cuesOnRef = useRef(true);
  useEffect(() => {
    cuesOnRef.current = cuesOn; // 루프(stale 클로저)에서 최신 토글 읽기
  });
  const [nextCountdown, setNextCountdown] = useState<number | null>(null); // 다음 운동 자동 전환 카운트다운(초)

  const resetProgress = useCallback(() => {
    phaseRef.current = 0;
    repsRef.current = 0;
    holdMsRef.current = 0;
    releasedRef.current = false;
    doneRef.current = false;
    autoNextStartedRef.current = false;
    smootherRef.current?.reset();
    resetSpeech();
    setReps(0);
    setHoldMs(0);
    setPhaseIdx(0);
    setDone(false);
    setInPos(false);
    setFeedback("");
    setNextCountdown(null);
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    runtimeRef.current?.landmarker.close();
    runtimeRef.current = null;
    lastVideoTimeRef.current = -1;
    setStatus("idle");
  }, []);

  const loop = useCallback(() => {
    const runtime = runtimeRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!runtime || !video || !canvas) return;

    if (video.readyState >= 2 && video.videoWidth > 0) {
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      const ctx = canvas.getContext("2d");
      if (ctx && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        const now = performance.now();
        const dt = lastTsRef.current ? now - lastTsRef.current : 0;
        lastTsRef.current = now;

        const result = runtime.landmarker.detectForVideo(video, now);

        // 포즈 떨림 제거(One Euro) — 첫 사람만, 판정·드로잉 모두 평활본 사용 → 횟수·각도 안정
        let persons = result.landmarks;
        if (persons.length > 0 && smootherRef.current) {
          const sm = smootherRef.current.apply(persons[0], dt / 1000);
          persons = [sm, ...persons.slice(1)];
        }

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const du = new runtime.mp.DrawingUtils(ctx);
        for (const lm of persons) {
          du.drawConnectors(lm, runtime.mp.PoseLandmarker.POSE_CONNECTIONS, {
            color: "#a3e635",
            lineWidth: 3,
          });
          du.drawLandmarks(lm, { color: "#22d3ee", radius: 4 });
        }
        ctx.restore();

        // ── 운동 판정 ──
        if (!doneRef.current && persons.length > 0) {
          const phase = exercise.phases?.[phaseRef.current];
          const r = exercise.evaluate(persons[0], phase);
          const cues = cuesOnRef.current;

          if (exercise.mode === "hold") {
            if (r.ok && r.inPosition) holdMsRef.current += dt;
            const need = (exercise.holdSec ?? 10) * 1000;
            if (holdMsRef.current >= need) {
              phaseRef.current += 1;
              holdMsRef.current = 0;
              if (phaseRef.current >= (exercise.phases?.length ?? 1)) {
                doneRef.current = true;
                beep(cues, 1046, 220); // 완료음(높은 톤)
                vibrate(cues, [80, 40, 80]);
                speak("완료했어요", cues, { force: true, minGapMs: 0 });
              } else {
                beep(cues, 880, 140); // 한 단계(좌→우) 완료
                vibrate(cues, 60);
                speak("반대쪽으로 바꾸세요", cues, { force: true, minGapMs: 0 });
              }
            }
          } else {
            if (r.ok && r.released) releasedRef.current = true;
            if (r.ok && r.inPosition && releasedRef.current) {
              repsRef.current += 1;
              releasedRef.current = false;
              const target = exercise.reps ?? 10;
              if (repsRef.current >= target) {
                doneRef.current = true;
                beep(cues, 1046, 220);
                vibrate(cues, [80, 40, 80]);
                speak("완료했어요", cues, { force: true, minGapMs: 0 });
              } else {
                beep(cues, 880, 90); // 한 회 카운트
                vibrate(cues, 40);
                speak(String(repsRef.current), cues, { force: true, minGapMs: 300 });
              }
            }
          }

          // UI 갱신 + 교정 음성 큐는 ~10fps
          if (now - lastUiRef.current >= 100) {
            lastUiRef.current = now;
            setFeedback(r.feedback);
            setReps(repsRef.current);
            setHoldMs(holdMsRef.current);
            setPhaseIdx(phaseRef.current);
            setInPos(r.ok && r.inPosition);
            if (doneRef.current) setDone(true);
            // 목표 미달 시 교정 멘트(과빈도 방지 2.5s 내장)
            if (!doneRef.current && r.ok && !r.inPosition) speak(r.feedback, cues);
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [exercise]);

  const start = useCallback(async () => {
    try {
      setStatus("loading");
      setError("");
      resetProgress();
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("카메라 사용 불가 — HTTPS 또는 localhost에서만 동작합니다.");
      }
      if (!runtimeRef.current) runtimeRef.current = await createPoseRuntime();
      if (!smootherRef.current) smootherRef.current = new LandmarkSmoother();
      smootherRef.current.reset();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setStatus("running");
      lastTsRef.current = 0;
      // 시작 시 동작 안내 음성(첫 비프로 오디오 컨텍스트 깨움)
      beep(cuesOnRef.current, 660, 80);
      speak(exercise.instructions, cuesOnRef.current, { force: true, minGapMs: 0 });
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [loop, resetProgress]);

  useEffect(() => stop, [stop]);

  // 운동 완료 → 코스의 다음 운동으로 자동 전환(3초 카운트다운, 1회만). 단일 운동(onNext 없음)이면 미동작.
  useEffect(() => {
    if (!done || !onNext || autoNextStartedRef.current) return;
    autoNextStartedRef.current = true;
    let c = 3;
    setNextCountdown(c);
    const iv = setInterval(() => {
      c -= 1;
      if (c <= 0) {
        clearInterval(iv);
        setNextCountdown(null);
        onNext(); // 다음 운동으로 (마지막이면 코스 완료 화면)
      } else {
        setNextCountdown(c);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [done, onNext]);

  // 코스 연속 진행: 다음 운동으로 넘어오면(autoStart) 카메라 자동 시작 — 사람이 매번 '시작' 안 누르게.
  // 최초 진입은 사용자 제스처(첫 '시작')로 권한 받으므로 autoStart는 2번째 운동부터만 true.
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  });
  useEffect(() => {
    if (autoStart) startRef.current();
    // 마운트 1회만 — 의존성 비움(exercise 바뀌면 key로 remount되어 재실행).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phaseLabel = exercise.phases
    ? exercise.phaseLabels?.[exercise.phases[Math.min(phaseIdx, exercise.phases.length - 1)]]
    : undefined;
  const holdSec = exercise.holdSec ?? 10;
  // 목표 진행도(0~1): rep=횟수/목표, hold=현재 단계 유지시간/필요시간
  const progress = done
    ? 1
    : exercise.mode === "rep"
      ? Math.min(1, reps / (exercise.reps ?? 10))
      : Math.min(1, holdMs / (holdSec * 1000));

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between">
        <button onClick={onExit} className="text-sm text-zinc-500 hover:underline">
          ← 운동 목록
        </button>
        <div className="flex items-center gap-2">
          {courseLabel && (
            <span className="rounded-full bg-lime-100 px-2 py-0.5 text-xs font-medium text-lime-700 dark:bg-lime-950 dark:text-lime-300">
              {courseLabel}
            </span>
          )}
          <button
            onClick={() => setCuesOn((v) => !v)}
            title="음성·사운드·진동 코칭"
            aria-pressed={cuesOn}
            className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-xs dark:border-zinc-700"
          >
            {cuesOn ? "🔊 음성 켬" : "🔇 음성 끔"}
          </button>
          <span className="text-sm font-medium">
            {exercise.emoji} {exercise.name}
          </span>
        </div>
      </div>

      {/* 시범 — "이렇게 하세요" */}
      <div className="flex w-full items-center gap-4 rounded-xl border border-zinc-300 p-3 dark:border-zinc-700">
        <ExerciseDemo exerciseId={exercise.id} gender={gender} />
        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          <p className="mb-1 font-medium text-black dark:text-zinc-50">이렇게 하세요 (시범)</p>
          <p>{exercise.instructions}</p>
          <p className="mt-2 text-xs text-zinc-400">교정: {exercise.helps}</p>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-xl border border-zinc-300 bg-zinc-900 dark:border-zinc-700">
        <canvas ref={canvasRef} className="block h-auto w-full" />
        {status !== "running" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
            {status === "loading"
              ? "준비 중…"
              : status === "error"
                ? "오류 — 아래 확인"
                : "‘시작’을 누르세요"}
          </div>
        )}
        {/* 진행 오버레이 */}
        {status === "running" && (
          <>
            <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-black/40 px-4 py-2 text-white">
              {exercise.mode === "rep" ? (
                <span className="text-2xl font-bold tabular-nums">
                  {reps} / {exercise.reps}
                </span>
              ) : (
                <span className="text-lg font-bold tabular-nums">
                  {phaseLabel} {(holdMs / 1000).toFixed(1)} / {holdSec}s
                </span>
              )}
              <span className="flex items-center gap-2 text-sm">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${inPos ? "bg-lime-400" : "bg-zinc-400"}`}
                  aria-hidden
                />
                {done ? "완료 🎉" : feedback}
              </span>
            </div>
            {/* 목표 진행 게이지 */}
            <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/30">
              <div
                className={`h-full transition-[width] duration-150 ${inPos ? "bg-lime-400" : "bg-cyan-400"}`}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </>
        )}
      </div>
      <video ref={videoRef} className="hidden" playsInline muted />

      <div className="flex w-full items-center justify-end gap-2">
        {done && (
          <span className="mr-auto font-medium text-lime-600">
            {nextCountdown !== null
              ? `완료! 🎉 ${nextCountdown}초 후 ${nextLabel ?? "다음 운동"}`
              : "완료했어요! 🎉"}
          </span>
        )}
        {done && onNext && (
          <button
            onClick={onNext}
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            {nextCountdown !== null ? "지금" : (nextLabel ?? "다음")} →
          </button>
        )}
        {status === "running" ? (
          <>
            <button
              onClick={resetProgress}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700"
            >
              다시
            </button>
            <button
              onClick={stop}
              className="rounded-full bg-zinc-200 px-5 py-2 text-sm font-medium text-zinc-900 dark:bg-zinc-700 dark:text-zinc-50"
            >
              중지
            </button>
          </>
        ) : (
          <button
            onClick={start}
            disabled={status === "loading"}
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {status === "loading" ? "준비 중…" : "시작"}
          </button>
        )}
      </div>

      {error && (
        <p className="w-full rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
