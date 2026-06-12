"""DEMO_READONLY 안전장치 — 순수 플래그 테스트.

(Streamlit AppTest 기반 버튼 잠금 테스트는 app.py 은퇴와 함께
 legacy/test_app_readonly_legacy.py 로 이동했다 — posera 피벗 P0.)
"""
from core import config


def test_config_readonly_flag(monkeypatch):
    for truthy in ["true", "True", "1", "yes", "on"]:
        monkeypatch.setenv("DEMO_READONLY", truthy)
        assert config.readonly() is True
    for falsy in ["false", "0", "", "no"]:
        monkeypatch.setenv("DEMO_READONLY", falsy)
        assert config.readonly() is False
    monkeypatch.delenv("DEMO_READONLY", raising=False)
    assert config.readonly() is False
