"""pacs_scp.py — C-STORE SCP (DICOM 수신 서버) 골격 (D8 준비). pynetdicom 기반.

포트로 들어오는 DICOM을 받아 기존 파이프라인(dicom_io→deid→infer→store)에 넘긴다.
"파일 업로드(화면①)" 대신 "PACS 네트워크 수신"으로 같은 처리를 한다.

★ Orthanc 설치·실제 C-STORE 전송은 사람이 아침에. 이 골격은 import·기동 스모크만 검증.
pynetdicom 미설치 시 정직하게 안내하고 종료한다.

실행:
    python -m scripts.pacs_scp --port 11112        # 수신 서버 기동(블로킹)
streamlit import 금지. core.dicom_io/deid/store 재사용.
"""
from __future__ import annotations

import argparse
import os
import tempfile

try:
    from pynetdicom import AE, AllStoragePresentationContexts, evt
    _HAS_PYNETDICOM = True
except ImportError:
    _HAS_PYNETDICOM = False

DEFAULT_PORT = 11112
DEFAULT_AET = "MEDGATE"


def available() -> bool:
    return _HAS_PYNETDICOM


def handle_store(event):
    """수신 DICOM → dicom_io→deid(→infer)→store 파이프라인. 성공 시 0x0000 반환."""
    from core import deid, dicom_io
    from core.store import Store

    ds = event.dataset
    ds.file_meta = event.file_meta
    tmp = os.path.join(tempfile.gettempdir(), f"medgate_pacs_{event.message_id}.dcm")
    try:
        ds.save_as(tmp, write_like_original=False)
        loaded = dicom_io.load(tmp)
        result = deid.run(loaded)
        store = Store()
        removed = deid.strip_phi_for_storage(result["removed_tags"])
        import json
        store.add_study(
            anon_patient_id=str(result["dataset"].get("PatientID", "")),
            source_filename=f"PACS:{getattr(ds, 'SOPInstanceUID', '?')}",
            modality=loaded["metadata"].get("Modality", ""),
            body_part=loaded["metadata"].get("BodyPartExamined", ""),
            num_removed_tags=len(removed),
            num_blurred_regions=len(result["blurred_regions"]),
            removed_tags=json.dumps(removed, ensure_ascii=False),
            status="received(PACS)",
        )
        store.close()
        print(f"[PACS] 수신·비식별·저장 완료: {getattr(ds, 'Modality', '?')} "
              f"태그 {len(removed)}개 제거", flush=True)
        # TODO(D8): infer.predict + 결과 저장 연계 (추론은 무겁게 — 옵션/큐 권장)
        return 0x0000  # Success
    except Exception as exc:  # noqa: BLE001
        print(f"[PACS] 처리 실패: {exc}", flush=True)
        return 0xA700  # Out of Resources
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def serve(port: int = DEFAULT_PORT, aet: str = DEFAULT_AET, block: bool = True):
    """C-STORE SCP 기동. pynetdicom 없으면 None 반환(안내 출력). block=False면 서버 객체 반환."""
    if not _HAS_PYNETDICOM:
        print("pynetdicom 미설치 — `pip install pynetdicom` 후 실행하세요.", flush=True)
        return None
    ae = AE(ae_title=aet)
    ae.supported_contexts = AllStoragePresentationContexts
    handlers = [(evt.EVT_C_STORE, handle_store)]
    print(f"[PACS] C-STORE SCP 기동: AET={aet} port={port} (Ctrl+C 종료)", flush=True)
    return ae.start_server(("0.0.0.0", port), evt_handlers=handlers, block=block)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--aet", default=DEFAULT_AET)
    a = ap.parse_args()
    serve(a.port, a.aet, block=True)


if __name__ == "__main__":
    main()
