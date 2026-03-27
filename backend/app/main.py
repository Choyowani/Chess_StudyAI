from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import cast

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from backend.app.analysis.engine_service import AnalysisFailure, AnalysisResult, EngineAnalysisService
from backend.app.config import EngineSettings
from backend.app.coaching.feedback_service import FeedbackService, MoveFeedback
from backend.app.coaching.review_service import ReviewService
from backend.app.coaching.weakness_service import UserWeaknessSummaryItem, WeaknessService
from backend.app.domain.game_state import InvalidMoveError
from backend.app.persistence.archive_store import SqliteGameArchiveRepository
from backend.app.persistence.checkpoint_store import InProgressGameRecord, SqliteGameCheckpointRepository
from backend.app.persistence.models import GameReviewEntry
from backend.app.schemas.game import (
    ArchivedGameResponse,
    ArchivedGameSummaryResponse,
    GameCreateRequest,
    GameSnapshotResponse,
    InProgressGameSummaryResponse,
    MoveRequest,
    UserWeaknessSummaryResponse,
)
from backend.app.services.game_sessions import GameSession, GameSessionStore


app = FastAPI(title="Chess Study Assistant API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = GameSessionStore()
app.state.engine_settings = EngineSettings.from_env()
app.state.analysis_service = EngineAnalysisService(settings=app.state.engine_settings)
app.state.feedback_service = FeedbackService()
app.state.review_service = ReviewService()
app.state.weakness_service = WeaknessService()
app.state.archive_repository = SqliteGameArchiveRepository()
app.state.checkpoint_repository = SqliteGameCheckpointRepository()


@app.on_event("shutdown")
def shutdown_services() -> None:
    cast(EngineAnalysisService, app.state.analysis_service).close()


def _analysis_payload(fen: str) -> tuple[dict[str, object] | None, dict[str, str] | None]:
    analysis_service = cast(EngineAnalysisService, app.state.analysis_service)
    result = analysis_service.safe_analyze_fen(fen)
    if isinstance(result, AnalysisFailure):
        return None, asdict(result)

    analysis = cast(AnalysisResult, result)
    return asdict(analysis), None


def _feedback_payload(
    move_record,
    before_analysis_result: AnalysisResult | AnalysisFailure,
    after_analysis_result: AnalysisResult | AnalysisFailure,
) -> tuple[dict[str, object] | None, str | None]:
    if isinstance(before_analysis_result, AnalysisFailure) or isinstance(after_analysis_result, AnalysisFailure):
        return None, "Feedback is unavailable because engine analysis could not be completed for this move."

    feedback_service = cast(FeedbackService, app.state.feedback_service)
    feedback = feedback_service.build_feedback(move_record, before_analysis_result, after_analysis_result)
    return asdict(feedback), None


def _snapshot_from_session(
    session: GameSession,
    *,
    analysis: dict[str, object] | None = None,
    analysis_error: dict[str, str] | None = None,
    feedback: dict[str, object] | None = None,
    feedback_error: str | None = None,
) -> GameSnapshotResponse:
    history = [asdict(record) for record in session.game_state.move_history]
    status = asdict(session.game_state.status())
    last_move = session.game_state.move_history[-1].move_uci if session.game_state.move_history else None

    return GameSnapshotResponse(
        game_id=session.game_id,
        fen=session.game_state.current_fen(),
        last_move_uci=last_move,
        move_history=history,
        status=status,
        legal_moves=list(session.game_state.legal_moves()),
        analysis=analysis,
        analysis_error=analysis_error,
        feedback=feedback,
        feedback_error=feedback_error,
        archived_game_id=session.archived_game_id,
    )


def _save_checkpoint(session: GameSession) -> None:
    checkpoint_repository = cast(SqliteGameCheckpointRepository, app.state.checkpoint_repository)
    checkpoint_repository.save_checkpoint(
        game_id=session.game_id,
        user_id=session.user_id,
        initial_fen=session.game_state.initial_fen,
        current_fen=session.game_state.current_fen(),
        started_at=session.started_at,
        updated_at=datetime.now(timezone.utc),
        status="in_progress",
        user_color="white",
        move_history=session.game_state.move_history,
        review_entries=tuple(session.review_entries),
    )


def _session_from_checkpoint(record: InProgressGameRecord) -> GameSession:
    from backend.app.domain.game_state import ChessGameState

    started_at = datetime.fromisoformat(record.started_at)
    return GameSession(
        game_id=record.game_id,
        user_id=record.user_id,
        game_state=ChessGameState.from_records(
            record.initial_fen,
            list(record.move_history),
            expected_current_fen=record.current_fen,
        ),
        started_at=started_at,
        review_entries=list(record.review_entries),
    )


def _get_or_restore_session(game_id: str) -> GameSession | None:
    session = store.get_game(game_id)
    if session is not None:
        return session

    checkpoint_repository = cast(SqliteGameCheckpointRepository, app.state.checkpoint_repository)
    checkpoint = checkpoint_repository.load_checkpoint(game_id)
    if checkpoint is None:
        return None

    session = _session_from_checkpoint(checkpoint)
    store.load_game(session)
    return session


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/games", response_model=GameSnapshotResponse)
def create_game(payload: GameCreateRequest | None = None) -> GameSnapshotResponse:
    session = store.create_game(user_id=(payload.user_id if payload else "local-user"))
    try:
        _save_checkpoint(session)
    except Exception:
        store.delete_game(session.game_id)
        raise HTTPException(status_code=500, detail="Game was created in memory but could not be checkpointed.")
    return _snapshot_from_session(session)


@app.get("/api/games/{game_id}", response_model=GameSnapshotResponse)
def get_game(game_id: str) -> GameSnapshotResponse:
    session = _get_or_restore_session(game_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Game session was not found.")
    return _snapshot_from_session(session)


@app.get("/api/checkpoints/games", response_model=list[InProgressGameSummaryResponse])
def list_in_progress_games(limit: int = 50) -> list[InProgressGameSummaryResponse]:
    checkpoint_repository = cast(SqliteGameCheckpointRepository, app.state.checkpoint_repository)
    checkpoints = checkpoint_repository.list_checkpoints(limit=limit)
    return [InProgressGameSummaryResponse(**asdict(item)) for item in checkpoints]


@app.get("/api/checkpoints/games/{game_id}/resume", response_model=GameSnapshotResponse)
def resume_in_progress_game(game_id: str) -> GameSnapshotResponse:
    session = _get_or_restore_session(game_id)
    if session is None:
        raise HTTPException(status_code=404, detail="In-progress game was not found.")
    return _snapshot_from_session(session)


@app.get("/api/archive/games/{game_id}", response_model=ArchivedGameResponse)
def get_archived_game(game_id: str) -> ArchivedGameResponse:
    archive_repository = cast(SqliteGameArchiveRepository, app.state.archive_repository)
    archived = archive_repository.load_game(game_id)
    if archived is None:
        raise HTTPException(status_code=404, detail="Archived game was not found.")
    return ArchivedGameResponse(**asdict(archived))


@app.get("/api/archive/games", response_model=list[ArchivedGameSummaryResponse])
def list_archived_games(limit: int = 50) -> list[ArchivedGameSummaryResponse]:
    archive_repository = cast(SqliteGameArchiveRepository, app.state.archive_repository)
    archived_games = archive_repository.list_games(limit=limit)
    return [ArchivedGameSummaryResponse(**asdict(item)) for item in archived_games]


@app.get("/api/users/{user_id}/weakness-summary", response_model=UserWeaknessSummaryResponse)
def get_user_weakness_summary(user_id: str) -> UserWeaknessSummaryResponse:
    archive_repository = cast(SqliteGameArchiveRepository, app.state.archive_repository)
    patterns = archive_repository.list_user_patterns(user_id)
    weakness_service = cast(WeaknessService, app.state.weakness_service)
    return UserWeaknessSummaryResponse(
        user_id=user_id,
        patterns=[
            {
                **asdict(item),
                "display_label": weakness_service.display_label(item.pattern_type, item.pattern_key),
                "study_recommendation": weakness_service.study_recommendation(item.pattern_type, item.pattern_key),
                "related_game_ids": archive_repository.list_related_games_for_pattern(
                    user_id,
                    pattern_type=item.pattern_type,
                    pattern_key=item.pattern_key,
                ),
            }
            for item in cast(list[UserWeaknessSummaryItem], patterns)
        ],
    )


@app.post("/api/games/{game_id}/moves", response_model=GameSnapshotResponse)
def apply_move(game_id: str, payload: MoveRequest) -> GameSnapshotResponse:
    session = _get_or_restore_session(game_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Game session was not found.")

    before_fen = session.game_state.current_fen()
    move_uci = payload.move_uci
    if payload.promotion_piece is not None:
        if len(move_uci) == 4:
            move_uci = f"{move_uci}{payload.promotion_piece}"
        elif len(move_uci) == 5 and move_uci[-1].lower() != payload.promotion_piece:
            raise HTTPException(status_code=400, detail="Promotion choice does not match the requested move.")
    try:
        move_record = session.game_state.apply_uci_move(move_uci)
    except InvalidMoveError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    before_analysis_result = cast(
        AnalysisResult | AnalysisFailure,
        cast(EngineAnalysisService, app.state.analysis_service).safe_analyze_fen(before_fen),
    )
    after_analysis_result = cast(
        AnalysisResult | AnalysisFailure,
        cast(EngineAnalysisService, app.state.analysis_service).safe_analyze_fen(session.game_state.current_fen()),
    )

    analysis = None if isinstance(after_analysis_result, AnalysisFailure) else asdict(after_analysis_result)
    analysis_error = asdict(after_analysis_result) if isinstance(after_analysis_result, AnalysisFailure) else None
    feedback, feedback_error = _feedback_payload(move_record, before_analysis_result, after_analysis_result)
    store.append_review_entry(
        game_id,
        GameReviewEntry(
            move_record=move_record,
            analysis_before=None if isinstance(before_analysis_result, AnalysisFailure) else before_analysis_result,
            analysis_after=None if isinstance(after_analysis_result, AnalysisFailure) else after_analysis_result,
            feedback=None if feedback is None else MoveFeedback(**feedback),
        ),
    )

    try:
        _save_checkpoint(session)
    except Exception as exc:
        session.game_state.undo_last_move()
        session.review_entries.pop()
        raise HTTPException(status_code=500, detail="Move was rejected because checkpoint persistence failed.") from exc

    status = session.game_state.status()
    if status.is_game_over and session.archived_game_id is None:
        archive_repository = cast(SqliteGameArchiveRepository, app.state.archive_repository)
        weakness_occurrences = cast(WeaknessService, app.state.weakness_service).detect_occurrences(
            tuple(session.review_entries)
        )
        archive_repository.save_completed_game(
            game_id=session.game_id,
            user_id=session.user_id,
            started_at=session.started_at,
            finished_at=datetime.now(timezone.utc),
            result=status.result,
            user_color="white",
            initial_fen=session.game_state.initial_fen,
            final_fen=session.game_state.current_fen(),
            summary_text="이 완료 대국에 대해 규칙 기반 복기 요약이 생성되었습니다.",
            review_report=cast(ReviewService, app.state.review_service).build_report(tuple(session.review_entries)),
            move_history=session.game_state.move_history,
            review_entries=tuple(session.review_entries),
            weakness_occurrences=weakness_occurrences,
        )
        cast(SqliteGameCheckpointRepository, app.state.checkpoint_repository).delete_checkpoint(session.game_id)
        session.archived_game_id = session.game_id

    return _snapshot_from_session(
        session,
        analysis=analysis,
        analysis_error=analysis_error,
        feedback=feedback,
        feedback_error=feedback_error,
    )


@app.post("/api/games/{game_id}/undo", response_model=GameSnapshotResponse)
def undo_last_move(game_id: str) -> GameSnapshotResponse:
    session = _get_or_restore_session(game_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Game session was not found.")
    if session.archived_game_id is not None or session.game_state.status().is_game_over:
        raise HTTPException(status_code=400, detail="Undo is only available during a live study session.")
    if not session.game_state.move_history:
        raise HTTPException(status_code=400, detail="No moves available to undo.")

    undone_move = session.game_state.undo_last_move()
    removed_review_entry = session.review_entries.pop() if session.review_entries else None

    try:
        _save_checkpoint(session)
    except Exception as exc:
        session.game_state.apply_uci_move(undone_move.move_uci)
        if removed_review_entry is not None:
            session.review_entries.append(removed_review_entry)
        raise HTTPException(status_code=500, detail="Move undo was rejected because checkpoint persistence failed.") from exc

    analysis, analysis_error = _analysis_payload(session.game_state.current_fen())
    return _snapshot_from_session(
        session,
        analysis=analysis,
        analysis_error=analysis_error,
        feedback=None,
        feedback_error=None,
    )
