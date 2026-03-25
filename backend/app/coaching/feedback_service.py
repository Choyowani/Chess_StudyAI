from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import chess

from backend.app.analysis.engine_service import AnalysisResult
from backend.app.domain.game_state import MoveRecord


MoveQualityLabel = Literal["Good", "Playable", "Inaccuracy", "Mistake", "Blunder"]


@dataclass(frozen=True, slots=True)
class MoveFeedback:
    played_move_uci: str
    played_move_san: str
    best_move_uci: str
    best_move_san: str
    score_loss_centipawns: int
    move_quality_label: MoveQualityLabel
    short_explanation: str
    current_plan: str


class FeedbackService:
    """Turns engine analysis outputs into learner-facing move feedback."""

    def build_feedback(
        self,
        move_record: MoveRecord,
        before_analysis: AnalysisResult,
        after_analysis: AnalysisResult,
    ) -> MoveFeedback:
        best_value = self._numeric_score(before_analysis.best_move.score)
        actual_value = -self._numeric_score(after_analysis.evaluation)
        score_loss = max(0, best_value - actual_value)
        label = self._quality_label(score_loss)

        return MoveFeedback(
            played_move_uci=move_record.move_uci,
            played_move_san=move_record.move_san,
            best_move_uci=before_analysis.best_move.move_uci,
            best_move_san=before_analysis.best_move.move_san,
            score_loss_centipawns=score_loss,
            move_quality_label=label,
            short_explanation=self._explanation(label, move_record, before_analysis),
            current_plan=self._plan_line(after_analysis),
        )

    @staticmethod
    def _numeric_score(score) -> int:
        if score.centipawns is not None:
            return score.centipawns
        if score.mate is not None:
            sign = 1 if score.mate > 0 else -1
            return sign * (100000 - abs(score.mate))
        return 0

    @staticmethod
    def _quality_label(score_loss: int) -> MoveQualityLabel:
        if score_loss <= 40:
            return "Good"
        if score_loss <= 110:
            return "Playable"
        if score_loss <= 220:
            return "Inaccuracy"
        if score_loss <= 420:
            return "Mistake"
        return "Blunder"

    @staticmethod
    def _explanation(label: MoveQualityLabel, move_record: MoveRecord, before_analysis: AnalysisResult) -> str:
        if move_record.move_uci == before_analysis.best_move.move_uci:
            return "You matched the engine's preferred move in this position."

        prefix = {
            "Good": "Your move stays close to the best line.",
            "Playable": "Your move is usable, but there was a cleaner option.",
            "Inaccuracy": "This move gives away some value and loosens the position.",
            "Mistake": "This choice misses a stronger continuation and shifts the game the wrong way.",
            "Blunder": "This move drops too much value compared with the engine's first choice.",
        }[label]
        return f"{prefix} The engine preferred {before_analysis.best_move.move_san}."

    def _plan_line(self, after_analysis: AnalysisResult) -> str:
        best_reply = after_analysis.best_move.move_san
        san = best_reply
        uci = after_analysis.best_move.move_uci
        destination = uci[2:4]

        if san in {"O-O", "O-O-O"}:
            return f"Plan: prioritize king safety and coordination with {san}."
        if "x" in san:
            return f"Plan: look for the active tactical idea {san} and punish loose pieces."
        if destination in {"d4", "e4", "d5", "e5"}:
            return f"Plan: fight for the center with {san}."
        if san.startswith(("N", "B")):
            return f"Plan: improve piece activity by developing with {san}."
        if san.startswith("R"):
            return f"Plan: activate the rook with {san} and increase pressure."
        if san.startswith("Q"):
            return f"Plan: use {san} to increase pressure, but keep queen activity coordinated."

        board = chess.Board(after_analysis.fen)
        if board.is_check():
            return "Plan: respond to the check first and stabilize the king."
        return f"Plan: the engine wants {san} as the most direct improving move."
