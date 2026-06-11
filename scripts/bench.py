"""bench.py — 단계별 처리시간 실측 (전처리 / 추론).

# 이식: plateguard scripts/_bench.py 의 perf_counter + statistics.median 측정 패턴
pydicom 내장 샘플(CT_small.dcm)로 전처리·추론 ms를 N회 중앙값으로 실측한다 (실환자 데이터 금지).
실행: python -m scripts.bench   (repo 루트에서)
"""
from __future__ import annotations

import statistics
import time

from pydicom.data import get_testdata_file

from core import deid, dicom_io, infer, preprocess

N = 20


def main() -> None:
    loaded = dicom_io.load(get_testdata_file("CT_small.dcm"))
    img = deid.run(loaded)["pixels"]  # 비식별 8비트 이미지

    available = infer.is_available()
    infer.ensure_model()              # 워밍업 (1회 로드 비용 제외)
    infer.predict(preprocess.preprocess(img))  # 추론 워밍업

    pre_t: list[float] = []
    inf_t: list[float] = []
    for _ in range(N):
        t0 = time.perf_counter()
        pre = preprocess.preprocess(img)
        t1 = time.perf_counter()
        infer.predict(pre)
        t2 = time.perf_counter()
        pre_t.append((t1 - t0) * 1000.0)
        inf_t.append((t2 - t1) * 1000.0)

    pre_ms = statistics.median(pre_t)
    inf_ms = statistics.median(inf_t)
    print(f"=== MedGate 처리시간 실측 (샘플 CT_small.dcm, N={N}, CPU) ===")
    print(f"  전처리(정규화·CLAHE·감마): {pre_ms:7.1f} ms")
    print(f"  추론(TorchXRayVision)    : {inf_ms:7.1f} ms")
    print(f"  합계                      : {pre_ms + inf_ms:7.1f} ms")
    if not available:
        print("  (주의) 모델 미로드 — 추론 시간은 '모델 없음' 경로 기준")


if __name__ == "__main__":
    main()
