"""arena.py — 보고서 작성 프롬프트 구성 50개 서바이벌 선발 (spec §5).

파이프라인: 6차원 구성 50개 생성 → 구성당 10케이스 보고서 생성(묶음 1콜) →
하드게이트(report.check_gate 재사용) → 채점 4축(정확성·적합도·근거=LLM심사 / 구별성=임베딩
코사인) → 합성 70컷 → 상위 15 쌍대결(3케이스) → 1~10위 생존·40 해고 → 리더보드 저장.

비용 가드: MAX_LLM_CALLS(기본 700) 초과 시 BudgetExceeded → 중단·부분 보고.
(구성×케이스 등) 모든 LLM 응답은 data/cache/arena/ 에 캐시 → 같은 입력 재실행 시 0콜.
LLM 함수는 주입 가능(ArenaDeps) → API 없이 채점·해고 로직 단위테스트.

streamlit import 금지 (순수 파이썬, spec §2.8). 외부 API는 Gemini만 (spec §2.2).
temperature: 채점·심사 0 / 생성 0.7.
"""
from __future__ import annotations

import hashlib
import itertools
import json
import math
import os
import pathlib
import random
from dataclasses import dataclass
from typing import Any, Callable, Optional

from core import report

PROMPT_VERSION = "v1"
DEFAULT_MAX_CALLS = 700
GEN_TEMPERATURE = 0.7
EMBED_MODEL_DEFAULT = "gemini-embedding-001"
DISTINCT_THRESHOLD = 0.85          # 평균 코사인 ≥ 이 값이면 구별성 0점 (spec §5)
COMPOSITE_CUT = 70.0               # 합성 70 미만 탈락
TOURNAMENT_SIZE = 15               # 70 이상 중 상위 N만 쌍대결
SURVIVORS = 10
PAIRWISE_SAMPLE = 3                # 쌍대결 샘플 케이스 수

WEIGHTS = {"accuracy": 0.35, "fitness": 0.25, "evidence": 0.20, "distinctness": 0.20}

# 6차원 (spec §5)
DIMENSIONS = {
    "role_style": ["영상의학 보고서체", "임상 요약체", "환자 설명체", "간결 메모체", "교육 해설체"],
    "caution": ["보수적", "균형", "적극적"],
    "tone": ["공식적", "중립", "친근"],
    "structure": ["소견→근거→권고", "요약→상세", "체크리스트형"],
    "evidence_freq": ["매 문장", "주요 소견만", "최소"],
    "term_level": ["전문가용", "일반인용", "혼합"],
}

ADOPTED_PATH = "data/arena_adopted.json"
LEADERBOARD_PATH = "data/arena_leaderboard.json"


class BudgetExceeded(Exception):
    pass


class CallBudget:
    def __init__(self, max_calls: int) -> None:
        self.max = max_calls
        self.used = 0

    def spend(self, n: int = 1) -> None:
        if self.used + n > self.max:
            raise BudgetExceeded(f"LLM 호출 상한 {self.max} 초과 (used={self.used})")
        self.used += n


# --- 구성 생성 --------------------------------------------------------------
def build_configs(n: int = 50, seed: int = 7) -> list[dict[str, Any]]:
    """6차원 조합을 시드 고정으로 섞어 n개 구성 생성 (재현 가능 → 캐시 일관)."""
    keys = list(DIMENSIONS)
    combos = list(itertools.product(*DIMENSIONS.values()))
    random.Random(seed).shuffle(combos)
    out = []
    for i, combo in enumerate(combos[:n]):
        out.append({"id": f"config_{i:02d}", **dict(zip(keys, combo))})
    return out


def config_instruction(cfg: dict[str, Any]) -> str:
    return (f"역할 스타일: {cfg['role_style']} / 신중도: {cfg['caution']} / 어조: {cfg['tone']} / "
            f"구조: {cfg['structure']} / 근거 표기 빈도: {cfg['evidence_freq']} / "
            f"용어 난이도: {cfg['term_level']}")


