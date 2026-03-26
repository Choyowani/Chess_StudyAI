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
            self._entry(1, "e4", 20, "Good", "이 장면에서는 엔진의 1순위 수와 같은 선택이었습니다.", "계획: e5로 중앙 주도권을 다투는 흐름을 보세요.", 10),
            self._entry(2, "f3", 520, "Blunder", "엔진의 1순위 수와 비교해 너무 많은 가치를 잃은 선택이었습니다.", "계획: 먼저 체크에 대응하며 킹을 안정시키세요.", 500),
            self._entry(3, "Nc3", 35, "Good", "최선의 흐름과 크게 어긋나지 않는 수였습니다.", "계획: Nf6로 기물을 전개하며 활동성을 높이세요.", 15),
            self._entry(4, "g4", 320, "Mistake", "더 강한 흐름을 놓쳐 국면의 방향이 좋지 않게 바뀌었습니다.", "계획: Qh4# 같은 전술 수를 먼저 확인하고 느슨한 기물을 압박하세요.", 450),
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
