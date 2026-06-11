"""preprocess.py — X-ray 추론/표시용 전처리 (정규화·CLAHE·감마).

# 이식: yolo11 preprocessor.py 의 clahe()/_gamma_lut()/brightness_normalize() 패턴
원본은 번호판(BGR/LAB 3채널) 대상이라, X-ray(8비트 그레이스케일 단일 채널)에 맞게
LAB 분리 단계를 빼고 그레이 채널에 직접 적용하도록 다듬어 가져왔다.
CLAHE는 X-ray 대비 보정의 표준 기법. streamlit import 금지 (spec §2.8).
"""
from __future__ import annotations

import cv2
import numpy as np


def normalize(img: np.ndarray) -> np.ndarray:
    """min-max 정규화 → 8비트 0~255 (yolo11 brightness_normalize 스케일 정규화 단순화)."""
    arr = img.astype(np.float32)
    lo, hi = float(arr.min()), float(arr.max())
    if hi <= lo:
        return np.zeros(arr.shape, dtype=np.uint8)
    return cv2.normalize(arr, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)


def _as_gray_u8(img: np.ndarray) -> np.ndarray:
    """BGR/원시 dtype을 8비트 그레이스케일로 통일."""
    if img.ndim == 3:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if img.dtype != np.uint8:
        img = normalize(img)
    return img


def clahe(img: np.ndarray, clip_limit: float = 2.0, tile: int = 8) -> np.ndarray:
    """CLAHE 대비 향상 — X-ray 보정 표준 기법 (yolo11 clahe() 패턴, 그레이 단일채널 적용).

    X-ray 권장값(clip 2.0, tile 8x8). 원본 번호판용 clip 5.0보다 보수적.
    """
    gray = _as_gray_u8(img)
    c = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile, tile))
    return c.apply(gray)


def _gamma_lut(g: float) -> np.ndarray:
    """gamma 값에 대응되는 256-entry uint8 LUT (yolo11 _gamma_lut 이식)."""
    return np.array([((i / 255.0) ** g) * 255 for i in range(256)]).astype("uint8")


def gamma(img: np.ndarray, g: float = 1.0) -> np.ndarray:
    """감마 보정. g<1 → 밝게, g>1 → 어둡게 (yolo11 gamma_bright/gamma_dark 통합)."""
    return cv2.LUT(_as_gray_u8(img), _gamma_lut(g))


def preprocess(img: np.ndarray, clip_limit: float = 2.0, tile: int = 8,
               g: float = 1.0) -> np.ndarray:
    """X-ray 추론 전처리 파이프라인: 정규화 → CLAHE → (감마). 8비트 그레이 반환."""
    out = clahe(normalize(_as_gray_u8(img)), clip_limit, tile)
    if g != 1.0:
        out = gamma(out, g)
    return out
