"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPoseRuntime, type PoseRuntime } from "@/lib/pose/poseLandmarker";
import type { Exercise } from "@/lib/exercise/exercises";
import ExerciseDemo, { type Gender } from "@/components/ExerciseDemo";

type Status = "idle" | "loading" | "running" | "error";

export default function CoachCamera({
  exercise,
  gender = "man",
  onExit,
}: {
  exercise: Exercise;
  gender?: Gender;
  onExit: () => void;
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

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [reps, setReps] = useState(0);
  const [holdMs, setHoldMs] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [done, setDone] = useState(false);

  const resetProgress = useCallback(() => {
    phaseRef.current = 0;
    repsRef.current = 0;
    holdMsRef.current = 0;
    releasedRef.current = false;
    doneRef.current = false;
    setReps(0);
    setHoldMs(0);
    setPhaseIdx(0);
    setDone(false);
    setFeedback("");
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

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const du = new runtime.mp.DrawingUtils(ctx);
        for (const lm of result.landmarks) {
          du.drawConnectors(lm, runtime.mp.PoseLandmarker.POSE_CONNECTIONS, {
            color: "#a3e635",
            lineWidth: 3,
          });
          du.drawLandmarks(lm, { color: "#22d3ee", radius: 4 });
        }
        ctx.restore();

        // ── 운동 판정 ──
        if (!doneRef.current && result.landmarks.length > 0) {
          const phase = exercise.phases?.[phaseRef.current];
          const r = exercise.evaluate(result.landmarks[0], phase);

          if (exercise.mode === "hold") {
            if (r.ok && r.inPosition) holdMsRef.current += dt;
            const need = (exercise.holdSec ?? 10) * 1000;
            if (holdMsRef.current >= need) {
              phaseRef.current += 1;
              holdMsRef.current = 0;
              if (phaseRef.current >= (exercise.phases?.length ?? 1)) {
                doneRef.current = true;
              }
            }
          } else {
            if (r.ok && r.released) releasedRef.current = true;
            if (r.ok && r.inPosition && releasedRef.current) {
              repsRef.current += 1;
              releasedRef.current = false;
              if (repsRef.current >= (exercise.reps ?? 10)) doneRef.current = true;
            }
          }

          // UI 갱신은 ~10fps
          if (now - lastUiRef.current >= 100) {
            lastUiRef.current = now;
            setFeedback(r.feedback);
            setReps(repsRef.current);
            setHoldMs(holdMsRef.current);
            setPhaseIdx(phaseRef.current);
            if (doneRef.current) setDone(true);
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
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [loop, resetProgress]);

  useEffect(() => stop, [stop]);

  const phaseLabel = exercise.phases
    ? exercise.phaseLabels?.[exercise.phases[Math.min(phaseIdx, exercise.phases.length - 1)]]
    : undefined;
  const holdSec = exercise.holdSec ?? 10;

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between">
        <button onClick={onExit} className="text-sm text-zinc-500 hover:underline">
          ← 운동 목록
        </button>
        <span className="text-sm font-medium">
          {exercise.emoji} {exercise.name}
        </span>
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
            <span className="text-sm">{done ? "완료 🎉" : feedback}</span>
          </div>
        )}
      </div>
      <video ref={videoRef} className="hidden" playsInline muted />

      <div className="flex w-full items-center justify-end gap-2">
        {done && (
          <span className="mr-auto font-medium text-lime-600">완료했어요! 🎉</span>
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
