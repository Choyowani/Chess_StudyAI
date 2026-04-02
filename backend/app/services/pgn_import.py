from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from io import StringIO
from uuid import uuid4

import chess.pgn

from backend.app.analysis.engine_service import AnalysisFailure, AnalysisResult, EngineAnalysisService
from backend.app.coaching.feedback_service import FeedbackService
from backend.app.coaching.review_service import GameReviewReport, ReviewService
from backend.app.coaching.weakness_service import WeaknessOccurrence, WeaknessService
from backend.app.domain.game_state import ChessGameState, InvalidMoveError, MoveRecord
from backend.app.persistence.archive_store import ArchivedGameRecord, SqliteGameArchiveRepository
from backend.app.persistence.models import GameReviewEntry


@dataclass(frozen=True, slots=True)
class ImportedPgnGame:
    game_id: str
    user_id: str
    started_at: datetime
    finished_at: datetime
    result: str | None
    terminal_reason: str | None
    initial_fen: str
    final_fen: str
    move_history: tuple[MoveRecord, ...]
    review_entries: tuple[GameReviewEntry, ...]
    review_report: GameReviewReport | None
    weakness_occurrences: tuple[WeaknessOccurrence, ...]
    summary_text: str
    pgn_text: str


class PgnImportError(ValueError):
    """Raised when PGN text cannot be imported as a completed archived game."""