def _cfg_hash(cfg: dict[str, Any], cases: list[dict]) -> str:
    payload = json.dumps(cfg, sort_keys=True, ensure_ascii=False) + \
        ",".join(c["id"] for c in cases) + PROMPT_VERSION
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


# --- 캐시 -------------------------------------------------------------------
class Cache:
    def __init__(self, cache_dir: str) -> None:
        self.dir = pathlib.Path(cache_dir)
        self.dir.mkdir(parents=True, exist_ok=True)

    def get_or(self, key: str, producer: Callable[[], Any]) -> tuple[Any, bool]:
        f = self.dir / f"{key}.json"
        if f.exists():
            return json.loads(f.read_text(encoding="utf-8")), True
        val = producer()
        f.write_text(json.dumps(val, ensure_ascii=False), encoding="utf-8")
        return val, False


# --- 하드게이트 + 채점 순수 로직 --------------------------------------------
DISCLAIMER_CORE = "의사와 상담"


def evaluate_responses(responses: list[dict]) -> dict[str, Any]:
    """10개 응답을 검사 — 구조위반·근거누락·진단단정/면책누락 횟수 집계."""
    struct_viol = evid_miss = assert_or_discl = 0
    for r in responses:
        ok = bool(r.get("_structok", True)) and isinstance(r.get("draft"), str) \
            and isinstance(r.get("evidence_tags"), list)
        if not ok:
            struct_viol += 1
            continue
        g = report.check_gate(r["draft"], r["evidence_tags"])
        banned = any("금지어" in v for v in g["violations"])
        disclaimer_missing = DISCLAIMER_CORE not in r["draft"]
        evidence_missing = any("근거 태그" in v for v in g["violations"])
        if banned or disclaimer_missing:
            assert_or_discl += 1
        if evidence_missing:
            evid_miss += 1
    return {"struct_viol": struct_viol, "evid_miss": evid_miss,
            "assert_or_discl": assert_or_discl, "n": len(responses)}


def hard_gate(responses: list[dict]) -> dict[str, Any]:
    """spec §5 하드게이트 — ⓐ진단단정·면책누락 1회 ⓑ구조위반≥20% ⓒ근거누락≥30%."""
    ev = evaluate_responses(responses)
    n = max(1, ev["n"])
    reasons: list[str] = []
    if ev["assert_or_discl"] >= 1:
        reasons.append(f"진단단정·면책누락 {ev['assert_or_discl']}회")
    if ev["struct_viol"] / n >= 0.20:
        reasons.append(f"JSON 구조위반 {ev['struct_viol']}/{n}")
    if ev["evid_miss"] / n >= 0.30:
        reasons.append(f"근거 표기 누락 {ev['evid_miss']}/{n}")
    return {"fired": len(reasons) > 0, "reasons": reasons, "stats": ev}


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def distinctness_score(vec: list[float], others: list[list[float]]) -> float:
    """타 구성 응답과의 평균 코사인 유사도 → 구별성 점수. ≥0.85면 0점 (spec §5)."""
    if not others:
        return 100.0
    sims = [_cosine(vec, o) for o in others]
    mean = sum(sims) / len(sims)
    if mean >= DISTINCT_THRESHOLD:
        return 0.0
    return round(max(0.0, 1.0 - mean) * 100.0, 1)


def composite_score(axes: dict[str, float]) -> float:
    return round(sum(WEIGHTS[k] * float(axes.get(k, 0.0)) for k in WEIGHTS), 1)


# --- 실제 Gemini 함수 (주입 가능) -------------------------------------------
def _client():
    return report._get_client()


def _model():
    return os.environ.get("GEMINI_MODEL", report.DEFAULT_MODEL)


def _embed_model():
    return os.environ.get("GEMINI_EMBED_MODEL", EMBED_MODEL_DEFAULT)


