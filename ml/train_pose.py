"""train_pose.py — 자세품질 MLP 학습 (P6). 랜드마크 특징 → 자세 점수 회귀.

규칙 증류: COCO 실 키포인트를 golden_rules(=score.ts 이식)로 자동라벨한 데이터로
작은 MLP 가 symmetry/golden/overall 점수를 예측하도록 학습한다. 이후 Supabase 로 모은
실사용자 데이터로 파인튜닝하고 ONNX 로 내보내 브라우저(onnxruntime-web) 추론에 쓴다.

CPU 친화(작은 망), train_mura.py 의 로깅·OOM 재시도 패턴 미러.

실행:
    python -m ml.train_pose --ann data/pose/annotations/person_keypoints_val2017.json --epochs 8
    # 스모크: python -m ml.train_pose --ann <...> --steps 5

streamlit import 금지. ml.pose_dataset / ml.golden_rules 재사용.
"""
from __future__ import annotations

import argparse
import os
import time

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, random_split

from ml.pose_dataset import FEATURE_DIM, PoseKeypointDataset

N_TARGETS = 3  # symmetry, golden, overall


class PostureMLP(nn.Module):
    """작은 MLP: 20-D 랜드마크 특징 → 3 점수(0~1). CPU 친화 (~수천 파라미터)."""

    def __init__(self, in_dim: int = FEATURE_DIM, hidden: int = 64,
                 out_dim: int = N_TARGETS) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(in_dim, hidden), nn.ReLU(),
            nn.Linear(hidden, hidden), nn.ReLU(),
            nn.Linear(hidden, out_dim), nn.Sigmoid(),  # 점수는 0~1
        )

    def forward(self, x):
        return self.net(x)


def _collate(batch):
    feats = torch.from_numpy(np.stack([b[0] for b in batch]))
    targs = torch.from_numpy(np.stack([b[1] for b in batch]))
    masks = torch.from_numpy(np.stack([b[2] for b in batch]))
    return feats, targs, masks


def _masked_mae(pred, targ, mask):
    """마스크된 MAE — golden 미가용(mask=0) 타깃은 제외."""
    err = (pred - targ).abs() * mask
    denom = mask.sum().clamp(min=1.0)
    return err.sum() / denom


