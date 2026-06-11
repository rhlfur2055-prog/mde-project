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
