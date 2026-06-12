"""evolve_models 스모크 — 더미 데이터로 진화 1→2세대가 에러 없이 도는지 (실 MURA·GPU 없이)."""
from pathlib import Path

import cv2
import numpy as np

from scripts import evolve_models


def _mkimg(p):
    p.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(p), (np.random.default_rng(3).random((40, 40)) * 255).astype("uint8"))


def test_evolve_smoke_two_generations(tmp_path):
    for split in ["train", "valid"]:
        for cls in ["normal", "abnormal"]:
            for i in range(3):
                _mkimg(tmp_path / split / cls / f"{i}.png")

    out = str(tmp_path / "evo")
    summary = evolve_models.evolve(
        train_dir=str(tmp_path / "train"), valid_dir=str(tmp_path / "valid"),
        models_dir=str(tmp_path / "models"), out_prefix=out,
        max_generations=2, candidates_per_gen=2, epochs=1, device="cpu",
        batch=2, pretrained=False, scope_fn=lambda g: None,
        eval_max_per_class=4, train_max_per_class=4, seed=7)

    assert summary["generations"] >= 1
    assert Path(out + "_gen1.json").exists()
    assert Path(out + "_summary.json").exists()
    w = summary["winner"]
    assert 0.0 <= w["accuracy"] <= 1.0
    assert "arch" in w and "lr" in w
    # 세대별 최고 정확도 기록 존재
    assert len(summary["best_accuracy_by_gen"]) >= 1


def test_evolve_cache_reuse(tmp_path):
    """같은 시그니처 모델이 이미 있으면 재학습하지 않고 재사용(중복 방지)."""
    cand = {"arch": "densenet121", "lr": 1e-4, "augment": False}
    mdir = tmp_path / "models"
    mdir.mkdir()
    # 미리 .pt 배치(시그니처 일치)
    import torch
    from scripts.train_mura import build_model
    sigp = mdir / (evolve_models.sig(cand, None) + ".pt")
    torch.save(build_model("densenet121").state_dict(), str(sigp))

    _mkimg(tmp_path / "train" / "normal" / "a.png")
    path, cached = evolve_models.train_candidate(
        cand, None, str(mdir), str(tmp_path / "train"), "cpu",
        epochs=1, batch=2, pretrained=False, train_max_per_class=2)
    assert cached is True          # 재사용됨(학습 생략)
    assert path == str(sigp)
