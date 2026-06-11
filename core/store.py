"""store.py — SQLite 저장 (D1: studies 테이블 최소 구현).

업로드된 비식별 스터디 1건을 기록한다. analyses·arena_runs 테이블은 이후 단계(D3+)에서 확장.
yolo11 db.py의 SQLite CREATE/INSERT 패턴 이식. streamlit을 import하지 않는 순수 파이썬 모듈.
"""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Optional

DEFAULT_DB_PATH = "data/medgate.db"


class Store:
    """MedGate SQLite 저장소. D1에서는 studies 테이블만 사용한다."""

    def __init__(self, db_path: Optional[str] = None) -> None:
        path = db_path or DEFAULT_DB_PATH
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._create_tables()

    def _create_tables(self) -> None:
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS studies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                anon_patient_id TEXT,
                source_filename TEXT,
                modality TEXT,
                body_part TEXT,
                num_removed_tags INTEGER DEFAULT 0,
                num_blurred_regions INTEGER DEFAULT 0,
                status TEXT DEFAULT 'uploaded',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        self.conn.commit()

    def add_study(
        self,
        *,
        anon_patient_id: str,
        source_filename: str,
        modality: str = "",
        body_part: str = "",
        num_removed_tags: int = 0,
        num_blurred_regions: int = 0,
        status: str = "uploaded",
    ) -> int:
        """studies에 1행 INSERT하고 새 id를 반환한다."""
        cur = self.conn.execute(
            """
            INSERT INTO studies
            (anon_patient_id, source_filename, modality, body_part,
             num_removed_tags, num_blurred_regions, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (anon_patient_id, source_filename, modality, body_part,
             num_removed_tags, num_blurred_regions, status),
        )
        self.conn.commit()
        return int(cur.lastrowid)

    def list_studies(self, limit: int = 100) -> list[sqlite3.Row]:
        return self.conn.execute(
            "SELECT * FROM studies ORDER BY created_at DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()

    def close(self) -> None:
        self.conn.close()
