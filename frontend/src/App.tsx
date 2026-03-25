import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";

import { replayContextForPly } from "./archive";
import { checkedKingSquare, isInteractivePiece, toMoveUci } from "./board";
import type {
  ArchivedGame,
  ArchivedGameSummary,
  BoardSquare,
  CandidateOverlay,
  EvaluationScore,
  GameSnapshot,
  InProgressGameSummary,
  MoveRecord,
  UserWeaknessSummary,
  ViewMode,
  WeaknessPattern,
} from "./types";
import { ArchiveReplayView } from "./views/ArchiveReplayView";
import { LivePlayView } from "./views/LivePlayView";
import { PostGameReviewView } from "./views/PostGameReviewView";
import { WeaknessDashboardView } from "./views/WeaknessDashboardView";

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`http://localhost:8000${input}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(data?.detail ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function formatEvaluation(score: EvaluationScore | null): string {
  if (!score) {
    return "No score";
  }
  if (score.mate !== null) {
    return `Mate in ${Math.abs(score.mate)}`;
  }
  if (score.centipawns === null) {
    return "No score";
  }
  return `${(score.centipawns / 100).toFixed(2)} pawns`;
}

function formatScoreLoss(scoreLossCentipawns: number): string {
  return `${(scoreLossCentipawns / 100).toFixed(2)} pawns`;
}

function lastHistoryMove(snapshot: GameSnapshot): MoveRecord | null {
  return snapshot.move_history.length > 0
    ? snapshot.move_history[snapshot.move_history.length - 1]
    : null;
}

function formatTimestamp(isoValue: string): string {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) {
    return isoValue;
  }
  return date.toLocaleString();
}

function candidateOverlays(snapshot: GameSnapshot): CandidateOverlay[] {
  if (!snapshot.analysis || snapshot.analysis.fen !== snapshot.fen) {
    return [];
  }

  return snapshot.analysis.top_moves.slice(0, 3).map((move) => ({
    rank: move.rank,
    from: move.move_uci.slice(0, 2),
    to: move.move_uci.slice(2, 4),
  }));
}

function weaknessKey(pattern: WeaknessPattern): string {
  return `${pattern.pattern_type}:${pattern.pattern_key}`;
}

function sortWeaknessPatterns(patterns: WeaknessPattern[]): WeaknessPattern[] {
  return [...patterns].sort((left, right) => {
    if (right.frequency !== left.frequency) {
      return right.frequency - left.frequency;
    }
    return right.last_seen_at.localeCompare(left.last_seen_at);
  });
}

function viewLabel(viewMode: ViewMode): string {
  if (viewMode === "live") return "Live Play";
  if (viewMode === "review") return "Post-Game Review";
  if (viewMode === "archive") return "Archive Replay";
  return "Weakness Dashboard";
}

export function App() {
  const activeUserId = "local-user";
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [archivedGame, setArchivedGame] = useState<ArchivedGame | null>(null);
  const [archiveList, setArchiveList] = useState<ArchivedGameSummary[]>([]);
  const [inProgressList, setInProgressList] = useState<InProgressGameSummary[]>([]);
  const [weaknessSummary, setWeaknessSummary] = useState<UserWeaknessSummary | null>(null);
  const [selectedWeaknessKey, setSelectedWeaknessKey] = useState<string | null>(null);
  const [selectedReplayPly, setSelectedReplayPly] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [message, setMessage] = useState("Creating a new board...");
  const [archiveMessage, setArchiveMessage] = useState("Loading archived games...");
  const [resumeMessage, setResumeMessage] = useState("Loading resumable games...");
  const [weaknessMessage, setWeaknessMessage] = useState("Loading weakness summary...");
  const [viewMode, setViewMode] = useState<ViewMode>("live");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);
  const [isWeaknessLoading, setIsWeaknessLoading] = useState(false);

  async function createGame() {
    setMessage("Creating a new board...");
    try {
      const created = await requestJson<GameSnapshot>("/api/games", { method: "POST" });
      setSnapshot(created);
      setSelectedSquare(null);
      setViewMode("live");
      setMessage("Board ready. White to move.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create a game.");
    }
  }

  useEffect(() => {
    void createGame();
  }, []);

  async function refreshArchiveList() {
    try {
      const archives = await requestJson<ArchivedGameSummary[]>("/api/archive/games");
      setArchiveList(archives);
      setArchiveMessage(archives.length > 0 ? "Archived games ready." : "No archived games yet.");
    } catch (error) {
      setArchiveList([]);
      setArchiveMessage(error instanceof Error ? error.message : "Failed to load archived games.");
    }
  }

  useEffect(() => {
    void refreshArchiveList();
  }, [snapshot?.archived_game_id]);

  async function refreshInProgressList() {
    try {
      const resumableGames = await requestJson<InProgressGameSummary[]>("/api/checkpoints/games");
      setInProgressList(resumableGames);
      setResumeMessage(resumableGames.length > 0 ? "Resumable games ready." : "No unfinished games saved yet.");
    } catch (error) {
      setInProgressList([]);
      setResumeMessage(error instanceof Error ? error.message : "Failed to load resumable games.");
    }
  }

  useEffect(() => {
    void refreshInProgressList();
  }, [snapshot?.game_id, snapshot?.fen, snapshot?.archived_game_id]);

  async function refreshWeaknessSummary() {
    setIsWeaknessLoading(true);
    try {
      const summary = await requestJson<UserWeaknessSummary>(`/api/users/${activeUserId}/weakness-summary`);
      const sorted = sortWeaknessPatterns(summary.patterns);
      setWeaknessSummary({ ...summary, patterns: sorted });
      setSelectedWeaknessKey((current) => {
        if (current && sorted.some((pattern) => weaknessKey(pattern) === current)) {
          return current;
        }
        return sorted[0] ? weaknessKey(sorted[0]) : null;
      });
      setWeaknessMessage(sorted.length > 0 ? "Weakness summary ready." : "No repeated weakness patterns yet.");
    } catch (error) {
      setWeaknessSummary(null);
      setSelectedWeaknessKey(null);
      setWeaknessMessage(error instanceof Error ? error.message : "Failed to load weakness summary.");
    } finally {
      setIsWeaknessLoading(false);
    }
  }

  useEffect(() => {
    void refreshWeaknessSummary();
  }, [snapshot?.archived_game_id]);

  useEffect(() => {
    const archivedGameId = snapshot?.archived_game_id;
    if (!archivedGameId) {
      return;
    }

    let cancelled = false;

    async function loadArchive() {
      try {
        const archive = await requestJson<ArchivedGame>(`/api/archive/games/${archivedGameId}`);
        if (!cancelled) {
          setArchivedGame(archive);
          setSelectedReplayPly(archive.move_logs.length);
        }
      } catch {
        if (!cancelled) {
          setArchivedGame(null);
        }
      }
    }

    void loadArchive();
    return () => {
      cancelled = true;
    };
  }, [snapshot?.archived_game_id]);

  const replayContext = useMemo(
    () => replayContextForPly(archivedGame, selectedReplayPly),
    [archivedGame, selectedReplayPly],
  );

  const weaknessPatterns = weaknessSummary?.patterns ?? [];
  const selectedWeakness =
    weaknessPatterns.find((pattern) => weaknessKey(pattern) === selectedWeaknessKey) ?? weaknessPatterns[0] ?? null;
  const overlays = snapshot ? candidateOverlays(snapshot) : [];
  const checkedSquare = snapshot ? checkedKingSquare(snapshot) : null;
  const hasReviewReady = Boolean(
    snapshot?.archived_game_id &&
      archivedGame?.id === snapshot.archived_game_id &&
      archivedGame.review_report,
  );

  async function openArchivedGame(gameId: string) {
    setIsArchiveLoading(true);
    setArchiveMessage("Loading archived replay...");
    try {
      const archive = await requestJson<ArchivedGame>(`/api/archive/games/${gameId}`);
      setArchivedGame(archive);
      setSelectedReplayPly(archive.move_logs.length);
      setViewMode("archive");
      setArchiveMessage(`Loaded replay for ${gameId}.`);
    } catch (error) {
      setArchiveMessage(error instanceof Error ? error.message : "Failed to load archived game.");
    } finally {
      setIsArchiveLoading(false);
    }
  }

  async function resumeGame(gameId: string) {
    setResumeMessage("Resuming saved game...");
    try {
      const resumed = await requestJson<GameSnapshot>(`/api/checkpoints/games/${gameId}/resume`);
      setSnapshot(resumed);
      setSelectedSquare(null);
      setViewMode("live");
      setMessage(`Resumed game ${gameId}. ${resumed.status.turn} to move.`);
      setResumeMessage(`Resumed ${gameId}.`);
    } catch (error) {
      setResumeMessage(error instanceof Error ? error.message : "Failed to resume saved game.");
    }
  }

  async function submitMove(from: string, to: string) {
    if (!snapshot || isSubmitting) {
      return;
    }

    const moveUci = toMoveUci(snapshot, from, to);
    setIsSubmitting(true);
    try {
      const next = await requestJson<GameSnapshot>(`/api/games/${snapshot.game_id}/moves`, {
        method: "POST",
        body: JSON.stringify({ move_uci: moveUci }),
      });
      setSnapshot(next);
      setSelectedSquare(null);
      if (next.status.is_checkmate) {
        setMessage(`Checkmate. ${next.status.winner} wins.`);
      } else if (next.status.is_stalemate) {
        setMessage("Stalemate.");
      } else if (next.status.is_draw) {
        setMessage(next.status.draw_reason ? `Draw by ${next.status.draw_reason}.` : "Draw.");
      } else if (next.status.is_check) {
        setMessage(`${next.status.turn} is in check.`);
      } else if (next.feedback) {
        setMessage(`Move accepted: ${next.feedback.played_move_san}. ${next.feedback.move_quality_label}.`);
      } else if (next.analysis && next.analysis.fen === next.fen) {
        setMessage(
          `Move accepted: ${lastHistoryMove(next)?.move_san ?? moveUci}. Best reply: ${next.analysis.best_move.move_san}`,
        );
      } else if (next.analysis_error) {
        setMessage(`Move accepted: ${lastHistoryMove(next)?.move_san ?? moveUci}. Analysis unavailable.`);
      } else {
        setMessage(`Move accepted: ${lastHistoryMove(next)?.move_san ?? moveUci}`);
      }
    } catch (error) {
      setSelectedSquare(null);
      setMessage(error instanceof Error ? error.message : "Move failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSquareClick(square: BoardSquare) {
    if (!snapshot || isSubmitting) {
      return;
    }

    if (selectedSquare === null) {
      if (isInteractivePiece(snapshot, square)) {
        setSelectedSquare(square.square);
        setMessage(`Selected ${square.square}. Choose a destination.`);
      }
      return;
    }

    if (selectedSquare === square.square) {
      setSelectedSquare(null);
      setMessage("Selection cleared.");
      return;
    }

    if (isInteractivePiece(snapshot, square)) {
      setSelectedSquare(square.square);
      setMessage(`Selected ${square.square}. Choose a destination.`);
      return;
    }

    void submitMove(selectedSquare, square.square);
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, square: BoardSquare) {
    if (!snapshot || isSubmitting || !isInteractivePiece(snapshot, square)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", square.square);
    setSelectedSquare(square.square);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>, targetSquare: BoardSquare) {
    event.preventDefault();
    const from = event.dataTransfer.getData("text/plain");
    if (!from || from === targetSquare.square) {
      return;
    }
    void submitMove(from, targetSquare.square);
  }

  function openReplayFromPly(plyIndex: number) {
    setSelectedReplayPly(plyIndex);
    setViewMode("archive");
  }

  if (snapshot === null) {
    return <main className="loading-shell">Creating a new board...</main>;
  }

  return (
    <main className="study-shell">
      <aside className="workspace-sidebar">
        <section className="panel-card brand-card">
          <p className="eyebrow">Chess Study Assistant</p>
          <h1>Study-first chess coach</h1>
          <p className="support-copy">
            Play on a backend-authoritative board, get immediate feedback, and move into replay and weakness review without losing context.
          </p>
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Workspace</p>
              <h3>{viewLabel(viewMode)}</h3>
            </div>
          </div>
          <div className="nav-stack">
            <button type="button" className={`nav-button ${viewMode === "live" ? "active" : ""}`} onClick={() => setViewMode("live")}>
              Live play
            </button>
            <button type="button" className={`nav-button ${viewMode === "review" ? "active" : ""}`} onClick={() => setViewMode("review")}>
              Review
            </button>
            <button type="button" className={`nav-button ${viewMode === "archive" ? "active" : ""}`} onClick={() => setViewMode("archive")}>
              Archive replay
            </button>
            <button type="button" className={`nav-button ${viewMode === "weakness" ? "active" : ""}`} onClick={() => setViewMode("weakness")}>
              Weakness
            </button>
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Current state</p>
              <h3>Live sync summary</h3>
            </div>
          </div>
          <div className="info-grid compact">
            <div>
              <span className="muted-label">Turn</span>
              <strong>{snapshot.status.turn}</strong>
            </div>
            <div>
              <span className="muted-label">Moves</span>
              <strong>{snapshot.move_history.length}</strong>
            </div>
            <div>
              <span className="muted-label">Analysis</span>
              <strong>{snapshot.analysis?.fen === snapshot.fen ? "Ready" : snapshot.analysis_error ? "Unavailable" : "Pending"}</strong>
            </div>
            <div>
              <span className="muted-label">Review</span>
              <strong>{hasReviewReady ? "Saved" : "Not ready"}</strong>
            </div>
          </div>
          <p className="helper-note">FEN: {snapshot.fen}</p>
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Resume</p>
              <h3>Saved unfinished games</h3>
            </div>
            <button type="button" className="secondary-button" onClick={() => void refreshInProgressList()}>
              Refresh
            </button>
          </div>
          <p className="helper-note">{resumeMessage}</p>
          <ol className="archive-list">
            {inProgressList.map((item) => (
              <li key={`checkpoint-${item.game_id}`}>
                <button type="button" className="archive-card" onClick={() => void resumeGame(item.game_id)}>
                  <div className="archive-card-head">
                    <strong>{item.status}</strong>
                    <span>{item.move_count} plies</span>
                  </div>
                  <span>{formatTimestamp(item.updated_at)}</span>
                  <span>{item.user_color} perspective</span>
                  <div>{item.game_id}</div>
                </button>
              </li>
            ))}
            {inProgressList.length === 0 ? <li>No resumable games available.</li> : null}
          </ol>
        </section>
      </aside>

      <section className="content-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Current view</p>
            <h2>{viewLabel(viewMode)}</h2>
          </div>
          <div className="status-strip">
            <span className="status-pill accent">{snapshot.status.turn} to move</span>
            <span className="status-pill">{archiveList.length} archived</span>
            <span className="status-pill">{weaknessPatterns.length} weakness patterns</span>
          </div>
        </header>

        {viewMode === "live" ? (
          <LivePlayView
            snapshot={snapshot}
            message={message}
            selectedSquare={selectedSquare}
            overlays={overlays}
            checkedSquare={checkedSquare}
            isSubmitting={isSubmitting}
            hasReviewReady={hasReviewReady}
            formatEvaluation={formatEvaluation}
            formatScoreLoss={formatScoreLoss}
            onSquareClick={handleSquareClick}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onCreateGame={() => void createGame()}
            onOpenArchive={() => setViewMode("archive")}
            onOpenReview={() => setViewMode("review")}
            onOpenWeakness={() => setViewMode("weakness")}
          />
        ) : null}

        {viewMode === "review" ? (
          <PostGameReviewView
            archivedGame={archivedGame}
            onReplayFromPly={openReplayFromPly}
            onOpenArchive={() => setViewMode("archive")}
            onOpenWeakness={() => setViewMode("weakness")}
          />
        ) : null}

        {viewMode === "archive" ? (
          <ArchiveReplayView
            archivedGame={archivedGame}
            archiveList={archiveList}
            archiveMessage={archiveMessage}
            isArchiveLoading={isArchiveLoading}
            selectedReplayPly={selectedReplayPly}
            replayContext={replayContext}
            onSelectArchivedGame={(gameId) => void openArchivedGame(gameId)}
            onSelectReplayPly={setSelectedReplayPly}
            onRefreshArchiveList={() => void refreshArchiveList()}
            onOpenReview={() => setViewMode("review")}
          />
        ) : null}

        {viewMode === "weakness" ? (
          <WeaknessDashboardView
            summary={weaknessSummary}
            selectedWeakness={selectedWeakness}
            weaknessMessage={weaknessMessage}
            isWeaknessLoading={isWeaknessLoading}
            onSelectWeakness={setSelectedWeaknessKey}
            onRefresh={() => void refreshWeaknessSummary()}
            onOpenArchivedGame={(gameId) => void openArchivedGame(gameId)}
          />
        ) : null}
      </section>
    </main>
  );
}
