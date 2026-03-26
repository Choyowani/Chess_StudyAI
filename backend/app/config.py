from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import find_dotenv, load_dotenv


load_dotenv(find_dotenv(usecwd=True), override=False)


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_optional_int(name: str) -> int | None:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except ValueError:
        return None


@dataclass(frozen=True, slots=True)
class EngineSettings:
    path: str | None
    threads: int
    hash_mb: int
    multipv: int
    depth: int
    move_time_ms: int | None
    startup_timeout_ms: int

    @classmethod
    def from_env(cls) -> "EngineSettings":
        return cls(
            path=os.getenv("CHESS_ENGINE_PATH") or None,
            threads=max(1, _env_int("CHESS_ENGINE_THREADS", 1)),
            hash_mb=max(1, _env_int("CHESS_ENGINE_HASH_MB", 64)),
            multipv=max(1, _env_int("CHESS_ENGINE_MULTIPV", 3)),
            depth=max(1, _env_int("CHESS_ENGINE_DEPTH", 12)),
            move_time_ms=_env_optional_int("CHESS_ENGINE_MOVE_TIME_MS"),
            startup_timeout_ms=max(1000, _env_int("CHESS_ENGINE_STARTUP_TIMEOUT_MS", 10000)),
        )
