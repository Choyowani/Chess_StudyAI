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
                            note=f"Evaluation swung by {(swing / 100):.2f} pawns after {entry.move_record.move_san}.",
                        )
                    )
            previous_eval = current_eval

        return points

    def _study_points(self, feedback_entries: list[GameReviewEntry]) -> tuple[str, ...]:
        points: list[str] = []
        high_loss = [entry for entry in feedback_entries if entry.feedback.score_loss_centipawns >= 220]
        if high_loss:
            points.append("Study point: review the moments where one move changed the evaluation sharply.")

        tactical = [
            entry
            for entry in feedback_entries
            if "tactical" in entry.feedback.current_plan.lower() or "punish loose pieces" in entry.feedback.current_plan.lower()
        ]
        if tactical:
            points.append("Study point: spend time on tactical awareness and checking forcing moves first.")

        center = [entry for entry in feedback_entries if "center" in entry.feedback.current_plan.lower()]
        if center:
            points.append("Study point: compare your move choices with central control plans in the opening.")

        development = [entry for entry in feedback_entries if "develop" in entry.feedback.current_plan.lower()]
        if development:
            points.append("Study point: focus on faster development and piece activity in similar positions.")

        if not points:
            points.append("Study point: keep comparing your moves with the engine's first choice to sharpen move selection.")

        return tuple(points[:4])

    @staticmethod
    def _mover_perspective_eval(entry: GameReviewEntry) -> int:
        if entry.analysis_after is None:
            return 0
        score = entry.analysis_after.evaluation
        raw = score.centipawns if score.centipawns is not None else 0
        return -raw
