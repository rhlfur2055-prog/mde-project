"""golden_rules.py — web/lib/golden/score.ts 의 충실한 파이썬 포트 (규칙 증류용).

목적
  웹 앱은 MediaPipe Pose(33 랜드마크) → score.ts 규칙으로 자세 점수를 매긴다.
  여기서는 그 규칙을 파이썬으로 똑같이 재구현해, **실제 공개 포즈 데이터셋의 키포인트**를
  동일 규칙으로 자동 라벨링한다. (= 실데이터에 대한 규칙 증류. 가짜 데이터 생성 아님.)

좌표계 약속 (score.ts 와 동일)
  - 입력 랜드마크는 정규화 좌표, **y는 아래로 증가**(화면 좌표계).
  - 점수는 0~100, 등급은 A/B/C/D.

키포인트 스키마 매핑 (COCO 17 → score.ts 가 쓰는 MediaPipe 인덱스)
  score.ts 가 실제로 참조하는 랜드마크는 다음뿐이다 (poseConfig.ts LM):
      LEFT_EAR(7), RIGHT_EAR(8), LEFT_SHOULDER(11), RIGHT_SHOULDER(12),
      LEFT_HIP(23), RIGHT_HIP(24), LEFT_ANKLE(27), RIGHT_ANKLE(28).
  (NOSE/KNEE 는 LM 에 있으나 점수 계산식엔 미사용.)
  COCO 17 키포인트는 이 8개를 전부 포함하므로 모든 지표가 계산 가능하다:
      COCO 'left_ear'/'right_ear'   → EAR    → headTilt
      COCO 'left_shoulder'/'right_shoulder' → SHOULDER
      COCO 'left_hip'/'right_hip'   → HIP
      COCO 'left_ankle'/'right_ankle' → ANKLE → golden ratio (전신 필요)
  COCO 의 eye(눈) 2점은 score.ts 가 안 쓰므로 무시한다.
  ※ MediaPipe 'ear' 와 COCO 'ear' 는 동일 해부학 지점이라 headTilt 의미가 보존된다.

streamlit·웹 프레임워크 import 금지 (순수 파이썬).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Sequence

# ── poseConfig.ts GOLDEN 상수 (1:1 이식) ──────────────────────────────
PHI = 1.618
VISIBILITY_MIN = 0.5
W_SHOULDER_TILT = 3.0
W_HIP_TILT = 3.0
W_HEAD_TILT = 2.0
TILT_NOTE_THRESHOLD_DEG = 3.0
GOLDEN_DEV_PENALTY = 300.0
GRADE_A = 85.0
GRADE_B = 70.0
GRADE_C = 55.0


Point = "tuple[float, float, Optional[float]]"  # (x, y, visibility)


def _clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def _mid(a, b):
    return ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)


def _dist(a, b) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def line_tilt_deg(a, b) -> float:
    """두 점을 잇는 선이 수평에서 벗어난 각도 [0,90]. score.ts lineTiltDeg 와 동일."""
    ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    d = abs(ang) % 180.0
    if d > 90.0:
        d = 180.0 - d
    return d


def _visible(p) -> bool:
    """score.ts visible(): visibility 없으면 보임, 있으면 임계 이상이어야 보임."""
    if p is None:
        return False
    vis = p[2] if len(p) > 2 else None
    return vis is None or vis >= VISIBILITY_MIN


def grade_of(score: float) -> str:
    if score >= GRADE_A:
        return "A"
    if score >= GRADE_B:
        return "B"
    if score >= GRADE_C:
        return "C"
    return "D"


@dataclass
class BodyMetrics:
    sym_available: bool
    symmetry_score: float          # 0~100 (반올림 전 raw)
    shoulder_tilt_deg: float
    hip_tilt_deg: float
    head_tilt_deg: float
    golden_available: bool
    golden_score: float            # 0~100 (raw)
    lower_upper_ratio: float
    overall_score: int             # score.ts 와 동일하게 round
    grade: str                     # A/B/C/D/-


def compute_body_metrics(
    *,
    l_sh=None, r_sh=None,
    l_hip=None, r_hip=None,
    l_ear=None, r_ear=None,
    l_ank=None, r_ank=None,
) -> BodyMetrics:
    """score.ts computeBodyMetrics() 의 점수 산출부 1:1 포트.

    각 인자는 (x, y) 또는 (x, y, visibility) 튜플 또는 None.
    deviations(사람용 코멘트)는 학습에 불필요하므로 생략, 점수만 산출한다.
    """
    sh_ok = _visible(l_sh) and _visible(r_sh)
    hip_ok = _visible(l_hip) and _visible(r_hip)
    head_ok = _visible(l_ear) and _visible(r_ear)

    shoulder_tilt = line_tilt_deg(l_sh, r_sh) if sh_ok else 0.0
    hip_tilt = line_tilt_deg(l_hip, r_hip) if hip_ok else 0.0
    head_tilt = line_tilt_deg(l_ear, r_ear) if head_ok else 0.0

    sym_available = sh_ok  # 최소 어깨가 보이면 대칭 평가 (score.ts 와 동일)
    symmetry_score = 0.0
    if sym_available:
        symmetry_score = _clamp(
            100.0
            - (shoulder_tilt * W_SHOULDER_TILT
               + hip_tilt * W_HIP_TILT
               + head_tilt * W_HEAD_TILT)
        )

    golden_ok = sh_ok and hip_ok and _visible(l_ank) and _visible(r_ank)
    lower_upper_ratio = 0.0
    golden_score = 0.0
    if golden_ok:
        sh_mid = _mid(l_sh, r_sh)
        hip_mid = _mid(l_hip, r_hip)
        ank_mid = _mid(l_ank, r_ank)
        upper = _dist(sh_mid, hip_mid)
        lower = _dist(hip_mid, ank_mid)
        if upper > 1e-6:
            lower_upper_ratio = lower / upper
            rel_dev = abs(lower_upper_ratio - PHI) / PHI
            golden_score = _clamp(100.0 - rel_dev * GOLDEN_DEV_PENALTY)

    parts = []
    if sym_available:
        parts.append(symmetry_score)
    if golden_ok:
        parts.append(golden_score)
    overall_score = round(sum(parts) / len(parts)) if parts else 0

    return BodyMetrics(
        sym_available=sym_available,
        symmetry_score=symmetry_score,
        shoulder_tilt_deg=shoulder_tilt,
        hip_tilt_deg=hip_tilt,
        head_tilt_deg=head_tilt,
        golden_available=golden_ok,
        golden_score=golden_score,
        lower_upper_ratio=lower_upper_ratio,
        overall_score=overall_score,
        grade=grade_of(overall_score) if parts else "-",
    )
