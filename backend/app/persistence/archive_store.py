from __future__ import annotations

import json
import sqlite3
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import chess
import chess.pgn

from backend.app.analysis.engine_service import AnalysisResult
from backend.app.domain.game_state import MoveRecord
from backend.app.coaching.review_service import GameReviewReport
from backend.app.coaching.weakness_service import UserWeaknessSummaryItem, WeaknessOccurrence
from backend.app.persistence.models import GameReviewEntry


@dataclass(frozen=True, slots=True)
class ArchivedMoveLog:
    ply_index: int
    side_to_move_before: str
    before_fen: str
    move_uci: str
    move_san: str
    after_fen: str
    best_move_uci: str | None
    best_move_san: str | None
    top_candidate_moves: list[dict[str, object]]
    move_quality_label: str | None
    short_coaching_note: str | None
    current_plan: str | None
    pattern_tags: list[dict[str, str]]


@dataclass(frozen=True, slots=True)
class ArchivedGameRecord:
    id: str
    user_id: str
    started_at: str
    finished_at: str
    result: str | None
    user_color: str
    initial_fen: str
    final_fen: str
    pgn: str
    summary_text: str | None
    review_report: GameReviewReport | None
    move_logs: list[ArchivedMoveLog]


@dataclass(frozen=True, slots=True)
class ArchivedGameSummary:
    game_id: str
    started_at: str
    finished_at: str
    result: str | None
    user_color: str
    move_count: int
    summary_preview: str | None


