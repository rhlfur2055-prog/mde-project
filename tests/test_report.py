"""report 게이트 단위 테스트 — Gemini 호출 없이 가짜 초안 문자열로 검증 (spec §6)."""
import json

from core import report


# --- 게이트 순수 함수 -------------------------------------------------------
GOOD_DRAFT = (
    "무릎 전후면 X-ray에서 관절 간격 협소 가능성이 의심됩니다. [AI결과]\n"
    "추가 평가가 필요하며 정형외과 확인 필요. [불확실]\n"
    "본 서비스는 교육·기술 데모입니다. 의료 진단이 아니며, 모든 의료적 판단은 의사와 상담하세요."
)


def test_gate_passes_clean_draft():
    g = report.check_gate(GOOD_DRAFT, ["[AI결과]", "[불확실]"])
    assert g["passed"] is True
    assert g["violations"] == []


def test_gate_blocks_banned_word():
    bad = "퇴행성 관절염으로 확진됩니다. 약을 복용하세요. [AI결과] 의심됨"
    g = report.check_gate(bad, ["[AI결과]"])
    assert g["passed"] is False
    joined = " ".join(g["violations"])
    assert "확진" in joined
    assert "복용" in joined


def test_gate_blocks_missing_hedge():
    no_hedge = "관절 간격이 좁습니다. [AI결과]"   # 헤지 표현 없음
    g = report.check_gate(no_hedge, ["[AI결과]"])
    assert g["passed"] is False
    assert any("헤지" in v for v in g["violations"])


def test_gate_blocks_missing_evidence_tag():
    no_tag = "관절 간격 협소가 의심됩니다."   # 근거 태그 없음
    g = report.check_gate(no_tag)
    assert g["passed"] is False
    assert any("근거 태그" in v for v in g["violations"])


def test_gate_rejects_invalid_evidence_tag_list():
    g = report.check_gate(GOOD_DRAFT, ["[AI결과]", "[추측]"])
    assert g["passed"] is False
    assert any("허용되지 않은" in v for v in g["violations"])


# --- 재시도 로직 (가짜 generate_fn 주입 — Gemini 미호출) ---------------------
def test_generate_report_passes_first_try():
    def fake(analysis, prev):
        return GOOD_DRAFT, ["[AI결과]", "[불확실]"]
    rep = report.generate_report({"label": "정상 범위"}, generate_fn=fake)
    assert rep["gate"]["passed"] is True
    assert rep["gate"]["retries"] == 0


def test_generate_report_retries_then_succeeds():
    calls = {"n": 0}

    def fake(analysis, prev):
        calls["n"] += 1
        if calls["n"] < 3:
            return "확진됩니다.", []          # 게이트 탈락 (금지어+태그없음)
        return GOOD_DRAFT, ["[AI결과]"]        # 3번째에 통과
    rep = report.generate_report({"label": "x"}, generate_fn=fake)
    assert rep["gate"]["passed"] is True
    assert rep["gate"]["retries"] == 2        # 2번 재시도 후 통과
    assert calls["n"] == 3


def test_generate_report_fails_after_max_retries():
    calls = {"n": 0}

    def always_bad(analysis, prev):
        calls["n"] += 1
        return "확진됩니다. 복용하세요.", []   # 항상 탈락
    rep = report.generate_report({"label": "x"}, generate_fn=always_bad, max_retries=3)
    assert rep["gate"]["passed"] is False      # 가짜 통과 금지 — 정직하게 실패
    assert rep["gate"]["retries"] == 3
    assert calls["n"] == 4                      # 최초 1 + 재시도 3
    assert len(rep["gate"]["violations"]) >= 1


def test_build_prompt_includes_adopted_style(tmp_path, monkeypatch):
    """아레나 1등 채택 구성이 있으면 보고서 프롬프트에 그 스타일이 주입된다 (D6-3 연계)."""
    p = tmp_path / "adopted.json"
    p.write_text(json.dumps({"config": {"id": "config_05"},
                             "instruction": "역할 스타일: 임상 요약체 / 신중도: 보수적"}),
                 encoding="utf-8")
    monkeypatch.setattr(report, "ADOPTED_PATH", str(p))
    prompt = report._build_prompt({"label": "정상 범위", "top_finding": "x", "confidence": 0.5}, None)
    assert "채택된 작성 구성" in prompt
    assert "임상 요약체" in prompt


def test_build_prompt_without_adopted(tmp_path, monkeypatch):
    monkeypatch.setattr(report, "ADOPTED_PATH", str(tmp_path / "none.json"))
    prompt = report._build_prompt({"label": "정상 범위", "top_finding": "x", "confidence": 0.5}, None)
    assert "채택된 작성 구성" not in prompt


def test_generate_report_feeds_violations_back():
    """재시도 시 직전 위반사항이 generate_fn에 전달되는지."""
    seen = []

    def fake(analysis, prev):
        seen.append(prev)
        return "확진됩니다.", []
    report.generate_report({"label": "x"}, generate_fn=fake, max_retries=1)
    assert seen[0] is None                      # 최초엔 위반 없음
    assert seen[1] is not None and len(seen[1]) >= 1  # 재시도엔 위반 전달
