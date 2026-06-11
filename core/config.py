"""config.py — 런타임 설정 플래그 (순수 파이썬, streamlit import 금지).

DEMO_READONLY: 공개 데모 보호용. true면 Gemini·추론(torch) 호출 버튼을 잠그고
미리 만든 결과만 열람하게 한다 (방문자가 API 비용·연산을 태우지 못하게).
"""
from __future__ import annotations

import os

_TRUE = {"1", "true", "yes", "on", "y"}


def readonly() -> bool:
    """DEMO_READONLY 환경변수가 참이면 True (배포 시 st.secrets→os.environ 브리지)."""
    return os.environ.get("DEMO_READONLY", "").strip().lower() in _TRUE
