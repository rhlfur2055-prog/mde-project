"""app.py — MedGate Streamlit 단일 앱 (4페이지 진입점).

D1: 화면① 업로드(DICOM 읽기→비식별→비교 표시→보관함 기록)만 구현.
②③④는 이후 단계에서 구현 — 지금은 정직하게 "구현 전" 안내만 표시한다 (Mock 금지, spec §2.6).
화면 코드만 — 도메인 로직은 core/ 모듈에 위임한다 (spec §2.8, §3).
"""
import io
import json
import time
from pathlib import Path

import cv2
import streamlit as st

from core import deid, dicom_io, infer, preprocess
from core.store import Store

CACHE_DIR = "data/cache"

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
    st.caption(
        "ℹ️ 픽셀 글자 블러는 밝기 기반 휴리스틱 — 폰트·대비에 따라 미검출 가능."
    )
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
            removed_tags=json.dumps(removed, ensure_ascii=False),
        )
        # 비식별 이미지를 캐시에 저장 → 화면②가 다시 읽어 분석한다 (PHI 미저장)
        Path(CACHE_DIR).mkdir(parents=True, exist_ok=True)
        img_path = f"{CACHE_DIR}/study_{rid}.png"
        cv2.imwrite(img_path, result["pixels"])
        store.set_image_path(rid, img_path)
        st.success(f"보관함 기록 완료 — studies.id = {rid}")


def _render_card(label: str, confidence: float, elapsed_ms: float,
                 top_finding, cached: bool) -> None:
    c1, c2, c3 = st.columns(3)
    c1.metric("판정", label)
    c2.metric("확신도", f"{confidence * 100:.1f}%")
    c3.metric("처리 시간", f"{elapsed_ms:.0f} ms")
    note = "저장된 결과(재추론 없음)" if cached else "신규 추론"
    if top_finding:
        st.caption(f"최다 활성 소견(흉부 모델): {top_finding} · {note}")
    else:
        st.caption(note)


def page_analyze() -> None:
    st.header("② 분석 — AI 판정")
    st.warning(
        "현재 흉부 학습 모델(TorchXRayVision)로 파이프라인 검증 중 — "
        "근골격 모델(MURA 파인튜닝, D7)로 교체 예정."
    )
    store = get_store()
    studies = store.list_studies()
    if not studies:
        st.info("먼저 ① 업로드에서 DICOM을 업로드하세요.")
        return

    options = {
        f"#{s['id']} · {s['source_filename']} · {s['modality']}": s["id"]
        for s in studies
    }
    pick = st.selectbox("분석할 항목", list(options.keys()))
    sid = options[pick]
    study = store.get_study(sid)

    if st.button("분석 시작", type="primary"):
        cached = store.get_analysis(sid)
        if cached is not None:
            st.success("동일 항목 — 저장된 결과를 즉시 표시합니다 (중복 추론 안 함).")
            _render_card(cached["label"], cached["confidence"],
                         cached["elapsed_ms"], cached["top_finding"], cached=True)
            return

        img_path = study["image_path"] if study else None
        if not img_path or not Path(img_path).exists():
            st.error("저장된 비식별 이미지가 없습니다. ①에서 다시 업로드하세요.")
            return

        with st.status("분석 중...", expanded=True) as status:
            st.write("① 전처리 (정규화·CLAHE·감마)")
            img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
            infer.ensure_model()  # 1회 로드 비용을 처리시간에서 제외 (워밍업)
            t0 = time.perf_counter()
            pre = preprocess.preprocess(img)
            st.write("② 추론 (TorchXRayVision)")
            result = infer.predict(pre)
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            st.write("③ 저장")
            if result["label"] != infer.LABEL_NO_MODEL:
                store.add_analysis(sid, result["label"], float(result["confidence"]),
                                   result.get("top_finding"), elapsed_ms,
                                   result.get("model", ""))
                status.update(label="분석 완료", state="complete")
            else:
                status.update(label="모델 없음", state="error")

        if result["label"] == infer.LABEL_NO_MODEL:
            st.error(f"모델을 로드할 수 없습니다: {result.get('error')}")
        else:
            _render_card(result["label"], result["confidence"], elapsed_ms,
                         result.get("top_finding"), cached=False)


def _render_detail(store: Store, sid: int) -> None:
    d = store.get_study_detail(sid)
    if d is None:
        st.error("항목을 찾을 수 없습니다.")
        return
    st.subheader(f"상세 — #{sid} · {d['source_filename']}")

    col_img, col_meta = st.columns([1, 1])
    with col_img:
        st.caption("비식별 이미지")
        if d["image_path"] and Path(d["image_path"]).exists():
            st.image(d["image_path"], use_container_width=True)
        else:
            st.info("저장된 비식별 이미지가 없습니다.")
    with col_meta:
        st.caption(f"부위: {d['body_part'] or '-'} · 모달리티: {d['modality'] or '-'} · 상태: {d['status']}")
        tags = json.loads(d["removed_tags"] or "[]")
        st.markdown(f"**제거/치환된 식별 태그: {len(tags)}개**")
        if tags:
            st.dataframe(
                [{"태그": t["tag"], "항목": t["keyword"], "조치": t["action"],
                  "원본값": t["old"], "치환값": t["new"]} for t in tags],
                use_container_width=True, hide_index=True,
            )

    st.markdown("**분석 결과**")
    if d["verdict_label"]:
        c1, c2, c3 = st.columns(3)
        c1.metric("판정", d["verdict_label"])
        c2.metric("확신도", f"{(d['verdict_conf'] or 0) * 100:.1f}%")
        c3.metric("처리 시간", f"{d['verdict_ms'] or 0:.0f} ms")
        if d["verdict_top"]:
            st.caption(f"최다 활성 소견(흉부 모델): {d['verdict_top']} · 모델 {d['verdict_model']}")
    else:
        st.info("미분석 — ② 분석에서 [분석 시작]을 실행하세요.")


def page_archive() -> None:
    st.header("③ 보관함 — 목록 / 상세")
    store = get_store()
    rows = store.list_studies_with_verdict()
    if not rows:
        st.info("먼저 ① 업로드에서 DICOM을 업로드하세요.")
        return

    table = [
        {"ID": r["id"], "비식별ID": r["anon_patient_id"], "일시": r["created_at"],
         "부위": r["body_part"] or "-", "상태": r["status"],
         "판정": r["verdict"] or "미분석"}
        for r in rows
    ]
    event = st.dataframe(
        table, use_container_width=True, hide_index=True,
        on_select="rerun", selection_mode="single-row",
    )
    selected = event.selection.rows if event and event.selection else []
    if selected:
        st.divider()
        _render_detail(store, table[selected[0]]["ID"])
    else:
        st.caption("↑ 행을 선택하면 상세가 표시됩니다.")


def page_todo(title: str, step: str) -> None:
    st.header(title)
    st.info(f"이 화면은 아직 구현 전입니다 ({step}). 현재는 ①·②·③ 만 동작합니다.")


PAGES = {
    "① 업로드": page_upload,
    "② 분석": page_analyze,
    "③ 보관함": page_archive,
    "④ 아레나": lambda: page_todo("④ 아레나", "D6"),
}


def main() -> None:
    st.sidebar.title("MedGate")
    choice = st.sidebar.radio("화면", list(PAGES.keys()))
    PAGES[choice]()
    st.divider()
    st.caption(f"⚠️ {DISCLAIMER}")


main()
