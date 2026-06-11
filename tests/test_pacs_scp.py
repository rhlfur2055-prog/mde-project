"""pacs_scp 스모크 — 수신 서버가 에러 없이 기동·종료되는지 (실제 C-STORE 전송 없음)."""
import pytest

from scripts import pacs_scp


def test_server_starts_and_stops():
    if not pacs_scp.available():
        pytest.skip("pynetdicom 미설치")
    server = pacs_scp.serve(port=11119, block=False)
    assert server is not None
    server.shutdown()   # 에러 없이 종료


def test_graceful_when_pynetdicom_missing(monkeypatch):
    """pynetdicom 미설치 시 serve()는 None 반환(정직 종료)."""
    monkeypatch.setattr(pacs_scp, "_HAS_PYNETDICOM", False)
    assert pacs_scp.serve(port=11120) is None
    monkeypatch.setattr(pacs_scp, "_HAS_PYNETDICOM", True)
    assert pacs_scp.available() is True
