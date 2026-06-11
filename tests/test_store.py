"""store 단위 테스트 — studies 테이블 INSERT/조회 (임시 db 파일)."""
from core.store import Store


def test_add_and_list_study(tmp_path):
    db = str(tmp_path / "test.db")
    store = Store(db)
    rid = store.add_study(
        anon_patient_id="ANON-DEADBEEF",
        source_filename="CT_small.dcm",
        modality="CT",
        body_part="",
        num_removed_tags=5,
        num_blurred_regions=0,
    )
    assert rid == 1

    rows = store.list_studies()
    assert len(rows) == 1
    row = rows[0]
    assert row["source_filename"] == "CT_small.dcm"
    assert row["modality"] == "CT"
    assert row["anon_patient_id"] == "ANON-DEADBEEF"
    assert row["num_removed_tags"] == 5
    assert row["status"] == "uploaded"
    assert row["created_at"] is not None
    store.close()


def test_db_file_created(tmp_path):
    db = tmp_path / "made.db"
    store = Store(str(db))
    store.add_study(anon_patient_id="ANON-1", source_filename="x.dcm")
    assert db.exists()
    store.close()


def test_image_path_set_and_get(tmp_path):
    store = Store(str(tmp_path / "t.db"))
    sid = store.add_study(anon_patient_id="ANON-1", source_filename="x.dcm")
    store.set_image_path(sid, "data/cache/study_1.png")
    row = store.get_study(sid)
    assert row["image_path"] == "data/cache/study_1.png"
    store.close()


def test_analysis_cache_upsert(tmp_path):
    """study당 1건 — 재분석 시 덮어쓰기(중복 행 생성 안 함)."""
    store = Store(str(tmp_path / "t.db"))
    sid = store.add_study(anon_patient_id="ANON-1", source_filename="x.dcm")
    assert store.get_analysis(sid) is None  # 분석 전엔 캐시 없음

    store.add_analysis(sid, "정상 범위", 0.81, "Effusion", 123.4, "densenet121-res224-all")
    first = store.get_analysis(sid)
    assert first["label"] == "정상 범위"
    assert abs(first["confidence"] - 0.81) < 1e-6
    assert first["elapsed_ms"] == 123.4

    # 같은 study 재분석 → UPDATE (행 1건 유지)
    store.add_analysis(sid, "이상 소견 의심", 0.92, "Pneumonia", 88.0, "densenet121-res224-all")
    again = store.get_analysis(sid)
    assert again["label"] == "이상 소견 의심"
    cnt = store.conn.execute("SELECT COUNT(*) FROM analyses WHERE study_id=?", (sid,)).fetchone()[0]
    assert cnt == 1
    store.close()


def test_migration_adds_image_path_to_legacy_db(tmp_path):
    """image_path 없는 구(舊) studies 테이블에 마이그레이션이 컬럼을 추가한다."""
    import sqlite3
    db = str(tmp_path / "legacy.db")
    conn = sqlite3.connect(db)
    conn.execute(
        "CREATE TABLE studies (id INTEGER PRIMARY KEY AUTOINCREMENT, "
        "anon_patient_id TEXT, source_filename TEXT)"
    )
    conn.commit()
    conn.close()

    store = Store(db)  # _migrate가 image_path 추가해야 함
    cols = [r[1] for r in store.conn.execute("PRAGMA table_info(studies)")]
    assert "image_path" in cols
    store.close()
