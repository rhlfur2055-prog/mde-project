"""deid.py — DICOM 비식별화.

(1) 식별 태그 제거/치환 (DICOM PS3.15 기밀성 프로파일 기반 핵심 PHI 태그).
(2) 픽셀에 새겨진(burned-in) 글자영역 검출 후 블러 (plateguard core.py 모자이크/GaussianBlur 패턴 이식).

streamlit을 import하지 않는 순수 파이썬 모듈 (spec §2.8). Mock 없음 — 실제 태그 조작·실제 CV 블러.
"""
from __future__ import annotations

import copy
import hashlib
from typing import Any

import cv2
import numpy as np
import pydicom

from core import dicom_io

# 가명으로 치환할 식별 태그 (값을 보존할 필요는 없지만 행 추적용 ID는 유지)
REPLACE_TAGS = ["PatientName", "PatientID"]

# 값을 비울(제거) 식별 태그
REMOVE_TAGS = [
    "PatientBirthDate", "PatientAddress", "PatientTelephoneNumbers",
    "OtherPatientIDs", "OtherPatientNames", "PatientMotherBirthName",
    "ReferringPhysicianName", "PerformingPhysicianName", "OperatorsName",
    "PhysiciansOfRecord", "RequestingPhysician", "NameOfPhysiciansReadingStudy",
    "InstitutionName", "InstitutionAddress", "InstitutionalDepartmentName",
    "StationName", "AccessionNumber", "DeviceSerialNumber",
]


def _pseudonym(seed: str) -> str:
    """원본 식별자에서 결정적(deterministic) 가명 생성 — 같은 환자는 같은 가명."""
    h = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:8].upper()
    return f"ANON-{h}"


def deid_dataset(ds: pydicom.Dataset) -> tuple[pydicom.Dataset, list[dict[str, Any]]]:
    """식별 태그 제거/치환. (비식별 Dataset, 제거이력 리스트) 반환. 원본 ds는 변경하지 않는다."""
    out = copy.deepcopy(ds)
    anon = _pseudonym(str(ds.get("PatientID", "")) + "|" + str(ds.get("PatientName", "")))
    removed: list[dict[str, Any]] = []

    for kw in REPLACE_TAGS:
        if kw in out and str(out.get(kw)):
            elem = out.data_element(kw)
            old = str(elem.value)
            elem.value = anon
            removed.append({"keyword": kw, "tag": str(elem.tag),
                            "old": old, "new": anon, "action": "치환"})

    for kw in REMOVE_TAGS:
        if kw in out and str(out.get(kw)):
            elem = out.data_element(kw)
            old = str(elem.value)
            elem.value = ""
            removed.append({"keyword": kw, "tag": str(elem.tag),
                            "old": old, "new": "", "action": "제거"})

    return out, removed


def detect_text_regions(img8: np.ndarray, bright_thresh: int = 230,
                        min_aspect: float = 2.5) -> list[list[int]]:
    """8비트 그레이스케일에서 burned-in 텍스트로 추정되는 영역 박스를 검출한다.

    OCR 없이 고전 CV로 보수적으로 잡는다: 밝은(near-white) 픽셀 → 가로 연결 →
    '가로로 길고 낮은' 텍스트 라인 휴리스틱. 해부학 구조 오검출을 줄이려 보수적으로 설정.
    반환: [[x1, y1, x2, y2], ...]
    """
    gray = img8 if img8.ndim == 2 else cv2.cvtColor(img8, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    _, bright = cv2.threshold(gray, bright_thresh, 255, cv2.THRESH_BINARY)
    # 인접 글자들을 한 단어/줄로 연결 (가로 방향)
    kx = max(5, w // 25)
    conn = cv2.getStructuringElement(cv2.MORPH_RECT, (kx, 1))
    closed = cv2.morphologyEx(bright, cv2.MORPH_CLOSE, conn)

    cnts, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes: list[list[int]] = []
    for c in cnts:
        x, y, bw, bh = cv2.boundingRect(c)
        if bh < 8 or bh > 0.12 * h:           # 글자 줄 높이 범위
            continue
        if bw * bh > 0.20 * h * w:            # 너무 큰 덩어리(=해부학/배경)는 제외
            continue
        if bw / float(bh + 1e-6) < min_aspect:  # 가로로 긴 라인만
            continue
        boxes.append([x, y, x + bw, y + bh])
    return boxes


def blur_regions(img8: np.ndarray, boxes: list[list[int]]) -> np.ndarray:
    """검출된 박스를 모자이크+가우시안으로 식별 불가하게 가린다 (원본 미변경, 사본 반환)."""
    out = img8.copy()
    h, w = out.shape[:2]
    for box in boxes:
        x1, y1, x2, y2 = [int(v) for v in box]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        if x2 <= x1 or y2 <= y1:
            continue
        roi = out[y1:y2, x1:x2]
        sw = max(1, roi.shape[1] // 12)
        sh = max(1, roi.shape[0] // 12)
        small = cv2.resize(roi, (sw, sh), interpolation=cv2.INTER_LINEAR)
        pix = cv2.resize(small, (roi.shape[1], roi.shape[0]), interpolation=cv2.INTER_NEAREST)
        k = max(9, (min(roi.shape[0], roi.shape[1]) // 2) * 2 + 1)  # 홀수 커널
        out[y1:y2, x1:x2] = cv2.GaussianBlur(pix, (k, k), 0)
    return out


def run(loaded: dict[str, Any]) -> dict[str, Any]:
    """dicom_io.load 결과를 받아 태그 비식별 + 픽셀 글자영역 블러를 수행한다.

    반환: {
        "dataset": 비식별 Dataset,
        "pixels_original": 8비트 원본 표시 이미지,
        "pixels": 8비트 비식별(블러) 표시 이미지,
        "removed_tags": [...], "blurred_regions": [...],
    }
    """
    ds_deid, removed = deid_dataset(loaded["dataset"])
    img8 = dicom_io.to_uint8(loaded["pixels"])
    boxes = detect_text_regions(img8)
    img_deid = blur_regions(img8, boxes)
    return {
        "dataset": ds_deid,
        "pixels_original": img8,
        "pixels": img_deid,
        "removed_tags": removed,
        "blurred_regions": boxes,
    }
