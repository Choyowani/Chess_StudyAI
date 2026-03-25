import unittest

from backend.app.analysis.engine_service import AnalysisResult, CandidateMove, EvaluationScore
from backend.app.coaching.feedback_service import FeedbackService
from backend.app.domain.game_state import MoveRecord


class FeedbackServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = FeedbackService()

    def test_builds_good_feedback_for_best_move_match(self) -> None:
        move_record = MoveRecord(
            ply_index=1,
            side_to_move_before="white",
            before_fen="start",
            move_uci="e2e4",
            move_san="e4",
            after_fen="after",
        )
        before_analysis = AnalysisResult(
            fen="start",
            best_move=CandidateMove(
                rank=1,
                move_uci="e2e4",
                move_san="e4",
                score=EvaluationScore(perspective="side_to_move", centipawns=40, mate=None),
                principal_variation_uci=("e2e4",),
                principal_variation_san=("e4",),
            ),
            top_moves=(),
            evaluation=EvaluationScore(perspective="side_to_move", centipawns=40, mate=None),
        )
        after_analysis = AnalysisResult(
            fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
            best_move=CandidateMove(
                rank=1,
                move_uci="e7e5",
                move_san="e5",
                score=EvaluationScore(perspective="side_to_move", centipawns=-20, mate=None),
                principal_variation_uci=("e7e5",),
                principal_variation_san=("e5",),
            ),
            top_moves=(),
            evaluation=EvaluationScore(perspective="side_to_move", centipawns=-20, mate=None),
        )

        feedback = self.service.build_feedback(move_record, before_analysis, after_analysis)

        self.assertEqual(feedback.move_quality_label, "Good")
        self.assertEqual(feedback.best_move_uci, "e2e4")
        self.assertIn("matched", feedback.short_explanation.lower())
        self.assertTrue(feedback.current_plan.startswith("Plan:"))

    def test_marks_large_drop_as_blunder(self) -> None:
        move_record = MoveRecord(
            ply_index=1,
            side_to_move_before="white",
            before_fen="start",
            move_uci="f2f3",
            move_san="f3",
            after_fen="after",
        )
        before_analysis = AnalysisResult(
            fen="start",
            best_move=CandidateMove(
                rank=1,
                move_uci="e2e4",
                move_san="e4",
                score=EvaluationScore(perspective="side_to_move", centipawns=80, mate=None),
                principal_variation_uci=("e2e4",),
                principal_variation_san=("e4",),
            ),
            top_moves=(),
            evaluation=EvaluationScore(perspective="side_to_move", centipawns=80, mate=None),
        )
        after_analysis = AnalysisResult(
            fen="rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1",
            best_move=CandidateMove(
                rank=1,
                move_uci="e7e5",
                move_san="e5",
                score=EvaluationScore(perspective="side_to_move", centipawns=500, mate=None),
                principal_variation_uci=("e7e5",),
                principal_variation_san=("e5",),
            ),
            top_moves=(),
            evaluation=EvaluationScore(perspective="side_to_move", centipawns=500, mate=None),
        )

        feedback = self.service.build_feedback(move_record, before_analysis, after_analysis)

        self.assertEqual(feedback.move_quality_label, "Blunder")
        self.assertGreater(feedback.score_loss_centipawns, 420)
        self.assertIn("preferred", feedback.short_explanation.lower())


if __name__ == "__main__":
    unittest.main()