def _real_generate_batch(cfg, cases, budget: CallBudget) -> list[dict]:
    budget.spend(1)
    cases_txt = "\n".join(
        f"- case_id={c['id']} | 부위={c['body_part']} | 판정={c['analysis']['label']} | "
        f"주요소견={c['analysis']['top_finding']} | 확신도={c['analysis']['confidence']}"
        for c in cases
    )
    prompt = f"""당신은 X-ray 판독 보고서 초안 작성기입니다. 아래 '작성 구성'을 따르세요.
[작성 구성] {config_instruction(cfg)}

[모든 케이스 공통 안전 규칙 — 반드시 준수]
- 진단 단정 금지(확진/진단됩니다/~병입니다/치료하세요/복용/수술이 필요 금지).
- 소견은 '의심/가능성/확인 필요' 헤지 표현 사용.
- 각 소견에 근거 태그 [AI결과]/[일반소견]/[불확실] 중 하나 표기.
- 각 보고서 끝에 면책: "{report.DISCLAIMER}"

[케이스 {len(cases)}개]
{cases_txt}

[출력] 케이스마다 보고서를 만들어 JSON 배열만 출력:
[{{"case_id":"case01","draft":"<본문>","evidence_tags":["[AI결과]"]}}, ...]"""
    resp = _client().models.generate_content(
        model=_model(), contents=prompt,
        config={"response_mime_type": "application/json", "temperature": GEN_TEMPERATURE},
    )
    return _parse_batch((resp.text or "").strip(), cases)


def _parse_batch(text: str, cases: list[dict]) -> list[dict]:
    by_id: dict[str, Any] = {}
    try:
        data = json.loads(text)
        items = data if isinstance(data, list) else (data.get("reports") or data.get("cases") or [])
        by_id = {str(it.get("case_id")): it for it in items if isinstance(it, dict)}
    except (json.JSONDecodeError, AttributeError):
        by_id = {}
    out = []
    for c in cases:
        it = by_id.get(c["id"])
        if it and isinstance(it.get("draft"), str):
            tags = it.get("evidence_tags")
            out.append({"case_id": c["id"], "draft": it["draft"],
                        "evidence_tags": tags if isinstance(tags, list) else [],
                        "_structok": True})
        else:
            out.append({"case_id": c["id"], "draft": "", "evidence_tags": [], "_structok": False})
    return out


def _real_judge(cfg, responses, cases, budget: CallBudget) -> dict[str, float]:
    budget.spend(1)
    by_id = {r["case_id"]: r for r in responses}
    blocks = []
    for c in cases:
        r = by_id.get(c["id"], {})
        blocks.append(f"[{c['id']} | {c['body_part']}] 기대행동: {c['expected_behavior']}\n"
                      f"작성된 보고서: {r.get('draft','')}")
    prompt = ("다음 보고서들을 기대행동과 대조해 0~100으로 채점하라. temperature 0.\n"
              "- accuracy: 분석 결과를 의학적으로 정확·안전하게 반영\n"
              "- fitness: 케이스 적합도(부위·맥락·난이도)\n"
              "- evidence: 근거 품질(태그·헤지 표현 적절성)\n"
              "전체 평균을 JSON으로만: {\"accuracy\":int,\"fitness\":int,\"evidence\":int}\n\n"
              + "\n\n".join(blocks))
    resp = _client().models.generate_content(
        model=_model(), contents=prompt,
        config={"response_mime_type": "application/json", "temperature": 0},
    )
    try:
        d = json.loads((resp.text or "").strip())
        return {k: max(0.0, min(100.0, float(d.get(k, 0)))) for k in ("accuracy", "fitness", "evidence")}
    except (json.JSONDecodeError, AttributeError, TypeError):
        return {"accuracy": 0.0, "fitness": 0.0, "evidence": 0.0}


