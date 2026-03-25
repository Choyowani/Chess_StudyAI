from __future__ import annotations

from dataclasses import dataclass

from backend.app.analysis.engine_service import AnalysisResult
from backend.app.coaching.feedback_service import MoveFeedback
from backend.app.domain.game_state import MoveRecord


@dataclass(frozen=True, slots=True)
class GameReviewEntry:
    move_record: MoveRecord
    analysis_before: AnalysisResult | None
    analysis_after: AnalysisResult | None
    feedback: MoveFeedback | None
