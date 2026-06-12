import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { POSE_CONFIG } from "./config";

// 자세추정 런타임: MediaPipe 모듈은 브라우저 전용이라 동적 import로 로드
// (SSR 평가 회피). mp 네임스페이스를 함께 반환 → DrawingUtils/POSE_CONNECTIONS 재사용.
export type PoseRuntime = {
  landmarker: PoseLandmarker;
  mp: typeof import("@mediapipe/tasks-vision");
};

export async function createPoseRuntime(): Promise<PoseRuntime> {
  const mp = await import("@mediapipe/tasks-vision");
  const vision = await mp.FilesetResolver.forVisionTasks(POSE_CONFIG.WASM_BASE);
  const landmarker = await mp.PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: POSE_CONFIG.MODEL_URL,
      delegate: POSE_CONFIG.DELEGATE,
    },
    runningMode: "VIDEO",
    numPoses: POSE_CONFIG.NUM_POSES,
    minPoseDetectionConfidence: POSE_CONFIG.MIN_POSE_DETECTION_CONFIDENCE,
    minPosePresenceConfidence: POSE_CONFIG.MIN_POSE_PRESENCE_CONFIDENCE,
    minTrackingConfidence: POSE_CONFIG.MIN_TRACKING_CONFIDENCE,
  });
  return { landmarker, mp };
}
