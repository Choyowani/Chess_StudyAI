from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Callable, Protocol

import chess
import chess.engine


class AnalysisServiceError(RuntimeError):
    """Base error for analysis service failures."""


class InvalidFenError(AnalysisServiceError):
    """Raised when the provided FEN cannot be parsed as a valid board position."""


class EngineUnavailableError(AnalysisServiceError):
    """Raised when the engine binary is missing or cannot be started."""


class EngineAnalysisError(AnalysisServiceError):
    """Raised when the engine process fails during analysis."""


@dataclass(frozen=True, slots=True)
class EvaluationScore:
    perspective: str
    centipawns: int | None
    mate: int | None


@dataclass(frozen=True, slots=True)
class CandidateMove:
    rank: int
    move_uci: str
    move_san: str
    score: EvaluationScore
    principal_variation_uci: tuple[str, ...]
    principal_variation_san: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class AnalysisResult:
    fen: str
    best_move: CandidateMove
    top_moves: tuple[CandidateMove, ...]
    evaluation: EvaluationScore


@dataclass(frozen=True, slots=True)
class AnalysisFailure:
    fen: str
    error_type: str
    message: str


class EngineProtocol(Protocol):
    def analyse(
        self,
        board: chess.Board,
        limit: chess.engine.Limit,
        *,
        multipv: int = 1,
    ) -> dict[str, Any] | list[dict[str, Any]]:
        ...

    def quit(self) -> None:
        ...


EngineFactory = Callable[[str], EngineProtocol]


class EngineAnalysisService:
    """Runs pure engine analysis against a FEN position."""

    def __init__(
        self,
        engine_path: str | None = None,
        *,
        depth: int = 12,
        multipv: int = 3,
        engine_factory: EngineFactory | None = None,
    ) -> None:
        self._engine_path = engine_path or os.getenv("CHESS_ENGINE_PATH")
        self._depth = depth
        self._multipv = multipv
        self._engine_factory = engine_factory or self._default_engine_factory

    def analyze_fen(self, fen: str) -> AnalysisResult:
        board = self._board_from_fen(fen)
        engine = self._start_engine()
        try:
            raw_info = engine.analyse(
                board,
                chess.engine.Limit(depth=self._depth),
                multipv=self._multipv,
            )
        except chess.engine.EngineError as exc:
            raise EngineAnalysisError(f"Engine failed during analysis: {exc}") from exc
        except TimeoutError as exc:
            raise EngineAnalysisError("Engine timed out during analysis.") from exc
        except Exception as exc:
            raise EngineAnalysisError(f"Unexpected engine analysis failure: {exc}") from exc
        finally:
            self._quit_engine(engine)

        lines = self._normalize_lines(raw_info)
        top_moves = tuple(self._candidate_from_info(board, info, rank=index + 1) for index, info in enumerate(lines[:3]))
        if not top_moves:
            raise EngineAnalysisError("Engine returned no candidate moves.")

        return AnalysisResult(
            fen=board.fen(),
            best_move=top_moves[0],
            top_moves=top_moves,
            evaluation=top_moves[0].score,
        )

    def safe_analyze_fen(self, fen: str) -> AnalysisResult | AnalysisFailure:
        try:
            return self.analyze_fen(fen)
        except AnalysisServiceError as exc:
            return AnalysisFailure(
                fen=fen,
                error_type=exc.__class__.__name__,
                message=str(exc),
            )

    def _board_from_fen(self, fen: str) -> chess.Board:
        try:
            return chess.Board(fen)
        except ValueError as exc:
            raise InvalidFenError(f"Invalid FEN: {fen}") from exc

    def _start_engine(self) -> EngineProtocol:
        if not self._engine_path:
            raise EngineUnavailableError(
                "Engine path is not configured. Set CHESS_ENGINE_PATH or pass engine_path explicitly."
            )

        try:
            return self._engine_factory(self._engine_path)
        except FileNotFoundError as exc:
            raise EngineUnavailableError(f"Engine binary was not found: {self._engine_path}") from exc
        except OSError as exc:
            raise EngineUnavailableError(f"Engine could not be started: {exc}") from exc

    @staticmethod
    def _default_engine_factory(engine_path: str) -> EngineProtocol:
        return chess.engine.SimpleEngine.popen_uci(engine_path)

    @staticmethod
    def _quit_engine(engine: EngineProtocol) -> None:
        try:
            engine.quit()
        except Exception:
            return

    @staticmethod
    def _normalize_lines(raw_info: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
        if isinstance(raw_info, list):
            return raw_info
        return [raw_info]

    def _candidate_from_info(self, board: chess.Board, info: dict[str, Any], *, rank: int) -> CandidateMove:
        pv = info.get("pv")
        if not pv:
            raise EngineAnalysisError("Engine response did not include a principal variation.")

        first_move = pv[0]
        score = self._evaluation_from_info(board, info)
        pv_uci = tuple(move.uci() for move in pv)
        pv_san = self._principal_variation_san(board, pv)

        return CandidateMove(
            rank=rank,
            move_uci=first_move.uci(),
            move_san=board.san(first_move),
            score=score,
            principal_variation_uci=pv_uci,
            principal_variation_san=pv_san,
        )

    @staticmethod
    def _evaluation_from_info(board: chess.Board, info: dict[str, Any]) -> EvaluationScore:
        raw_score = info.get("score")
        if raw_score is None:
            raise EngineAnalysisError("Engine response did not include an evaluation score.")

        pov_score = raw_score.pov(board.turn)
        return EvaluationScore(
            perspective="side_to_move",
            centipawns=pov_score.score(mate_score=100000),
            mate=pov_score.mate(),
        )

    @staticmethod
    def _principal_variation_san(board: chess.Board, pv: list[chess.Move]) -> tuple[str, ...]:
        replay_board = board.copy(stack=False)
        san_moves: list[str] = []
        for move in pv:
            san_moves.append(replay_board.san(move))
            replay_board.push(move)
        return tuple(san_moves)


def analyze_fen_position(
    fen: str,
    *,
    engine_path: str | None = None,
    depth: int = 12,
    multipv: int = 3,
) -> AnalysisResult:
    service = EngineAnalysisService(engine_path=engine_path, depth=depth, multipv=multipv)
    return service.analyze_fen(fen)
