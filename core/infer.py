"""infer.py — AI 판정 (D2 베이스라인: TorchXRayVision 흉부 사전학습 분류기).

인터페이스 고정(spec §3): predict(img: np.ndarray) -> {"label": str, "confidence": float}.

주의: 흉부(胸部) 학습 모델이라 근골격(무릎·척추·손) X-ray엔 도메인 외 — 파이프라인 검증용.
       D7에서 MURA 파인튜닝(근골격 정상/이상) 모델로 교체 예정(spec §7).
모델 로드 실패(미설치/오프라인) 시 "모델 없음"을 정직하게 반환(spec §2.6). 가짜 판정 금지.
streamlit import 금지 (spec §2.8).
"""
from __future__ import annotations

from typing import Any, Optional

import numpy as np

WEIGHTS = "densenet121-res224-all"
ABNORMAL_THRESHOLD = 0.5

LABEL_ABNORMAL = "이상 소견 의심"
LABEL_NORMAL = "정상 범위"
LABEL_NO_MODEL = "모델 없음"

_model: Any = None
_load_error: Optional[str] = None
_load_attempted = False


def _get_model() -> Any:
    """xrv DenseNet를 1회만 로드해 캐시한다 (가중치 자동 다운로드/캐시)."""
    global _model, _load_error, _load_attempted
    if _load_attempted:
        return _model
    _load_attempted = True
    try:
        import torchxrayvision as xrv
        _model = xrv.models.DenseNet(weights=WEIGHTS)
        _model.eval()
    except Exception as exc:  # noqa: BLE001 — 미설치/오프라인을 정직하게 표면화
        _load_error = f"{type(exc).__name__}: {exc}"
        _model = None
    return _model


def ensure_model() -> Any:
    """모델을 미리 로드(워밍업)한다 — 처리시간 실측 시 1회 로드 비용 제외용."""
    return _get_model()


def is_available() -> bool:
    return _get_model() is not None


def _to_model_input(img: np.ndarray):
    """그레이/컬러 이미지를 xrv 입력 텐서 (1,1,224,224)로 변환."""
    import torch
    import torchvision
    import torchxrayvision as xrv

    arr = img.astype(np.float32)
    if arr.ndim == 3:
        arr = arr.mean(2)
    maxval = 255.0 if arr.max() <= 255 else float(arr.max())
    arr = xrv.datasets.normalize(arr, maxval)   # → [-1024, 1024]
    arr = arr[None, ...]                          # (1, H, W) 채널 추가
    transform = torchvision.transforms.Compose([
        xrv.datasets.XRayCenterCrop(),
        xrv.datasets.XRayResizer(224),
    ])
    arr = transform(arr)
    return torch.from_numpy(arr)[None, ...].float()  # (1, 1, 224, 224)


def _aggregate(scores: dict[str, float]) -> dict[str, Any]:
    """병변별 확률 → 정상/이상 이진 판정. 최댓값을 이상 점수로 본다."""
    scores = {k: float(v) for k, v in scores.items() if k}
    top = max(scores, key=scores.get)
    top_score = scores[top]
    if top_score >= ABNORMAL_THRESHOLD:
        return {"label": LABEL_ABNORMAL, "confidence": top_score,
                "top_finding": top, "top_score": top_score}
    return {"label": LABEL_NORMAL, "confidence": 1.0 - top_score,
            "top_finding": top, "top_score": top_score}


def predict(img: np.ndarray) -> dict[str, Any]:
    """X-ray 이미지(np.ndarray) → {"label", "confidence", ...}. 모델 없으면 정직하게 반환."""
    model = _get_model()
    if model is None:
        return {"label": LABEL_NO_MODEL, "confidence": 0.0,
                "top_finding": None, "model": WEIGHTS, "error": _load_error}
    import torch

    x = _to_model_input(img)
    with torch.no_grad():
        out = model(x)[0].detach().cpu().numpy()  # (18,) sigmoid 확률
    scores = dict(zip(model.pathologies, out.tolist()))
    result = _aggregate(scores)
    result["model"] = WEIGHTS
    return result
