"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPoseRuntime, type PoseRuntime } from "@/lib/pose/poseLandmarker";
import { computeBodyMetrics, type BodyMetrics } from "@/lib/golden/score";

type Status = "idle" | "loading" | "running" | "error";

export default function PoseCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<PoseRuntime | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const fpsRef = useRef<{ last: number; frames: number }>({ last: 0, frames: 0 });
  const lastMetricsAtRef = useRef<number>(0);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [fps, setFps] = useState(0);
  const [ms, setMs] = useState(0);
  const [detected, setDetected] = useState(false);
  const [metrics, setMetrics] = useState<BodyMetrics | null>(null);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    runtimeRef.current?.landmarker.close();
    runtimeRef.current = null;
    lastVideoTimeRef.current = -1;
    setStatus("idle");
    setFps(0);
    setMs(0);
    setDetected(false);
    setMetrics(null);
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

        const t0 = performance.now();
        const result = runtime.landmarker.detectForVideo(video, t0);
        const t1 = performance.now();
        setMs(Math.round(t1 - t0));

        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const drawingUtils = new runtime.mp.DrawingUtils(ctx);
        setDetected(result.landmarks.length > 0);
        // 점수는 ~5fps로 갱신(화면 떨림 방지) — P3 황금비율 엔진
        if (result.landmarks.length > 0 && t1 - lastMetricsAtRef.current >= 200) {
          lastMetricsAtRef.current = t1;
          setMetrics(computeBodyMetrics(result.landmarks[0]));
        }
        for (const landmarks of result.landmarks) {
          drawingUtils.drawConnectors(
            landmarks,
            runtime.mp.PoseLandmarker.POSE_CONNECTIONS,
            { color: "#a3e635", lineWidth: 3 },
          );
          drawingUtils.drawLandmarks(landmarks, { color: "#22d3ee", radius: 4 });
        }
        ctx.restore();

        const f = fpsRef.current;
        f.frames++;
        if (t1 - f.last >= 500) {
          setFps(Math.round((f.frames * 1000) / (t1 - f.last)));
          f.frames = 0;
          f.last = t1;
        }
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const start = useCallback(async () => {
    try {
      setStatus("loading");
      setError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "카메라 사용 불가 — HTTPS 또는 localhost에서만 동작합니다(폰은 https 필요).",
        );
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
      fpsRef.current = { last: performance.now(), frames: 0 };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [loop]);

  // 언마운트 시 정리
  useEffect(() => stop, [stop]);

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-4">
      <div className="relative w-full overflow-hidden rounded-xl border border-zinc-300 bg-zinc-900 dark:border-zinc-700">
        <canvas ref={canvasRef} className="block h-auto w-full" />
        {status !== "running" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
            {status === "loading"
              ? "모델·카메라 준비 중…"
              : status === "error"
                ? "오류 — 아래 메시지 확인"
                : "‘카메라 시작’을 누르세요"}
          </div>
        )}
      </div>
      {/* 화면 표시는 canvas로만 — video는 소스용(숨김) */}
      <video ref={videoRef} className="hidden" playsInline muted />

      <div className="flex w-full items-center justify-between gap-3 text-sm">
        <div className="flex gap-4 font-mono text-zinc-600 dark:text-zinc-300">
          <span>FPS: {fps}</span>
          <span>추론: {ms}ms</span>
          <span className={detected ? "text-lime-600" : "text-zinc-400"}>
            {detected ? "● 자세 감지" : "○ 미감지"}
          </span>
        </div>
        {status === "running" ? (
          <button
            onClick={stop}
            className="rounded-full bg-zinc-200 px-5 py-2 font-medium text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-50"
          >
            중지
          </button>
        ) : (
          <button
            onClick={start}
            disabled={status === "loading"}
            className="rounded-full bg-foreground px-5 py-2 font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {status === "loading" ? "준비 중…" : "카메라 시작"}
          </button>
        )}
      </div>

      {metrics && (
        <div className="w-full rounded-xl border border-zinc-300 p-4 dark:border-zinc-700">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500">종합 자세 점수</span>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-black dark:text-zinc-50">
                {metrics.overall.score}
              </span>
              <span className="rounded-md bg-foreground px-2 py-0.5 text-sm font-semibold text-background">
                {metrics.overall.grade}
              </span>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
              <div className="flex justify-between">
                <span className="text-zinc-500">좌우 대칭</span>
                <span className="font-semibold tabular-nums">
                  {metrics.symmetry.available ? metrics.symmetry.score : "—"}
                </span>
              </div>
              <div className="mt-1 font-mono text-xs text-zinc-500">
                어깨 {metrics.symmetry.shoulderTiltDeg}° · 골반{" "}
                {metrics.symmetry.hipTiltDeg}° · 머리 {metrics.symmetry.headTiltDeg}°
              </div>
            </div>
            <div className="rounded-lg bg-zinc-100 p-3 dark:bg-zinc-800">
              <div className="flex justify-between">
                <span className="text-zinc-500">황금비(φ)</span>
                <span className="font-semibold tabular-nums">
                  {metrics.golden.available ? metrics.golden.score : "—"}
                </span>
              </div>
              <div className="mt-1 font-mono text-xs text-zinc-500">
                하체:상체 {metrics.golden.available ? metrics.golden.lowerUpperRatio : "—"}{" "}
                / 목표 {metrics.golden.phi}
              </div>
            </div>
          </div>

          {metrics.deviations.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-400">
              {metrics.deviations.map((d, i) => (
                <li key={i}>• {d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="w-full rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
