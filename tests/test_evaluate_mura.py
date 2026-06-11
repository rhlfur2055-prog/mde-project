"""evaluate_mura 스모크 — 더미 모델·이미지로 영상 아레나 리더보드 파이프라인 검증 (실 MURA 없이)."""
import cv2
import numpy as np
import torch

from scripts import evaluate_mura
from scripts.train_mura import build_model


def _mkimg(p):
    p.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(p), (np.random.default_rng(2).random((40, 40)) * 255).astype("uint8"))


def test_evaluate_smoke_leaderboard(tmp_path):
    data = tmp_path / "testset"
    for i in range(2):
        _mkimg(data / "normal" / f"n{i}.png")
        _mkimg(data / "abnormal" / f"a{i}.png")
    mdir = tmp_path / "models"
    mdir.mkdir()
    for name in ["m1", "m2"]:
        torch.save(build_model("densenet121").state_dict(), str(mdir / f"{name}.pt"))

    rows = evaluate_mura.evaluate(str(mdir), str(data), arch="densenet121")
    assert len(rows) == 2
    for r in rows:
        assert 0.0 <= r["accuracy"] <= 1.0
        assert 0.0 <= r["sensitivity"] <= 1.0
        assert 0.0 <= r["specificity"] <= 1.0
        assert r["n"] == 4
    assert rows[0]["accuracy"] >= rows[-1]["accuracy"]   # 정확도순 정렬
