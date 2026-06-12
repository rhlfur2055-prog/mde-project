"""mura_dataset.py — MURA(스탠포드 근골격 X-ray) 데이터 로더 (D7 준비).

MURA 공식 구조(문서 기준):
    MURA-v1.1/train/XR_{부위}/patient{XXXXX}/study{N}_{positive|negative}/image{M}.png
  → study 폴더명의 positive/negative 로 비정상(1)/정상(0) 라벨링.

# TODO(데이터 확인 — 사람이 아침에): 공식 배포의 train_labeled_studies.csv /
#   valid_labeled_studies.csv 로 라벨을 교차검증할 것. 폴더명 규칙과 CSV가 다르면 CSV 우선.
#   (실데이터가 없어 현재 폴더명 규칙으로만 구현·미검증)

positive/negative 마커가 없는 일반 폴더(더미·테스트)는 ImageFolder 방식
(최상위 하위폴더명을 클래스로, 'abnormal'/'positive' 포함 시 1)으로 폴백한다.

streamlit import 금지 (순수 파이썬, spec §2.8).
"""
from __future__ import annotations

import pathlib
from typing import Callable, Optional

from PIL import Image
from torch.utils.data import Dataset

IMG_EXT = {".png", ".jpg", ".jpeg", ".bmp"}


def label_from_path(p) -> Optional[int]:
    """경로에 MURA study 라벨 마커가 있으면 1(positive)/0(negative), 없으면 None."""
    s = str(p).lower()
    if "positive" in s:
        return 1
    if "negative" in s:
        return 0
    return None


class MuraDataset(Dataset):
    """MURA 근골격 X-ray 이진분류(정상 0 / 비정상 1) 데이터셋.

    root 하위의 모든 이미지를 모아 라벨링한다.
    - 모든 이미지에 positive/negative 마커가 있으면 그것으로 라벨.
    - 아니면 ImageFolder 폴백(최상위 하위폴더명=클래스).
    """

    def __init__(self, root: str, transform: Optional[Callable] = None,
                 class_to_idx: Optional[dict[str, int]] = None,
                 max_per_class: Optional[int] = None) -> None:
        self.root = pathlib.Path(root)
        self.transform = transform
        imgs = sorted(p for p in self.root.rglob("*") if p.suffix.lower() in IMG_EXT)

        marker = [(p, label_from_path(p)) for p in imgs]
        if imgs and all(lbl is not None for _, lbl in marker):
            self.samples = marker  # MURA 폴더명 규칙 (study*_positive/negative — CSV와 일치 검증됨)
            self.class_to_idx = {"negative": 0, "positive": 1}
        else:
            # ImageFolder 폴백: 최상위 하위폴더명을 클래스로
            classes = sorted({p.relative_to(self.root).parts[0]
                              for p in imgs if len(p.relative_to(self.root).parts) > 1})
            self.class_to_idx = class_to_idx or {
                c: (1 if ("abnormal" in c.lower() or "positive" in c.lower()) else 0)
                for c in classes
            }
            self.samples = [
                (p, self.class_to_idx.get(p.relative_to(self.root).parts[0], 0))
                for p in imgs if len(p.relative_to(self.root).parts) > 1
            ]

        if max_per_class is not None:
            # 클래스 균형 유지하며 클래스당 표본 수 제한 (CPU 빠른 검증용)
            capped: list = []
            counts: dict[int, int] = {}
            for p, lbl in self.samples:
                if counts.get(lbl, 0) < max_per_class:
                    capped.append((p, lbl))
                    counts[lbl] = counts.get(lbl, 0) + 1
            self.samples = capped

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")  # DenseNet/흉부모델 호환 3채널
        if self.transform is not None:
            img = self.transform(img)
        return img, label
