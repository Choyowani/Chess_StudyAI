import unittest

from backend.app.analysis.engine_service import AnalysisResult, CandidateMove, EvaluationScore
from backend.app.coaching.feedback_service import MoveFeedback
from backend.app.coaching.review_service import ReviewService
from backend.app.domain.game_state import MoveRecord
from backend.app.persistence.models import GameReviewEntry


class ReviewServiceTests(unittest.TestCase):
    def test_builds_structured_review_report(self) -> None:
        service = ReviewService()
        entries = (
            self._entry(1, "e4", 20, "Good", "Matched the best move.", "Plan: fight for the center with e5.", 10),
            self._entry(2, "f3", 520, "Blunder", "This move drops too much value.", "Plan: respond to the check first and stabilize the king.", 500),
            self._entry(3, "Nc3", 35, "Good", "Your move stays close to the best line.", "Plan: improve piece activity by developing with Nf6.", 15),
            self._entry(4, "g4", 320, "Mistake", "This choice misses a stronger continuation.", "Plan: look for the active tactical idea Qh4# and punish loose pieces.", 450),
        )

        report = service.build_report(entries)

        self.assertLessEqual(len(report.critical_mistakes), 3)
        self.assertGreaterEqual(len(report.good_moves), 2)
        self.assertGreaterEqual(len(report.turning_points), 1)
        self.assertGreaterEqual(len(report.study_points), 1)

    def _entry(
        self,
        ply_index: int,
        move_san: str,
        loss: int,
        label: str,
        explanation: str,
        plan: str,
        after_eval: int,
    ) -> GameReviewEntry:
        move = MoveRecord(
            ply_index=ply_index,
            side_to_move_before="white" if ply_index % 2 == 1 else "black",
            before_fen=f"before-{ply_index}",
            move_uci="e2e4",
            move_san=move_san,
            after_fen=f"after-{ply_index}",
        )
        analysis = AnalysisResult(
            fen=f"fen-{ply_index}",
            best_move=CandidateMove(
                rank=1,
                move_uci="e2e4",
                move_san="e4",
                score=EvaluationScore(perspective="side_to_move", centipawns=after_eval, mate=None),
                principal_variation_uci=("e2e4",),
                principal_variation_san=("e4",),
            ),
            top_moves=(),
            evaluation=EvaluationScore(perspective="side_to_move", centipawns=-after_eval, mate=None),
        )
        feedback = MoveFeedback(
            played_move_uci="e2e4",
            played_move_san=move_san,
            best_move_uci="e2e4",
            best_move_san="e4",
            score_loss_centipawns=loss,
            move_quality_label=label,  # type: ignore[arg-type]
            short_explanation=explanation,
            current_plan=plan,
        )
        return GameReviewEntry(move_record=move, analysis_before=analysis, analysis_after=analysis, feedback=feedback)


if __name__ == "__main__":
    unittest.main()
