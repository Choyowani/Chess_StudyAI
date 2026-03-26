from __future__ import annotations

from dataclasses import dataclass

import chess

from backend.app.persistence.models import GameReviewEntry


@dataclass(frozen=True, slots=True)
class WeaknessOccurrence:
    ply_index: int
    pattern_type: str
    pattern_key: str
    note: str


@dataclass(frozen=True, slots=True)
class UserWeaknessSummaryItem:
    pattern_type: str
    pattern_key: str
    frequency: int
    last_seen_at: str
    notes: str


class WeaknessService:
    """Derives repeatable weakness tags from archived move review data."""

    @staticmethod
    def display_label(pattern_type: str, pattern_key: str) -> str:
        if pattern_type == "tactics" and pattern_key == "missed_tactical_pattern":
            return "전술 기회를 자주 놓침"
        if pattern_type == "king_safety" and pattern_key == "delayed_castling":
            return "캐슬링이 자주 늦어짐"
        if pattern_type == "development" and pattern_key == "delayed_piece_development":
            return "기물 전개가 자주 늦어짐"
        if pattern_type == "structure" and pattern_key.startswith("pawn_structure:"):
            return "비슷한 폰 구조에서 실수가 반복됨"
        return pattern_key.replace("_", " ").title()

    @staticmethod
    def study_recommendation(pattern_type: str, pattern_key: str) -> str:
        if pattern_type == "tactics" and pattern_key == "missed_tactical_pattern":
            return "수를 두기 전에 체크, 잡기, 직접 위협 같은 강제 수를 먼저 확인하는 습관을 들여 보세요."
        if pattern_type == "king_safety" and pattern_key == "delayed_castling":
            return "중앙이 열리기 시작하면 캐슬링을 더 서둘러 킹 안전이 반복 약점이 되지 않게 해 보세요."
        if pattern_type == "development" and pattern_key == "delayed_piece_development":
            return "오프닝에서는 옆쪽 수에 템포를 쓰기 전에 나이트와 비숍부터 자연스럽게 전개해 보세요."
        if pattern_type == "structure" and pattern_key.startswith("pawn_structure:"):
            return "이 폰 구조가 나온 대국을 다시 보면서 어떤 파일, 약한 칸, 브레이크가 문제였는지 정리해 보세요."
        return "관련 대국을 다시 보며 포지션이 무너지기 전에 어떤 판단이 반복되었는지 찾아보세요."

    def detect_occurrences(self, review_entries: tuple[GameReviewEntry, ...]) -> tuple[WeaknessOccurrence, ...]:
        occurrences: list[WeaknessOccurrence] = []
        for entry in review_entries:
            if entry.feedback is None:
                continue

            occurrences.extend(self._tactical_miss(entry))
            occurrences.extend(self._delayed_castling(entry))
            occurrences.extend(self._delayed_development(entry))
            occurrences.extend(self._structure_mistake(entry))

        return tuple(occurrences)

    @staticmethod
    def _tactical_miss(entry: GameReviewEntry) -> list[WeaknessOccurrence]:
        if entry.analysis_before is None or entry.feedback.score_loss_centipawns < 180:
            return []
        best_san = entry.analysis_before.best_move.move_san
        if not any(token in best_san for token in ("x", "+", "#")):
            return []
        return [
            WeaknessOccurrence(
                ply_index=entry.move_record.ply_index,
                pattern_type="tactics",
                pattern_key="missed_tactical_pattern",
                note=f"{best_san} 같은 강제 수를 볼 수 있었지만 놓친 장면입니다.",
            )
        ]

    @staticmethod
    def _delayed_castling(entry: GameReviewEntry) -> list[WeaknessOccurrence]:
        if entry.analysis_before is None:
            return []
        board = chess.Board(entry.move_record.before_fen)
        if board.fullmove_number < 5 or entry.move_record.move_san in {"O-O", "O-O-O"}:
            return []
        best_san = entry.analysis_before.best_move.move_san
        king_square = board.king(board.turn)
        home_square = chess.E1 if board.turn == chess.WHITE else chess.E8
        if king_square != home_square:
            return []
        if best_san not in {"O-O", "O-O-O"} and "킹 안전" not in entry.feedback.current_plan.lower():
            return []
        return [
            WeaknessOccurrence(
                ply_index=entry.move_record.ply_index,
                pattern_type="king_safety",
                pattern_key="delayed_castling",
                note="킹 안전을 우선해야 하는 장면이었는데 캐슬링이 늦어졌습니다.",
            )
        ]

    @staticmethod
    def _delayed_development(entry: GameReviewEntry) -> list[WeaknessOccurrence]:
        if entry.analysis_before is None:
            return []
        board = chess.Board(entry.move_record.before_fen)
        if board.fullmove_number > 8:
            return []
        undeveloped = WeaknessService._undeveloped_minor_pieces(board)
        if undeveloped < 3 or entry.move_record.move_san.startswith(("N", "B")):
            return []
        best_san = entry.analysis_before.best_move.move_san
        if not best_san.startswith(("N", "B")) and "전개" not in entry.feedback.current_plan.lower():
            return []
        return [
            WeaknessOccurrence(
                ply_index=entry.move_record.ply_index,
                pattern_type="development",
                pattern_key="delayed_piece_development",
                note="전개 수가 가능했지만 기물 활동성을 높이는 흐름이 늦어졌습니다.",
            )
        ]

    @staticmethod
    def _structure_mistake(entry: GameReviewEntry) -> list[WeaknessOccurrence]:
        if entry.feedback.score_loss_centipawns < 140:
            return []
        board = chess.Board(entry.move_record.before_fen)
        return [
            WeaknessOccurrence(
                ply_index=entry.move_record.ply_index,
                pattern_type="structure",
                pattern_key=WeaknessService._pawn_structure_signature(board),
                note="비슷한 폰 구조에서 반복되는 실수가 다시 나타났습니다.",
            )
        ]

    @staticmethod
    def _undeveloped_minor_pieces(board: chess.Board) -> int:
        if board.turn == chess.WHITE:
            homes = (chess.B1, chess.G1, chess.C1, chess.F1)
            color = chess.WHITE
        else:
            homes = (chess.B8, chess.G8, chess.C8, chess.F8)
            color = chess.BLACK
        undeveloped = 0
        for square in homes:
            piece = board.piece_at(square)
            if piece is not None and piece.color == color and piece.piece_type in {chess.KNIGHT, chess.BISHOP}:
                undeveloped += 1
        return undeveloped

    @staticmethod
    def _pawn_structure_signature(board: chess.Board) -> str:
        white_pawns = sorted(chess.square_name(square) for square in board.pieces(chess.PAWN, chess.WHITE))
        black_pawns = sorted(chess.square_name(square) for square in board.pieces(chess.PAWN, chess.BLACK))
        return f"pawn_structure:{','.join(white_pawns)}|{','.join(black_pawns)}"