class SqliteGameArchiveRepository:
    """Stores completed game logs in a local SQLite database."""

    def __init__(self, db_path: str | Path = "data/chess_study.db") -> None:
        self._db_path = Path(db_path)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize_schema()

    def save_completed_game(
        self,
        *,
        game_id: str,
        user_id: str,
        started_at: datetime,
        finished_at: datetime,
        result: str | None,
        user_color: str,
        initial_fen: str,
        final_fen: str,
        summary_text: str | None,
        review_report: GameReviewReport | None,
        move_history: tuple[MoveRecord, ...],
        review_entries: tuple[GameReviewEntry, ...],
        weakness_occurrences: tuple[WeaknessOccurrence, ...],
    ) -> None:
        pgn_text = self._build_pgn(initial_fen, move_history)
        occurrences_by_ply: dict[int, list[WeaknessOccurrence]] = {}
        for occurrence in weakness_occurrences:
            occurrences_by_ply.setdefault(occurrence.ply_index, []).append(occurrence)
        with sqlite3.connect(self._db_path) as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO games (
                    id, user_id, started_at, finished_at, result, user_color, initial_fen, final_fen, pgn, summary_text, review_report_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    game_id,
                    user_id,
                    started_at.astimezone(timezone.utc).isoformat(),
                    finished_at.astimezone(timezone.utc).isoformat(),
                    result,
                    user_color,
                    initial_fen,
                    final_fen,
                    pgn_text,
                    summary_text,
                    json.dumps(asdict(review_report), ensure_ascii=True) if review_report else None,
                ),
            )
            connection.execute("DELETE FROM move_logs WHERE game_id = ?", (game_id,))

            for entry in review_entries:
                move_record = entry.move_record
                analysis_before = entry.analysis_before
                feedback = entry.feedback
                connection.execute(
                    """
                    INSERT INTO move_logs (
                        game_id,
                        ply_index,
                        side_to_move_before,
                        before_fen,
                        move_uci,
                        move_san,
                        after_fen,
                        best_move_uci,
                        best_move_san,
                        top_moves_json,
                        move_quality_label,
                        short_coaching_note,
                        current_plan,
                        pattern_tags_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        game_id,
                        move_record.ply_index,
                        move_record.side_to_move_before,
                        move_record.before_fen,
                        move_record.move_uci,
                        move_record.move_san,
                        move_record.after_fen,
                        analysis_before.best_move.move_uci if analysis_before else None,
                        analysis_before.best_move.move_san if analysis_before else None,
                        json.dumps(self._top_moves_json(analysis_before), ensure_ascii=True),
                        feedback.move_quality_label if feedback else None,
                        feedback.short_explanation if feedback else None,
                        feedback.current_plan if feedback else None,
                        json.dumps(
                            [
                                {
                                    "pattern_type": occurrence.pattern_type,
                                    "pattern_key": occurrence.pattern_key,
                                    "note": occurrence.note,
                                }
                                for occurrence in occurrences_by_ply.get(move_record.ply_index, [])
                            ],
                            ensure_ascii=True,
                        ),
                    ),
                )

            for occurrence in weakness_occurrences:
                connection.execute(
                    """
                    INSERT INTO user_patterns (user_id, pattern_type, pattern_key, frequency, last_seen_at, notes)
                    VALUES (?, ?, ?, 1, ?, ?)
                    ON CONFLICT(user_id, pattern_type, pattern_key)
                    DO UPDATE SET
                        frequency = frequency + 1,
                        last_seen_at = excluded.last_seen_at,
                        notes = excluded.notes
                    """,
                    (
                        user_id,
                        occurrence.pattern_type,
                        occurrence.pattern_key,
                        finished_at.astimezone(timezone.utc).isoformat(),
                        occurrence.note,
                    ),
                )
            connection.commit()

    def load_game(self, game_id: str) -> ArchivedGameRecord | None:
        with sqlite3.connect(self._db_path) as connection:
            connection.row_factory = sqlite3.Row
            game_row = connection.execute("SELECT * FROM games WHERE id = ?", (game_id,)).fetchone()
            if game_row is None:
                return None

            move_rows = connection.execute(
                "SELECT * FROM move_logs WHERE game_id = ? ORDER BY ply_index ASC",
                (game_id,),
            ).fetchall()

        return ArchivedGameRecord(
            id=game_row["id"],
            user_id=game_row["user_id"],
            started_at=game_row["started_at"],
            finished_at=game_row["finished_at"],
            result=game_row["result"],
            user_color=game_row["user_color"],
            initial_fen=game_row["initial_fen"],
            final_fen=game_row["final_fen"],
            pgn=game_row["pgn"],
            summary_text=game_row["summary_text"],
            review_report=self._parse_review_report(game_row["review_report_json"]),
            move_logs=[
                ArchivedMoveLog(
                    ply_index=row["ply_index"],
                    side_to_move_before=row["side_to_move_before"],
                    before_fen=row["before_fen"],
                    move_uci=row["move_uci"],
                    move_san=row["move_san"],
                    after_fen=row["after_fen"],
                    best_move_uci=row["best_move_uci"],
                    best_move_san=row["best_move_san"],
                    top_candidate_moves=json.loads(row["top_moves_json"]),
                    move_quality_label=row["move_quality_label"],
                    short_coaching_note=row["short_coaching_note"],
                    current_plan=row["current_plan"],
                    pattern_tags=json.loads(row["pattern_tags_json"]),
                )
                for row in move_rows
            ],
        )

    def list_games(self, *, limit: int = 50) -> list[ArchivedGameSummary]:
        with sqlite3.connect(self._db_path) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT
                    games.id,
                    games.started_at,
                    games.finished_at,
                    games.result,
                    games.user_color,
                    games.summary_text,
                    COUNT(move_logs.ply_index) AS move_count
                FROM games
                LEFT JOIN move_logs ON move_logs.game_id = games.id
                GROUP BY
                    games.id,
                    games.started_at,
                    games.finished_at,
                    games.result,
                    games.user_color,
                    games.summary_text
                ORDER BY games.finished_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()

        return [
            ArchivedGameSummary(
                game_id=row["id"],
                started_at=row["started_at"],
                finished_at=row["finished_at"],
                result=row["result"],
                user_color=row["user_color"],
                move_count=row["move_count"],
                summary_preview=self._summary_preview(row["summary_text"]),
            )
            for row in rows
        ]

    def list_user_patterns(self, user_id: str, *, limit: int = 10) -> list[UserWeaknessSummaryItem]:
        with sqlite3.connect(self._db_path) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT pattern_type, pattern_key, frequency, last_seen_at, notes
                FROM user_patterns
                WHERE user_id = ?
                ORDER BY frequency DESC, last_seen_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()

        return [
            UserWeaknessSummaryItem(
                pattern_type=row["pattern_type"],
                pattern_key=row["pattern_key"],
                frequency=row["frequency"],
                last_seen_at=row["last_seen_at"],
                notes=row["notes"],
            )
            for row in rows
        ]

    def list_related_games_for_pattern(
        self,
        user_id: str,
        *,
        pattern_type: str,
        pattern_key: str,
        limit: int = 3,
    ) -> list[str]:
        pattern_type_like = self._json_like_value(pattern_type)
        pattern_key_like = self._json_like_value(pattern_key)
        with sqlite3.connect(self._db_path) as connection:
            connection.row_factory = sqlite3.Row
            rows = connection.execute(
                """
                SELECT DISTINCT games.id, games.finished_at
                FROM games
                INNER JOIN move_logs ON move_logs.game_id = games.id
                WHERE games.user_id = ?
                  AND move_logs.pattern_tags_json LIKE ?
                  AND move_logs.pattern_tags_json LIKE ?
                  ESCAPE '\\'
                ORDER BY games.finished_at DESC
                LIMIT ?
                """,
                (
                    user_id,
                    f'%\"pattern_type\": \"{pattern_type_like}\"%',
                    f'%\"pattern_key\": \"{pattern_key_like}\"%',
                    limit,
                ),
            ).fetchall()

        return [row["id"] for row in rows]

    def _initialize_schema(self) -> None:
        with sqlite3.connect(self._db_path) as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS games (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL DEFAULT 'local-user',
                    started_at TEXT NOT NULL,
                    finished_at TEXT NOT NULL,
                    result TEXT,
                    user_color TEXT NOT NULL,
                    initial_fen TEXT NOT NULL,
                    final_fen TEXT NOT NULL,
                    pgn TEXT NOT NULL,
                    summary_text TEXT
                    ,review_report_json TEXT
                );

                CREATE TABLE IF NOT EXISTS move_logs (
                    game_id TEXT NOT NULL,
                    ply_index INTEGER NOT NULL,
                    side_to_move_before TEXT NOT NULL,
                    before_fen TEXT NOT NULL,
                    move_uci TEXT NOT NULL,
                    move_san TEXT NOT NULL,
                    after_fen TEXT NOT NULL,
                    best_move_uci TEXT,
                    best_move_san TEXT,
                    top_moves_json TEXT NOT NULL,
                    move_quality_label TEXT,
                    short_coaching_note TEXT,
                    current_plan TEXT,
                    pattern_tags_json TEXT NOT NULL DEFAULT '[]',
                    PRIMARY KEY (game_id, ply_index),
                    FOREIGN KEY (game_id) REFERENCES games(id)
                );

                CREATE TABLE IF NOT EXISTS user_patterns (
                    user_id TEXT NOT NULL,
                    pattern_type TEXT NOT NULL,
                    pattern_key TEXT NOT NULL,
                    frequency INTEGER NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    notes TEXT NOT NULL,
                    PRIMARY KEY (user_id, pattern_type, pattern_key)
                );
                """
            )
            self._ensure_column(connection, "games", "user_id", "TEXT NOT NULL DEFAULT 'local-user'")
            self._ensure_column(connection, "games", "review_report_json", "TEXT")
            self._ensure_column(connection, "move_logs", "pattern_tags_json", "TEXT NOT NULL DEFAULT '[]'")
            connection.commit()

    @staticmethod
    def _ensure_column(connection: sqlite3.Connection, table_name: str, column_name: str, ddl: str) -> None:
        columns = {row[1] for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()}
        if column_name not in columns:
            connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {ddl}")

    @staticmethod
    def _summary_preview(summary_text: str | None, *, limit: int = 140) -> str | None:
        if summary_text is None:
            return None
        normalized = " ".join(summary_text.split())
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[: limit - 3].rstrip()}..."

    @staticmethod
    def _json_like_value(value: str) -> str:
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    @staticmethod
    def _parse_review_report(raw: str | None) -> GameReviewReport | None:
        if raw is None:
            return None
        payload = json.loads(raw)
        from backend.app.coaching.review_service import GameReviewReport, ReviewItem, TurningPoint

        return GameReviewReport(
            critical_mistakes=tuple(ReviewItem(**item) for item in payload.get("critical_mistakes", [])),
            good_moves=tuple(ReviewItem(**item) for item in payload.get("good_moves", [])),
            turning_points=tuple(TurningPoint(**item) for item in payload.get("turning_points", [])),
            study_points=tuple(payload.get("study_points", [])),
        )

    @staticmethod
    def _top_moves_json(analysis: AnalysisResult | None) -> list[dict[str, object]]:
        if analysis is None:
            return []
        return [
            {
                "rank": move.rank,
                "move_uci": move.move_uci,
                "move_san": move.move_san,
                "score": {
                    "perspective": move.score.perspective,
                    "centipawns": move.score.centipawns,
                    "mate": move.score.mate,
                },
                "principal_variation_uci": list(move.principal_variation_uci),
                "principal_variation_san": list(move.principal_variation_san),
            }
            for move in analysis.top_moves
        ]

    @staticmethod
    def _build_pgn(initial_fen: str, move_history: tuple[MoveRecord, ...]) -> str:
        board = chess.Board(initial_fen)
        game = chess.pgn.Game()
        if initial_fen != chess.STARTING_FEN:
            game.headers["SetUp"] = "1"
            game.headers["FEN"] = initial_fen
        node = game
        for move_record in move_history:
            move = chess.Move.from_uci(move_record.move_uci)
            node = node.add_variation(move)
            board.push(move)
        outcome = board.outcome(claim_draw=True)
        game.headers["Result"] = outcome.result() if outcome else "*"
        exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
        return game.accept(exporter)
