from __future__ import annotations

from dataclasses import dataclass

from backend.app.persistence.models import GameReviewEntry


@dataclass(frozen=True, slots=True)
class ReviewItem:
    ply_index: int
    move_san: str
    note: str
    score_loss_centipawns: int | None = None


@dataclass(frozen=True, slots=True)
class TurningPoint:
    ply_index: int
    move_san: str
    swing_centipawns: int
    note: str


@dataclass(frozen=True, slots=True)
class GameReviewReport:
    critical_mistakes: tuple[ReviewItem, ...]
    good_moves: tuple[ReviewItem, ...]
    turning_points: tuple[TurningPoint, ...]
    study_points: tuple[str, ...]


class ReviewService:
    """Builds a compact post-game review report from per-move review data."""

    def build_report(self, review_entries: tuple[GameReviewEntry, ...]) -> GameReviewReport:
        feedback_entries = [entry for entry in review_entries if entry.feedback is not None]

        critical_mistakes = tuple(
            ReviewItem(
                ply_index=entry.move_record.ply_index,
                move_san=entry.move_record.move_san,
                note=entry.feedback.short_explanation,
                score_loss_centipawns=entry.feedback.score_loss_centipawns,
            )
            for entry in sorted(
                (
                    entry
                    for entry in feedback_entries
                    if entry.feedback.move_quality_label in {"Blunder", "Mistake", "Inaccuracy"}
                ),
                key=lambda item: item.feedback.score_loss_centipawns,
                reverse=True,
            )[:3]
        )

        good_moves = tuple(
            ReviewItem(
                ply_index=entry.move_record.ply_index,
                move_san=entry.move_record.move_san,
                note=entry.feedback.short_explanation,
                score_loss_centipawns=entry.feedback.score_loss_centipawns,
            )
            for entry in sorted(
                (
                    entry
                    for entry in feedback_entries
                    if entry.feedback.move_quality_label in {"Good", "Playable"}
                ),
                key=lambda item: item.feedback.score_loss_centipawns,
            )[:3]
        )

        turning_points = tuple(
            sorted(self._turning_points(review_entries), key=lambda point: point.swing_centipawns, reverse=True)[:3]
        )

        study_points = self._study_points(feedback_entries)

        return GameReviewReport(
            critical_mistakes=critical_mistakes,
            good_moves=good_moves,
            turning_points=turning_points,
            study_points=study_points,
        )

    def _turning_points(self, review_entries: tuple[GameReviewEntry, ...]) -> list[TurningPoint]:
        points: list[TurningPoint] = []
        previous_eval: int | None = None

        for entry in review_entries:
            if entry.analysis_after is None:
                continue

            current_eval = self._mover_perspective_eval(entry)
            if previous_eval is not None:
                swing = abs(current_eval - previous_eval)
                if swing >= 80:
                    points.append(
                        TurningPoint(
                            ply_index=entry.move_record.ply_index,
                            move_san=entry.move_record.move_san,
                            swing_centipawns=swing,
                            note=f"{entry.move_record.move_san} 이후 평가가 {(swing / 100):.2f}폰만큼 크게 흔들렸습니다.",
                        )
                    )
            previous_eval = current_eval

        return points

    def _study_points(self, feedback_entries: list[GameReviewEntry]) -> tuple[str, ...]:
        points: list[str] = []
        high_loss = [entry for entry in feedback_entries if entry.feedback.score_loss_centipawns >= 220]
        if high_loss:
            points.append("학습 포인트: 한 수로 평가가 크게 흔들린 장면을 다시 보며 왜 급격히 나빠졌는지 확인해 보세요.")

        tactical = [
            entry
            for entry in feedback_entries
            if "전술" in entry.feedback.current_plan.lower() or "느슨한 기물" in entry.feedback.current_plan.lower()
        ]
        if tactical:
            points.append("학습 포인트: 수를 두기 전에 체크, 잡기, 직접 위협 같은 강제 수를 먼저 보는 습관을 들여 보세요.")

        center = [entry for entry in feedback_entries if "중앙" in entry.feedback.current_plan.lower()]
        if center:
            points.append("학습 포인트: 오프닝에서는 중앙 장악 계획과 내 선택이 어떻게 달랐는지 비교해 보세요.")

        development = [entry for entry in feedback_entries if "전개" in entry.feedback.current_plan.lower()]
        if development:
            points.append("학습 포인트: 비슷한 장면에서는 더 빠른 기물 전개와 활동성 확보에 집중해 보세요.")

        if not points:
            points.append("학습 포인트: 내 수와 엔진의 1순위 수를 계속 비교하면서 수 선택 기준을 다듬어 보세요.")

        return tuple(points[:4])

    @staticmethod
    def _mover_perspective_eval(entry: GameReviewEntry) -> int:
        if entry.analysis_after is None:
            return 0
        score = entry.analysis_after.evaluation
        raw = score.centipawns if score.centipawns is not None else 0
        return -raw
