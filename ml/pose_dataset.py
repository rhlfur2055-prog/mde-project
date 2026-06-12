"""pose_dataset.py — COCO person-keypoints 로더 + 규칙 자동라벨 (P6).

데이터셋: COCO 2017 person keypoints (val split, person_keypoints_val2017.json).
  - 라이선스: 어노테이션 CC-BY-4.0 (이미지는 Flickr 원저작자 라이선스; 본 학습은 이미지 불필요, 키포인트만 사용).
  - 출처: http://images.cocodataset.org/annotations/annotations_trainval2017.zip
  - 크기: zip 241MB → 그중 person_keypoints_val2017.json 만 추출(약 10MB, ~5000 이미지, ~11k 인스턴스).

라벨 = **실제 COCO 키포인트의 결정론적 함수**(golden_rules = score.ts 규칙 이식).
  → 가짜 데이터가 아니라 실 공개 데이터에 대한 규칙 증류(spec 비-목 규칙 준수).

특징 벡터(X): score.ts 가 쓰는 8개 랜드마크의 정규화 좌표.
  - 각 인스턴스의 bbox(또는 키포인트 외접 박스)로 [0,1] 정규화 → 위치·스케일 불변.
  - y 는 아래로 증가(score.ts 좌표계 그대로 유지).
  - 누락(visibility 0) 랜드마크는 좌표 0, 가시 플래그 0 으로 채움.
  - feature 레이아웃(20-D): 8 랜드마크 × (x, y) + 4 가시플래그(ear/shoulder/hip/ankle 쌍 단위)
    = 16 + 4 = 20.

라벨(y): symmetry/golden/overall (0~1 스케일) + grade(0~3 정수).
  - 학습 회귀 타깃은 0~1 로 스케일(/100). grade 는 분류용 보조 라벨.
  - golden 미가용 인스턴스는 golden 타깃 마스크=0 (손실에서 제외 가능).

streamlit·웹 프레임워크 import 금지 (순수 파이썬, spec §2.8). core/mura_dataset.py 구조 미러.
"""
from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass
from typing import Optional

import numpy as np
from torch.utils.data import Dataset

from ml.golden_rules import compute_body_metrics

# COCO 17 키포인트 이름 → 인덱스 (person_keypoints categories 와 동일 순서)
COCO_KP = {
    "nose": 0, "left_eye": 1, "right_eye": 2, "left_ear": 3, "right_ear": 4,
    "left_shoulder": 5, "right_shoulder": 6, "left_elbow": 7, "right_elbow": 8,
    "left_wrist": 9, "right_wrist": 10, "left_hip": 11, "right_hip": 12,
    "left_knee": 13, "right_knee": 14, "left_ankle": 15, "right_ankle": 16,
}

# score.ts 가 쓰는 8 랜드마크. feature 순서 고정.
FEATURE_LANDMARKS = [
    "left_ear", "right_ear",
    "left_shoulder", "right_shoulder",
    "left_hip", "right_hip",
    "left_ankle", "right_ankle",
]
FEATURE_DIM = len(FEATURE_LANDMARKS) * 2 + 4  # 16 좌표 + 4 가시쌍 플래그 = 20
GRADE_IDX = {"A": 0, "B": 1, "C": 2, "D": 3, "-": 3}


def _coco_point(kps: list, name: str):
    """COCO keypoints 평탄배열에서 (x, y, v) 추출. v: 0=미라벨,1=가림,2=보임."""
    i = COCO_KP[name] * 3
    return kps[i], kps[i + 1], kps[i + 2]


def _to_score_point(x: float, y: float, v: int, w: float, h: float, x0: float, y0: float):
    """COCO 픽셀좌표 → bbox 정규화 (x,y,visibility) 또는 None.

    v>=1 이면 라벨 존재. score.ts visibility 임계(0.5)와 호환되게:
      - v==2(보임)  → visibility=1.0
      - v==1(가림)  → visibility=1.0 (좌표는 있으므로 측정엔 사용; score.ts 의 0.5 임계 통과)
      - v==0(미라벨)→ None (해당 랜드마크 없음)
    """
    if v < 1:
        return None
    nx = (x - x0) / w if w > 1e-6 else 0.0
    ny = (y - y0) / h if h > 1e-6 else 0.0
    return (nx, ny, 1.0)


@dataclass
class PoseSample:
    features: np.ndarray   # (FEATURE_DIM,) float32
    targets: np.ndarray    # (3,) float32 [symmetry, golden, overall] in 0~1
    mask: np.ndarray       # (3,) float32 — 1=라벨유효
    grade: int             # 0~3


