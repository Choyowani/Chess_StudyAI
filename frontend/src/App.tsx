import { useEffect, useMemo, useState } from "react";

import { replayContextForPly, parseArchivedCandidateMove } from "./archive";
import { BoardView, checkedKingSquare, isInteractivePiece, toMoveUci } from "./board";
import type {
  ArchivedGame,
  ArchivedGameSummary,
  BoardSquare,
  CandidateMove,
  CandidateOverlay,
  EvaluationScore,
  GameSnapshot,
  InProgressGameSummary,
  MoveRecord,
  UserWeaknessSummary,
  ViewMode,
  WeaknessPattern,
} from "./types";

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

  useEffect(() => {
    let cancelled = false;

    async function createGame() {
      try {
        const created = await requestJson<GameSnapshot>("/api/games", { method: "POST" });
        if (!cancelled) {
          setSnapshot(created);
          setMessage("Board ready. White to move.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Failed to create a game.");
        }
      }
    }

    void createGame();
    return () => {
      cancelled = true;
    };
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

  const replayMove = replayContext?.currentMove ?? null;
  const weaknessPatterns = weaknessSummary?.patterns ?? [];
  const selectedWeakness =
    weaknessPatterns.find((pattern) => weaknessKey(pattern) === selectedWeaknessKey) ?? weaknessPatterns[0] ?? null;
  const studyFocusPatterns = weaknessPatterns.slice(0, 3);
  const replayCandidates: CandidateMove[] = replayMove
    ? replayMove.top_candidate_moves
        .map((candidate) => parseArchivedCandidateMove(candidate))
        .filter((candidate): candidate is CandidateMove => candidate !== null)
        .sort((left, right) => left.rank - right.rank)
    : [];

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

  function handleDragStart(event: React.DragEvent<HTMLButtonElement>, square: BoardSquare) {
    if (!snapshot || isSubmitting || !isInteractivePiece(snapshot, square)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", square.square);
    setSelectedSquare(square.square);
  }

  function handleDrop(event: React.DragEvent<HTMLButtonElement>, targetSquare: BoardSquare) {
    event.preventDefault();
    const from = event.dataTransfer.getData("text/plain");
    if (!from || from === targetSquare.square) {
      return;
    }
    void submitMove(from, targetSquare.square);
  }

  if (snapshot === null) {
    return <main className="app-shell"><section className="status-panel">{message}</section></main>;
  }

  const selectedArchiveSummary = archivedGame
    ? archiveList.find((item) => item.game_id === archivedGame.id) ?? null
    : null;

  return (
    <main className="app-shell">
      <section className="board-panel">
        <header className="board-header">
          <div>
            <p className="eyebrow">
              {viewMode === "live" ? "Live board" : viewMode === "archive" ? "Archive replay" : "Weakness dashboard"}
            </p>
            <h1>
              {viewMode === "live"
                ? "Playable Study Board"
                : viewMode === "archive"
                  ? "Archived Game Replay"
                  : "Repeated Weakness Dashboard"}
            </h1>
          </div>
          <div className="header-actions">
            <button type="button" className={`mode-chip ${viewMode === "live" ? "active" : ""}`} onClick={() => setViewMode("live")}>Live</button>
            <button type="button" className={`mode-chip ${viewMode === "archive" ? "active" : ""}`} onClick={() => setViewMode("archive")}>Archive</button>
            <button type="button" className={`mode-chip ${viewMode === "weakness" ? "active" : ""}`} onClick={() => setViewMode("weakness")}>Weakness</button>
            <div className="turn-chip">
              {viewMode === "live"
                ? `${snapshot.status.turn} to move`
                : viewMode === "archive"
                  ? archivedGame
                    ? `Ply ${selectedReplayPly}/${archivedGame.move_logs.length}`
                    : "Select a game"
                  : `${weaknessPatterns.length} patterns`}
            </div>
          </div>
        </header>

        {viewMode === "live" ? (
          <>
            <BoardView
              fen={snapshot.fen}
              lastMoveUci={snapshot.last_move_uci}
              checkedSquare={checkedKingSquare(snapshot)}
              overlays={candidateOverlays(snapshot)}
              selectedSquare={selectedSquare}
              interactive
              disabled={isSubmitting || snapshot.status.is_game_over}
              onSquareClick={handleSquareClick}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
            <section className="board-subpanel">
              <p className="eyebrow">Live sync</p>
              <p>Board state is only committed after backend validation and state update.</p>
              <p>Analysis and coaching remain optional sidecar data, so failed analysis does not break play.</p>
            </section>
          </>
        ) : archivedGame && replayContext ? (
          <>
            <BoardView
              fen={replayContext.boardFen}
              lastMoveUci={replayMove?.move_uci ?? null}
              checkedSquare={null}
              overlays={[]}
              disabled
            />
            <section className="board-subpanel">
              <div className="replay-toolbar">
                <button type="button" onClick={() => setSelectedReplayPly(0)} disabled={selectedReplayPly === 0}>First</button>
                <button type="button" onClick={() => setSelectedReplayPly((current) => Math.max(0, current - 1))} disabled={selectedReplayPly === 0}>Previous</button>
                <button type="button" onClick={() => setSelectedReplayPly((current) => Math.min(archivedGame.move_logs.length, current + 1))} disabled={selectedReplayPly >= archivedGame.move_logs.length}>Next</button>
                <button type="button" onClick={() => setSelectedReplayPly(archivedGame.move_logs.length)} disabled={selectedReplayPly >= archivedGame.move_logs.length}>Last</button>
              </div>
              <p>{replayMove ? `Replaying ply ${replayMove.ply_index}: ${replayMove.move_san} (${replayMove.move_uci})` : "Replay at the initial position before move 1."}</p>
              <p>Board position: {replayContext.boardFen}</p>
            </section>
          </>
        ) : viewMode === "weakness" ? (
          <>
            <section className="dashboard-grid">
              {weaknessPatterns.map((pattern) => (
                <button
                  key={weaknessKey(pattern)}
                  type="button"
                  className={`dashboard-card ${selectedWeakness && weaknessKey(pattern) === weaknessKey(selectedWeakness) ? "selected" : ""}`}
                  onClick={() => setSelectedWeaknessKey(weaknessKey(pattern))}
                >
                  <p className="eyebrow">{pattern.pattern_type}</p>
                  <h2>{pattern.display_label}</h2>
                  <p className="dashboard-number">{pattern.frequency} times</p>
                  <p>Last seen: {formatTimestamp(pattern.last_seen_at)}</p>
                  <p>{pattern.notes}</p>
                </button>
              ))}
              {!isWeaknessLoading && weaknessPatterns.length === 0 ? (
                <div className="dashboard-card empty-card">
                  <p className="eyebrow">Weaknesses</p>
                  <h2>No repeated patterns yet</h2>
                  <p>Finish a few archived games first. Repeated themes will appear here once the rule-based tracker has enough data.</p>
                </div>
              ) : null}
            </section>
            <section className="board-subpanel">
              <p className="eyebrow">Next focus</p>
              <h2>What to study next</h2>
              {studyFocusPatterns.length > 0 ? (
                <ol className="move-list">
                  {studyFocusPatterns.map((pattern) => (
                    <li key={`focus-${weaknessKey(pattern)}`}>
                      <strong>{pattern.display_label}</strong>
                      <div>{pattern.study_recommendation}</div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{isWeaknessLoading ? "Loading recommendations..." : "Recommendations will appear after repeated weakness patterns are detected."}</p>
              )}
            </section>
          </>
        ) : (
          <section className="status-panel">
            <p className="eyebrow">Archive replay</p>
            <h2>Select a saved game</h2>
            <p>Choose an archived game from the browser to replay move by move.</p>
          </section>
        )}
      </section>

      <aside className="side-panel">
        <section className="status-panel">
          <p className="eyebrow">Workspace</p>
          <h2>
            {viewMode === "live" ? "Current session" : viewMode === "archive" ? "Archive browser" : "Weakness study"}
          </h2>
          <p>{viewMode === "live" ? message : viewMode === "archive" ? archiveMessage : weaknessMessage}</p>
          <div className="chip-row">
            <button type="button" className="secondary-button" onClick={() => setViewMode("live")}>Open live board</button>
            <button type="button" className="secondary-button" onClick={() => setViewMode("archive")}>Open archive browser</button>
            <button type="button" className="secondary-button" onClick={() => setViewMode("weakness")}>Open weakness dashboard</button>
          </div>
        </section>

        <section className="status-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Resume</p>
              <h2>Saved unfinished games</h2>
            </div>
            <button type="button" className="secondary-button" onClick={() => void refreshInProgressList()}>
              Refresh
            </button>
          </div>
          <p>{resumeMessage}</p>
          <ol className="archive-list">
            {inProgressList.map((item) => (
              <li key={`checkpoint-${item.game_id}`}>
                <button type="button" className="archive-card" onClick={() => void resumeGame(item.game_id)}>
                  <strong>{item.status}</strong>
                  <span>{formatTimestamp(item.updated_at)}</span>
                  <span>{item.move_count} plies</span>
                  <span>{item.user_color} perspective</span>
                  <div>{item.game_id}</div>
                </button>
              </li>
            ))}
            {inProgressList.length === 0 ? <li>No resumable games available.</li> : null}
          </ol>
        </section>

        <section className="status-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Archive list</p>
              <h2>Saved completed games</h2>
            </div>
            <button type="button" className="secondary-button" onClick={() => void refreshArchiveList()}>Refresh</button>
          </div>
          <ol className="archive-list">
            {archiveList.map((item) => (
              <li key={item.game_id}>
                <button
                  type="button"
                  className={`archive-card ${archivedGame?.id === item.game_id ? "selected" : ""}`}
                  onClick={() => void openArchivedGame(item.game_id)}
                  disabled={isArchiveLoading}
                >
                  <strong>{item.result ?? "*"}</strong>
                  <span>{formatTimestamp(item.finished_at)}</span>
                  <span>{item.move_count} plies</span>
                  <span>{item.user_color} perspective</span>
                  <div>{item.summary_preview ?? "Saved game ready for replay."}</div>
                </button>
              </li>
            ))}
            {archiveList.length === 0 ? <li>No archived games available.</li> : null}
          </ol>
        </section>

        {viewMode === "live" ? (
          <>
            <section className="status-panel">
              <p className="eyebrow">State</p>
              <h2>{message}</h2>
              <p>FEN: {snapshot.fen}</p>
              <p>Moves played: {snapshot.move_history.length}</p>
              <p>Analysis position: {snapshot.analysis?.fen ?? snapshot.analysis_error?.fen ?? "Not requested yet"}</p>
            </section>
            <section className="status-panel">
              <p className="eyebrow">Recent moves</p>
              <ol className="move-list">
                {snapshot.move_history.slice(-8).map((move) => (
                  <li key={move.ply_index}><strong>{move.ply_index}.</strong> {move.move_san} <span>{move.move_uci}</span></li>
                ))}
                {snapshot.move_history.length === 0 ? <li>No moves yet.</li> : null}
              </ol>
            </section>
            {archivedGame?.review_report ? (
              <section className="status-panel">
                <p className="eyebrow">Post-game review</p>
                <h2>Automatic review</h2>
                <p>{archivedGame.summary_text ?? "Review generated."}</p>
                <p>Result: {archivedGame.result ?? "*"}</p>
                <button type="button" className="secondary-button" onClick={() => setViewMode("archive")}>Open archived replay</button>
              </section>
            ) : null}
            <section className="status-panel overlay-placeholder">
              <p className="eyebrow">Feedback</p>
              <h2>Immediate coaching</h2>
              {snapshot.feedback ? (
                <>
                  <p>Quality: <strong>{snapshot.feedback.move_quality_label}</strong></p>
                  <p>Best move gap: {formatScoreLoss(snapshot.feedback.score_loss_centipawns)}</p>
                  <p>Best move was {snapshot.feedback.best_move_san} ({snapshot.feedback.best_move_uci}).</p>
                  <p>{snapshot.feedback.short_explanation}</p>
                  <p>{snapshot.feedback.current_plan}</p>
                </>
              ) : snapshot.feedback_error ? (
                <>
                  <p>Coaching feedback unavailable.</p>
                  <p>{snapshot.feedback_error}</p>
                </>
              ) : (
                <p>Feedback will appear here after a move is accepted.</p>
              )}
            </section>
            <section className="status-panel overlay-placeholder">
              <p className="eyebrow">Analysis</p>
              <h2>Engine details</h2>
              {snapshot.analysis && snapshot.analysis.fen === snapshot.fen ? (
                <>
                  <p>Evaluation: {formatEvaluation(snapshot.analysis.evaluation)}</p>
                  <p>Best move: {snapshot.analysis.best_move.move_san} ({snapshot.analysis.best_move.move_uci})</p>
                  <ol className="move-list">
                    {snapshot.analysis.top_moves.map((move) => (
                      <li key={move.rank}>
                        <strong>{move.rank}.</strong> {move.move_san}
                        <span>{move.move_uci}</span>
                        <div>PV: {move.principal_variation_san.join(" ")}</div>
                      </li>
                    ))}
                  </ol>
                </>
              ) : snapshot.analysis_error ? (
                <>
                  <p>Analysis unavailable.</p>
                  <p>{snapshot.analysis_error.message}</p>
                </>
              ) : (
                <p>Analysis will appear here after a move is accepted.</p>
              )}
            </section>
          </>
        ) : viewMode === "archive" ? (
          <>
            <section className="status-panel">
              <p className="eyebrow">Replay summary</p>
              <h2>{archivedGame ? "Archived replay context" : "No game selected"}</h2>
              {archivedGame ? (
                <>
                  <p>Game ID: {archivedGame.id}</p>
                  <p>Started: {formatTimestamp(archivedGame.started_at)}</p>
                  <p>Finished: {formatTimestamp(archivedGame.finished_at)}</p>
                  <p>Result: {archivedGame.result ?? "*"}</p>
                  <p>Move count: {archivedGame.move_logs.length}</p>
                  <p>{selectedArchiveSummary?.summary_preview ?? archivedGame.summary_text ?? "Replay data loaded."}</p>
                </>
              ) : <p>Select an archived game to enter replay mode.</p>}
            </section>
            <section className="status-panel">
              <p className="eyebrow">Replay moves</p>
              <h2>Move navigation</h2>
              {archivedGame ? (
                <ol className="move-list replay-move-list">
                  <li><button type="button" className={`move-jump ${selectedReplayPly === 0 ? "selected" : ""}`} onClick={() => setSelectedReplayPly(0)}>Start position</button></li>
                  {archivedGame.move_logs.map((move) => (
                    <li key={move.ply_index}>
                      <button type="button" className={`move-jump ${selectedReplayPly === move.ply_index ? "selected" : ""}`} onClick={() => setSelectedReplayPly(move.ply_index)}>
                        {move.ply_index}. {move.move_san}
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <p>No replay moves to show yet.</p>}
            </section>
            <section className="status-panel">
              <p className="eyebrow">Replay detail</p>
              <h2>{replayMove ? `Ply ${replayMove.ply_index}` : "Initial position"}</h2>
              {replayMove ? (
                <>
                  <p>Before FEN: {replayMove.before_fen}</p>
                  <p>After FEN: {replayMove.after_fen}</p>
                  <p>User move: {replayMove.move_san} ({replayMove.move_uci})</p>
                  <p>Best move: {replayMove.best_move_san && replayMove.best_move_uci ? `${replayMove.best_move_san} (${replayMove.best_move_uci})` : "Not stored"}</p>
                  <p>Move quality: {replayMove.move_quality_label ?? "Not graded"}</p>
                  <p>{replayMove.short_coaching_note ?? "No short coaching note stored."}</p>
                  <p>{replayMove.current_plan ?? "No one-line plan stored."}</p>
                </>
              ) : (
                <>
                  <p>Before FEN: {archivedGame?.initial_fen ?? "Not loaded"}</p>
                  <p>After FEN: Select a ply to inspect the resulting position.</p>
                  <p>Replay starts from the archived initial position and steps through every stored ply.</p>
                </>
              )}
            </section>
            <section className="status-panel">
              <p className="eyebrow">Candidate review</p>
              <h2>Best alternatives at that moment</h2>
              {replayCandidates.length > 0 ? (
                <ol className="move-list">
                  {replayCandidates.map((move) => (
                    <li key={`${move.rank}-${move.move_uci}`}>
                      <strong>{move.rank}.</strong> {move.move_san}
                      <span>{move.move_uci}</span>
                      <div>Score: {formatEvaluation(move.score)}</div>
                      <div>PV: {move.principal_variation_san.join(" ") || "No PV stored"}</div>
                    </li>
                  ))}
                </ol>
              ) : <p>Select a played move to review the stored best move and top candidate moves.</p>}
            </section>
            <section className="status-panel">
              <p className="eyebrow">Review context</p>
              <h2>Learning notes</h2>
              {replayContext?.reviewNotes.length ? (
                <ol className="move-list">
                  {replayContext.reviewNotes.map((note, index) => (
                    <li key={`${selectedReplayPly}-${index + 1}`}>{note}</li>
                  ))}
                </ol>
              ) : <p>Selected ply has no dedicated review highlight. Use the full summary below for broader themes.</p>}
              {replayMove?.pattern_tags.length ? (
                <div className="tag-row">
                  {replayMove.pattern_tags.map((tag, index) => (
                    <span key={`${tag.pattern_type}-${tag.pattern_key}-${index + 1}`} className="tag-pill">
                      {tag.pattern_type}: {tag.pattern_key}
                    </span>
                  ))}
                </div>
              ) : null}
            </section>
            <section className="status-panel">
              <p className="eyebrow">Game review</p>
              <h2>Archived review summary</h2>
              {archivedGame?.review_report ? (
                <>
                  <p>{archivedGame.summary_text ?? "Rule-based review generated for this completed game."}</p>
                  <h2>Major mistakes</h2>
                  <ol className="move-list">
                    {archivedGame.review_report.critical_mistakes.map((item) => (
                      <li key={`archive-mistake-${item.ply_index}`}><strong>{item.ply_index}.</strong> {item.move_san}<div>{item.note}</div></li>
                    ))}
                  </ol>
                  <h2>Good moves</h2>
                  <ol className="move-list">
                    {archivedGame.review_report.good_moves.map((item) => (
                      <li key={`archive-good-${item.ply_index}`}><strong>{item.ply_index}.</strong> {item.move_san}<div>{item.note}</div></li>
                    ))}
                  </ol>
                  <h2>Study next</h2>
                  <ol className="move-list">
                    {archivedGame.review_report.study_points.map((item, index) => (
                      <li key={`archive-study-${index + 1}`}>{item}</li>
                    ))}
                  </ol>
                </>
              ) : <p>No archived review summary available for this game.</p>}
            </section>
          </>
        ) : (
          <>
            <section className="status-panel">
              <p className="eyebrow">Summary</p>
              <h2>Repeated weakness overview</h2>
              <p>User: {activeUserId}</p>
              <p>Patterns found: {weaknessPatterns.length}</p>
              <p>Sorting: frequency first, then most recent occurrence.</p>
              <button type="button" className="secondary-button" onClick={() => void refreshWeaknessSummary()} disabled={isWeaknessLoading}>
                Refresh weakness summary
              </button>
            </section>
            <section className="status-panel">
              <p className="eyebrow">Weakness detail</p>
              <h2>{selectedWeakness ? selectedWeakness.display_label : "No weakness selected"}</h2>
              {selectedWeakness ? (
                <>
                  <p>Frequency: {selectedWeakness.frequency}</p>
                  <p>Last seen: {formatTimestamp(selectedWeakness.last_seen_at)}</p>
                  <p>{selectedWeakness.notes}</p>
                  <p>{selectedWeakness.study_recommendation}</p>
                </>
              ) : (
                <p>{isWeaknessLoading ? "Loading weakness summary..." : "No repeated weaknesses recorded yet."}</p>
              )}
            </section>
            <section className="status-panel">
              <p className="eyebrow">Related games</p>
              <h2>Replay entry points</h2>
              {selectedWeakness?.related_game_ids.length ? (
                <ol className="move-list">
                  {selectedWeakness.related_game_ids.map((gameId) => {
                    const archiveSummary = archiveList.find((item) => item.game_id === gameId);
                    return (
                      <li key={`weakness-game-${gameId}`}>
                        <button type="button" className="move-jump" onClick={() => void openArchivedGame(gameId)}>
                          {archiveSummary ? `${archiveSummary.result ?? "*"} · ${formatTimestamp(archiveSummary.finished_at)}` : gameId}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p>No related archived games were attached to this weakness yet.</p>
              )}
            </section>
            <section className="status-panel">
              <p className="eyebrow">Study focus</p>
              <h2>Next to focus on</h2>
              {studyFocusPatterns.length > 0 ? (
                <ol className="move-list">
                  {studyFocusPatterns.map((pattern) => (
                    <li key={`study-${weaknessKey(pattern)}`}>
                      <strong>{pattern.display_label}</strong>
                      <div>{pattern.study_recommendation}</div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>Complete more archived games to unlock study recommendations.</p>
              )}
            </section>
          </>
        )}
      </aside>
    </main>
  );
}
