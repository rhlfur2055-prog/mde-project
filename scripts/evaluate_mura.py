"""evaluate_mura.py — "영상 아레나": 학습된 MURA 모델들을 실제 정답으로 채점·줄세우기. D7 준비.

여러 .pt 모델을 MURA 테스트셋(의사 정답 라벨)으로 평가해 정확도·민감도·특이도로 리더보드를 만든다.
1등 모델을 infer.py(MURA_MODEL)에 채택한다. 보고서 아레나(④)의 "영상 버전".

실행:
    python -m scripts.evaluate_mura --models <모델폴더> --data <MURA테스트폴더> --arch densenet169
    # 스모크(더미): python -m scripts.evaluate_mura --models <dummy_models> --data <dummy_imgs> --arch densenet121

★ 실제 MURA 데이터 평가·다운로드는 사람이 아침에. 골격은 더미로 파이프라인만 검증.
streamlit import 금지. core.mura_dataset / scripts.train_mura 재사용.
"""
from __future__ import annotations

import argparse
import glob
import os

import torch
from torch.utils.data import DataLoader

from core.mura_dataset import MuraDataset
from scripts.train_mura import build_model, build_transform


def load_model(path: str, arch: str) -> torch.nn.Module:
    m = build_model(arch)
    m.load_state_dict(torch.load(path, map_location="cpu"))
    m.eval()
    return m


def evaluate_model(model: torch.nn.Module, dl: DataLoader, device: str = "cpu") -> dict:
    """이진분류 정확도·민감도(비정상 검출)·특이도(정상 검출) 계산."""
    tp = tn = fp = fn = 0
    with torch.no_grad():
        for x, y in dl:
            pred = model(x.to(device)).argmax(1).cpu().tolist()
            truth = y.tolist() if hasattr(y, "tolist") else list(y)
            for p, t in zip(pred, truth):
                if t == 1 and p == 1:
                    tp += 1
                elif t == 0 and p == 0:
                    tn += 1
                elif t == 0 and p == 1:
                    fp += 1
                elif t == 1 and p == 0:
                    fn += 1
    tot = tp + tn + fp + fn
    return {
        "accuracy": round((tp + tn) / tot, 4) if tot else 0.0,
        "sensitivity": round(tp / (tp + fn), 4) if (tp + fn) else 0.0,
        "specificity": round(tn / (tn + fp), 4) if (tn + fp) else 0.0,
        "n": tot,
    }


def _arch_from_name(path: str, default: str) -> str:
    """파일명 stem(예: densenet121.pt, resnet50__aug.pt)에서 arch 추출."""
    import torchvision.models as m
    stem = os.path.splitext(os.path.basename(path))[0].split("__")[0]
    return stem if hasattr(m, stem) else default


def evaluate(models_dir: str, data_dir: str, arch: str = "densenet169",
             device: str = "cpu", batch: int = 8,
             max_per_class: "int | None" = None,
             out: "str | None" = None, parts: "list[str] | None" = None) -> list[dict]:
    ds = MuraDataset(data_dir, transform=build_transform(),
                     max_per_class=max_per_class, parts=parts)
    if len(ds) == 0:
        raise SystemExit(f"테스트 데이터 없음: {data_dir}")
    dl = DataLoader(ds, batch_size=batch)
    paths = sorted(glob.glob(os.path.join(models_dir, "*.pt")))
    if not paths:
        raise SystemExit(f"모델(.pt) 없음: {models_dir}")

    rows = []
    for p in paths:
        model_arch = _arch_from_name(p, arch)
        met = evaluate_model(load_model(p, model_arch), dl, device)
        met["model"] = os.path.basename(p)
        met["arch"] = model_arch
        rows.append(met)
        print(f"  평가 {met['model']}: acc={met['accuracy']} sens={met['sensitivity']} "
              f"spec={met['specificity']} n={met['n']}", flush=True)

    rows.sort(key=lambda r: r["accuracy"], reverse=True)
    print("=== 영상 아레나 리더보드 (정확도순) ===")
    for i, r in enumerate(rows, 1):
        print(f"  {i}. {r['model']} ({r.get('arch','?')})  acc={r['accuracy']} "
              f"sens={r['sensitivity']} spec={r['specificity']}")
    print(f"채택 후보(1등): {rows[0]['model']} → infer.py MURA_MODEL 로 지정")
    if out:
        import json
        os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"data_dir": data_dir, "max_per_class": max_per_class,
                       "leaderboard": rows, "winner": rows[0]}, f, ensure_ascii=False, indent=2)
        print(f"리더보드 저장: {out}", flush=True)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True, help="평가할 .pt 모델들이 있는 폴더")
    ap.add_argument("--data", required=True, help="MURA 테스트셋(정답 라벨) 폴더")
    ap.add_argument("--arch", default="densenet169", help="파일명에서 못 찾을 때 기본 arch")
    ap.add_argument("--max-per-class", type=int, default=None, dest="max_per_class")
    ap.add_argument("--out", default=None, help="리더보드 JSON 저장 경로")
    ap.add_argument("--device", default="cpu")
    a = ap.parse_args()
    evaluate(a.models, a.data, a.arch, a.device, max_per_class=a.max_per_class, out=a.out)


if __name__ == "__main__":
    main()
