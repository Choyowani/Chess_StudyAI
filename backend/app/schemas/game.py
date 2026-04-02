from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


ColorName = Literal["white", "black"]


class MoveRecordResponse(BaseModel):
    ply_index: int
    side_to_move_before: ColorName
    before_fen: str
    move_uci: str
    move_san: str
    after_fen: str


class GameStatusResponse(BaseModel):
    turn: ColorName
    is_check: bool
    is_checkmate: bool
    is_stalemate: bool
    is_draw: bool
    draw_reason: str | None
    is_game_over: bool
    result: str | None
    winner: ColorName | None
    terminal_reason: str | None = None


class EvaluationScoreResponse(BaseModel):
    perspective: str
    centipawns: int | None
    mate: int | None


class CandidateMoveResponse(BaseModel):
    rank: int
    move_uci: str
    move_san: str
    score: EvaluationScoreResponse
    principal_variation_uci: list[str]
    principal_variation_san: list[str]


class AnalysisResponse(BaseModel):
    fen: str
    best_move: CandidateMoveResponse
    top_moves: list[CandidateMoveResponse]
    evaluation: EvaluationScoreResponse


class AnalysisErrorResponse(BaseModel):
    fen: str
    error_type: str
    message: str


class MoveFeedbackResponse(BaseModel):
    played_move_uci: str
    played_move_san: str
    best_move_uci: str
    best_move_san: str
    score_loss_centipawns: int
    move_quality_label: str
    short_explanation: str
    current_plan: str


class ArchivedMoveLogResponse(BaseModel):
    ply_index: int
    side_to_move_before: ColorName
    before_fen: str
    move_uci: str
    move_san: str
    after_fen: str
    best_move_uci: str | None
    best_move_san: str | None
    top_candidate_moves: list[dict[str, object]]
    move_quality_label: str | None
    short_coaching_note: str | None
    current_plan: str | None
    pattern_tags: list[dict[str, str]]


class ReviewItemResponse(BaseModel):
    ply_index: int
    move_san: str
    note: str
    score_loss_centipawns: int | None = None


class TurningPointResponse(BaseModel):
    ply_index: int
    move_san: str
    swing_centipawns: int
    note: str


class ReviewReportResponse(BaseModel):
    critical_mistakes: list[ReviewItemResponse]
    good_moves: list[ReviewItemResponse]
    turning_points: list[TurningPointResponse]
    study_points: list[str]


class ArchivedGameResponse(BaseModel):
    id: str
    user_id: str
    started_at: str
    finished_at: str
    result: str | None
    terminal_reason: str | None = None
    user_color: str
    initial_fen: str
    final_fen: str
    pgn: str
    summary_text: str | None
    review_report: ReviewReportResponse | None
    move_logs: list[ArchivedMoveLogResponse]


class ArchivedGameSummaryResponse(BaseModel):
    game_id: str
    started_at: str
    finished_at: str
    result: str | None
    terminal_reason: str | None = None
    user_color: str
    move_count: int
    summary_preview: str | None


class InProgressGameSummaryResponse(BaseModel):
    game_id: str
    user_id: str
    current_fen: str
    started_at: str
    updated_at: str
    status: str
    user_color: str
    move_count: int


class GameSnapshotResponse(BaseModel):
    game_id: str
    fen: str
    last_move_uci: str | None
    move_history: list[MoveRecordResponse]
    status: GameStatusResponse
    legal_moves: list[str]
    analysis: AnalysisResponse | None = None
    analysis_error: AnalysisErrorResponse | None = None
    feedback: MoveFeedbackResponse | None = None
    feedback_error: str | None = None
    archived_game_id: str | None = None


class MoveRequest(BaseModel):
    move_uci: str = Field(min_length=4, max_length=5)
    promotion_piece: Literal["q", "r", "b", "n"] | None = None


class ResignationRequest(BaseModel):
    side: ColorName


class GameCreateRequest(BaseModel):
    user_id: str = Field(default="local-user", min_length=1, max_length=100)


class PgnImportRequest(BaseModel):
    user_id: str = Field(default="local-user", min_length=1, max_length=100)
    pgn_text: str = Field(min_length=1)


class WeaknessPatternResponse(BaseModel):
    pattern_type: str
    pattern_key: str
    display_label: str
    frequency: int
    last_seen_at: str
    notes: str
    study_recommendation: str
    related_game_ids: list[str]


class UserWeaknessSummaryResponse(BaseModel):
    user_id: str
    patterns: list[WeaknessPatternResponse]
