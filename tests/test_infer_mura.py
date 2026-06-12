"""infer MURA 로더 + 폴백 테스트 — 가중치 없으면 흉부 폴백, 있으면 MURA. predict 인터페이스 불변."""
import numpy as np
import pytest

from core import infer


def _reset_mura():
    infer._mura_attempted = False
    infer._mura_model = None


def test_fallback_to_chest_when_no_mura(monkeypatch):
    _reset_mura()
    monkeypatch.setenv("MURA_MODEL", "data/__no_such_mura__.pt")
    assert infer._get_mura_model() is None        # 가중치 없음 → None
    if not infer.is_available():
        pytest.skip("xrv 흉부 모델 미로드(오프라인)")
    img = (np.random.default_rng(0).random((128, 128)) * 255).astype("uint8")
    out = infer.predict(img)
    assert out["model"] == infer.WEIGHTS           # 흉부 베이스라인으로 폴백
    assert out["label"] in (infer.LABEL_ABNORMAL, infer.LABEL_NORMAL)
    _reset_mura()


def test_uses_mura_when_weights_present(tmp_path, monkeypatch):
    _reset_mura()
    import torch
    from scripts.train_mura import build_model
    p = tmp_path / "mura.pt"
    torch.save(build_model("densenet169").state_dict(), str(p))  # 더미(랜덤 init) 가중치
    monkeypatch.setenv("MURA_MODEL", str(p))

    assert infer._get_mura_model() is not None      # MURA 가중치 로드됨
    img = (np.random.default_rng(1).random((100, 100)) * 255).astype("uint8")
    out = infer.predict(img)
    assert out["model"] == "mura-densenet169"        # MURA 경로 사용
    assert out["label"] in (infer.LABEL_ABNORMAL, infer.LABEL_NORMAL)  # 인터페이스 불변
    assert 0.0 <= out["confidence"] <= 1.0
    assert infer.active_model_name() == "mura-densenet169"  # 화면②가 읽는 활성 모델명
    _reset_mura()


def test_active_model_name_falls_back_without_mura(monkeypatch):
    _reset_mura()
    monkeypatch.setenv("MURA_MODEL", "data/__no_mura_here__.pt")
    name = infer.active_model_name()
    assert name in (infer.WEIGHTS, infer.LABEL_NO_MODEL)   # 흉부 또는 모델 없음
    assert not name.startswith("mura")
    _reset_mura()
