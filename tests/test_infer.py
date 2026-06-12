"""infer 단위/통합 테스트.

- _aggregate: 모델 없이 라벨 매핑 로직 검증 (순수 함수).
- predict 통합: 실제 xrv 모델로 pydicom 샘플 추론 (가중치 로드 불가 시 skip — mock 금지).
"""
import numpy as np
import pytest
from pydicom.data import get_testdata_file

from core import deid, dicom_io, infer, preprocess


@pytest.fixture(autouse=True)
def _disable_mura(monkeypatch):
    """이 모듈은 흉부 베이스라인 경로 검증 — 로컬 data/mura_model.pt가 있어도 MURA 비활성화."""
    monkeypatch.setenv("MURA_MODEL", "data/__none_for_infer_test__.pt")
    infer._mura_attempted = False
    infer._mura_model = None
    yield
    infer._mura_attempted = False
    infer._mura_model = None


def test_aggregate_abnormal_when_high_score():
    res = infer._aggregate({"Pneumonia": 0.9, "Effusion": 0.1, "": 0.99})
    assert res["label"] == infer.LABEL_ABNORMAL
    assert res["top_finding"] == "Pneumonia"   # 빈 라벨('')은 무시
    assert abs(res["confidence"] - 0.9) < 1e-6


def test_aggregate_normal_when_low_score():
    res = infer._aggregate({"Pneumonia": 0.2, "Effusion": 0.1})
    assert res["label"] == infer.LABEL_NORMAL
    assert abs(res["confidence"] - 0.8) < 1e-6  # 1 - 0.2


def test_predict_on_ct_sample_real_model():
    if not infer.is_available():
        pytest.skip(f"xrv 모델 로드 불가(오프라인 등): {infer._load_error}")
    loaded = dicom_io.load(get_testdata_file("CT_small.dcm"))
    img = deid.run(loaded)["pixels"]
    out = infer.predict(preprocess.preprocess(img))
    assert out["label"] in (infer.LABEL_ABNORMAL, infer.LABEL_NORMAL)
    assert 0.0 <= out["confidence"] <= 1.0
    assert isinstance(out["top_finding"], str)
    assert out["model"] == infer.WEIGHTS


def test_predict_accepts_uint8_grayscale():
    if not infer.is_available():
        pytest.skip("xrv 모델 로드 불가")
    img = (np.random.default_rng(0).random((128, 128)) * 255).astype(np.uint8)
    out = infer.predict(img)
    assert out["label"] in (infer.LABEL_ABNORMAL, infer.LABEL_NORMAL)
    assert 0.0 <= out["confidence"] <= 1.0
