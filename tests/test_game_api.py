import unittest
import sqlite3
from pathlib import Path
from uuid import uuid4

import chess
from fastapi.testclient import TestClient

import backend.app.main as main_module
from backend.app.analysis.engine_service import AnalysisFailure, AnalysisResult, CandidateMove, EvaluationScore
from backend.app.domain.game_state import ChessGameState
from backend.app.main import app
from backend.app.persistence.checkpoint_store import SqliteGameCheckpointRepository
from backend.app.persistence.archive_store import SqliteGameArchiveRepository
from backend.app.services.game_sessions import GameSession, GameSessionStore


class FakeAnalysisService:
    def __init__(self, result) -> None:
        self._result = result

    def safe_analyze_fen(self, fen: str):
        return self._result(fen) if callable(self._result) else self._result


class GameApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self._original_analysis_service = app.state.analysis_service
        self._original_archive_repository = app.state.archive_repository
        self._original_checkpoint_repository = app.state.checkpoint_repository
        self._original_store = main_module.store
        self._test_db_path = Path("data") / f"test_archive_{uuid4().hex}.db"
        app.state.archive_repository = SqliteGameArchiveRepository(self._test_db_path)
        app.state.checkpoint_repository = SqliteGameCheckpointRepository(self._test_db_path)
        main_module.store = GameSessionStore()

    def tearDown(self) -> None:
        app.state.analysis_service = self._original_analysis_service
        app.state.archive_repository = self._original_archive_repository
        app.state.checkpoint_repository = self._original_checkpoint_repository
        main_module.store = self._original_store
        if self._test_db_path.exists():
            try:
                self._test_db_path.unlink()
            except PermissionError:
                pass

    def _load_custom_game(self, fen: str, *, user_id: str = "local-user") -> str:
        session = GameSession(
            game_id=str(uuid4()),
            user_id=user_id,
            game_state=ChessGameState(fen),
            started_at=main_module.datetime.now(main_module.timezone.utc),
            review_entries=[],
        )
        main_module.store.load_game(session)
        main_module._save_checkpoint(session)
        return session.game_id

    def test_create_and_fetch_game_snapshot(self) -> None:
        created = self.client.post("/api/games")
        self.assertEqual(created.status_code, 200)
        game = created.json()

        fetched = self.client.get(f"/api/games/{game['game_id']}")
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["fen"], game["fen"])

    def test_zero_move_sessions_are_not_listed_or_resumable_after_restart(self) -> None:
        created = self.client.post("/api/games", json={"user_id": "student-zero"})
        self.assertEqual(created.status_code, 200)
        game = created.json()

        checkpoints = self.client.get("/api/checkpoints/games")
        self.assertEqual(checkpoints.status_code, 200)
        self.assertFalse(any(item["game_id"] == game["game_id"] for item in checkpoints.json()))

        main_module.store = GameSessionStore()

        resumed = self.client.get(f"/api/checkpoints/games/{game['game_id']}/resume")
        self.assertEqual(resumed.status_code, 404)

    def test_illegal_move_is_rejected_without_state_desync(self) -> None:
        created = self.client.post("/api/games")
        game = created.json()
        before_fen = game["fen"]

        rejected = self.client.post(
            f"/api/games/{game['game_id']}/moves",
            json={"move_uci": "e2e5"},
        )
        self.assertEqual(rejected.status_code, 400)

        after = self.client.get(f"/api/games/{game['game_id']}")
        self.assertEqual(after.status_code, 200)
        self.assertEqual(after.json()["fen"], before_fen)

    def test_legal_move_updates_snapshot_with_analysis(self) -> None:
        start_fen = chess.STARTING_FEN
        after_fen = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"

        app.state.analysis_service = FakeAnalysisService(
            lambda fen: (
                AnalysisResult(
                    fen=start_fen,
                    best_move=CandidateMove(
                        rank=1,
                        move_uci="e2e4",
                        move_san="e4",
                        score=EvaluationScore(perspective="side_to_move", centipawns=36, mate=None),
                        principal_variation_uci=("e2e4", "e7e5"),
                        principal_variation_san=("e4", "e5"),
                    ),
                    top_moves=(
                        CandidateMove(
                            rank=1,
                            move_uci="e2e4",
                            move_san="e4",
                            score=EvaluationScore(perspective="side_to_move", centipawns=36, mate=None),
                            principal_variation_uci=("e2e4", "e7e5"),
                            principal_variation_san=("e4", "e5"),
                        ),
                        CandidateMove(
                            rank=2,
                            move_uci="d2d4",
                            move_san="d4",
                            score=EvaluationScore(perspective="side_to_move", centipawns=24, mate=None),
                            principal_variation_uci=("d2d4", "d7d5"),
                            principal_variation_san=("d4", "d5"),
                        ),
                        CandidateMove(
                            rank=3,
                            move_uci="g1f3",
                            move_san="Nf3",
                            score=EvaluationScore(perspective="side_to_move", centipawns=16, mate=None),
                            principal_variation_uci=("g1f3", "d7d5"),
                            principal_variation_san=("Nf3", "d5"),
                        ),
                    ),
                    evaluation=EvaluationScore(perspective="side_to_move", centipawns=36, mate=None),
                )
                if fen == start_fen
                else AnalysisResult(
                    fen=after_fen,
                    best_move=CandidateMove(
                        rank=1,
                        move_uci="e7e5",
                        move_san="e5",
                        score=EvaluationScore(perspective="side_to_move", centipawns=-18, mate=None),
                        principal_variation_uci=("e7e5", "g1f3"),
                        principal_variation_san=("e5", "Nf3"),
                    ),
                    top_moves=(
                        CandidateMove(
                            rank=1,
                            move_uci="e7e5",
                            move_san="e5",
                            score=EvaluationScore(perspective="side_to_move", centipawns=-18, mate=None),
                            principal_variation_uci=("e7e5", "g1f3"),
                            principal_variation_san=("e5", "Nf3"),
                        ),
                        CandidateMove(
                            rank=2,
                            move_uci="c7c5",
                            move_san="c5",
                            score=EvaluationScore(perspective="side_to_move", centipawns=-10, mate=None),
                            principal_variation_uci=("c7c5", "g1f3"),
                            principal_variation_san=("c5", "Nf3"),
                        ),
                        CandidateMove(
                            rank=3,
                            move_uci="e7e6",
                            move_san="e6",
                            score=EvaluationScore(perspective="side_to_move", centipawns=-6, mate=None),
                            principal_variation_uci=("e7e6", "d2d4"),
                            principal_variation_san=("e6", "d4"),
                        ),
                    ),
                    evaluation=EvaluationScore(perspective="side_to_move", centipawns=-18, mate=None),
                )
            )
        )

        created = self.client.post("/api/games")
        game = created.json()

        moved = self.client.post(
            f"/api/games/{game['game_id']}/moves",
            json={"move_uci": "e2e4"},
        )
        self.assertEqual(moved.status_code, 200)
        body = moved.json()
        self.assertEqual(body["last_move_uci"], "e2e4")
        self.assertEqual(len(body["move_history"]), 1)
        self.assertEqual(body["analysis"]["fen"], body["fen"])
        self.assertEqual(len(body["analysis"]["top_moves"]), 3)
        self.assertIsNone(body["analysis_error"])
        self.assertEqual(body["feedback"]["move_quality_label"], "Good")
        self.assertIn("1순위 수", body["feedback"]["short_explanation"])
        self.assertEqual(body["feedback"]["best_move_uci"], "e2e4")
        self.assertTrue(body["feedback"]["current_plan"].startswith("계획:"))

    def test_analysis_failure_does_not_break_move_flow(self) -> None:
        app.state.analysis_service = FakeAnalysisService(
            lambda fen: AnalysisFailure(
                fen=fen,
                error_type="EngineUnavailableError",
                message="Engine path is not configured.",
            )
        )

        created = self.client.post("/api/games")
        game = created.json()

        moved = self.client.post(
            f"/api/games/{game['game_id']}/moves",
            json={"move_uci": "e2e4"},
        )

        self.assertEqual(moved.status_code, 200)
        body = moved.json()
        self.assertEqual(body["last_move_uci"], "e2e4")
        self.assertIsNone(body["analysis"])
        self.assertEqual(body["analysis_error"]["fen"], body["fen"])
        self.assertEqual(body["analysis_error"]["error_type"], "EngineUnavailableError")
        self.assertIsNone(body["feedback"])
        self.assertIsNotNone(body["feedback_error"])

    def test_completed_game_is_archived_and_can_be_loaded(self) -> None:
        app.state.analysis_service = FakeAnalysisService(
            lambda fen: AnalysisResult(
                fen=fen,
                best_move=CandidateMove(
                    rank=1,
                    move_uci="e2e4",
                    move_san="e4",
                    score=EvaluationScore(perspective="side_to_move", centipawns=20, mate=None),
                    principal_variation_uci=("e2e4",),
                    principal_variation_san=("e4",),
                ),
                top_moves=(
                    CandidateMove(
                        rank=1,
                        move_uci="e2e4",
                        move_san="e4",
                        score=EvaluationScore(perspective="side_to_move", centipawns=20, mate=None),
                        principal_variation_uci=("e2e4",),
                        principal_variation_san=("e4",),
                    ),
                    CandidateMove(
                        rank=2,
                        move_uci="d2d4",
                        move_san="d4",
                        score=EvaluationScore(perspective="side_to_move", centipawns=10, mate=None),
                        principal_variation_uci=("d2d4",),
                        principal_variation_san=("d4",),
                    ),
                    CandidateMove(
                        rank=3,
                        move_uci="g1f3",
                        move_san="Nf3",
                        score=EvaluationScore(perspective="side_to_move", centipawns=5, mate=None),
                        principal_variation_uci=("g1f3",),
                        principal_variation_san=("Nf3",),
                    ),
                ),
                evaluation=EvaluationScore(perspective="side_to_move", centipawns=-20, mate=None),
            )
        )

        created = self.client.post("/api/games", json={"user_id": "student-a"})
        game = created.json()

        for move in ("f2f3", "e7e5", "g2g4", "d8h4"):
            moved = self.client.post(
                f"/api/games/{game['game_id']}/moves",
                json={"move_uci": move},
            )
            self.assertEqual(moved.status_code, 200)

        finished_body = moved.json()
        self.assertEqual(finished_body["status"]["result"], "0-1")
        self.assertEqual(finished_body["status"]["terminal_reason"], "checkmate")
        self.assertEqual(finished_body["archived_game_id"], game["game_id"])

        archived = self.client.get(f"/api/archive/games/{game['game_id']}")
        self.assertEqual(archived.status_code, 200)
        archive_body = archived.json()
        self.assertEqual(archive_body["id"], game["game_id"])
        self.assertEqual(archive_body["user_id"], "student-a")
        self.assertEqual(archive_body["result"], "0-1")
        self.assertEqual(archive_body["terminal_reason"], "checkmate")
        self.assertIn("Qh4#", archive_body["pgn"])
        self.assertEqual(len(archive_body["move_logs"]), 4)
        self.assertEqual(archive_body["move_logs"][0]["before_fen"], chess.STARTING_FEN)
        self.assertIn("top_candidate_moves", archive_body["move_logs"][0])
        self.assertIn("move_quality_label", archive_body["move_logs"][0])
        self.assertIn("short_coaching_note", archive_body["move_logs"][0])
        self.assertIn("pattern_tags", archive_body["move_logs"][0])
        self.assertIsNotNone(archive_body["review_report"])
        self.assertLessEqual(len(archive_body["review_report"]["critical_mistakes"]), 3)
        self.assertGreaterEqual(len(archive_body["review_report"]["study_points"]), 1)

    def test_archive_repository_migrates_legacy_games_table_with_missing_review_report_column(self) -> None:
        legacy_db_path = Path("data") / f"legacy_archive_{uuid4().hex}.db"
        try:
            with sqlite3.connect(legacy_db_path) as connection:
                connection.executescript(
                    """
                    CREATE TABLE games (
                        id TEXT PRIMARY KEY,
                        started_at TEXT NOT NULL,
                        finished_at TEXT NOT NULL,
                        result TEXT,
                        user_color TEXT NOT NULL,
                        initial_fen TEXT NOT NULL,
                        final_fen TEXT NOT NULL,
                        pgn TEXT NOT NULL,
                        summary_text TEXT,
                        user_id TEXT NOT NULL DEFAULT 'local-user'
                    );

                    CREATE TABLE move_logs (
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
                        PRIMARY KEY (game_id, ply_index)
                    );

                    CREATE TABLE user_patterns (
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
                connection.commit()

            migrated_repository = SqliteGameArchiveRepository(legacy_db_path)

            with sqlite3.connect(legacy_db_path) as connection:
                columns = {row[1] for row in connection.execute("PRAGMA table_info(games)").fetchall()}

            self.assertIn("review_report_json", columns)
            self.assertIn("terminal_reason", columns)
            self.assertIsNotNone(migrated_repository)
        finally:
            if "migrated_repository" in locals():
                del migrated_repository
            if legacy_db_path.exists():
                try:
                    legacy_db_path.unlink()
                except PermissionError:
                    pass

    def test_archived_game_list_returns_replay_summaries(self) -> None:
        app.state.analysis_service = FakeAnalysisService(
            lambda fen: AnalysisResult(
                fen=fen,
                best_move=CandidateMove(
                    rank=1,
                    move_uci="e2e4",
                    move_san="e4",
                    score=EvaluationScore(perspective="side_to_move", centipawns=20, mate=None),
                    principal_variation_uci=("e2e4",),
                    principal_variation_san=("e4",),
                ),
                top_moves=(
                    CandidateMove(
                        rank=1,
                        move_uci="e2e4",
                        move_san="e4",
                        score=EvaluationScore(perspective="side_to_move", centipawns=20, mate=None),
                        principal_variation_uci=("e2e4",),
                        principal_variation_san=("e4",),
                    ),
                ),
                evaluation=EvaluationScore(perspective="side_to_move", centipawns=20, mate=None),
            )
        )

        created = self.client.post("/api/games", json={"user_id": "student-c"})
        game = created.json()

        for move in ("f2f3", "e7e5", "g2g4", "d8h4"):
            moved = self.client.post(f"/api/games/{game['game_id']}/moves", json={"move_uci": move})
            self.assertEqual(moved.status_code, 200)

        listed = self.client.get("/api/archive/games")
        self.assertEqual(listed.status_code, 200)
        body = listed.json()
        self.assertGreaterEqual(len(body), 1)
        matching = next(item for item in body if item["game_id"] == game["game_id"])
        self.assertEqual(matching["result"], "0-1")
        self.assertEqual(matching["terminal_reason"], "checkmate")
        self.assertEqual(matching["move_count"], 4)
        self.assertEqual(matching["user_color"], "white")
        self.assertIsNotNone(matching["summary_preview"])

    def test_pgn_import_creates_archived_game_without_engine(self) -> None:
        app.state.analysis_service = FakeAnalysisService(
            lambda fen: AnalysisFailure(
                fen=fen,
                error_type="EngineUnavailableError",
                message="Engine path is not configured.",
            )
        )

        pgn_text = """
[Event "Imported Study Game"]
[Site "?"]
[Date "2026.04.02"]
[Round "-"]
[White "Alice"]
[Black "Bob"]
[Result "0-1"]
[Termination "won on time"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1
        """.strip()

        imported = self.client.post(
            "/api/archive/import-pgn",
            json={"user_id": "student-import", "pgn_text": pgn_text},
        )
        self.assertEqual(imported.status_code, 200)
        body = imported.json()
        self.assertEqual(body["user_id"], "student-import")
        self.assertEqual(body["result"], "0-1")
        self.assertEqual(body["terminal_reason"], "white_time_forfeit")
        self.assertEqual(len(body["move_logs"]), 6)
        self.assertEqual(body["move_logs"][0]["before_fen"], chess.STARTING_FEN)
        self.assertIn('Termination "won on time"', body["pgn"])
        self.assertIsNotNone(body["review_report"])

        listed = self.client.get("/api/archive/games")
        self.assertEqual(listed.status_code, 200)
        matching = next(item for item in listed.json() if item["game_id"] == body["id"])
        self.assertEqual(matching["terminal_reason"], "white_time_forfeit")
        self.assertEqual(matching["move_count"], 6)

        loaded = self.client.get(f"/api/archive/games/{body['id']}")
        self.assertEqual(loaded.status_code, 200)
        self.assertEqual(loaded.json()["id"], body["id"])

    def test_pgn_import_rejects_invalid_movetext(self) -> None:
        invalid_pgn = """
[Event "Broken"]
[Site "?"]
[Date "2026.04.02"]
[Round "-"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. NotAMove 1-0
        """.strip()

        imported = self.client.post(
            "/api/archive/import-pgn",
            json={"user_id": "student-import", "pgn_text": invalid_pgn},
        )
        self.assertEqual(imported.status_code, 400)
        self.assertIn("수순", imported.json()["detail"])

    def test_user_weakness_summary_aggregates_patterns(self) -> None:
        def analysis_for(fen: str) -> AnalysisResult:
            if fen == chess.STARTING_FEN:
                return AnalysisResult(
                    fen=fen,
                    best_move=CandidateMove(
                        rank=1,
                        move_uci="e2e4",
                        move_san="e4",
                        score=EvaluationScore(perspective="side_to_move", centipawns=80, mate=None),
                        principal_variation_uci=("e2e4", "e7e5"),
                        principal_variation_san=("e4", "e5"),
                    ),
                    top_moves=(
                        CandidateMove(
                            rank=1,
                            move_uci="e2e4",
                            move_san="e4",
                            score=EvaluationScore(perspective="side_to_move", centipawns=80, mate=None),
                            principal_variation_uci=("e2e4", "e7e5"),
                            principal_variation_san=("e4", "e5"),
                        ),
                    ),
                    evaluation=EvaluationScore(perspective="side_to_move", centipawns=80, mate=None),
                )
            return AnalysisResult(
                fen=fen,
                best_move=CandidateMove(
                    rank=1,
                    move_uci="d8h4",
                    move_san="Qh4#",
                    score=EvaluationScore(perspective="side_to_move", centipawns=500, mate=1),
                    principal_variation_uci=("d8h4",),
                    principal_variation_san=("Qh4#",),
                ),
                top_moves=(
                    CandidateMove(
                        rank=1,
                        move_uci="d8h4",
                        move_san="Qh4#",
                        score=EvaluationScore(perspective="side_to_move", centipawns=500, mate=1),
                        principal_variation_uci=("d8h4",),
                        principal_variation_san=("Qh4#",),
                    ),
                ),
                evaluation=EvaluationScore(perspective="side_to_move", centipawns=500, mate=1),
            )

        app.state.analysis_service = FakeAnalysisService(analysis_for)

        for _ in range(2):
            created = self.client.post("/api/games", json={"user_id": "student-b"})
            game = created.json()
            for move in ("f2f3", "e7e5", "g2g4", "d8h4"):
                moved = self.client.post(
                    f"/api/games/{game['game_id']}/moves",
                    json={"move_uci": move},
                )
                self.assertEqual(moved.status_code, 200)

        summary = self.client.get("/api/users/student-b/weakness-summary")
        self.assertEqual(summary.status_code, 200)
        body = summary.json()
        self.assertEqual(body["user_id"], "student-b")
        self.assertGreaterEqual(len(body["patterns"]), 1)
        self.assertGreaterEqual(body["patterns"][0]["frequency"], 2)
        self.assertTrue(body["patterns"][0]["display_label"])
        self.assertTrue(body["patterns"][0]["study_recommendation"])
        self.assertGreaterEqual(len(body["patterns"][0]["related_game_ids"]), 1)

    def test_in_progress_game_is_checkpointed_and_can_resume_after_restart(self) -> None:
        created = self.client.post("/api/games", json={"user_id": "student-resume"})
        self.assertEqual(created.status_code, 200)
        game = created.json()

        moved = self.client.post(f"/api/games/{game['game_id']}/moves", json={"move_uci": "e2e4"})
        self.assertEqual(moved.status_code, 200)
        moved_body = moved.json()

        checkpoint_list = self.client.get("/api/checkpoints/games")
        self.assertEqual(checkpoint_list.status_code, 200)
        checkpoints = checkpoint_list.json()
        matching = next(item for item in checkpoints if item["game_id"] == game["game_id"])
        self.assertEqual(matching["move_count"], 1)
        self.assertEqual(matching["status"], "in_progress")

        main_module.store = GameSessionStore()

        resumed = self.client.get(f"/api/checkpoints/games/{game['game_id']}/resume")
        self.assertEqual(resumed.status_code, 200)
        resumed_body = resumed.json()
        self.assertEqual(resumed_body["fen"], moved_body["fen"])
        self.assertEqual(resumed_body["move_history"], moved_body["move_history"])
        self.assertEqual(resumed_body["status"]["turn"], moved_body["status"]["turn"])

        continued = self.client.post(f"/api/games/{game['game_id']}/moves", json={"move_uci": "e7e5"})
        self.assertEqual(continued.status_code, 200)
        continued_body = continued.json()
        self.assertEqual(len(continued_body["move_history"]), 2)
        self.assertEqual(continued_body["last_move_uci"], "e7e5")

    def test_resume_preserves_special_move_legality(self) -> None:
        initial_fen = "4k3/5p2/8/3pP3/8/8/8/4K3 b - - 0 1"
        game_id = self._load_custom_game(initial_fen, user_id="student-special")

        prepared = self.client.post(f"/api/games/{game_id}/moves", json={"move_uci": "f7f5"})
        self.assertEqual(prepared.status_code, 200)

        main_module.store = GameSessionStore()

        resumed = self.client.get(f"/api/checkpoints/games/{game_id}/resume")
        self.assertEqual(resumed.status_code, 200)
        resumed_body = resumed.json()
        self.assertIn("e5f6", resumed_body["legal_moves"])
        self.assertEqual(resumed_body["status"]["turn"], "white")

        moved = self.client.post(f"/api/games/{game_id}/moves", json={"move_uci": "e5f6"})
        self.assertEqual(moved.status_code, 200)
        moved_body = moved.json()
        self.assertEqual(moved_body["last_move_uci"], "e5f6")
        self.assertEqual(moved_body["status"]["turn"], "black")

    def test_resumed_session_preserves_study_undo_and_retry_branch(self) -> None:
        start_fen = chess.STARTING_FEN

        app.state.analysis_service = FakeAnalysisService(
            lambda fen: AnalysisResult(
                fen=fen,
                best_move=CandidateMove(
                    rank=1,
                    move_uci="e2e4" if fen == start_fen else "e7e5",
                    move_san="e4" if fen == start_fen else "e5",
                    score=EvaluationScore(perspective="side_to_move", centipawns=24, mate=None),
                    principal_variation_uci=("e2e4", "e7e5") if fen == start_fen else ("e7e5", "g1f3"),
                    principal_variation_san=("e4", "e5") if fen == start_fen else ("e5", "Nf3"),
                ),
                top_moves=(
                    CandidateMove(
                        rank=1,
                        move_uci="e2e4" if fen == start_fen else "e7e5",
                        move_san="e4" if fen == start_fen else "e5",
                        score=EvaluationScore(perspective="side_to_move", centipawns=24, mate=None),
                        principal_variation_uci=("e2e4", "e7e5") if fen == start_fen else ("e7e5", "g1f3"),
                        principal_variation_san=("e4", "e5") if fen == start_fen else ("e5", "Nf3"),
                    ),
                    CandidateMove(
                        rank=2,
                        move_uci="d2d4" if fen == start_fen else "c7c5",
                        move_san="d4" if fen == start_fen else "c5",
                        score=EvaluationScore(perspective="side_to_move", centipawns=18, mate=None),
                        principal_variation_uci=("d2d4",) if fen == start_fen else ("c7c5",),
                        principal_variation_san=("d4",) if fen == start_fen else ("c5",),
                    ),
                    CandidateMove(
                        rank=3,
                        move_uci="g1f3" if fen == start_fen else "e7e6",
                        move_san="Nf3" if fen == start_fen else "e6",
                        score=EvaluationScore(perspective="side_to_move", centipawns=12, mate=None),
                        principal_variation_uci=("g1f3",) if fen == start_fen else ("e7e6",),
                        principal_variation_san=("Nf3",) if fen == start_fen else ("e6",),
                    ),
                ),
                evaluation=EvaluationScore(perspective="side_to_move", centipawns=24, mate=None),
            )
        )

        created = self.client.post("/api/games")
        game = created.json()

        moved = self.client.post(f"/api/games/{game['game_id']}/moves", json={"move_uci": "e2e4"})
        self.assertEqual(moved.status_code, 200)
        moved_body = moved.json()
        self.assertEqual(len(moved_body["move_history"]), 1)

        main_module.store = GameSessionStore()

        resumed = self.client.get(f"/api/checkpoints/games/{game['game_id']}/resume")
        self.assertEqual(resumed.status_code, 200)
        resumed_body = resumed.json()
        self.assertEqual(resumed_body["move_history"], moved_body["move_history"])
        self.assertEqual(resumed_body["status"]["turn"], "black")

        undone = self.client.post(f"/api/games/{game['game_id']}/undo")
        self.assertEqual(undone.status_code, 200)
        undone_body = undone.json()
        self.assertEqual(undone_body["fen"], start_fen)
        self.assertEqual(len(undone_body["move_history"]), 0)
        self.assertEqual(undone_body["status"]["turn"], "white")
        self.assertIsNotNone(undone_body["analysis"])
        self.assertIsNone(undone_body["feedback"])

        retried = self.client.post(f"/api/games/{game['game_id']}/moves", json={"move_uci": "d2d4"})
        self.assertEqual(retried.status_code, 200)
        retried_body = retried.json()
        self.assertEqual(len(retried_body["move_history"]), 1)
        self.assertEqual(retried_body["move_history"][-1]["move_uci"], "d2d4")
        self.assertNotEqual(retried_body["fen"], start_fen)

    def test_study_undo_reverts_last_move_and_allows_retry_branch(self) -> None:
        start_fen = chess.STARTING_FEN

        app.state.analysis_service = FakeAnalysisService(
            lambda fen: AnalysisResult(
                fen=fen,
                best_move=CandidateMove(
                    rank=1,
                    move_uci="e2e4" if fen == start_fen else "e7e5",
                    move_san="e4" if fen == start_fen else "e5",
                    score=EvaluationScore(perspective="side_to_move", centipawns=24, mate=None),
                    principal_variation_uci=("e2e4", "e7e5") if fen == start_fen else ("e7e5", "g1f3"),
                    principal_variation_san=("e4", "e5") if fen == start_fen else ("e5", "Nf3"),
                ),
                top_moves=(
                    CandidateMove(
                        rank=1,
                        move_uci="e2e4" if fen == start_fen else "e7e5",
                        move_san="e4" if fen == start_fen else "e5",
                        score=EvaluationScore(perspective="side_to_move", centipawns=24, mate=None),
                        principal_variation_uci=("e2e4", "e7e5") if fen == start_fen else ("e7e5", "g1f3"),
                        principal_variation_san=("e4", "e5") if fen == start_fen else ("e5", "Nf3"),
                    ),
                    CandidateMove(
                        rank=2,
                        move_uci="d2d4" if fen == start_fen else "c7c5",
                        move_san="d4" if fen == start_fen else "c5",
                        score=EvaluationScore(perspective="side_to_move", centipawns=18, mate=None),
                        principal_variation_uci=("d2d4",) if fen == start_fen else ("c7c5",),
                        principal_variation_san=("d4",) if fen == start_fen else ("c5",),
                    ),
                    CandidateMove(
                        rank=3,
                        move_uci="g1f3" if fen == start_fen else "e7e6",
                        move_san="Nf3" if fen == start_fen else "e6",
                        score=EvaluationScore(perspective="side_to_move", centipawns=12, mate=None),
                        principal_variation_uci=("g1f3",) if fen == start_fen else ("e7e6",),
                        principal_variation_san=("Nf3",) if fen == start_fen else ("e6",),
                    ),
                ),
                evaluation=EvaluationScore(perspective="side_to_move", centipawns=24, mate=None),
            )
        )

        created = self.client.post("/api/games")
        game = created.json()

        moved = self.client.post(f"/api/games/{game['game_id']}/moves", json={"move_uci": "e2e4"})
        self.assertEqual(moved.status_code, 200)
        moved_body = moved.json()
        self.assertEqual(len(moved_body["move_history"]), 1)

        undone = self.client.post(f"/api/games/{game['game_id']}/undo")
        self.assertEqual(undone.status_code, 200)
        undone_body = undone.json()
        self.assertEqual(undone_body["fen"], start_fen)
        self.assertEqual(len(undone_body["move_history"]), 0)
        self.assertIsNotNone(undone_body["analysis"])
        self.assertIsNone(undone_body["feedback"])
        self.assertIsNone(undone_body["feedback_error"])

        retried = self.client.post(f"/api/games/{game['game_id']}/moves", json={"move_uci": "d2d4"})
        self.assertEqual(retried.status_code, 200)
        retried_body = retried.json()
        self.assertEqual(len(retried_body["move_history"]), 1)
        self.assertEqual(retried_body["move_history"][-1]["move_uci"], "d2d4")
        self.assertNotEqual(retried_body["fen"], start_fen)

    def test_study_undo_rejects_empty_history(self) -> None:
        created = self.client.post("/api/games")
        game = created.json()

        undone = self.client.post(f"/api/games/{game['game_id']}/undo")
        self.assertEqual(undone.status_code, 400)

    def test_terminal_game_transfers_from_checkpoint_to_archive(self) -> None:
        app.state.analysis_service = FakeAnalysisService(
            lambda fen: AnalysisResult(
                fen=fen,
                best_move=CandidateMove(
                    rank=1,
                    move_uci="e2e4",
                    move_san="e4",
                    score=EvaluationScore(perspective="side_to_move", centipawns=20, mate=None),
                    principal_variation_uci=("e2e4",),
                    principal_variation_san=("e4",),
                ),
                top_moves=(
                    CandidateMove(
                        rank=1,
                        move_uci="e2e4",
                        move_san="e4",
                        score=EvaluationScore(perspective="side_to_move", centipawns=20, mate=None),
                        principal_variation_uci=("e2e4",),
                        principal_variation_san=("e4",),
                    ),
                ),
                evaluation=EvaluationScore(perspective="side_to_move", centipawns=20, mate=None),
            )
        )

        created = self.client.post("/api/games")
        game = created.json()
        for move in ("f2f3", "e7e5", "g2g4", "d8h4"):
            moved = self.client.post(f"/api/games/{game['game_id']}/moves", json={"move_uci": move})
            self.assertEqual(moved.status_code, 200)

        checkpoints = self.client.get("/api/checkpoints/games")
        self.assertEqual(checkpoints.status_code, 200)
        self.assertFalse(any(item["game_id"] == game["game_id"] for item in checkpoints.json()))

        archived = self.client.get(f"/api/archive/games/{game['game_id']}")
        self.assertEqual(archived.status_code, 200)

    def test_underpromotion_choice_is_applied_and_preserved(self) -> None:
        promotion_fen = "k7/4P3/8/8/8/8/8/4K3 w - - 0 1"

        def analysis_for(fen: str) -> AnalysisResult:
            return AnalysisResult(
                fen=fen,
                best_move=CandidateMove(
                    rank=1,
                    move_uci="e7e8n" if fen == promotion_fen else "e8f6",
                    move_san="e8=N+" if fen == promotion_fen else "Nf6+",
                    score=EvaluationScore(perspective="side_to_move", centipawns=240, mate=None),
                    principal_variation_uci=("e7e8n",) if fen == promotion_fen else ("e8f6",),
                    principal_variation_san=("e8=N+",) if fen == promotion_fen else ("Nf6+",),
                ),
                top_moves=(
                    CandidateMove(
                        rank=1,
                        move_uci="e7e8n" if fen == promotion_fen else "e8f6",
                        move_san="e8=N+" if fen == promotion_fen else "Nf6+",
                        score=EvaluationScore(perspective="side_to_move", centipawns=240, mate=None),
                        principal_variation_uci=("e7e8n",) if fen == promotion_fen else ("e8f6",),
                        principal_variation_san=("e8=N+",) if fen == promotion_fen else ("Nf6+",),
                    ),
                    CandidateMove(
                        rank=2,
                        move_uci="e7e8q" if fen == promotion_fen else "e8g7",
                        move_san="e8=Q+" if fen == promotion_fen else "Ng7+",
                        score=EvaluationScore(perspective="side_to_move", centipawns=180, mate=None),
                        principal_variation_uci=("e7e8q",) if fen == promotion_fen else ("e8g7",),
                        principal_variation_san=("e8=Q+",) if fen == promotion_fen else ("Ng7+",),
                    ),
                    CandidateMove(
                        rank=3,
                        move_uci="e7e8r" if fen == promotion_fen else "e8d6",
                        move_san="e8=R+" if fen == promotion_fen else "Nd6+",
                        score=EvaluationScore(perspective="side_to_move", centipawns=150, mate=None),
                        principal_variation_uci=("e7e8r",) if fen == promotion_fen else ("e8d6",),
                        principal_variation_san=("e8=R+",) if fen == promotion_fen else ("Nd6+",),
                    ),
                ),
                evaluation=EvaluationScore(perspective="side_to_move", centipawns=240, mate=None),
            )

        app.state.analysis_service = FakeAnalysisService(analysis_for)
        game_id = self._load_custom_game(promotion_fen, user_id="student-promo")

        moved = self.client.post(
            f"/api/games/{game_id}/moves",
            json={"move_uci": "e7e8", "promotion_piece": "n"},
        )

        self.assertEqual(moved.status_code, 200)
        body = moved.json()
        self.assertEqual(body["last_move_uci"], "e7e8n")
        self.assertEqual(body["move_history"][-1]["move_uci"], "e7e8n")
        self.assertIn("=N", body["move_history"][-1]["move_san"])
        self.assertEqual(body["analysis"]["fen"], body["fen"])
        self.assertIsNotNone(body["feedback"])

        resumed = self.client.get(f"/api/games/{game_id}")
        self.assertEqual(resumed.status_code, 200)
        self.assertEqual(resumed.json()["last_move_uci"], "e7e8n")

    def test_invalid_promotion_choice_is_rejected(self) -> None:
        game_id = self._load_custom_game("4k3/8/8/8/8/8/4P3/K7 w - - 0 1")

        rejected = self.client.post(
            f"/api/games/{game_id}/moves",
            json={"move_uci": "e2e4", "promotion_piece": "q"},
        )
        self.assertEqual(rejected.status_code, 400)

        promotion_game_id = self._load_custom_game("k7/4P3/8/8/8/8/8/4K3 w - - 0 1")
        mismatch = self.client.post(
            f"/api/games/{promotion_game_id}/moves",
            json={"move_uci": "e7e8n", "promotion_piece": "r"},
        )
        self.assertEqual(mismatch.status_code, 400)

    def test_white_resignation_archives_game_and_blocks_further_moves(self) -> None:
        created = self.client.post("/api/games", json={"user_id": "student-resign-white"})
        self.assertEqual(created.status_code, 200)
        game = created.json()

        moved = self.client.post(f"/api/games/{game['game_id']}/moves", json={"move_uci": "e2e4"})
        self.assertEqual(moved.status_code, 200)

        resigned = self.client.post(
            f"/api/games/{game['game_id']}/resign",
            json={"side": "white"},
        )
        self.assertEqual(resigned.status_code, 200)
        body = resigned.json()
        self.assertTrue(body["status"]["is_game_over"])
        self.assertEqual(body["status"]["terminal_reason"], "white_resigned")
        self.assertEqual(body["status"]["result"], "0-1")
        self.assertEqual(body["status"]["winner"], "black")
        self.assertEqual(body["archived_game_id"], game["game_id"])
        self.assertEqual(body["legal_moves"], [])

        archived = self.client.get(f"/api/archive/games/{game['game_id']}")
        self.assertEqual(archived.status_code, 200)
        archived_body = archived.json()
        self.assertEqual(archived_body["terminal_reason"], "white_resigned")
        self.assertEqual(archived_body["result"], "0-1")
        self.assertIn('Result "0-1"', archived_body["pgn"])

        listed = self.client.get("/api/archive/games")
        self.assertEqual(listed.status_code, 200)
        matching = next(item for item in listed.json() if item["game_id"] == game["game_id"])
        self.assertEqual(matching["terminal_reason"], "white_resigned")

        rejected = self.client.post(f"/api/games/{game['game_id']}/moves", json={"move_uci": "e7e5"})
        self.assertEqual(rejected.status_code, 400)

    def test_black_resignation_is_supported(self) -> None:
        created = self.client.post("/api/games", json={"user_id": "student-resign-black"})
        self.assertEqual(created.status_code, 200)
        game = created.json()

        resigned = self.client.post(
            f"/api/games/{game['game_id']}/resign",
            json={"side": "black"},
        )
        self.assertEqual(resigned.status_code, 200)
        body = resigned.json()
        self.assertEqual(body["status"]["terminal_reason"], "black_resigned")
        self.assertEqual(body["status"]["result"], "1-0")
        self.assertEqual(body["status"]["winner"], "white")
        self.assertEqual(body["archived_game_id"], game["game_id"])

    def test_illegal_move_response_preserves_debuggable_context(self) -> None:
        game_id = self._load_custom_game("4k3/8/8/8/8/8/4r3/R3K3 w Q - 0 1")

        rejected = self.client.post(
            f"/api/games/{game_id}/moves",
            json={"move_uci": "a1a2"},
        )

        self.assertEqual(rejected.status_code, 400)
        self.assertIn("Illegal move for current position: a1a2", rejected.json()["detail"])


if __name__ == "__main__":
    unittest.main()