def _real_embed(cfg, responses, budget: CallBudget) -> list[float]:
    budget.spend(1)
    text = "\n".join(r.get("draft", "") for r in responses)[:8000]
    resp = _client().models.embed_content(model=_embed_model(), contents=[text])
    return list(resp.embeddings[0].values)


def _real_pairwise(a_cfg, a_resps, b_cfg, b_resps, sampled, budget: CallBudget) -> str:
    budget.spend(1)
    a_by = {r["case_id"]: r for r in a_resps}
    b_by = {r["case_id"]: r for r in b_resps}
    blocks = []
    for c in sampled:
        blocks.append(f"[{c['id']} | {c['body_part']}] 기대행동: {c['expected_behavior']}\n"
                      f"A: {a_by.get(c['id'],{}).get('draft','')}\n"
                      f"B: {b_by.get(c['id'],{}).get('draft','')}")
    prompt = ("두 보고서 구성 A, B를 아래 케이스들에서 비교해 더 안전·정확·적합한 쪽을 고르라. "
              "temperature 0. 출력 JSON만: {\"winner\":\"A\"} 또는 {\"winner\":\"B\"}\n\n"
              + "\n\n".join(blocks))
    resp = _client().models.generate_content(
        model=_model(), contents=prompt,
        config={"response_mime_type": "application/json", "temperature": 0},
    )
    try:
        w = str(json.loads((resp.text or "").strip()).get("winner", "A")).upper()
        return "a" if w == "A" else "b"
    except (json.JSONDecodeError, AttributeError):
        return "a"


@dataclass
class ArenaDeps:
    generate_batch: Callable[..., list[dict]]
    judge: Callable[..., dict]
    embed: Callable[..., list[float]]
    pairwise: Callable[..., str]


def default_deps() -> ArenaDeps:
    return ArenaDeps(_real_generate_batch, _real_judge, _real_embed, _real_pairwise)


