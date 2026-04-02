from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

from backend.app.domain.game_state import ChessGameState, MoveRecord
from backend.app.persistence.models import GameReviewEntry


@dataclass(slots=True)
class GameSession:
    game_id: str
    user_id: str
    game_state: ChessGameState
    started_at: datetime
    review_entries: list[GameReviewEntry]
    archived_game_id: str | None = None
    terminal_reason: str | None = None
    terminal_result: str | None = None
    terminal_winner: str | None = None


class GameSessionStore:
    """In-memory session store for active games."""

    def __init__(self) -> None:
        self._sessions: dict[str, GameSession] = {}
        self._lock = Lock()

    def create_game(self, *, user_id: str = "local-user") -> GameSession:
        with self._lock:
            game_id = str(uuid4())
            session = GameSession(
                game_id=game_id,
                user_id=user_id,
                game_state=ChessGameState(),
                started_at=datetime.now(timezone.utc),
                review_entries=[],
            )
            self._sessions[game_id] = session
            return session

    def load_game(self, session: GameSession) -> GameSession:
        with self._lock:
            self._sessions[session.game_id] = session
            return session

    def get_game(self, game_id: str) -> GameSession | None:
        with self._lock:
            return self._sessions.get(game_id)

    def delete_game(self, game_id: str) -> None:
        with self._lock:
            self._sessions.pop(game_id, None)

    def apply_move(self, game_id: str, move_uci: str) -> MoveRecord:
        with self._lock:
            session = self._sessions.get(game_id)
            if session is None:
                raise KeyError(game_id)
            return session.game_state.apply_uci_move(move_uci)

    def append_review_entry(self, game_id: str, entry: GameReviewEntry) -> None:
        with self._lock:
            session = self._sessions.get(game_id)
            if session is None:
                raise KeyError(game_id)
            session.review_entries.append(entry)
