"""dicom_io.py — DICOM 파일 읽기.

pydicom으로 DICOM을 읽어 (메타데이터 dict + 픽셀 numpy 배열 + 원본 Dataset)로 변환한다.
streamlit을 import하지 않는 순수 파이썬 모듈 (spec §2.8 — pytest 단독 테스트 대상).
"""
from __future__ import annotations

from typing import Any, BinaryIO, Union

import numpy as np
import pydicom

# 화면·표에 노출할 핵심 메타데이터 키워드 (식별정보 포함 — 비식별 전/후 비교 근거)
META_KEYWORDS = [
    "PatientName", "PatientID", "PatientBirthDate", "PatientSex", "PatientAge",
    "ReferringPhysicianName", "InstitutionName", "StudyDate", "StudyTime",
    "AccessionNumber", "Modality", "BodyPartExamined", "Manufacturer",
    "Rows", "Columns",
]


def load(src: Union[str, BinaryIO]) -> dict[str, Any]:
    """DICOM을 읽어 메타데이터·픽셀·원본 Dataset을 돌려준다.

    src: 파일 경로(str) 또는 file-like(BytesIO 등 — Streamlit UploadedFile 호환).
    반환: {"metadata": dict[str, str], "pixels": np.ndarray, "dataset": pydicom.Dataset}
    """
    ds = pydicom.dcmread(src)
    meta: dict[str, str] = {}
    for kw in META_KEYWORDS:
        if kw in ds:
            val = ds.get(kw)
            meta[kw] = "" if val is None else str(val)
    pixels = ds.pixel_array  # 원본 dtype(예: int16/uint16) 그대로 — 보정은 preprocess(D2)
    return {"metadata": meta, "pixels": pixels, "dataset": ds}


def to_uint8(pixels: np.ndarray) -> np.ndarray:
    """표시·블러용 8비트 그레이스케일 변환 (단순 min-max 정규화).

    CLAHE·감마 등 진단용 보정은 preprocess.py(D2) 영역이며,
    여기서는 화면 표시/글자영역 검출을 위한 표시 변환만 한다.
    """
    arr = pixels.astype(np.float32)
    lo, hi = float(arr.min()), float(arr.max())
    if hi <= lo:
        return np.zeros(arr.shape, dtype=np.uint8)
    norm = (arr - lo) / (hi - lo)
    return (norm * 255.0).round().astype(np.uint8)
