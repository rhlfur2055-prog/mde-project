"""preprocess 단위 테스트 — 정규화·CLAHE·감마 (yolo11 이식분).

실데이터는 pydicom 내장 샘플만 사용 (spec §2.5).
"""
import numpy as np
from pydicom.data import get_testdata_file

from core import dicom_io, preprocess


def test_normalize_int16_to_full_uint8_range():
    arr = np.array([[100, 600], [1200, 2000]], dtype=np.int16)
    out = preprocess.normalize(arr)
    assert out.dtype == np.uint8
    assert out.min() == 0 and out.max() == 255


def test_normalize_flat_image_safe():
    flat = np.full((8, 8), 42, dtype=np.int16)
    out = preprocess.normalize(flat)
    assert out.dtype == np.uint8 and out.max() == 0


def test_gamma_brightens_and_darkens():
    mid = np.full((16, 16), 100, dtype=np.uint8)
    brighter = preprocess.gamma(mid, 0.5)   # g<1 → 밝게
    darker = preprocess.gamma(mid, 2.0)     # g>1 → 어둡게
    assert brighter.mean() > 100
    assert darker.mean() < 100
    assert brighter.dtype == np.uint8 and darker.dtype == np.uint8


def test_clahe_changes_contrast_and_keeps_shape():
    # 저대비 그라디언트 — CLAHE가 국소 대비를 바꿔야 함
    grad = np.tile(np.linspace(80, 160, 64).astype(np.uint8), (64, 1))
    out = preprocess.clahe(grad)
    assert out.dtype == np.uint8
    assert out.shape == grad.shape
    assert not np.array_equal(out, grad)        # 실제로 변형됨
    assert out.std() >= grad.std()              # 대비 확대


def test_preprocess_pipeline_on_ct_sample():
    loaded = dicom_io.load(get_testdata_file("CT_small.dcm"))
    out = preprocess.preprocess(loaded["pixels"])  # int16 입력
    assert out.dtype == np.uint8
    assert out.shape == loaded["pixels"].shape
    assert out.min() >= 0 and out.max() <= 255
