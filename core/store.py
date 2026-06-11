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
                image_path TEXT,
                status TEXT DEFAULT 'uploaded',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        # analyses: 화면② 결과 캐시 (study당 1건 — 재분석 시 즉시 반환, ②AC)
        self.conn.execute(
            """
            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                study_id INTEGER UNIQUE NOT NULL,
                label TEXT,
                confidence REAL,
                top_finding TEXT,
                elapsed_ms REAL,
                model TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (study_id) REFERENCES studies(id)
            )
            """
        )
        self.conn.commit()
        self._migrate()

    def _migrate(self) -> None:
        """기존 D1 DB(image_path 없음)에 컬럼을 방어적으로 추가."""
        cols = [r[1] for r in self.conn.execute("PRAGMA table_info(studies)")]
        if "image_path" not in cols:
            self.conn.execute("ALTER TABLE studies ADD COLUMN image_path TEXT")
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

    def set_image_path(self, study_id: int, image_path: str) -> None:
        """업로드 시 저장한 비식별 이미지 경로를 study에 기록 (화면②가 다시 읽음)."""
        self.conn.execute(
            "UPDATE studies SET image_path = ? WHERE id = ?", (image_path, study_id)
        )
        self.conn.commit()

    def get_study(self, study_id: int) -> Optional[sqlite3.Row]:
        return self.conn.execute(
            "SELECT * FROM studies WHERE id = ?", (study_id,)
        ).fetchone()

    def list_studies(self, limit: int = 100) -> list[sqlite3.Row]:
        return self.conn.execute(
            "SELECT * FROM studies ORDER BY created_at DESC, id DESC LIMIT ?",
            (limit,),
        ).fetchall()

    def add_analysis(
        self,
        study_id: int,
        label: str,
        confidence: float,
        top_finding: Optional[str],
        elapsed_ms: float,
        model: str,
    ) -> int:
        """분석 결과를 캐시한다 (study당 1건 — 재실행 시 덮어쓰기)."""
        cur = self.conn.execute(
            """
            INSERT INTO analyses (study_id, label, confidence, top_finding, elapsed_ms, model)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(study_id) DO UPDATE SET
                label=excluded.label, confidence=excluded.confidence,
                top_finding=excluded.top_finding, elapsed_ms=excluded.elapsed_ms,
                model=excluded.model, created_at=CURRENT_TIMESTAMP
            """,
            (study_id, label, confidence, top_finding, elapsed_ms, model),
        )
        self.conn.commit()
        return int(cur.lastrowid)

    def get_analysis(self, study_id: int) -> Optional[sqlite3.Row]:
        """캐시된 분석 결과 (없으면 None) — 화면②의 '재분석 즉시 표시'에 사용."""
        return self.conn.execute(
            "SELECT * FROM analyses WHERE study_id = ?", (study_id,)
        ).fetchone()

    def close(self) -> None:
        self.conn.close()
