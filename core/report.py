"""report.py — 보고서 초안(Gemini) + 품질 게이트(spec §6).

- check_gate(): LLM과 분리된 **순수 함수** — API 없이 단위테스트 가능 (금지어·헤지·근거태그).
- generate_report(): Gemini로 초안 생성 → 게이트 → 실패 시 위반사항 피드백하며 재시도(≤3).
  3회 재시도 후에도 실패면 passed=False로 **정직하게 기록**(가짜 통과 금지).
  생성 함수는 주입 가능(generate_fn) — 테스트에서 가짜 초안으로 재시도 로직 검증.

출력 스키마(spec §6): {"draft": str, "evidence_tags": [...],
                       "gate": {"passed": bool, "violations": [...], "retries": int}}
streamlit import 금지 (spec §2.8). 외부 API는 Gemini만 (spec §2.2).
"""
from __future__ import annotations

import json
import os
import pathlib
from typing import Any, Callable, Optional

# --- 게이트 규칙 (spec §6) ---------------------------------------------------
# 금지어(부분 일치). "~병입니다"는 접미 패턴이므로 부분문자열 "병입니다"로 검사.
BANNED_WORDS = ["확진", "진단됩니다", "병입니다", "치료하세요", "복용", "수술이 필요"]
# 필수 헤지 표현(의심/가능성/확인 필요 계열)
HEDGE_TERMS = ["의심", "가능성", "확인 필요", "확인이 필요"]
# 허용 근거 태그
EVIDENCE_TAGS = ["[AI결과]", "[일반소견]", "[불확실]"]

DEFAULT_MODEL = "gemini-2.5-flash"
MAX_RETRIES = 3
ADOPTED_PATH = "data/arena_adopted.json"

DISCLAIMER = (
    "본 서비스는 교육·기술 데모입니다. 의료 진단이 아니며, "
    "모든 의료적 판단은 의사와 상담하세요."
)


def check_gate(draft: str, evidence_tags: Optional[list[str]] = None) -> dict[str, Any]:
    """초안 문자열을 spec §6 규칙으로 검사한다 (순수 함수, LLM 미사용).

    반환: {"passed": bool, "violations": [str, ...]}
    """
    violations: list[str] = []

    for word in BANNED_WORDS:
        if word in draft:
            violations.append(f"금지어 '{word}' 포함")

    if not any(h in draft for h in HEDGE_TERMS):
        violations.append("필수 헤지 표현(의심/가능성/확인 필요) 누락")

    tags_in_draft = [t for t in EVIDENCE_TAGS if t in draft]
    if not tags_in_draft:
        violations.append("근거 태그([AI결과]/[일반소견]/[불확실]) 누락")

    if evidence_tags is not None:
        bad = [t for t in evidence_tags if t not in EVIDENCE_TAGS]
        if bad:
            violations.append(f"허용되지 않은 근거 태그: {bad}")

    return {"passed": len(violations) == 0, "violations": violations}


# --- Gemini 클라이언트 -------------------------------------------------------
_client: Any = None


def _load_env() -> None:
    """.env(BOM 가능)를 읽어 GEMINI_API_KEY 등을 환경에 올린다."""
    p = pathlib.Path(".env")
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def _get_client() -> Any:
    global _client
    if _client is not None:
        return _client
    _load_env()
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY 없음 — .env를 확인하세요.")
    from google import genai
    _client = genai.Client(api_key=key)
    return _client


def _model_name() -> str:
    return os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)


def _adopted_instruction() -> Optional[str]:
    """아레나 1등 채택 구성이 있으면 그 작성 지침을 반환 (없으면 None)."""
    p = pathlib.Path(ADOPTED_PATH)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8")).get("instruction")
    except (json.JSONDecodeError, OSError):
        return None


def _build_prompt(analysis: dict[str, Any], prev_violations: Optional[list[str]]) -> str:
    fix = ""
    if prev_violations:
        fix = ("\n[직전 시도가 아래 규칙을 위반했습니다 — 반드시 수정하세요]\n- "
               + "\n- ".join(prev_violations))
    adopted = _adopted_instruction()
    style = f"\n[채택된 작성 구성 — 이 스타일을 따르세요] {adopted}" if adopted else ""
    return f"""당신은 영상의학 보고서 초안 작성 보조입니다.
아래 AI 분석 결과를 바탕으로 한국어 X-ray 판독 '초안'을 작성하세요.{style}

[필수 규칙]
- 진단을 단정하지 마세요. 모든 소견은 '의심', '가능성', '확인 필요' 같은 헤지 표현을 사용.
- 다음 표현 절대 금지: 확진, 진단됩니다, ~병입니다, 치료하세요, 복용, 수술이 필요.
- 각 소견 문장에 근거 태그를 [AI결과] / [일반소견] / [불확실] 중 하나로 표기.
- 마지막 줄에 면책 문구 포함: "{DISCLAIMER}"

[AI 분석 결과]
- 판정: {analysis.get('label')}
- 주요 활성 소견(흉부 베이스라인 모델 기준): {analysis.get('top_finding')}
- 모델 확신도: {analysis.get('confidence')}
{fix}

[출력 형식] 아래 JSON만 출력:
{{"draft": "<보고서 본문 문자열>", "evidence_tags": ["[AI결과]"]}}"""


def _gemini_generate(analysis: dict[str, Any],
                     prev_violations: Optional[list[str]]) -> tuple[str, list[str]]:
    """실제 Gemini 호출 → (draft, evidence_tags). JSON 파싱 실패 시 원문/빈태그 반환."""
    client = _get_client()
    prompt = _build_prompt(analysis, prev_violations)
    resp = client.models.generate_content(
        model=_model_name(),
        contents=prompt,
        config={"response_mime_type": "application/json", "temperature": 0.2},
    )
    text = (resp.text or "").strip()
    try:
        data = json.loads(text)
        return str(data.get("draft", "")), list(data.get("evidence_tags", []))
    except (json.JSONDecodeError, AttributeError):
        return text, []


def generate_report(
    analysis: dict[str, Any],
    generate_fn: Optional[Callable[[dict, Optional[list[str]]], tuple[str, list[str]]]] = None,
    max_retries: int = MAX_RETRIES,
) -> dict[str, Any]:
    """초안 생성 → 게이트 → 실패 시 재시도(≤max_retries). spec §6 JSON 반환.

    generate_fn: (analysis, prev_violations) -> (draft, evidence_tags).
                 None이면 실제 Gemini 호출 사용. 테스트는 가짜 함수 주입.
    """
    gen = generate_fn or _gemini_generate
    prev_violations: Optional[list[str]] = None
    last: Optional[tuple[str, list[str], dict]] = None

    for attempt in range(max_retries + 1):  # 최초 1회 + 재시도 max_retries회
        draft, tags = gen(analysis, prev_violations)
        gate = check_gate(draft, tags)
        if gate["passed"]:
            return {"draft": draft, "evidence_tags": tags,
                    "gate": {"passed": True, "violations": [], "retries": attempt}}
        last = (draft, tags, gate)
        prev_violations = gate["violations"]

    draft, tags, gate = last  # 전부 실패 — 정직하게 실패 기록 (가짜 통과 금지)
    return {"draft": draft, "evidence_tags": tags,
            "gate": {"passed": False, "violations": gate["violations"],
                     "retries": max_retries}}
