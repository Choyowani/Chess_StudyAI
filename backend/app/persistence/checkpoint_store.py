from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from backend.app.analysis.engine_service import AnalysisResult, CandidateMove, EvaluationScore
from backend.app.coaching.feedback_service import MoveFeedback
from backend.app.domain.game_state import MoveRecord
from backend.app.persistence.models import GameReviewEntry


@dataclass(frozen=True, slots=True)
class InProgressGameSummary:
    game_id: str
    user_id: str
    current_fen: str
    started_at: str
    updated_at: str
    status: str
    user_color: str
    move_count: int


@dataclass(frozen=True, slots=True)
class InProgressGameRecord:
    game_id: str
    user_id: str
    initial_fen: str
    current_fen: str
    started_at: str
    updated_at: str
    status: str
    user_color: str
    move_history: tuple[MoveRecord, ...]
    review_entries: tuple[GameReviewEntry, ...]


class SqliteGameCheckpointRepository:
    """Stores durable checkpoints for unfinished live games."""

    def __init__(self, db_path: str | Path = "data/chess_study.db") -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_schema()

    def save_checkpoint(
        self,
        *,
        game_id: str,
        user_id: str,
        initial_fen: str,
        current_fen: str,
        started_at: datetime,
        updated_at: datetime,
        status: str,
        user_color: str,
        move_history: tuple[MoveRecord, ...],
        review_entries: tuple[GameReviewEntry, ...],
    ) -> None:
        if len(move_history) == 0:
            self.delete_checkpoint(game_id)
            return

        with sqlite3.connect(self._db_path) as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO in_progress_games (
                    game_id, user_id, initial_fen, current_fen, started_at, updated_at, status, user_color, move_history_json, review_entries_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    game_id,
                    user_id,
                    initial_fen,
                    current_fen,
                    started_at.astimezone(timezone.utc).isoformat(),
                    updated_at.astimezone(timezone.utc).isoformat(),
                    status,
                    user_color,
                    json.dumps([asdict(item) for item in move_history], ensure_ascii=True),
                    json.dumps([self._review_entry_json(item) for item in review_entries], ensure_ascii=True),
                ),
            )
            connection.commit()

    def load_checkpoint(self, game_id: str) -> InProgressGameRecord | None:
        with sqlite3.connect(self._db_path) as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute(
                "SELECT * FROM in_progress_games WHERE game_id = ?",
                (game_id,),
            ).fetchone()
        if row is None:
            return None
        move_history = tuple(MoveRecord(**item) for item in json.loads(row["move_history_json"]))
        if len(move_history) == 0:
            self.delete_checkpoint(game_id)
            return None
        return InProgressGameRecord(
            game_id=row["game_id"],
            user_id=row["user_id"],
            initial_fen=row["initial_fen"],
            current_fen=row["current_fen"],
            started_at=row["started_at"],
            updated_at=row["updated_at"],
            status=row["status"],
            user_color=row["user_color"],
            move_history=move_history,
            review_entries=tuple(self._parse_review_entry(item) for item in json.loads(row["review_entries_json"])),
        )

    def list_checkpoints(self, *, limit: int = 50) -> list[InProgressGameSummary]:
        self._purge_zero_move_checkpoints()
        with sqlite3.connect(self._db_path) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT game_id, user_id, current_fen, started_at, updated_at, status, user_color,
                       json_array_length(move_history_json) AS move_count
                FROM in_progress_games
                WHERE json_array_length(move_history_json) > 0
                ORDER BY updated_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [
            InProgressGameSummary(
                game_id=row["game_id"],
                user_id=row["user_id"],
                current_fen=row["current_fen"],
                started_at=row["started_at"],
                updated_at=row["updated_at"],
                status=row["status"],
                user_color=row["user_color"],
                move_count=row["move_count"],
            )
            for row in rows
        ]

    def delete_checkpoint(self, game_id: str) -> None:
        with sqlite3.connect(self._db_path) as connection:
            connection.execute("DELETE FROM in_progress_games WHERE game_id = ?", (game_id,))
            connection.commit()

    def _purge_zero_move_checkpoints(self) -> None:
        with sqlite3.connect(self._db_path) as connection:
            connection.execute(
                """
                DELETE FROM in_progress_games
                WHERE json_array_length(move_history_json) = 0
                """
            )
            connection.commit()

    def _initialize_schema(self) -> None:
        with sqlite3.connect(self._db_path) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS in_progress_games (
                    game_id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    initial_fen TEXT NOT NULL,
                    current_fen TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    status TEXT NOT NULL,
                    user_color TEXT NOT NULL,
                    move_history_json TEXT NOT NULL,
                    review_entries_json TEXT NOT NULL
                )
                """
            )
            connection.commit()

    @staticmethod
    def _review_entry_json(entry: GameReviewEntry) -> dict[str, object]:
        return {
            "move_record": asdict(entry.move_record),
            "analysis_before": SqliteGameCheckpointRepository._analysis_json(entry.analysis_before),
            "analysis_after": SqliteGameCheckpointRepository._analysis_json(entry.analysis_after),
            "feedback": asdict(entry.feedback) if entry.feedback is not None else None,
        }

    @staticmethod
    def _analysis_json(analysis: AnalysisResult | None) -> dict[str, object] | None:
        return asdict(analysis) if analysis is not None else None

    @staticmethod
    def _parse_review_entry(payload: dict[str, object]) -> GameReviewEntry:
        return GameReviewEntry(
            move_record=MoveRecord(**payload["move_record"]),
            analysis_before=SqliteGameCheckpointRepository._parse_analysis(payload.get("analysis_before")),
            analysis_after=SqliteGameCheckpointRepository._parse_analysis(payload.get("analysis_after")),
            feedback=MoveFeedback(**payload["feedback"]) if payload.get("feedback") is not None else None,
        )

    @staticmethod
    def _parse_analysis(payload: object) -> AnalysisResult | None:
        if payload is None:
            return None
        typed = payload if isinstance(payload, dict) else {}
        top_moves = tuple(SqliteGameCheckpointRepository._parse_candidate(item) for item in typed.get("top_moves", []))
        best_move_payload = typed.get("best_move")
        if not isinstance(best_move_payload, dict):
            return None
        return AnalysisResult(
            fen=typed["fen"],
            best_move=SqliteGameCheckpointRepository._parse_candidate(best_move_payload),
            top_moves=top_moves,
            evaluation=SqliteGameCheckpointRepository._parse_score(typed["evaluation"]),
        )

    @staticmethod
    def _parse_candidate(payload: dict[str, object]) -> CandidateMove:
        return CandidateMove(
            rank=payload["rank"],
            move_uci=payload["move_uci"],
            move_san=payload["move_san"],
            score=SqliteGameCheckpointRepository._parse_score(payload["score"]),
            principal_variation_uci=tuple(payload.get("principal_variation_uci", [])),
            principal_variation_san=tuple(payload.get("principal_variation_san", [])),
        )

    @staticmethod
    def _parse_score(payload: dict[str, object]) -> EvaluationScore:
        return EvaluationScore(
            perspective=payload["perspective"],
            centipawns=payload.get("centipawns"),
            mate=payload.get("mate"),
        )
