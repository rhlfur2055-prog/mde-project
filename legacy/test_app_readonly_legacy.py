"""[LEGACY] 은퇴한 Streamlit app.py 의 DEMO_READONLY 버튼 잠금 테스트.

posera 피벗(P0)으로 Streamlit UI는 은퇴 → 기본 pytest 대상(tests/)에서 제외.
참조·복원용으로 보존한다. 실행하려면 레포 루트에서:
    python -m pytest legacy/test_app_readonly_legacy.py
"""
from streamlit.testing.v1 import AppTest


def test_readonly_locks_buttons(monkeypatch):
    """DEMO_READONLY=true → 업로드 잠금 안내 + 아레나/채택 버튼 disabled."""
    monkeypatch.setenv("DEMO_READONLY", "true")
    at = AppTest.from_file("legacy/app.py", default_timeout=90).run()

    assert any("읽기 전용" in i.value for i in at.info)
    assert any("읽기 전용" in w.value for w in at.sidebar.warning)

    at.radio[0].set_value("④ 아레나").run()
    arena_btns = [b for b in at.button if "아레나 실행" in b.label]
    assert arena_btns and all(b.disabled for b in arena_btns)
    adopt_btns = [b for b in at.button if "채택" in b.label]
    assert all(b.disabled for b in adopt_btns)


def test_not_readonly_enables_buttons(monkeypatch):
    """DEMO_READONLY 미설정 → 아레나 실행 버튼 활성."""
    monkeypatch.delenv("DEMO_READONLY", raising=False)
    at = AppTest.from_file("legacy/app.py", default_timeout=90).run()
    at.radio[0].set_value("④ 아레나").run()
    arena_btns = [b for b in at.button if "아레나 실행" in b.label]
    assert arena_btns and not any(b.disabled for b in arena_btns)
