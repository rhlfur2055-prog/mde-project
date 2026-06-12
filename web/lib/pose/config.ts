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

// YOLOv8n 사람검출(우리가 export한 ONNX) — onnxruntime-web 온디바이스 실행
export const YOLO_CONFIG = {
  MODEL_URL: "/models/yolov8n.onnx", // ml/export_onnx.py 산출물(web/public/models)
  // onnxruntime-web wasm은 번들 대신 CDN에서(설치 버전과 일치)
  WASM_PATH: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/",
  INPUT_SIZE: 640, // images: [1,3,640,640]
  PERSON_CLASS: 0, // COCO class 0 = person
  CONF_THRESHOLD: 0.5,
  IOU_THRESHOLD: 0.45,
  // 사람 박스는 천천히 움직임 → 검출 빈도를 낮춰 메인스레드 블로킹 최소화
  DETECT_INTERVAL_MS: 800,
  // WebGPU(폰·PC GPU) 우선, 미지원 시 WASM 폴백 → 모바일 최적화
  EXECUTION_PROVIDERS: ["webgpu", "wasm"] as const,
} as const;
