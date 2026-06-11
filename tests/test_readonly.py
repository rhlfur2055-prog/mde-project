"""DEMO_READONLY 안전장치 테스트 — 순수 플래그 + AppTest로 버튼 잠김 증명."""
from streamlit.testing.v1 import AppTest

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


def test_readonly_locks_buttons(monkeypatch):
    """DEMO_READONLY=true → 업로드 잠금 안내 + 아레나/채택 버튼 disabled."""
    monkeypatch.setenv("DEMO_READONLY", "true")
    at = AppTest.from_file("app.py", default_timeout=90).run()

    # 기본 페이지(업로드)에 읽기 전용 안내
    assert any("읽기 전용" in i.value for i in at.info)
    # 사이드바 읽기 전용 배너
    assert any("읽기 전용" in w.value for w in at.sidebar.warning)

    # 아레나 페이지로 이동 → 실행 버튼이 비활성
    at.radio[0].set_value("④ 아레나").run()
    arena_btns = [b for b in at.button if "아레나 실행" in b.label]
    assert arena_btns and all(b.disabled for b in arena_btns)
    # 1등 채택 버튼이 있으면 비활성
    adopt_btns = [b for b in at.button if "채택" in b.label]
    assert all(b.disabled for b in adopt_btns)


def test_not_readonly_enables_buttons(monkeypatch):
    """DEMO_READONLY 미설정 → 아레나 실행 버튼 활성."""
    monkeypatch.delenv("DEMO_READONLY", raising=False)
    at = AppTest.from_file("app.py", default_timeout=90).run()
    at.radio[0].set_value("④ 아레나").run()
    arena_btns = [b for b in at.button if "아레나 실행" in b.label]
    assert arena_btns and not any(b.disabled for b in arena_btns)
