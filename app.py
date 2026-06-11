"""app.py — MedGate Streamlit 단일 앱 (4페이지 진입점).

D1: 화면① 업로드(DICOM 읽기→비식별→비교 표시→보관함 기록)만 구현.
②③④는 이후 단계에서 구현 — 지금은 정직하게 "구현 전" 안내만 표시한다 (Mock 금지, spec §2.6).
화면 코드만 — 도메인 로직은 core/ 모듈에 위임한다 (spec §2.8, §3).
"""
import io

import streamlit as st

from core import deid, dicom_io
from core.store import Store

DISCLAIMER = (
    "본 서비스는 교육·기술 데모입니다. 의료 진단이 아니며, "
    "모든 의료적 판단은 의사와 상담하세요."
)

st.set_page_config(page_title="MedGate", layout="wide")


@st.cache_resource
def get_store() -> Store:
    return Store()


def page_upload() -> None:
    st.header("① 업로드 — DICOM 비식별화")
    files = st.file_uploader(
        "X-ray DICOM 파일(.dcm)", type=["dcm"], accept_multiple_files=True
    )
    if not files:
        st.info("DICOM(.dcm) 파일을 업로드하세요. (pydicom 내장 샘플로 테스트 가능)")
        return

    store = get_store()
    for f in files:
        st.subheader(f.name)
        try:
            loaded = dicom_io.load(io.BytesIO(f.getvalue()))
            result = deid.run(loaded)
        except Exception as exc:  # noqa: BLE001 — 사용자에게 읽기 실패를 정직하게 노출
            st.error(f"읽기 실패: {exc}")
            continue

        c1, c2 = st.columns(2)
        with c1:
            st.caption("원본")
            st.image(result["pixels_original"], clamp=True, use_container_width=True)
        with c2:
            st.caption("비식별본 (식별 영역 블러)")
            st.image(result["pixels"], clamp=True, use_container_width=True)

        removed = result["removed_tags"]
        st.markdown(
            f"**제거/치환된 식별 태그: {len(removed)}개 · "
            f"블러 영역: {len(result['blurred_regions'])}개**"
        )
        if removed:
            st.dataframe(
                [
                    {"태그": r["tag"], "항목": r["keyword"], "조치": r["action"],
                     "원본값": r["old"], "치환값": r["new"]}
                    for r in removed
                ],
                use_container_width=True,
            )

        meta = loaded["metadata"]
        rid = store.add_study(
            anon_patient_id=str(result["dataset"].get("PatientID", "")),
            source_filename=f.name,
            modality=meta.get("Modality", ""),
            body_part=meta.get("BodyPartExamined", ""),
            num_removed_tags=len(removed),
            num_blurred_regions=len(result["blurred_regions"]),
        )
        st.success(f"보관함 기록 완료 — studies.id = {rid}")


def page_todo(title: str, step: str) -> None:
    st.header(title)
    st.info(f"이 화면은 아직 구현 전입니다 ({step}). 현재는 ① 업로드만 동작합니다.")


PAGES = {
    "① 업로드": page_upload,
    "② 분석": lambda: page_todo("② 분석", "D2"),
    "③ 보관함": lambda: page_todo("③ 보관함", "D3"),
    "④ 아레나": lambda: page_todo("④ 아레나", "D6"),
}


def main() -> None:
    st.sidebar.title("MedGate")
    choice = st.sidebar.radio("화면", list(PAGES.keys()))
    PAGES[choice]()
    st.divider()
    st.caption(f"⚠️ {DISCLAIMER}")


main()
