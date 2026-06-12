"""evolve_models.py — 진화 영상 아레나: X-ray 판단 모델 후보를 세대 진화로 선발.

경쟁 단위 = **모델 후보 설정 {arch, lr, augment}** (페르소나/RAG/temperature 아님).
한 세대:
  각 후보를 GPU로 train_mura 학습(epoch 고정) → valid 정답으로 정확도 채점
  → 상위 절반 생존, 하위 탈락 → 생존자 설정 변형(lr·augment)으로 다음 세대 채움.
조기중단: 최고 정확도 개선 <+early_stop(기본 1%p)가 patience(2)세대 연속이면 종료.
모델 캐시(시그니처별 .pt 재사용) → 생존자·기존 산출 중복 학습 금지(흡수).
GPU 필수(cuda). OOM 시 train_with_oom_retry가 batch 절반 재시도.

실행: python -m scripts.evolve_models --max-generations 6 --candidates-per-gen 4
streamlit import 금지. train_mura/evaluate_mura/mura_dataset 재사용.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import random

import torch
from torch.utils.data import DataLoader

from core.mura_dataset import MuraDataset
from scripts.evaluate_mura import evaluate_model, load_model
from scripts.train_mura import build_transform, train_with_oom_retry

ARCHS = ["densenet121", "densenet169", "resnet50"]
LRS = [1e-4, 3e-4, 1e-3]


def scope_for_gen(gen: int) -> "list[str] | None":
    """gen 1~3: 2부위(XR_WRIST·XR_HAND) 빠르게 / gen 4~: 7부위 전체(None)."""
    return ["XR_WRIST", "XR_HAND"] if gen < 4 else None


def _scope_tag(scope) -> str:
    return "-".join(scope) if scope else "all7"


def sig(cand: dict, scope) -> str:
    return f"{cand['arch']}_lr{cand['lr']:.0e}_aug{int(cand['augment'])}_{_scope_tag(scope)}"


def seed_candidates(n: int) -> list[dict]:
    """1세대 시드 — 정확도 우선: densenet169 사전학습 + lr 1e-4~3e-4 + 강증강 중심."""
    base = [
        {"arch": "densenet169", "lr": 1e-4, "augment": True},
        {"arch": "densenet169", "lr": 3e-4, "augment": True},
        {"arch": "densenet121", "lr": 1e-4, "augment": True},
        {"arch": "resnet50", "lr": 1e-4, "augment": True},
        {"arch": "densenet169", "lr": 2e-4, "augment": False},
        {"arch": "densenet121", "lr": 3e-4, "augment": True},
    ]
    return base[:n]


def mutate(cand: dict, rng: random.Random) -> dict:
    """생존자 설정 변형 — lr ×{0.3,3}, augment flip, 가끔 arch 교체."""
    c = copy.deepcopy(cand)
    knob = rng.choice(["lr", "lr", "augment", "arch"])
    if knob == "lr":
        c["lr"] = max(1e-5, min(3e-3, c["lr"] * rng.choice([0.3, 3.0])))
    elif knob == "augment":
        c["augment"] = not c["augment"]
    else:
        c["arch"] = rng.choice([a for a in ARCHS if a != c["arch"]])
    return c


def evaluate_accuracy(model_path: str, arch: str, scope, valid_dir: str,
                      device: str, batch: int, eval_max_per_class) -> dict:
    ds = MuraDataset(valid_dir, transform=build_transform(), parts=scope,
                     max_per_class=eval_max_per_class)
    dl = DataLoader(ds, batch_size=batch)
    model = load_model(model_path, arch).to(device)
    met = evaluate_model(model, dl, device)
    met["n"] = len(ds)
    return met


def train_candidate(cand: dict, scope, models_dir: str, train_dir: str, device: str,
                    epochs: int, batch: int, pretrained: bool,
                    train_max_per_class) -> tuple[str, bool]:
    path = os.path.join(models_dir, sig(cand, scope) + ".pt")
    if os.path.exists(path):
        print(f"[cache] {sig(cand, scope)} 재사용 — 학습 생략(중복 방지)", flush=True)
        return path, True
    print(f"[train] {sig(cand, scope)} 학습 시작", flush=True)
    train_with_oom_retry(
        min_batch=2, batch=batch, data_dir=train_dir, epochs=epochs, steps=None,
        lr=cand["lr"], arch=cand["arch"], pretrained=pretrained, out=path,
        device=device, augment=cand["augment"], parts=scope,
        max_per_class=train_max_per_class, log_every=200)
    return path, False


def evolve(train_dir: str, valid_dir: str, models_dir: str, out_prefix: str,
           max_generations: int = 6, candidates_per_gen: int = 4, epochs: int = 6,
           device: str = "cuda", batch: int = 16, pretrained: bool = True,
           scope_fn=scope_for_gen, eval_max_per_class=None, train_max_per_class=None,
           early_stop: float = 0.005, patience: int = 2, seed: int = 7,
           target_accuracy: float = 0.86) -> dict:
    os.makedirs(models_dir, exist_ok=True)
    rng = random.Random(seed)
    population = seed_candidates(candidates_per_gen)
    history = []
    best_so_far = -1.0
    stall = 0

    for gen in range(1, max_generations + 1):
        scope = scope_fn(gen)
        print(f"\n===== GEN {gen} (부위={_scope_tag(scope)}, 후보 {len(population)}개) =====", flush=True)
        scored = []
        for cand in population:
            path, cached = train_candidate(cand, scope, models_dir, train_dir, device,
                                           epochs, batch, pretrained, train_max_per_class)
            met = evaluate_accuracy(path, cand["arch"], scope, valid_dir, device,
                                    batch, eval_max_per_class)
            row = {**cand, "sig": sig(cand, scope), "cached": cached,
                   "accuracy": met["accuracy"], "sensitivity": met["sensitivity"],
                   "specificity": met["specificity"], "n": met["n"]}
            scored.append(row)
            print(f"  [{sig(cand, scope)}] acc={met['accuracy']} sens={met['sensitivity']} "
                  f"spec={met['specificity']} n={met['n']}", flush=True)

        scored.sort(key=lambda r: r["accuracy"], reverse=True)
        n_survive = max(1, candidates_per_gen // 2)
        survivors = scored[:n_survive]
        gen_best = survivors[0]["accuracy"]

        gen_rec = {"generation": gen, "scope": _scope_tag(scope), "best_accuracy": gen_best,
                   "leaderboard": scored,
                   "survivors": [s["sig"] for s in survivors],
                   "eliminated": [s["sig"] for s in scored[n_survive:]]}
        history.append(gen_rec)
        with open(f"{out_prefix}_gen{gen}.json", "w", encoding="utf-8") as f:
            json.dump(gen_rec, f, ensure_ascii=False, indent=2)
        print(f"  → 세대 {gen} 최고 정확도 {gen_best:.4f} | 생존 {survivors[0]['sig']} | "
              f"개선 {gen_best - best_so_far:+.4f}", flush=True)

        # 목표 정확도 도달 시 즉시 종료
        if gen_best >= target_accuracy:
            print(f"  ✅ 목표 정확도 {target_accuracy} 도달 (gen {gen}, acc={gen_best:.4f}) — 종료", flush=True)
            best_so_far = max(best_so_far, gen_best)
            break

        # 조기중단 판정 (개선 < early_stop 가 patience 세대 연속)
        if gen_best - best_so_far < early_stop:
            stall += 1
        else:
            stall = 0
        best_so_far = max(best_so_far, gen_best)
        if stall >= patience and gen < max_generations:
            print(f"  ⏹ 조기중단: 개선 <{early_stop} 가 {patience}세대 연속 (gen {gen})", flush=True)
            break

        # 다음 세대 = 생존자 + 변형
        next_pop = [dict(arch=s["arch"], lr=s["lr"], augment=s["augment"]) for s in survivors]
        while len(next_pop) < candidates_per_gen:
            parent = rng.choice(survivors)
            next_pop.append(mutate(dict(arch=parent["arch"], lr=parent["lr"],
                                        augment=parent["augment"]), rng))
        population = next_pop

    winner = max((r for g in history for r in g["leaderboard"]), key=lambda r: r["accuracy"])
    summary = {"generations": len(history), "winner": winner,
               "best_accuracy_by_gen": [g["best_accuracy"] for g in history],
               "history": history}
    with open(f"{out_prefix}_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    print(f"\n=== 진화 종료: {len(history)}세대, 최종 1등 {winner['sig']} "
          f"acc={winner['accuracy']} ===", flush=True)
    return summary


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--train", default="MURA-v1.1_files/train")
    ap.add_argument("--valid", default="MURA-v1.1_files/valid")
    ap.add_argument("--models-dir", default="data/evolve_models", dest="models_dir")
    ap.add_argument("--out-prefix", default="data/evolve", dest="out_prefix")
    ap.add_argument("--max-generations", type=int, default=6, dest="max_generations")
    ap.add_argument("--candidates-per-gen", type=int, default=4, dest="candidates_per_gen")
    ap.add_argument("--epochs", type=int, default=6)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--scope", choices=["all7", "schedule"], default="all7",
                    help="all7=항상 7부위(정확도 우선) / schedule=초기 2부위")
    ap.add_argument("--target-accuracy", type=float, default=0.86, dest="target_accuracy")
    ap.add_argument("--early-stop", type=float, default=0.005, dest="early_stop")
    ap.add_argument("--eval-max-per-class", type=int, default=None, dest="eval_max_per_class",
                    help="None=valid 전체 채점(진짜 일반화 정확도)")
    a = ap.parse_args()
    if a.device.startswith("cuda") and not torch.cuda.is_available():
        raise SystemExit("GPU 필수: torch.cuda.is_available()=False — 중단")
    scope_fn = (lambda g: None) if a.scope == "all7" else scope_for_gen
    evolve(a.train, a.valid, a.models_dir, a.out_prefix, a.max_generations,
           a.candidates_per_gen, a.epochs, a.device, a.batch,
           scope_fn=scope_fn, eval_max_per_class=a.eval_max_per_class,
           early_stop=a.early_stop, target_accuracy=a.target_accuracy)


if __name__ == "__main__":
    main()
