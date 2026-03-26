import unittest
from pathlib import Path
from uuid import uuid4

import chess
from fastapi.testclient import TestClient

import backend.app.main as main_module
from backend.app.analysis.engine_service import AnalysisFailure, AnalysisResult, CandidateMove, EvaluationScore
from backend.app.main import app
from backend.app.persistence.checkpoint_store import SqliteGameCheckpointRepository
from backend.app.persistence.archive_store import SqliteGameArchiveRepository
from backend.app.services.game_sessions import GameSessionStore


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

    def test_create_and_fetch_game_snapshot(self) -> None:
        created = self.client.post("/api/games")
        self.assertEqual(created.status_code, 200)
        game = created.json()

        fetched = self.client.get(f"/api/games/{game['game_id']}")
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["fen"], game["fen"])

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
        self.assertEqual(finished_body["archived_game_id"], game["game_id"])

        archived = self.client.get(f"/api/archive/games/{game['game_id']}")
        self.assertEqual(archived.status_code, 200)
        archive_body = archived.json()
        self.assertEqual(archive_body["id"], game["game_id"])
        self.assertEqual(archive_body["user_id"], "student-a")
        self.assertEqual(archive_body["result"], "0-1")
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
        self.assertEqual(matching["move_count"], 4)
        self.assertEqual(matching["user_color"], "white")
        self.assertIsNotNone(matching["summary_preview"])

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


if __name__ == "__main__":
    unittest.main()
