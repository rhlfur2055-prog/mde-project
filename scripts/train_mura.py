"""train_mura.py — MURA 근골격 X-ray DenseNet 파인튜닝 (정상/비정상 이진분류). D7 준비.

데이터 경로만 꽂으면 도는 골격. 실제 MURA 다운로드·풀스케일 학습은 사람이 아침에 한다.
가중치 없이(weights=None) 시작하는 골격이며, 실학습 시 --pretrained 로 ImageNet 초기화 권장.

실행:
    python -m scripts.train_mura --data <MURA폴더> --epochs 3 --out data/mura_model.pt
    # 스모크(더미): python -m scripts.train_mura --data <dummy> --steps 2

streamlit import 금지. core.mura_dataset 재사용.
"""
from __future__ import annotations

import argparse
import os

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import models, transforms as T

from core.mura_dataset import MuraDataset

NUM_CLASSES = 2  # 0=정상, 1=비정상


def build_model(arch: str = "densenet169", pretrained: bool = False) -> nn.Module:
    """DenseNet 백본 + 2-class 분류 헤드 (MURA 이진분류)."""
    weights = "IMAGENET1K_V1" if pretrained else None
    factory = getattr(models, arch)
    model = factory(weights=weights)
    model.classifier = nn.Linear(model.classifier.in_features, NUM_CLASSES)
    return model


def build_transform() -> T.Compose:
    # 실학습 시 ImageNet 정규화·증강 추가 권장. 골격은 Resize+ToTensor만.
    return T.Compose([T.Resize((224, 224)), T.ToTensor()])


def train(data_dir: str, epochs: int = 3, steps: int | None = None, batch: int = 8,
          lr: float = 1e-4, arch: str = "densenet169", pretrained: bool = False,
          out: str = "data/mura_model.pt", device: str = "cpu") -> dict:
    ds = MuraDataset(data_dir, transform=build_transform())
    if len(ds) == 0:
        raise SystemExit(f"데이터 없음: {data_dir} 에 이미지가 없습니다.")
    dl = DataLoader(ds, batch_size=batch, shuffle=True)
    model = build_model(arch, pretrained).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    crit = nn.CrossEntropyLoss()

    model.train()
    done = 0
    for ep in range(epochs):
        for x, y in dl:
            x = x.to(device)
            y = torch.as_tensor(y).to(device)
            opt.zero_grad()
            loss = crit(model(x), y)
            loss.backward()
            opt.step()
            done += 1
            print(f"epoch {ep + 1} step {done} loss {loss.item():.4f}", flush=True)
            if steps and done >= steps:
                break
        if steps and done >= steps:
            break

    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    torch.save(model.state_dict(), out)
    print(f"saved {out} (samples={len(ds)}, steps={done}, arch={arch})", flush=True)
    return {"out": out, "samples": len(ds), "steps": done, "arch": arch}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.environ.get("MURA_DIR", ""))
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--steps", type=int, default=None, help="스모크용 — 최대 step 수")
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--arch", default="densenet169")
    ap.add_argument("--pretrained", action="store_true", help="ImageNet 초기화(다운로드)")
    ap.add_argument("--out", default="data/mura_model.pt")
    ap.add_argument("--device", default="cpu")
    a = ap.parse_args()
    if not a.data:
        raise SystemExit("--data <MURA폴더> 또는 MURA_DIR 환경변수 필요")
    train(a.data, a.epochs, a.steps, a.batch, a.lr,
          a.arch, a.pretrained, a.out, a.device)


if __name__ == "__main__":
    main()
