"""arena 단위 테스트 — 채점·해고·선발 로직을 가짜 응답으로 검증 (Gemini 미호출)."""
import json

from core import arena, report

CASES = json.load(open("data/benchmark_cases.json", encoding="utf-8"))["cases"]


# --- 구성 생성 --------------------------------------------------------------
def test_build_configs_50_distinct():
    cfgs = arena.build_configs(50)
    assert len(cfgs) == 50
    assert len({c["id"] for c in cfgs}) == 50
    for c in cfgs:
        assert set(arena.DIMENSIONS) <= set(c)
    # 시드 고정 → 재현 가능 (캐시 일관성)
    assert arena.build_configs(50) == cfgs


# --- 하드게이트 -------------------------------------------------------------
def _good(n=10):
    return [{"case_id": f"case{i:02d}", "_structok": True,
             "draft": "관절 간격 협소가 의심됩니다. 확인 필요. [AI결과] " + report.DISCLAIMER,
             "evidence_tags": ["[AI결과]"]} for i in range(1, n + 1)]


def test_hard_gate_passes_clean():
    assert arena.hard_gate(_good())["fired"] is False


def test_hard_gate_fires_on_banned_or_missing_disclaimer():
    r = _good()
    r[0]["draft"] = "퇴행성 관절염으로 확진됩니다."   # 금지어 + 면책 없음
    g = arena.hard_gate(r)
    assert g["fired"] is True
    assert any("진단단정" in x for x in g["reasons"])


def test_hard_gate_fires_on_structure_violation():
    r = _good()
    r[0]["_structok"] = False
    r[1]["_structok"] = False   # 2/10 = 20%
    g = arena.hard_gate(r)
    assert g["fired"] is True
    assert any("구조위반" in x for x in g["reasons"])


def test_hard_gate_fires_on_evidence_missing():
    r = _good()
    for i in range(3):          # 3/10 = 30%
        r[i]["draft"] = "관절 간격 협소가 의심됩니다. " + report.DISCLAIMER  # 태그 없음
        r[i]["evidence_tags"] = []
    g = arena.hard_gate(r)
    assert g["fired"] is True
    assert any("근거" in x for x in g["reasons"])


# --- 채점 수학 --------------------------------------------------------------
def test_composite_weights():
    axes = {"accuracy": 100, "fitness": 100, "evidence": 100, "distinctness": 100}
    assert arena.composite_score(axes) == 100.0
    axes = {"accuracy": 80, "fitness": 60, "evidence": 70, "distinctness": 0}
    # 0.35*80 + 0.25*60 + 0.2*70 + 0.2*0 = 28+15+14+0 = 57
    assert arena.composite_score(axes) == 57.0


def test_distinctness_zero_when_too_similar():
    v = [1.0, 0.0, 0.0]
    assert arena.distinctness_score(v, [v, v]) == 0.0          # 동일 → 코사인 1.0 ≥0.85 → 0
    assert arena.distinctness_score(v, [[0.0, 1.0, 0.0]]) > 0  # 직교 → 구별성 있음
    assert arena.distinctness_score(v, []) == 100.0            # 유일


# --- 전체 파이프라인 (가짜 deps) --------------------------------------------
def _fake_deps():
    def gen(cfg, cases, budget):
        budget.spend(1)
        i = int(cfg["id"].split("_")[1])
        out = []
        for j, c in enumerate(cases):
            draft = (f"{c['body_part']} 소견이 의심됩니다. 추가 확인 필요. [AI결과] "
                     + report.DISCLAIMER)
            if i % 13 == 0 and j == 0:        # 일부 구성은 하드게이트 탈락(금지어)
                draft = "확진됩니다. " + draft
            out.append({"case_id": c["id"], "draft": draft,
                        "evidence_tags": ["[AI결과]"], "_structok": True})
        return out

    def judge(cfg, responses, cases, budget):
        budget.spend(1)
        i = int(cfg["id"].split("_")[1])
        base = 50 + (i * 7 % 50)              # 50..99 스프레드
        return {"accuracy": base, "fitness": base, "evidence": base}

    def embed(cfg, responses, budget):
        budget.spend(1)
        i = int(cfg["id"].split("_")[1])
        v = [0.0] * 50
        v[i % 50] = 1.0                        # 서로 직교 → 구별성 확보
        return v

    def pairwise(a_cfg, a_resps, b_cfg, b_resps, sampled, budget):
        budget.spend(1)
        ia = int(a_cfg["id"].split("_")[1])
        ib = int(b_cfg["id"].split("_")[1])
        return "a" if ia > ib else "b"
    return arena.ArenaDeps(gen, judge, embed, pairwise)


def test_run_arena_full_pipeline(tmp_path):
    lb = arena.run_arena(
        CASES, deps=_fake_deps(), max_calls=700,
        cache_dir=str(tmp_path / "cache"), out_path=str(tmp_path / "lb.json"), seed=7,
    )
    assert lb["stopped"] is False
    assert len(lb["survivors"]) == 10                 # 생존 10
    assert len(lb["fired"]) == 40                     # 해고 40
    assert lb["winner"]["rank"] == 1
    assert lb["used_calls"] <= 700                    # 상한 이내
    # 해고 사유가 모두 기록됨
    assert all(f["reason"] for f in lb["fired"])
    # 리더보드 파일 생성 (④AC)
    assert (tmp_path / "lb.json").exists()
    # 순위는 합성/승수 내림차순
    comps = [s["composite"] for s in lb["survivors"]]
    assert comps == sorted(comps, reverse=True) or lb["survivors"][0]["wins"] >= lb["survivors"][-1]["wins"]


def test_run_arena_rerun_uses_cache_zero_calls(tmp_path):
    cache = str(tmp_path / "cache")
    out = str(tmp_path / "lb.json")
    first = arena.run_arena(CASES, deps=_fake_deps(), max_calls=700, cache_dir=cache, out_path=out)
    assert first["used_calls"] > 0
    second = arena.run_arena(CASES, deps=_fake_deps(), max_calls=700, cache_dir=cache, out_path=out)
    assert second["used_calls"] == 0                  # 재실행 — 전부 캐시 (④AC)
    assert len(second["survivors"]) == 10


def test_run_arena_budget_guard_stops(tmp_path):
    lb = arena.run_arena(CASES, deps=_fake_deps(), max_calls=5,
                         cache_dir=str(tmp_path / "cache"), out_path=str(tmp_path / "lb.json"))
    assert lb["stopped"] is True                      # 상한 초과 → 중단·보고
    assert lb["used_calls"] <= 5


def test_adopt_and_load(tmp_path):
    p = str(tmp_path / "adopted.json")
    cfg = arena.build_configs(50)[0]
    arena.adopt_config(cfg, path=p)
    loaded = arena.load_adopted(p)
    assert loaded["config"]["id"] == cfg["id"]
    assert "instruction" in loaded