class PoseKeypointDataset(Dataset):
    """COCO person-keypoints → 정규화 feature + golden_rules 자동라벨.

    Args:
        ann_path: person_keypoints_val2017.json 경로.
        require_symmetry: True면 어깨 가시(대칭 산출 가능) 인스턴스만 포함.
        golden_only: True면 전신(발목 포함, 황금비 산출 가능) 인스턴스만.
        max_samples: 표본 상한(빠른 검증).
        min_keypoints: 최소 라벨 키포인트 수(노이즈 인스턴스 제외).
    """

    def __init__(self, ann_path: str, *, require_symmetry: bool = True,
                 golden_only: bool = False, max_samples: Optional[int] = None,
                 min_keypoints: int = 5) -> None:
        self.ann_path = pathlib.Path(ann_path)
        with open(self.ann_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.samples: list[PoseSample] = []

        for ann in data["annotations"]:
            if ann.get("num_keypoints", 0) < min_keypoints:
                continue
            kps = ann["keypoints"]
            # 외접 박스: bbox 가 있으면 사용, 아니면 키포인트 min/max.
            bx, by, bw, bh = ann.get("bbox", [0, 0, 0, 0])
            if bw <= 1e-6 or bh <= 1e-6:
                xs = [kps[i] for i in range(0, 51, 3) if kps[i + 2] >= 1]
                ys = [kps[i + 1] for i in range(0, 51, 3) if kps[i + 2] >= 1]
                if not xs:
                    continue
                bx, by = min(xs), min(ys)
                bw, bh = max(max(xs) - bx, 1.0), max(max(ys) - by, 1.0)

            pts = {name: _to_score_point(*_coco_point(kps, name), bw, bh, bx, by)
                   for name in FEATURE_LANDMARKS}

            m = compute_body_metrics(
                l_ear=pts["left_ear"], r_ear=pts["right_ear"],
                l_sh=pts["left_shoulder"], r_sh=pts["right_shoulder"],
                l_hip=pts["left_hip"], r_hip=pts["right_hip"],
                l_ank=pts["left_ankle"], r_ank=pts["right_ankle"],
            )
            if require_symmetry and not m.sym_available:
                continue
            if golden_only and not m.golden_available:
                continue

            # feature 벡터 구성
            feat = np.zeros(FEATURE_DIM, dtype=np.float32)
            for j, name in enumerate(FEATURE_LANDMARKS):
                p = pts[name]
                if p is not None:
                    feat[j * 2] = p[0]
                    feat[j * 2 + 1] = p[1]
            # 가시쌍 플래그 (ear/shoulder/hip/ankle 쌍 모두 보이면 1)
            feat[16] = 1.0 if pts["left_ear"] and pts["right_ear"] else 0.0
            feat[17] = 1.0 if pts["left_shoulder"] and pts["right_shoulder"] else 0.0
            feat[18] = 1.0 if pts["left_hip"] and pts["right_hip"] else 0.0
            feat[19] = 1.0 if pts["left_ankle"] and pts["right_ankle"] else 0.0

            targets = np.array([
                m.symmetry_score / 100.0,
                m.golden_score / 100.0,
                m.overall_score / 100.0,
            ], dtype=np.float32)
            mask = np.array([
                1.0 if m.sym_available else 0.0,
                1.0 if m.golden_available else 0.0,
                1.0,  # overall 은 항상 정의(parts 평균)
            ], dtype=np.float32)

            self.samples.append(PoseSample(feat, targets, mask, GRADE_IDX[m.grade]))
            if max_samples is not None and len(self.samples) >= max_samples:
                break

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        s = self.samples[idx]
        return s.features, s.targets, s.mask

    def label_stats(self) -> dict:
        """라벨 분포 요약(검증/로그용)."""
        if not self.samples:
            return {"n": 0}
        t = np.stack([s.targets for s in self.samples])
        msk = np.stack([s.mask for s in self.samples])
        grades = np.bincount([s.grade for s in self.samples], minlength=4)
        return {
            "n": len(self.samples),
            "golden_available": int(msk[:, 1].sum()),
            "symmetry_mean": float(t[:, 0].mean()),
            "golden_mean": float((t[:, 1] * msk[:, 1]).sum() / max(1.0, msk[:, 1].sum())),
            "overall_mean": float(t[:, 2].mean()),
            "grade_ABCD": grades.tolist(),
        }