def train(ann_path: str, epochs: int = 8, steps: "int | None" = None, batch: int = 64,
          lr: float = 1e-3, hidden: int = 64, out: str = "data/pose_model.pt",
          device: str = "cpu", val_frac: float = 0.2, max_samples: "int | None" = None,
          require_symmetry: bool = True, golden_only: bool = False,
          log_every: int = 10, seed: int = 0) -> dict:
    torch.manual_seed(seed)
    ds = PoseKeypointDataset(ann_path, require_symmetry=require_symmetry,
                             golden_only=golden_only, max_samples=max_samples)
    if len(ds) < 10:
        raise SystemExit(f"데이터 부족: {ann_path} 에서 {len(ds)} 표본 — 어노테이션 경로 확인.")

    n_val = max(1, int(len(ds) * val_frac))
    n_tr = len(ds) - n_val
    g = torch.Generator().manual_seed(seed)
    tr_ds, va_ds = random_split(ds, [n_tr, n_val], generator=g)
    pin = device.startswith("cuda")
    tr = DataLoader(tr_ds, batch_size=batch, shuffle=True, collate_fn=_collate, pin_memory=pin)
    va = DataLoader(va_ds, batch_size=batch, shuffle=False, collate_fn=_collate, pin_memory=pin)

    model = PostureMLP(hidden=hidden).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    nparams = sum(p.numel() for p in model.parameters())
    nbatches = (n_tr + batch - 1) // batch
    print(f"[train] device={device} batch={batch} feature_dim={FEATURE_DIM} "
          f"params={nparams} train={n_tr} val={n_val} batches/epoch={nbatches} "
          f"epochs={epochs}", flush=True)
    print(f"[label] {ds.label_stats()}", flush=True)

    done = 0
    t0 = time.perf_counter()
    for ep in range(epochs):
        model.train()
        ep_loss, ep_n = 0.0, 0
        for x, y, msk in tr:
            x, y, msk = x.to(device), y.to(device), msk.to(device)
            opt.zero_grad()
            pred = model(x)
            # 마스크 가중 MSE — golden 미가용 타깃은 손실 제외.
            loss = (((pred - y) ** 2) * msk).sum() / msk.sum().clamp(min=1.0)
            loss.backward()
            opt.step()
            done += 1
            ep_n += 1
            ep_loss += loss.item()
            if done % log_every == 0:
                print(f"  epoch {ep + 1} step {done} loss {loss.item():.4f} "
                      f"[{time.perf_counter() - t0:.0f}s]", flush=True)
            if steps and done >= steps:
                break
        # ── val MAE (점수 단위 0~100 으로 환산해 직관적으로) ──
        model.eval()
        mae_sum = np.zeros(N_TARGETS)
        mae_cnt = np.zeros(N_TARGETS)
        with torch.no_grad():
            for x, y, msk in va:
                x, y, msk = x.to(device), y.to(device), msk.to(device)
                pred = model(x)
                err = ((pred - y).abs() * msk).sum(dim=0).cpu().numpy()
                cnt = msk.sum(dim=0).cpu().numpy()
                mae_sum += err
                mae_cnt += cnt
        mae = (mae_sum / np.maximum(mae_cnt, 1.0)) * 100.0  # 0~100 점수 단위
        print(f"[epoch {ep + 1}] train_mse {ep_loss / max(1, ep_n):.4f} | "
              f"val MAE(pts) sym={mae[0]:.2f} golden={mae[1]:.2f} overall={mae[2]:.2f} "
              f"(누적 {time.perf_counter() - t0:.0f}s)", flush=True)
        if steps and done >= steps:
            break

    elapsed = time.perf_counter() - t0
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    torch.save({"state_dict": model.state_dict(), "hidden": hidden,
                "in_dim": FEATURE_DIM, "out_dim": N_TARGETS}, out)
    peak = (torch.cuda.max_memory_allocated() / 1e6) if device.startswith("cuda") else 0
    print(f"saved {out} (train={n_tr}, val={n_val}, steps={done}, "
          f"elapsed={elapsed:.0f}s, gpu_peak={peak:.0f}MB)", flush=True)
    return {"out": out, "train": n_tr, "val": n_val, "steps": done,
            "val_mae_pts": [round(float(v), 3) for v in mae],
            "elapsed_s": round(elapsed, 1)}


def train_with_oom_retry(min_batch: int = 8, batch: int = 64, **kw) -> dict:
    """CUDA OOM 시 batch 절반 감축 재시도 (train_mura 패턴 미러)."""
    while True:
        try:
            return train(batch=batch, **kw)
        except RuntimeError as exc:
            if "out of memory" not in str(exc).lower():
                raise
            try:
                import gc
                gc.collect()
                torch.cuda.empty_cache()
                torch.cuda.synchronize()
            except Exception:
                pass
            new = batch // 2
            print(f"[OOM] batch {batch} → {new} 로 감축 후 재시도", flush=True)
            if new < min_batch:
                raise SystemExit(f"[OOM] batch {min_batch} 미만으로도 실패 — 중단")
            batch = new


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ann", default=os.environ.get(
        "POSE_ANN", "data/pose/annotations/person_keypoints_val2017.json"))
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--steps", type=int, default=None, help="스모크용 최대 step 수")
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--hidden", type=int, default=64)
    ap.add_argument("--out", default="data/pose_model.pt")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--val-frac", type=float, default=0.2, dest="val_frac")
    ap.add_argument("--max-samples", type=int, default=None, dest="max_samples")
    ap.add_argument("--golden-only", action="store_true", dest="golden_only",
                    help="전신(황금비 산출 가능) 인스턴스만 학습")
    ap.add_argument("--log-every", type=int, default=10, dest="log_every")
    a = ap.parse_args()
    if not os.path.exists(a.ann):
        raise SystemExit(
            f"어노테이션 없음: {a.ann}\n"
            "  COCO person keypoints 다운로드:\n"
            "  curl -o data/pose/annotations_trainval2017.zip "
            "http://images.cocodataset.org/annotations/annotations_trainval2017.zip\n"
            "  → person_keypoints_val2017.json 추출")
    train_with_oom_retry(
        min_batch=8, batch=a.batch, ann_path=a.ann, epochs=a.epochs, steps=a.steps,
        lr=a.lr, hidden=a.hidden, out=a.out, device=a.device, val_frac=a.val_frac,
        max_samples=a.max_samples, golden_only=a.golden_only, log_every=a.log_every)


if __name__ == "__main__":
    main()
