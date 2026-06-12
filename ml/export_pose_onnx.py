"""export_pose_onnx.py — 학습된 자세품질 MLP 를 브라우저(onnxruntime-web)용 ONNX 로 export (P6).

입력 텐서  : "landmarks"  shape [1, 20] float32
  = score.ts 가 쓰는 8 랜드마크(ear/shoulder/hip/ankle 쌍)의 bbox 정규화 (x,y) 16개
    + 가시쌍 플래그 4개. (레이아웃은 ml/pose_dataset.py FEATURE_LANDMARKS 와 동일.)
출력 텐서  : "scores"     shape [1, 3] float32  = [symmetry, golden, overall] (0~1; ×100 = 점수)

브라우저 통합 메모(이 스크립트 범위 밖):
  - MediaPipe 33 랜드마크에서 LEFT_EAR(7)/RIGHT_EAR(8)/LEFT_SHOULDER(11)/RIGHT_SHOULDER(12)/
    LEFT_HIP(23)/RIGHT_HIP(24)/LEFT_ANKLE(27)/RIGHT_ANKLE(28) 만 골라
  - 인스턴스 bbox(키포인트 외접 박스)로 [0,1] 정규화 후 위 레이아웃으로 펼침.
  - 누락 랜드마크는 좌표 0, 가시플래그 0.

실행:
    python -m ml.export_pose_onnx --ckpt data/pose_model.pt
결과:
    web/public/models/posture.onnx  (gitignore — yolov8n.onnx 와 동일 정책)
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch

from ml.pose_dataset import FEATURE_DIM
from ml.train_pose import N_TARGETS, PostureMLP

ROOT = Path(__file__).resolve().parent.parent
DEST_DIR = ROOT / "web" / "public" / "models"
DEST = DEST_DIR / "posture.onnx"
OPSET = 12


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", default="data/pose_model.pt")
    ap.add_argument("--out", default=str(DEST))
    a = ap.parse_args()

    ckpt = torch.load(a.ckpt, map_location="cpu")
    hidden = ckpt.get("hidden", 64)
    model = PostureMLP(in_dim=ckpt.get("in_dim", FEATURE_DIM), hidden=hidden,
                       out_dim=ckpt.get("out_dim", N_TARGETS))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    DEST_DIR.mkdir(parents=True, exist_ok=True)
    out_path = Path(a.out)
    dummy = torch.zeros(1, FEATURE_DIM, dtype=torch.float32)

    torch.onnx.export(
        model, dummy, str(out_path),
        input_names=["landmarks"], output_names=["scores"],
        opset_version=OPSET,
        dynamic_axes={"landmarks": {0: "batch"}, "scores": {0: "batch"}},
    )
    print(f"[export] -> {out_path}")

    onnx_model = onnx.load(str(out_path))
    onnx.checker.check_model(onnx_model)
    graph = onnx_model.graph

    def tinfo(t) -> str:
        dims = [d.dim_value if d.dim_value > 0 else (d.dim_param or "?")
                for d in t.type.tensor_type.shape.dim]
        return f"{t.name}  shape={dims}"

    print("\n=== ONNX I/O ===")
    for inp in graph.input:
        print(f"  input : {tinfo(inp)}")
    for out in graph.output:
        print(f"  output: {tinfo(out)}")

    # 런타임 검증: PyTorch vs ONNXRuntime 출력 일치 확인
    sess = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(0)
    x = rng.random((1, FEATURE_DIM), dtype=np.float32)
    ort_out = sess.run(["scores"], {"landmarks": x})[0]
    with torch.no_grad():
        pt_out = model(torch.from_numpy(x)).numpy()
    max_diff = float(np.abs(ort_out - pt_out).max())
    print(f"\n[verify] PyTorch vs ONNXRuntime max|diff| = {max_diff:.2e}")
    print(f"[verify] 샘플 출력 scores(0~1) = {ort_out.ravel().round(4).tolist()} "
          f"(×100 = symmetry/golden/overall 점수)")
    if max_diff > 1e-4:
        raise SystemExit(f"[verify] 출력 불일치 {max_diff} — export 실패")

    size_kb = out_path.stat().st_size / 1024
    print(f"\n[size]  {out_path.name} = {size_kb:.1f} KB")
    print("[done]  브라우저는 /models/posture.onnx 에서 fetch 한다.")


if __name__ == "__main__":
    main()
