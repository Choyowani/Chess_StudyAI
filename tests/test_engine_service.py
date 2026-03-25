import unittest

import chess
import chess.engine

from backend.app.analysis.engine_service import (
    AnalysisFailure,
    EngineAnalysisService,
    EngineAnalysisError,
    EngineUnavailableError,
    InvalidFenError,
)


class FakeEngine:
    def __init__(self, result, error: Exception | None = None) -> None:
        self._result = result
        self._error = error
        self.quit_called = False

    def analyse(self, board: chess.Board, limit: chess.engine.Limit, *, multipv: int = 1):
        if self._error is not None:
            raise self._error
        return self._result

    def quit(self) -> None:
        self.quit_called = True


class EngineAnalysisServiceTests(unittest.TestCase):
    def test_returns_structured_top_three_candidates(self) -> None:
        board = chess.Board()
        result = [
            {
                "pv": [chess.Move.from_uci("e2e4"), chess.Move.from_uci("e7e5")],
                "score": chess.engine.PovScore(chess.engine.Cp(34), board.turn),
            },
            {
                "pv": [chess.Move.from_uci("d2d4"), chess.Move.from_uci("d7d5")],
                "score": chess.engine.PovScore(chess.engine.Cp(20), board.turn),
            },
            {
                "pv": [chess.Move.from_uci("g1f3"), chess.Move.from_uci("g8f6")],
                "score": chess.engine.PovScore(chess.engine.Cp(12), board.turn),
            },
        ]

        service = EngineAnalysisService(
            engine_path="fake-engine",
            engine_factory=lambda _: FakeEngine(result),
        )

        analysis = service.analyze_fen(board.fen())

        self.assertEqual(analysis.best_move.move_uci, "e2e4")
        self.assertEqual(len(analysis.top_moves), 3)
        self.assertEqual(analysis.top_moves[0].move_san, "e4")
        self.assertEqual(analysis.top_moves[1].principal_variation_san, ("d4", "d5"))
        self.assertEqual(analysis.evaluation.centipawns, 34)

    def test_invalid_fen_is_rejected_clearly(self) -> None:
        service = EngineAnalysisService(
            engine_path="fake-engine",
            engine_factory=lambda _: FakeEngine([]),
        )

        with self.assertRaises(InvalidFenError):
            service.analyze_fen("not-a-fen")

    def test_missing_engine_path_raises_domain_error(self) -> None:
        service = EngineAnalysisService(engine_path=None)

        with self.assertRaises(EngineUnavailableError):
            service.analyze_fen(chess.STARTING_FEN)

    def test_engine_failure_is_wrapped(self) -> None:
        engine_error = chess.engine.EngineError("uci failed")
        service = EngineAnalysisService(
            engine_path="fake-engine",
            engine_factory=lambda _: FakeEngine([], error=engine_error),
        )

        with self.assertRaises(EngineAnalysisError):
            service.analyze_fen(chess.STARTING_FEN)

    def test_safe_analyze_returns_failure_object(self) -> None:
        service = EngineAnalysisService(engine_path=None)

        result = service.safe_analyze_fen(chess.STARTING_FEN)

        self.assertIsInstance(result, AnalysisFailure)
        self.assertEqual(result.error_type, "EngineUnavailableError")


if __name__ == "__main__":
    unittest.main()
