"""train_mura 스모크 — 더미 이미지로 1~2 step이 에러 없이 도는지 (실 MURA·실학습 아님)."""
import cv2
import numpy as np

from scripts import train_mura


def _mkimg(p):
    p.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(p), (np.random.default_rng(1).random((40, 40)) * 255).astype("uint8"))


def test_train_smoke_runs_and_saves(tmp_path):
    d = tmp_path / "dummy"
    for i in range(2):
        _mkimg(d / "normal" / f"n{i}.png")
        _mkimg(d / "abnormal" / f"a{i}.png")
    out = tmp_path / "mura_model.pt"
    # densenet121로 빠르게 스모크 (기본은 densenet169 — 실학습용)
    res = train_mura.train(str(d), epochs=1, steps=2, batch=2,
                           arch="densenet121", out=str(out), device="cpu")
    assert out.exists()
    assert res["samples"] == 4
    assert res["steps"] >= 1
