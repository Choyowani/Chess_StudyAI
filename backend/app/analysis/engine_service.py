from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass
from threading import Lock
from typing import Any, Callable, Protocol

import chess
import chess.engine

from backend.app.config import EngineSettings


class AnalysisServiceError(RuntimeError):
    """Base error for analysis service failures."""


class InvalidFenError(AnalysisServiceError):
    """Raised when the provided FEN cannot be parsed as a valid board position."""


class EngineUnavailableError(AnalysisServiceError):
    """Raised when the engine binary is missing or cannot be started."""


class EngineAnalysisError(AnalysisServiceError):
    """Raised when the engine process fails during analysis."""


class EngineConfigurationError(AnalysisServiceError):
    """Raised when engine startup succeeds but runtime options cannot be configured."""


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

    def configure(self, options: dict[str, Any]) -> None:
        ...


EngineFactory = Callable[[str], EngineProtocol]


class _SubprocessUciEngine:
    """Minimal persistent UCI engine wrapper for environments where asyncio subprocess transport fails."""

    def __init__(self, engine_path: str, *, startup_timeout_ms: int) -> None:
        self._process = subprocess.Popen(
            [engine_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        if self._process.stdin is None or self._process.stdout is None:
            raise OSError("Engine process pipes could not be created.")
        self._stdin = self._process.stdin
        self._stdout = self._process.stdout
        self._startup_timeout_ms = startup_timeout_ms
        self._boot()

    def _boot(self) -> None:
        self._send("uci")
        while True:
            line = self._readline()
            if line == "uciok":
                break
        self._ensure_ready()

    def configure(self, options: dict[str, Any]) -> None:
        for name, value in options.items():
            self._send(f"setoption name {name} value {value}")
        self._ensure_ready()

    def analyse(
        self,
        board: chess.Board,
        limit: chess.engine.Limit,
        *,
        multipv: int = 1,
    ) -> dict[str, Any] | list[dict[str, Any]]:
        self._send(f"setoption name MultiPV value {multipv}")
        self._ensure_ready()
        self._send(f"position fen {board.fen()}")
        self._send(self._go_command(limit))

        info_by_rank: dict[int, dict[str, Any]] = {}
        while True:
            line = self._readline()
            if line.startswith("info "):
                parsed = self._parse_info_line(board, line)
                if parsed is not None:
                    info_by_rank[parsed["multipv"]] = parsed
            elif line.startswith("bestmove "):
                break

        ordered = [info_by_rank[key] for key in sorted(info_by_rank)]
        return ordered if multipv > 1 else (ordered[0] if ordered else {})

    def quit(self) -> None:
        try:
            self._send("quit")
        except Exception:
            pass
        try:
            self._process.terminate()
        except Exception:
            pass
        try:
            self._process.wait(timeout=2)
        except Exception:
            try:
                self._process.kill()
            except Exception:
                pass
        try:
            self._stdin.close()
        except Exception:
            pass
        try:
            self._stdout.close()
        except Exception:
            pass

    def _ensure_ready(self) -> None:
        self._send("isready")
        while True:
            line = self._readline()
            if line == "readyok":
                return

    def _send(self, command: str) -> None:
        self._stdin.write(f"{command}\n")
        self._stdin.flush()

    def _readline(self) -> str:
        line = self._stdout.readline()
        if line == "":
            raise chess.engine.EngineError("Engine process closed unexpectedly.")
        return line.strip()

    @staticmethod
    def _go_command(limit: chess.engine.Limit) -> str:
        parts = ["go"]
        if limit.depth is not None:
            parts.extend(["depth", str(limit.depth)])
        if limit.time is not None:
            parts.extend(["movetime", str(max(1, int(limit.time * 1000)))])
        return " ".join(parts)

    @staticmethod
    def _parse_info_line(board: chess.Board, line: str) -> dict[str, Any] | None:
        tokens = line.split()
        if "score" not in tokens or "pv" not in tokens:
            return None

        multipv = 1
        if "multipv" in tokens:
            try:
                multipv = int(tokens[tokens.index("multipv") + 1])
            except (ValueError, IndexError):
                multipv = 1

        score_index = tokens.index("score")
        try:
            score_type = tokens[score_index + 1]
            score_value = int(tokens[score_index + 2])
        except (ValueError, IndexError):
            return None

        if score_type == "cp":
            score = chess.engine.PovScore(chess.engine.Cp(score_value), board.turn)
        elif score_type == "mate":
            score = chess.engine.PovScore(chess.engine.Mate(score_value), board.turn)
        else:
            return None

        pv_index = tokens.index("pv")
        move_tokens = tokens[pv_index + 1 :]
        pv: list[chess.Move] = []
        replay_board = board.copy(stack=False)
        for token in move_tokens:
            try:
                move = chess.Move.from_uci(token)
            except ValueError:
                break
            if move not in replay_board.legal_moves:
                break
            pv.append(move)
            replay_board.push(move)

        if not pv:
            return None

        return {
            "multipv": multipv,
            "pv": pv,
            "score": score,
        }


class EngineAnalysisService:
    """Runs pure engine analysis against a FEN position."""

    def __init__(
        self,
        engine_path: str | None = None,
        *,
        threads: int = 1,
        hash_mb: int = 64,
        depth: int = 12,
        multipv: int = 3,
        move_time_ms: int | None = None,
        startup_timeout_ms: int = 10000,
        settings: EngineSettings | None = None,
        engine_factory: EngineFactory | None = None,
    ) -> None:
        config = settings or EngineSettings(
            path=engine_path or os.getenv("CHESS_ENGINE_PATH"),
            threads=max(1, threads),
            hash_mb=max(1, hash_mb),
            multipv=max(1, multipv),
            depth=max(1, depth),
            move_time_ms=move_time_ms,
            startup_timeout_ms=max(1000, startup_timeout_ms),
        )
        self._engine_path = config.path
        self._threads = config.threads
        self._hash_mb = config.hash_mb
        self._depth = config.depth
        self._multipv = config.multipv
        self._move_time_ms = config.move_time_ms
        self._startup_timeout_ms = config.startup_timeout_ms
        self._engine_factory = engine_factory or self._default_engine_factory
        self._engine: EngineProtocol | None = None
        self._engine_lock = Lock()

    def analyze_fen(self, fen: str) -> AnalysisResult:
        board = self._board_from_fen(fen)
        with self._engine_lock:
            engine = self._start_engine()
            try:
                raw_info = engine.analyse(
                    board,
                    self._analysis_limit(),
                    multipv=self._multipv,
                )
            except chess.engine.EngineError as exc:
                self._reset_engine()
                raise EngineAnalysisError(f"Engine failed during analysis: {exc}") from exc
            except TimeoutError as exc:
                self._reset_engine()
                raise EngineAnalysisError("Engine timed out during analysis.") from exc
            except Exception as exc:
                self._reset_engine()
                raise EngineAnalysisError(f"Unexpected engine analysis failure: {exc}") from exc

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

    def close(self) -> None:
        with self._engine_lock:
            self._reset_engine()

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

        if self._engine is not None:
            return self._engine

        try:
            engine = self._engine_factory(self._engine_path)
        except FileNotFoundError as exc:
            raise EngineUnavailableError(f"Engine binary was not found: {self._engine_path}") from exc
        except OSError as exc:
            raise EngineUnavailableError(f"Engine could not be started: {exc}") from exc
        try:
            self._configure_engine(engine)
        except chess.engine.EngineError as exc:
            self._quit_engine(engine)
            raise EngineConfigurationError(f"Engine options could not be configured: {exc}") from exc

        self._engine = engine
        return engine

    def _default_engine_factory(self, engine_path: str) -> EngineProtocol:
        try:
            return chess.engine.SimpleEngine.popen_uci(engine_path, timeout=self._startup_timeout_ms / 1000)
        except (PermissionError, NotImplementedError):
            return _SubprocessUciEngine(engine_path, startup_timeout_ms=self._startup_timeout_ms)

    def _configure_engine(self, engine: EngineProtocol) -> None:
        options = {
            "Threads": self._threads,
            "Hash": self._hash_mb,
        }
        engine.configure(options)

    @staticmethod
    def _quit_engine(engine: EngineProtocol) -> None:
        try:
            engine.quit()
        except Exception:
            return

    def _reset_engine(self) -> None:
        if self._engine is None:
            return
        self._quit_engine(self._engine)
        self._engine = None

    def _analysis_limit(self) -> chess.engine.Limit:
        if self._move_time_ms is not None and self._move_time_ms > 0:
            return chess.engine.Limit(
                depth=self._depth,
                time=self._move_time_ms / 1000,
            )
        return chess.engine.Limit(depth=self._depth)

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
    threads: int = 1,
    hash_mb: int = 64,
    depth: int = 12,
    multipv: int = 3,
    move_time_ms: int | None = None,
    startup_timeout_ms: int = 10000,
) -> AnalysisResult:
    service = EngineAnalysisService(
        engine_path=engine_path,
        threads=threads,
        hash_mb=hash_mb,
        depth=depth,
        multipv=multipv,
        move_time_ms=move_time_ms,
        startup_timeout_ms=startup_timeout_ms,
    )
    try:
        return service.analyze_fen(fen)
    finally:
        service.close()
