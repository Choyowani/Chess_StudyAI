from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import chess


ColorName = Literal["white", "black"]


class InvalidMoveError(ValueError):
    """Raised when a move cannot be parsed or is illegal in the current position."""


@dataclass(frozen=True, slots=True)
class MoveRecord:
    ply_index: int
    side_to_move_before: ColorName
    before_fen: str
    move_uci: str
    move_san: str
    after_fen: str


@dataclass(frozen=True, slots=True)
class GameStatus:
    turn: ColorName
    is_check: bool
    is_checkmate: bool
    is_stalemate: bool
    is_draw: bool
    draw_reason: str | None
    is_game_over: bool
    result: str | None
    winner: ColorName | None


class ChessGameState:
    """Owns the canonical board state and move history for a single chess game."""

    def __init__(self, initial_fen: str | None = None) -> None:
        self._initial_fen = initial_fen or chess.STARTING_FEN
        self._board = chess.Board(self._initial_fen)
        self._history: list[MoveRecord] = []

    @classmethod
    def from_records(
        cls,
        initial_fen: str,
        move_history: tuple[MoveRecord, ...] | list[MoveRecord],
        *,
        expected_current_fen: str | None = None,
    ) -> "ChessGameState":
        state = cls(initial_fen)
        for expected in move_history:
            applied = state.apply_uci_move(expected.move_uci)
            if (
                applied.ply_index != expected.ply_index
                or applied.side_to_move_before != expected.side_to_move_before
                or applied.before_fen != expected.before_fen
                or applied.move_san != expected.move_san
                or applied.after_fen != expected.after_fen
            ):
                raise ValueError("Stored move history does not match canonical replay state.")
        if expected_current_fen is not None and state.current_fen() != expected_current_fen:
            raise ValueError("Stored current FEN does not match the replayed move history.")
        return state

    @property
    def initial_fen(self) -> str:
        return self._initial_fen

    @property
    def move_history(self) -> tuple[MoveRecord, ...]:
        return tuple(self._history)

    def current_fen(self) -> str:
        return self._board.fen()

    def legal_moves(self) -> tuple[str, ...]:
        return tuple(move.uci() for move in self._board.legal_moves)

    def is_legal_uci_move(self, move_uci: str) -> bool:
        try:
            move = chess.Move.from_uci(move_uci)
        except ValueError:
            return False
        return move in self._board.legal_moves

    def apply_uci_move(self, move_uci: str) -> MoveRecord:
        try:
            move = chess.Move.from_uci(move_uci)
        except ValueError as exc:
            raise InvalidMoveError(f"Invalid UCI move: {move_uci}") from exc

        if move not in self._board.legal_moves:
            raise InvalidMoveError(f"Illegal move for current position: {move_uci}")

        before_fen = self._board.fen()
        side_to_move_before = self._color_name(self._board.turn)
        move_san = self._board.san(move)
        self._board.push(move)
        record = MoveRecord(
            ply_index=len(self._history) + 1,
            side_to_move_before=side_to_move_before,
            before_fen=before_fen,
            move_uci=move.uci(),
            move_san=move_san,
            after_fen=self._board.fen(),
        )
        self._history.append(record)
        return record

    def undo_last_move(self) -> MoveRecord:
        if not self._history:
            raise IndexError("No moves available to undo.")

        record = self._history.pop()
        self._board.pop()
        return record

    def reset(self) -> None:
        self._board = chess.Board(self._initial_fen)
        self._history.clear()

    def status(self) -> GameStatus:
        outcome = self._board.outcome(claim_draw=True)
        draw_reason = self._draw_reason(outcome.termination) if outcome and outcome.winner is None else None
        result = outcome.result() if outcome else None
        winner = self._winner_name(outcome.winner) if outcome and outcome.winner is not None else None

        return GameStatus(
            turn=self._color_name(self._board.turn),
            is_check=self._board.is_check(),
            is_checkmate=self._board.is_checkmate(),
            is_stalemate=self._board.is_stalemate(),
            is_draw=bool(outcome and outcome.winner is None),
            draw_reason=draw_reason,
            is_game_over=self._board.is_game_over(claim_draw=True),
            result=result,
            winner=winner,
        )

    @staticmethod
    def _color_name(color: chess.Color) -> ColorName:
        return "white" if color == chess.WHITE else "black"

    def _winner_name(self, color: chess.Color) -> ColorName:
        return self._color_name(color)

    @staticmethod
    def _draw_reason(termination: chess.Termination) -> str:
        mapping = {
            chess.Termination.STALEMATE: "stalemate",
            chess.Termination.INSUFFICIENT_MATERIAL: "insufficient_material",
            chess.Termination.SEVENTYFIVE_MOVES: "seventyfive_moves",
            chess.Termination.FIVEFOLD_REPETITION: "fivefold_repetition",
            chess.Termination.FIFTY_MOVES: "fifty_moves_claim",
            chess.Termination.THREEFOLD_REPETITION: "threefold_repetition_claim",
            chess.Termination.VARIANT_DRAW: "variant_draw",
        }
        return mapping.get(termination, termination.name.lower())
