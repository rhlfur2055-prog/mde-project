// posera 자세추정 설정 (네임스페이스 상수 패턴 — yolo11 config.py 이식)
// WASM_BASE는 설치된 @mediapipe/tasks-vision 버전과 일치시켜야 함.
export const POSE_CONFIG = {
  WASM_BASE:
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
  // 경량 모델(모바일 우선). 정확도 우선이 필요하면 _full 로 교체.
  MODEL_URL:
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  DELEGATE: "GPU" as const, // WebGL/WebGPU. 미지원 환경은 "CPU"로 폴백.
  NUM_POSES: 1,
  MIN_POSE_DETECTION_CONFIDENCE: 0.5,
  MIN_POSE_PRESENCE_CONFIDENCE: 0.5,
  MIN_TRACKING_CONFIDENCE: 0.5,
} as const;
