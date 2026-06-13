"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPoseRuntime, type PoseRuntime } from "@/lib/pose/poseLandmarker";
import {
  createPersonDetector,
  type PersonBox,
  type PersonDetector,
} from "@/lib/pose/personDetector";
import { YOLO_CONFIG } from "@/lib/pose/config";
import {
  forwardHeadCvaDeg,
  shoulderProtractionDeg,
  kneeVarusDeg,
  type BodyMetrics,
  type Pt,
} from "@/lib/golden/score";
import {
  aggregateFrames,
  aggregateLandmarks,
  type AggregatedMetrics,
} from "@/lib/golden/aggregate";
import { AGGREGATE } from "@/lib/golden/poseConfig";
import { assessPosture, exerciseById } from "@/lib/exercise/exercises";
import { saveScan } from "@/lib/supabase/scans";
import { useSession, signInWithGoogle } from "@/lib/supabase/session";
import Link from "next/link";

type Assessment = { exerciseIds: string[]; advisories: string[] };

type Status = "idle" | "loading" | "running" | "error";

// Supabase 에러는 Error 인스턴스가 아니라 {message,code,...} 객체 → message 우선 추출
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

export default function PoseCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<PoseRuntime | null>(null);
  const rafRef = useRef<number>(0);
  const loopRef = useRef<() => void>(() => {}); // rAF 재귀 — 자기참조 대신 ref로 호출(stale 방지)
  const streamRef = useRef<MediaStream | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const fpsRef = useRef<{ last: number; frames: number }>({ last: 0, frames: 0 });
  const lastMetricsAtRef = useRef<number>(0);
  const lastLandmarksRef = useRef<unknown>(null);
  // 재현성: 최근 프레임 랜드마크 롤링 버퍼(집계·게이팅 입력). 단일 프레임 직결 금지.
  const framesRef = useRef<Pt[][]>([]);
  // YOLO 사람검출(온디바이스, 자세추정과 분리)
  const detectorRef = useRef<PersonDetector | null>(null);
  const detectorLoadingRef = useRef(false);
  const detectInFlightRef = useRef(false);
  const lastBoxRef = useRef<PersonBox | null>(null);
  const lastDetectAtRef = useRef<number>(0);
  // 반자동 확인: 신뢰도 충분 조건이 연속 유지되기 시작한 시각(0=미충족) + 자동저장 1회 가드
  const stableSinceRef = useRef<number>(0);
  const autoSavedRef = useRef<boolean>(false);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [fps, setFps] = useState(0);
  const [ms, setMs] = useState(0);
  const [detected, setDetected] = useState(false);
  const [personScore, setPersonScore] = useState(0);
  const [metrics, setMetrics] = useState<BodyMetrics | null>(null);
  const [agg, setAgg] = useState<AggregatedMetrics | null>(null);
  const [assess, setAssess] = useState<Assessment | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  // 로그인 세션 — 저장은 로그인 사용자만(계정 격리 RLS). 루프(stale 클로저)에서 ref로 읽음.
  const { session } = useSession();
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  });

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    runtimeRef.current?.landmarker.close();
    runtimeRef.current = null;
    detectorRef.current?.close();
    detectorRef.current = null;
    lastBoxRef.current = null;
    detectInFlightRef.current = false;
    lastVideoTimeRef.current = -1;
    framesRef.current = [];
    stableSinceRef.current = 0;
    autoSavedRef.current = false;
    setConfirmed(false);
    setStatus("idle");
    setFps(0);
    setMs(0);
    setDetected(false);
    setPersonScore(0);
    setMetrics(null);
    setAgg(null);
    setAssess(null);
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
        // 매 프레임 랜드마크를 롤링 버퍼에 적재(집계 입력). 윈도 초과분은 폐기.
        if (result.landmarks.length > 0) {
          const buf = framesRef.current;
          buf.push(result.landmarks[0] as Pt[]);
          if (buf.length > AGGREGATE.WINDOW) buf.splice(0, buf.length - AGGREGATE.WINDOW);
        }

        // 점수는 ~5fps로 갱신(화면 떨림 방지). 단일 프레임이 아니라 집계·게이팅 결과 사용.
        if (framesRef.current.length > 0 && t1 - lastMetricsAtRef.current >= 200) {
          lastMetricsAtRef.current = t1;
          const a = aggregateFrames(framesRef.current);
          const medLm = aggregateLandmarks(framesRef.current); // 집계 랜드마크(단일 프레임 직결 금지)
          lastLandmarksRef.current = medLm;
          setMetrics(a.metrics);
          setAgg(a);

          // 비진단/confidence 게이팅: 게이트 미통과·저신뢰면 추천 보류(재촬영 유도).
          if (a.gatePassed && a.confidence >= AGGREGATE.MIN_CONFIDENCE) {
            // 신규 지표(거북목 CVA·오다리 내반)도 집계 랜드마크로 산출.
            const cva = forwardHeadCvaDeg(medLm);
            const prot = shoulderProtractionDeg(medLm);
            const knee = kneeVarusDeg(medLm);
            setAssess(
              assessPosture({
                headTiltDeg: a.metrics.symmetry.headTiltDeg,
                shoulderTiltDeg: a.metrics.symmetry.shoulderTiltDeg,
                hipTiltDeg: a.metrics.symmetry.hipTiltDeg,
                cvaDeg: cva.cvaDeg,
                cvaAvailable: cva.available,
                shoulderProtractionDeg: prot.protractionDeg,
                shoulderProtractionAvailable: prot.available,
                kneeVarusDeg: knee.available ? knee.varusDeg : 0,
                kneeValgusDeg: knee.available ? knee.valgusDeg : 0,
              }),
            );

            // 반자동 확인완료: 조건이 연속 AUTO_CONFIRM_HOLD_MS 유지되면 자동으로 1회 저장.
            if (stableSinceRef.current === 0) stableSinceRef.current = t1;
            if (
              !autoSavedRef.current &&
              t1 - stableSinceRef.current >= AGGREGATE.AUTO_CONFIRM_HOLD_MS
            ) {
              autoSavedRef.current = true; // 가드: 같은 측정에서 중복 저장 금지
              setConfirmed(true);
              if (sessionRef.current) {
                // 로그인 사용자 → 계정에 저장(RLS: user_id=auth.uid())
                setSaving(true);
                setSaveMsg("측정 확인 — 자동 저장 중…");
                saveScan(a.metrics, medLm)
                  .then(() => setSaveMsg("확인완료 ✓ 자동 저장됨"))
                  .catch((e) => setSaveMsg("저장 실패: " + errMsg(e)))
                  .finally(() => setSaving(false));
              } else {
                // 비로그인 → 측정은 확인하되 저장은 보류(로그인 유도)
                setSaveMsg("확인완료 ✓ — 로그인하면 이 측정이 저장돼요");
              }
            }
          } else {
            setAssess(null); // 미통과 → 추천 산출 안 함
            // 조건 깨짐 → 안정 타이머·자동저장 가드 리셋(다시 자세 잡으면 재확인 가능)
            stableSinceRef.current = 0;
            autoSavedRef.current = false;
            setConfirmed(false);
          }
        }
        for (const landmarks of result.landmarks) {
          drawingUtils.drawConnectors(
            landmarks,
            runtime.mp.PoseLandmarker.POSE_CONNECTIONS,
            { color: "#a3e635", lineWidth: 3 },
          );
          drawingUtils.drawLandmarks(landmarks, { color: "#22d3ee", radius: 4 });
        }

        // YOLO 사람검출 박스(우리 ONNX, 온디바이스) — 좌표는 원본 픽셀 공간
        const box = lastBoxRef.current;
        if (box) {
          ctx.strokeStyle = "#fb923c";
          ctx.lineWidth = 3;
          ctx.strokeRect(box.x1, box.y1, box.x2 - box.x1, box.y2 - box.y1);
          ctx.fillStyle = "#fb923c";
          ctx.font = "16px sans-serif";
          ctx.fillText(
            `person ${Math.round(box.score * 100)}%`,
            box.x1 + 4,
            Math.max(16, box.y1 - 6),
          );
        }
        ctx.restore();

        // 사람검출은 자세추정과 분리해 ~5fps로(비동기, 겹침 방지)
        const det = detectorRef.current;
        if (
          det &&
          !detectInFlightRef.current &&
          t1 - lastDetectAtRef.current >= YOLO_CONFIG.DETECT_INTERVAL_MS
        ) {
          detectInFlightRef.current = true;
          lastDetectAtRef.current = t1;
          det
            .detect(video, video.videoWidth, video.videoHeight)
            .then((b) => {
              lastBoxRef.current = b;
              setPersonScore(b ? b.score : 0);
            })
            .catch(() => {})
            .finally(() => {
              detectInFlightRef.current = false;
            });
        }

        const f = fpsRef.current;
        f.frames++;
        if (t1 - f.last >= 500) {
          setFps(Math.round((f.frames * 1000) / (t1 - f.last)));
          f.frames = 0;
          f.last = t1;
        }
      }
    }
    rafRef.current = requestAnimationFrame(() => loopRef.current());
  }, []);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

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

      // YOLO 사람검출기(ONNX ~12MB)는 백그라운드 로드 → 준비되면 박스 표시
      if (!detectorRef.current && !detectorLoadingRef.current) {
        detectorLoadingRef.current = true;
        createPersonDetector()
          .then((d) => {
            detectorRef.current = d;
          })
          .catch((e) => {
            console.warn("YOLO 검출기 로드 실패(자세추정은 계속):", e);
          })
          .finally(() => {
            detectorLoadingRef.current = false;
          });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [loop]);

  const onSave = useCallback(async () => {
    if (!metrics) return;
    if (!session) {
      // 비로그인 → 구글 로그인으로 유도(로그인 후 같은 페이지 복귀)
      setSaveMsg("저장하려면 로그인하세요…");
      await signInWithGoogle();
      return;
    }
    try {
      setSaving(true);
      setSaveMsg("");
      await saveScan(metrics, lastLandmarksRef.current ?? []);
      setSaveMsg("저장됨 ✓");
    } catch (e) {
      setSaveMsg("저장 실패: " + errMsg(e));
    } finally {
      setSaving(false);
    }
  }, [metrics, session]);

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
          <span className={personScore > 0 ? "text-orange-500" : "text-zinc-400"}>
            YOLO {personScore > 0 ? `${Math.round(personScore * 100)}%` : "—"}
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

          {agg && (
            <div className="mt-2 font-mono text-xs">
              <span
                className={
                  agg.gatePassed && agg.confidence >= AGGREGATE.MIN_CONFIDENCE
                    ? "text-lime-600"
                    : "text-amber-600"
                }
              >
                측정 신뢰도 {Math.round(agg.confidence * 100)}% · {agg.framesUsed}프레임
              </span>
            </div>
          )}
          {agg && !(agg.gatePassed && agg.confidence >= AGGREGATE.MIN_CONFIDENCE) && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              정확한 측정을 위해 전신이 정면으로 또렷이 보이도록 거리를 맞춰 다시 서주세요. 신뢰도가
              충분해질 때까지 추천을 보류합니다.
            </p>
          )}
          {confirmed && (
            <p className="mt-2 rounded-lg bg-lime-50 px-3 py-2 text-xs font-medium text-lime-800 dark:bg-lime-950 dark:text-lime-300">
              ✓ 측정 확인완료 — 자세가 안정적으로 잡혀 자동으로 저장했습니다.
            </p>
          )}

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

          {assess && assess.exerciseIds.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">추천 교정운동</span>
                <Link
                  href={`/coach?plan=${assess.exerciseIds.join(",")}`}
                  className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90"
                >
                  추천 코스 시작 ({assess.exerciseIds.length}) →
                </Link>
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                {assess.exerciseIds.map((id) => {
                  const ex = exerciseById(id);
                  return ex ? (
                    <Link
                      key={id}
                      href={`/coach?ex=${id}`}
                      className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-200"
                    >
                      {ex.emoji} {ex.name}
                    </Link>
                  ) : null;
                })}
              </div>
            </div>
          )}

          {assess?.advisories.map((a, i) => (
            <p
              key={i}
              className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            >
              ⚠ {a}
            </p>
          ))}

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">{saveMsg}</span>
            <div className="flex gap-2">
              <Link
                href="/coach"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-black/4 dark:border-zinc-700 dark:text-zinc-200"
              >
                교정운동
              </Link>
              <Link
                href="/progress"
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-black/4 dark:border-zinc-700 dark:text-zinc-200"
              >
                진척 보기
              </Link>
              <button
                onClick={onSave}
                disabled={saving}
                className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
              >
                {saving
                  ? "저장 중…"
                  : !session
                    ? "로그인하고 저장"
                    : confirmed
                      ? "다시 저장"
                      : "이 측정 저장"}
              </button>
            </div>
          </div>
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