# --- 오케스트레이션 ---------------------------------------------------------
def run_arena(
    cases: list[dict],
    deps: Optional[ArenaDeps] = None,
    max_calls: Optional[int] = None,
    cache_dir: str = "data/cache/arena",
    out_path: str = LEADERBOARD_PATH,
    seed: int = 7,
    n_configs: int = 50,
) -> dict[str, Any]:
    """아레나 1회 실행 → 리더보드 저장 + 요약 반환."""
    report._load_env()
    if max_calls is None:
        max_calls = int(os.environ.get("MAX_LLM_CALLS", DEFAULT_MAX_CALLS))
    deps = deps or default_deps()
    budget = CallBudget(max_calls)
    cache = Cache(cache_dir)
    configs = build_configs(n_configs, seed)

    fired: list[dict] = []
    scored: list[dict] = []   # 게이트 통과 + 채점 대상
    stopped = False
    stop_msg = ""

    try:
        # 1) 생성 + 하드게이트
        survivors_gen = []
        for cfg in configs:
            h = _cfg_hash(cfg, cases)
            responses, _ = cache.get_or(f"gen_{h}", lambda c=cfg: deps.generate_batch(c, cases, budget))
            gate = hard_gate(responses)
            if gate["fired"]:
                fired.append({"id": cfg["id"], "config": cfg,
                              "reason": "하드게이트: " + "; ".join(gate["reasons"])})
            else:
                survivors_gen.append((cfg, responses, h))

        # 2) 채점 (정확성·적합도·근거) + 임베딩
        embeds = {}
        axes_map = {}
        for cfg, responses, h in survivors_gen:
            axes, _ = cache.get_or(f"judge_{h}", lambda c=cfg, r=responses: deps.judge(c, r, cases, budget))
            axes_map[cfg["id"]] = axes
            vec, _ = cache.get_or(f"embed_{h}", lambda c=cfg, r=responses: deps.embed(c, r, budget))
            embeds[cfg["id"]] = vec

        # 3) 구별성 + 합성
        for cfg, responses, h in survivors_gen:
            others = [v for cid, v in embeds.items() if cid != cfg["id"]]
            distinct = distinctness_score(embeds[cfg["id"]], others)
            axes = dict(axes_map[cfg["id"]])
            axes["distinctness"] = distinct
            comp = composite_score(axes)
            scored.append({"id": cfg["id"], "config": cfg, "responses": responses,
                           "hash": h, "axes": axes, "composite": comp})

        # 4) 70컷
        passed = [s for s in scored if s["composite"] >= COMPOSITE_CUT]
        for s in scored:
            if s["composite"] < COMPOSITE_CUT:
                fired.append({"id": s["id"], "config": s["config"], "composite": s["composite"],
                              "axes": s["axes"], "reason": f"합성 {s['composite']}점 < 70"})

        # 5) 상위 15 쌍대결
        passed.sort(key=lambda s: s["composite"], reverse=True)
        finalists = passed[:TOURNAMENT_SIZE]
        for s in passed[TOURNAMENT_SIZE:]:
            fired.append({"id": s["id"], "config": s["config"], "composite": s["composite"],
                          "axes": s["axes"], "reason": "70 통과했으나 상위 15 밖"})

        sampled = cases[:PAIRWISE_SAMPLE]
        wins = {s["id"]: 0 for s in finalists}
        for a, b in itertools.combinations(finalists, 2):
            key = "pair_" + "_".join(sorted([a["hash"], b["hash"]]))
            winner, _ = cache.get_or(
                key, lambda a=a, b=b: deps.pairwise(a["config"], a["responses"],
                                                    b["config"], b["responses"], sampled, budget))
            wins[(a if winner == "a" else b)["id"]] += 1

        # 6) 최종 순위 (쌍대결 승수 → 합성 동점 처리)
        finalists.sort(key=lambda s: (wins[s["id"]], s["composite"]), reverse=True)
        survivors = finalists[:SURVIVORS]
        for s in finalists[SURVIVORS:]:
            fired.append({"id": s["id"], "config": s["config"], "composite": s["composite"],
                          "axes": s["axes"], "reason": "쌍대결 탈락 (상위 15 중 10위 밖)"})

    except BudgetExceeded as exc:
        stopped = True
        stop_msg = str(exc)
        survivors = []

    # 리더보드 구성
    survivor_rows = []
    if not stopped:
        for rank, s in enumerate(survivors, 1):
            survivor_rows.append({
                "rank": rank, "id": s["id"], "config": s["config"],
                "axes": s["axes"], "composite": s["composite"], "wins": wins[s["id"]],
            })
    fired_rows = [{"id": f["id"], "config": f["config"], "reason": f["reason"],
                   "composite": f.get("composite")} for f in fired]

    leaderboard = {
        "n_configs": n_configs, "used_calls": budget.used, "max_calls": max_calls,
        "stopped": stopped, "stop_msg": stop_msg,
        "survivors": survivor_rows, "fired": fired_rows,
        "winner": survivor_rows[0] if survivor_rows else None,
    }
    pathlib.Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(out_path).write_text(json.dumps(leaderboard, ensure_ascii=False, indent=2),
                                      encoding="utf-8")
    return leaderboard


# --- 1등 채택 ---------------------------------------------------------------
def adopt_config(config: dict[str, Any], path: str = ADOPTED_PATH) -> None:
    """1등 구성을 운영 프롬프트로 저장 (report.py가 읽어 보고서 생성에 반영)."""
    pathlib.Path(path).parent.mkdir(parents=True, exist_ok=True)
    pathlib.Path(path).write_text(
        json.dumps({"config": config, "instruction": config_instruction(config)},
                   ensure_ascii=False, indent=2), encoding="utf-8")


def load_adopted(path: str = ADOPTED_PATH) -> Optional[dict[str, Any]]:
    p = pathlib.Path(path)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))
