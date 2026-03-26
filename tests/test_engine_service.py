import unittest
from importlib import reload
from unittest.mock import patch

import chess
import chess.engine

import backend.app.analysis.engine_service as engine_service_module
import backend.app.config as config_module
from backend.app.config import EngineSettings
from backend.app.analysis.engine_service import (
    AnalysisFailure,
    EngineConfigurationError,
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
        self.configure_calls: list[dict[str, object]] = []
        self.analyse_calls: list[tuple[chess.engine.Limit, int]] = []

    def analyse(self, board: chess.Board, limit: chess.engine.Limit, *, multipv: int = 1):
        self.analyse_calls.append((limit, multipv))
        if self._error is not None:
            raise self._error
        return self._result

    def quit(self) -> None:
        self.quit_called = True

    def configure(self, options: dict[str, object]) -> None:
        self.configure_calls.append(options)


class ConfigureErrorEngine(FakeEngine):
    def configure(self, options: dict[str, object]) -> None:
        raise chess.engine.EngineError("bad option")


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
        with patch.dict("os.environ", {}, clear=True):
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
        with patch.dict("os.environ", {}, clear=True):
            service = EngineAnalysisService(engine_path=None)

            result = service.safe_analyze_fen(chess.STARTING_FEN)

            self.assertIsInstance(result, AnalysisFailure)
            self.assertEqual(result.error_type, "EngineUnavailableError")

    def test_reuses_engine_process_and_applies_options(self) -> None:
        board = chess.Board()
        result = {
            "pv": [chess.Move.from_uci("e2e4"), chess.Move.from_uci("e7e5")],
            "score": chess.engine.PovScore(chess.engine.Cp(34), board.turn),
        }
        engine = FakeEngine(result)
        factory_calls: list[str] = []

        service = EngineAnalysisService(
            engine_path="fake-engine",
            threads=2,
            hash_mb=128,
            depth=10,
            multipv=2,
            move_time_ms=150,
            engine_factory=lambda path: factory_calls.append(path) or engine,
        )

        first = service.analyze_fen(board.fen())
        second = service.analyze_fen(board.fen())

        self.assertEqual(first.best_move.move_uci, "e2e4")
        self.assertEqual(second.best_move.move_uci, "e2e4")
        self.assertEqual(factory_calls, ["fake-engine"])
        self.assertEqual(engine.configure_calls, [{"Threads": 2, "Hash": 128}])
        self.assertEqual(len(engine.analyse_calls), 2)
        self.assertEqual(engine.analyse_calls[0][1], 2)
        self.assertEqual(engine.analyse_calls[0][0].depth, 10)
        self.assertEqual(engine.analyse_calls[0][0].time, 0.15)

        service.close()
        self.assertTrue(engine.quit_called)

    def test_invalid_engine_options_raise_configuration_error(self) -> None:
        service = EngineAnalysisService(
            engine_path="fake-engine",
            engine_factory=lambda _: ConfigureErrorEngine([]),
        )

        with self.assertRaises(EngineConfigurationError):
            service.analyze_fen(chess.STARTING_FEN)

    def test_settings_can_be_loaded_from_environment(self) -> None:
        with patch.dict(
            "os.environ",
            {
                "CHESS_ENGINE_PATH": "C:\\stockfish.exe",
                "CHESS_ENGINE_THREADS": "4",
                "CHESS_ENGINE_HASH_MB": "256",
                "CHESS_ENGINE_MULTIPV": "4",
                "CHESS_ENGINE_DEPTH": "14",
                "CHESS_ENGINE_MOVE_TIME_MS": "250",
                "CHESS_ENGINE_STARTUP_TIMEOUT_MS": "9000",
            },
            clear=False,
        ):
            settings = EngineSettings.from_env()

        self.assertEqual(settings.path, "C:\\stockfish.exe")
        self.assertEqual(settings.threads, 4)
        self.assertEqual(settings.hash_mb, 256)
        self.assertEqual(settings.multipv, 4)
        self.assertEqual(settings.depth, 14)
        self.assertEqual(settings.move_time_ms, 250)
        self.assertEqual(settings.startup_timeout_ms, 9000)

    def test_dotenv_file_is_loaded_for_engine_settings(self) -> None:
        def fake_load_dotenv(*args, **kwargs):
            import os

            os.environ["CHESS_ENGINE_PATH"] = "C:\\test\\stockfish.exe"
            os.environ["CHESS_ENGINE_THREADS"] = "2"
            os.environ["CHESS_ENGINE_HASH_MB"] = "96"
            os.environ["CHESS_ENGINE_MULTIPV"] = "3"
            os.environ["CHESS_ENGINE_DEPTH"] = "11"
            os.environ["CHESS_ENGINE_STARTUP_TIMEOUT_MS"] = "8000"
            return True

        with patch.dict("os.environ", {}, clear=True), patch("dotenv.find_dotenv", return_value=".env"), patch(
            "dotenv.load_dotenv",
            side_effect=fake_load_dotenv,
        ) as mocked_loader:
            reload(config_module)
            settings = config_module.EngineSettings.from_env()

        self.assertTrue(mocked_loader.called)
        self.assertEqual(settings.path, "C:\\test\\stockfish.exe")
        self.assertEqual(settings.threads, 2)
        self.assertEqual(settings.hash_mb, 96)
        self.assertEqual(settings.depth, 11)
        self.assertEqual(settings.startup_timeout_ms, 8000)

        reload(config_module)

    def test_windows_asyncio_subprocess_not_implemented_falls_back_to_subprocess_engine(self) -> None:
        board = chess.Board()
        fake_engine = FakeEngine(
            {
                "pv": [chess.Move.from_uci("e2e4"), chess.Move.from_uci("e7e5")],
                "score": chess.engine.PovScore(chess.engine.Cp(34), board.turn),
            }
        )

        with patch.object(
            chess.engine.SimpleEngine,
            "popen_uci",
            side_effect=NotImplementedError,
        ), patch.object(
            engine_service_module,
            "_SubprocessUciEngine",
            return_value=fake_engine,
        ) as fallback_factory:
            service = EngineAnalysisService(engine_path="C:\\stockfish.exe", startup_timeout_ms=5000)
            analysis = service.analyze_fen(board.fen())

        self.assertEqual(analysis.best_move.move_uci, "e2e4")
        fallback_factory.assert_called_once_with("C:\\stockfish.exe", startup_timeout_ms=5000)


if __name__ == "__main__":
    unittest.main()
