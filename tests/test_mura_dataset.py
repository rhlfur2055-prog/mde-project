"""mura_dataset 단위 테스트 — 더미 이미지로 라벨링 검증 (실 MURA 없이)."""
import cv2
import numpy as np

from core.mura_dataset import MuraDataset, label_from_path


def _mkimg(p):
    p.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(p), (np.random.default_rng(0).random((32, 32)) * 255).astype("uint8"))


def test_label_from_path():
    assert label_from_path("MURA/XR_WRIST/p1/study1_positive/img.png") == 1
    assert label_from_path("x/study1_negative/img.png") == 0
    assert label_from_path("foo/bar.png") is None


def test_imagefolder_fallback(tmp_path):
    _mkimg(tmp_path / "normal" / "a.png")
    _mkimg(tmp_path / "abnormal" / "b.png")
    ds = MuraDataset(str(tmp_path))
    assert len(ds) == 2
    assert sorted(lbl for _, lbl in ds.samples) == [0, 1]
    img, label = ds[0]
    assert label in (0, 1)
    assert img.size == (32, 32)  # PIL 이미지


def test_mura_marker_structure(tmp_path):
    _mkimg(tmp_path / "XR_WRIST" / "patient1" / "study1_positive" / "i.png")
    _mkimg(tmp_path / "XR_WRIST" / "patient2" / "study1_negative" / "i.png")
    ds = MuraDataset(str(tmp_path))
    assert sorted(lbl for _, lbl in ds.samples) == [0, 1]
    assert ds.class_to_idx == {"negative": 0, "positive": 1}
