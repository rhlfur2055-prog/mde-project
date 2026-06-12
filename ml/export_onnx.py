"""P2 — YOLOv8n 사람검출 모델을 브라우저(onnxruntime-web)용 ONNX로 export.

배경:
  - yolov8n.pt 는 Ultralytics가 자동 다운로드하는 COCO 사전학습 가중치다.
    (plate 전용 가중치가 아니라 범용 COCO 모델 — 사용 허용됨.)
  - COCO 클래스 id 0 = "person". 우리는 사람 박스만 필요하므로
    브라우저 후처리에서 class 0 만 필터링한다.

ONNX 출력 텐서 레이아웃 (YOLOv8 detect head):
  - shape = [1, 84, 8400]
      84 = 4(bbox: cx, cy, w, h) + 80(COCO class scores)
      8400 = 후보 anchor 수 (640 입력 기준 80*80 + 40*40 + 20*20)
  - 채널 우선(transposed) 형태이므로 브라우저 측에서:
      1) [84, 8400] -> [8400, 84] 전치
      2) 각 후보의 class 0(person) score 추출
      3) confidence threshold 필터
      4) NMS(non-max suppression) 로 중복 박스 제거
      5) bbox(cx,cy,w,h)는 640 입력 좌표계 — 원본 프레임으로 역스케일 필요

전처리(브라우저 측, 이 스크립트 범위 밖):
  - 입력 프레임을 640x640 으로 letterbox/resize
  - /255 정규화 (0~1)
  - NCHW 레이아웃 [1, 3, 640, 640], RGB 순서, float32

실행:
  python ml/export_onnx.py
결과:
  web/public/models/yolov8n.onnx  (브라우저가 /models/yolov8n.onnx 로 fetch)
"""

from __future__ import annotations

import shutil
from pathlib import Path

import onnx
from ultralytics import YOLO

# --- 경로 ---------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent          # c:\tool\medgate
DEST_DIR = ROOT / "web" / "public" / "models"
DEST = DEST_DIR / "yolov8n.onnx"
IMGSZ = 640
OPSET = 12


def main() -> None:
    DEST_DIR.mkdir(parents=True, exist_ok=True)

    # 1) COCO 사전학습 yolov8n 로드 (없으면 Ultralytics가 자동 다운로드)
    model = YOLO("yolov8n.pt")

    # 2) ONNX export — 고정 입력 640x640, opset12, 단순화/동적축 비활성
    exported = model.export(
        format="onnx",
        imgsz=IMGSZ,
        opset=OPSET,
        simplify=False,
        dynamic=False,
    )
    exported_path = Path(exported)
    print(f"[export] ultralytics가 생성한 파일: {exported_path}")

    # 3) web/public/models/ 로 이동
    shutil.move(str(exported_path), str(DEST))
    print(f"[move]   -> {DEST}")

    # 4) ONNX 그래프 입출력 텐서 점검
    onnx_model = onnx.load(str(DEST))
    onnx.checker.check_model(onnx_model)
    graph = onnx_model.graph

    def tensor_info(t) -> str:
        dims = []
        for d in t.type.tensor_type.shape.dim:
            dims.append(d.dim_value if d.dim_value > 0 else (d.dim_param or "?"))
        return f"{t.name}  shape={dims}"

    print("\n=== ONNX I/O ===")
    for inp in graph.input:
        print(f"  input : {tensor_info(inp)}")
    for out in graph.output:
        print(f"  output: {tensor_info(out)}")

    size_mb = DEST.stat().st_size / (1024 * 1024)
    print(f"\n[size]  {DEST.name} = {size_mb:.2f} MB")
    print("[done]  브라우저는 /models/yolov8n.onnx 에서 fetch 한다.")


if __name__ == "__main__":
    main()
