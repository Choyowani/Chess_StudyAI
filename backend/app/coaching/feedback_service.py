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
            return "이 장면에서는 엔진의 1순위 수와 같은 선택이었습니다."

        prefix = {
            "Good": "최선의 흐름과 크게 어긋나지 않는 수였습니다.",
            "Playable": "둘 수는 있었지만 더 깔끔한 선택이 있었습니다.",
            "Inaccuracy": "가치를 조금 내주면서 포지션을 다소 느슨하게 만들었습니다.",
            "Mistake": "더 강한 흐름을 놓쳐 국면의 방향이 좋지 않게 바뀌었습니다.",
            "Blunder": "엔진의 1순위 수와 비교해 너무 많은 가치를 잃은 선택이었습니다.",
        }[label]
        return f"{prefix} 이 장면에서 엔진은 {before_analysis.best_move.move_san}를 더 높게 평가했습니다."

    def _plan_line(self, after_analysis: AnalysisResult) -> str:
        best_reply = after_analysis.best_move.move_san
        san = best_reply
        uci = after_analysis.best_move.move_uci
        destination = uci[2:4]

        if san in {"O-O", "O-O-O"}:
            return f"계획: {san}로 킹 안전과 기물 연결을 먼저 챙기세요."
        if "x" in san:
            return f"계획: {san} 같은 전술 수를 먼저 확인하고 느슨한 기물을 압박하세요."
        if destination in {"d4", "e4", "d5", "e5"}:
            return f"계획: {san}로 중앙 주도권을 다투는 흐름을 보세요."
        if san.startswith(("N", "B")):
            return f"계획: {san}로 기물을 전개하며 활동성을 높이세요."
        if san.startswith("R"):
            return f"계획: {san}로 룩을 활성화해 압박을 키우세요."
        if san.startswith("Q"):
            return f"계획: {san}로 압박을 늘리되 퀸이 혼자 앞서가지 않게 조율하세요."

        board = chess.Board(after_analysis.fen)
        if board.is_check():
            return "계획: 먼저 체크에 대응하며 킹을 안정시키세요."
        return f"계획: 엔진은 {san}를 가장 직접적인 개선 수로 보고 있습니다."
