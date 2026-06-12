"""test_golden_rules.py — ml/golden_rules.py 가 web/lib/golden/score.ts 와 점수 일치하는지 검증.

기대값은 score.ts 를 tsc 로 컴파일·실행해 얻은 권위 출력(레퍼런스)을 고정한 것.
(생성 절차는 P6 보고서 참조 — sparse-undefined 호출 계약으로 4 케이스 산출.)
규칙이 바뀌면 이 테스트가 깨져 웹/파이썬 표류를 잡는다.
"""
from __future__ import annotations

from ml.golden_rules import compute_body_metrics, line_tilt_deg


def _summary(m):
    return dict(
        sym_avail=m.sym_available,
        sym=round(m.symmetry_score),
        sh=round(m.shoulder_tilt_deg, 1),
        hip=round(m.hip_tilt_deg, 1),
        head=round(m.head_tilt_deg, 1),
        golden_avail=m.golden_available,
        golden=round(m.golden_score),
        ratio=round(m.lower_upper_ratio, 1),
        overall=m.overall_score,
        grade=m.grade,
    )


# score.ts(tsc 컴파일) 권위 출력 — sparse(undefined) 호출 계약.
CASES = {
    "full_straight": (
        dict(l_ear=(0.45, 0.10), r_ear=(0.55, 0.10),
             l_sh=(0.40, 0.25), r_sh=(0.60, 0.25),
             l_hip=(0.42, 0.55), r_hip=(0.58, 0.55),
             l_ank=(0.43, 0.95), r_ank=(0.57, 0.95)),
        dict(sym_avail=True, sym=100, sh=0.0, hip=0.0, head=0.0,
             golden_avail=True, golden=47, ratio=1.3, overall=74, grade="B"),
    ),
    "tilted": (
        dict(l_ear=(0.45, 0.08), r_ear=(0.55, 0.14),
             l_sh=(0.40, 0.22), r_sh=(0.60, 0.30),
             l_hip=(0.42, 0.52), r_hip=(0.58, 0.60),
             l_ank=(0.43, 0.92), r_ank=(0.57, 0.98)),
        dict(sym_avail=True, sym=0, sh=21.8, hip=26.6, head=31.0,
             golden_avail=True, golden=41, ratio=1.3, overall=21, grade="D"),
    ),
    "sym_only_no_ankle": (
        dict(l_ear=(0.45, 0.10), r_ear=(0.55, 0.12),
             l_sh=(0.40, 0.25), r_sh=(0.60, 0.27),
             l_hip=(0.42, 0.55), r_hip=(0.58, 0.55)),
        dict(sym_avail=True, sym=60, sh=5.7, hip=0.0, head=11.3,
             golden_avail=False, golden=0, ratio=0.0, overall=60, grade="C"),
    ),
    "vis_filtered": (
        dict(l_sh=(0.40, 0.25, 0.9), r_sh=(0.60, 0.30, 0.9),
             l_hip=(0.42, 0.55, 0.3), r_hip=(0.58, 0.55, 0.3),
             l_ank=(0.43, 0.95, 0.9), r_ank=(0.57, 0.95, 0.9)),
        dict(sym_avail=True, sym=58, sh=14.0, hip=0.0, head=0.0,
             golden_avail=False, golden=0, ratio=0.0, overall=58, grade="C"),
    ),
}


def test_parity_with_score_ts():
    for name, (kwargs, expected) in CASES.items():
        got = _summary(compute_body_metrics(**kwargs))
        assert got == expected, f"{name}: {got} != {expected}"


def test_line_tilt_horizontal_and_vertical():
    assert line_tilt_deg((0, 0), (1, 0)) == 0.0          # 수평
    assert abs(line_tilt_deg((0, 0), (0, 1)) - 90.0) < 1e-9  # 수직
    assert abs(line_tilt_deg((0, 0), (1, 1)) - 45.0) < 1e-9  # 45도