class PgnImportService:
    def __init__(
        self,
        *,
        analysis_service: EngineAnalysisService,
        feedback_service: FeedbackService,
        review_service: ReviewService,
        weakness_service: WeaknessService,
        archive_repository: SqliteGameArchiveRepository,
    ) -> None:
        self._analysis_service = analysis_service
        self._feedback_service = feedback_service
        self._review_service = review_service
        self._weakness_service = weakness_service
        self._archive_repository = archive_repository

    def import_pgn(self, *, user_id: str, pgn_text: str) -> ArchivedGameRecord:
        imported = self._build_imported_game(user_id=user_id, pgn_text=pgn_text)
        self._archive_repository.save_completed_game(
            game_id=imported.game_id,
            user_id=imported.user_id,
            started_at=imported.started_at,
            finished_at=imported.finished_at,
            result=imported.result,
            terminal_reason=imported.terminal_reason,
            user_color="white",
            initial_fen=imported.initial_fen,
            final_fen=imported.final_fen,
            summary_text=imported.summary_text,
            review_report=imported.review_report,
            move_history=imported.move_history,
            review_entries=imported.review_entries,
            weakness_occurrences=imported.weakness_occurrences,
            pgn_text_override=imported.pgn_text,
        )
        archived = self._archive_repository.load_game(imported.game_id)
        if archived is None:
            raise PgnImportError("PGN 가져오기는 완료되었지만 저장된 대국을 다시 불러오지 못했습니다.")
        return archived

    def _build_imported_game(self, *, user_id: str, pgn_text: str) -> ImportedPgnGame:
        normalized_pgn = pgn_text.strip()
        if not normalized_pgn:
            raise PgnImportError("PGN 텍스트를 먼저 붙여 넣어 주세요.")

        parsed_game = chess.pgn.read_game(StringIO(normalized_pgn))
        if parsed_game is None:
            raise PgnImportError("PGN을 읽지 못했습니다. 헤더와 수순 형식을 다시 확인해 주세요.")
        if parsed_game.errors:
            raise PgnImportError(f"PGN을 파싱하지 못했습니다. {parsed_game.errors[0]}")

        initial_board = parsed_game.board()
        state = ChessGameState(initial_board.fen())
        review_entries: list[GameReviewEntry] = []

        mainline_moves = list(parsed_game.mainline_moves())
        if not mainline_moves:
            raise PgnImportError("수순이 없는 PGN은 가져올 수 없습니다.")

        for move in mainline_moves:
            try:
                move_record = state.apply_uci_move(move.uci())
            except InvalidMoveError as exc:
                raise PgnImportError(
                    f"{len(state.move_history) + 1}수째를 적용하지 못했습니다. 현재 포지션과 PGN 수순이 맞는지 확인해 주세요."
                ) from exc

            before_analysis = self._analysis_service.safe_analyze_fen(move_record.before_fen)
            after_analysis = self._analysis_service.safe_analyze_fen(move_record.after_fen)
            feedback = None
            if not isinstance(before_analysis, AnalysisFailure) and not isinstance(after_analysis, AnalysisFailure):
                feedback = self._feedback_service.build_feedback(
                    move_record,
                    before_analysis,
                    after_analysis,
                )

            review_entries.append(
                GameReviewEntry(
                    move_record=move_record,
                    analysis_before=None if isinstance(before_analysis, AnalysisFailure) else before_analysis,
                    analysis_after=None if isinstance(after_analysis, AnalysisFailure) else after_analysis,
                    feedback=feedback,
                )
            )

        review_entries_tuple = tuple(review_entries)
        review_report = self._review_service.build_report(review_entries_tuple)
        weakness_occurrences = self._weakness_service.detect_occurrences(review_entries_tuple)
        started_at = self._datetime_from_headers(parsed_game.headers)
        finished_at = started_at
        result = self._result_from_headers_or_state(parsed_game.headers, state)
        terminal_reason = self._terminal_reason_from_headers_or_state(parsed_game.headers, state, result)

        return ImportedPgnGame(
            game_id=str(uuid4()),
            user_id=user_id,
            started_at=started_at,
            finished_at=finished_at,
            result=result,
            terminal_reason=terminal_reason,
            initial_fen=state.initial_fen,
            final_fen=state.current_fen(),
            move_history=state.move_history,
            review_entries=review_entries_tuple,
            review_report=review_report,
            weakness_occurrences=weakness_occurrences,
            summary_text=self._summary_text(result=result, terminal_reason=terminal_reason, move_count=len(state.move_history)),
            pgn_text=normalized_pgn,
        )

    @staticmethod
    def _datetime_from_headers(headers: chess.pgn.Headers) -> datetime:
        utc_date = headers.get("UTCDate")
        utc_time = headers.get("UTCTime")
        if utc_date and utc_time and "?" not in utc_date and "?" not in utc_time:
            try:
                return datetime.strptime(f"{utc_date} {utc_time}", "%Y.%m.%d %H:%M:%S").replace(tzinfo=timezone.utc)
            except ValueError:
                pass

        date_value = headers.get("Date")
        if date_value and "?" not in date_value:
            try:
                return datetime.strptime(date_value, "%Y.%m.%d").replace(tzinfo=timezone.utc)
            except ValueError:
                pass

        return datetime.now(timezone.utc)

    @staticmethod
    def _result_from_headers_or_state(headers: chess.pgn.Headers, state: ChessGameState) -> str | None:
        header_result = headers.get("Result")
        if header_result in {"1-0", "0-1", "1/2-1/2", "*"}:
            return None if header_result == "*" else header_result
        return state.status().result

    @staticmethod
    def _terminal_reason_from_headers_or_state(
        headers: chess.pgn.Headers,
        state: ChessGameState,
        result: str | None,
    ) -> str | None:
        termination = (headers.get("Termination") or "").strip().lower()
        if "won on time" in termination or "time forfeit" in termination or "time" in termination:
            if result == "1-0":
                return "black_time_forfeit"
            if result == "0-1":
                return "white_time_forfeit"
            return "time_forfeit"
        if "resign" in termination:
            if result == "1-0":
                return "black_resigned"
            if result == "0-1":
                return "white_resigned"
            return "resigned"

        status = state.status()
        if status.is_checkmate:
            return "checkmate"
        if status.is_stalemate:
            return "stalemate"
        if status.is_draw:
            return status.draw_reason or "draw"

        return None

    @staticmethod
    def _summary_text(*, result: str | None, terminal_reason: str | None, move_count: int) -> str:
        if terminal_reason in {"white_resigned", "black_resigned"}:
            ending = "기권으로 종료된"
        elif terminal_reason in {"white_time_forfeit", "black_time_forfeit", "time_forfeit"}:
            ending = "시간패로 종료된"
        elif terminal_reason == "checkmate":
            ending = "체크메이트로 끝난"
        elif result == "1/2-1/2":
            ending = "무승부로 끝난"
        else:
            ending = "가져온"
        return f"PGN 가져오기로 저장된 대국입니다. {move_count}수까지 진행된 {ending} 게임을 다시보기와 복기에 연결했습니다."
