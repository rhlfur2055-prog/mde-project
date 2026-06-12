// YOLOv8n 사람검출 — 우리가 export한 ONNX(web/public/models/yolov8n.onnx)를
// onnxruntime-web로 브라우저 안에서 실행(온디바이스). 입력 images[1,3,640,640],
// 출력 output0[1,84,8400](채널-우선: 4 bbox + 80 class). class 0=person만 사용.
// 전처리: letterbox 640, RGB, /255, NCHW. 후처리: 디코드→임계값→NMS→원본좌표 환산.
// 2단계 검출(전체→ROI) 흐름은 yolo11 plate_engine 패턴 이식.
import { YOLO_CONFIG } from "./config";

export type PersonBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
};

export type PersonDetector = {
  detect: (
    src: CanvasImageSource,
    srcW: number,
    srcH: number,
  ) => Promise<PersonBox | null>;
  close: () => void;
};

function iou(a: PersonBox, b: PersonBox): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter + 1e-6);
}

function nms(boxes: PersonBox[], iouThr: number): PersonBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep: PersonBox[] = [];
  for (const box of sorted) {
    if (keep.every((k) => iou(k, box) < iouThr)) keep.push(box);
  }
  return keep;
}

export async function createPersonDetector(): Promise<PersonDetector> {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = YOLO_CONFIG.WASM_PATH;

  // WebGPU 우선(미지원 시 WASM 폴백) — 모바일/PC GPU 가속
  let session: import("onnxruntime-web").InferenceSession;
  try {
    session = await ort.InferenceSession.create(YOLO_CONFIG.MODEL_URL, {
      executionProviders: [...YOLO_CONFIG.EXECUTION_PROVIDERS],
      graphOptimizationLevel: "all",
    });
  } catch {
    // WebGPU 초기화 실패 시 WASM 단독 재시도
    session = await ort.InferenceSession.create(YOLO_CONFIG.MODEL_URL, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  }

  const S = YOLO_CONFIG.INPUT_SIZE;
  // 전처리용 오프스크린 캔버스(재사용)
  const off = document.createElement("canvas");
  off.width = S;
  off.height = S;
  const offCtx = off.getContext("2d", { willReadFrequently: true })!;
  const input = new Float32Array(3 * S * S);

  async function detect(
    src: CanvasImageSource,
    srcW: number,
    srcH: number,
  ): Promise<PersonBox | null> {
    if (srcW === 0 || srcH === 0) return null;
    // letterbox: 비율 유지 + 회색(114) 패딩
    const scale = Math.min(S / srcW, S / srcH);
    const newW = Math.round(srcW * scale);
    const newH = Math.round(srcH * scale);
    const padX = (S - newW) / 2;
    const padY = (S - newH) / 2;
    offCtx.fillStyle = "rgb(114,114,114)";
    offCtx.fillRect(0, 0, S, S);
    offCtx.drawImage(src, padX, padY, newW, newH);

    const { data } = offCtx.getImageData(0, 0, S, S);
    const plane = S * S;
    for (let i = 0; i < plane; i++) {
      const j = i * 4;
      input[i] = data[j] / 255; // R
      input[plane + i] = data[j + 1] / 255; // G
      input[2 * plane + i] = data[j + 2] / 255; // B
    }

    const tensor = new ort.Tensor("float32", input, [1, 3, S, S]);
    const out = await session.run({ images: tensor });
    const o = out.output0;
    const d = o.data as Float32Array;
    const n = o.dims[2]; // 8400 앵커
    const cls = YOLO_CONFIG.PERSON_CLASS;
    const scoreRow = 4 + cls; // 0~3 bbox, 4~ class

    const candidates: PersonBox[] = [];
    for (let i = 0; i < n; i++) {
      const score = d[scoreRow * n + i];
      if (score < YOLO_CONFIG.CONF_THRESHOLD) continue;
      const cx = d[i];
      const cy = d[n + i];
      const w = d[2 * n + i];
      const h = d[3 * n + i];
      // 640 letterbox 공간 → 원본 좌표 환산
      const x1 = (cx - w / 2 - padX) / scale;
      const y1 = (cy - h / 2 - padY) / scale;
      const x2 = (cx + w / 2 - padX) / scale;
      const y2 = (cy + h / 2 - padY) / scale;
      candidates.push({
        x1: Math.max(0, x1),
        y1: Math.max(0, y1),
        x2: Math.min(srcW, x2),
        y2: Math.min(srcH, y2),
        score,
      });
    }
    if (candidates.length === 0) return null;
    const kept = nms(candidates, YOLO_CONFIG.IOU_THRESHOLD);
    // 가장 확신도 높은 사람 1명
    return kept.reduce((a, b) => (b.score > a.score ? b : a));
  }

  return { detect, close: () => session.release() };
}
