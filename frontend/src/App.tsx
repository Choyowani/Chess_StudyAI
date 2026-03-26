import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";

import { replayContextForPly } from "./archive";
import { checkedKingSquare, isInteractivePiece, toMoveUci } from "./board";
import type {
  ArchivedGame,
  ArchivedGameSummary,
  BoardSquare,
  CandidateOverlay,
  ColorName,
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
import {
  analysisStatusLabel,
  archiveCountLabel,
  checkpointStatusLabel,
  colorPerspectiveLabel,
  drawMessage,
  checkMessage,
  checkmateMessage,
  localizeBackendMessage,
  moveAppliedMessage,
  moveAppliedWithBestReplyMessage,
  moveAppliedWithQualityMessage,
  moveAppliedWithoutAnalysisMessage,
  moveCountLabel,
  selectionMessage,
  uiGlossary,
  uiStatusText,
  turnStatusLabel,
  translateMoveQuality,
  viewLabel,
  weaknessCountLabel,
} from "./ui-text";

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
  const [studyPerspective, setStudyPerspective] = useState<ColorName>(() => {
    if (typeof window === "undefined") {
      return "white";
    }
    const stored = window.sessionStorage.getItem("studyPerspective");
    return stored === "black" ? "black" : "white";
  });
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [archivedGame, setArchivedGame] = useState<ArchivedGame | null>(null);
  const [archiveList, setArchiveList] = useState<ArchivedGameSummary[]>([]);
  const [inProgressList, setInProgressList] = useState<InProgressGameSummary[]>([]);
  const [weaknessSummary, setWeaknessSummary] = useState<UserWeaknessSummary | null>(null);
  const [selectedWeaknessKey, setSelectedWeaknessKey] = useState<string | null>(null);
  const [selectedReplayPly, setSelectedReplayPly] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [message, setMessage] = useState<string>(uiStatusText.loading.newGame);
  const [archiveMessage, setArchiveMessage] = useState<string>(uiStatusText.loading.archiveList);
  const [resumeMessage, setResumeMessage] = useState<string>(uiStatusText.loading.resumeList);
  const [weaknessMessage, setWeaknessMessage] = useState<string>(uiStatusText.loading.weaknessSummary);
  const [viewMode, setViewMode] = useState<ViewMode>("live");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);
  const [isWeaknessLoading, setIsWeaknessLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.sessionStorage.setItem("studyPerspective", studyPerspective);
  }, [studyPerspective]);

  async function createGame() {
    setMessage(uiStatusText.loading.newGame);
    try {
      const created = await requestJson<GameSnapshot>("/api/games", { method: "POST" });
      setSnapshot(created);
      setSelectedSquare(null);
      setViewMode("live");
      setMessage(uiStatusText.success.newGameReady);
    } catch (error) {
      setMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.createGame);
    }
  }

  useEffect(() => {
    void createGame();
  }, []);

  async function refreshArchiveList() {
    try {
      const archives = await requestJson<ArchivedGameSummary[]>("/api/archive/games");
      setArchiveList(archives);
      setArchiveMessage(archives.length > 0 ? uiStatusText.success.archiveListLoaded : uiStatusText.empty.archiveList);
    } catch (error) {
      setArchiveList([]);
      setArchiveMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.loadArchiveList);
    }
  }

  useEffect(() => {
    void refreshArchiveList();
  }, [snapshot?.archived_game_id]);

  async function refreshInProgressList() {
    try {
      const resumableGames = await requestJson<InProgressGameSummary[]>("/api/checkpoints/games");
      setInProgressList(resumableGames);
      setResumeMessage(resumableGames.length > 0 ? uiStatusText.success.resumableListLoaded : uiStatusText.empty.resumableList);
    } catch (error) {
      setInProgressList([]);
      setResumeMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.loadResumeList);
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
      setWeaknessMessage(sorted.length > 0 ? uiStatusText.success.weaknessLoaded : uiStatusText.empty.weaknessPatterns);
    } catch (error) {
      setWeaknessSummary(null);
      setSelectedWeaknessKey(null);
      setWeaknessMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.loadWeakness);
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
    setArchiveMessage(uiStatusText.loading.openingArchive);
    try {
      const archive = await requestJson<ArchivedGame>(`/api/archive/games/${gameId}`);
      setArchivedGame(archive);
      setSelectedReplayPly(archive.move_logs.length);
      setViewMode("archive");
      setArchiveMessage(uiStatusText.success.archiveOpened(gameId));
    } catch (error) {
      setArchiveMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.loadArchive);
    } finally {
      setIsArchiveLoading(false);
    }
  }

  async function resumeGame(gameId: string) {
    setResumeMessage(uiStatusText.loading.resumingGame);
    try {
      const resumed = await requestJson<GameSnapshot>(`/api/checkpoints/games/${gameId}/resume`);
      setSnapshot(resumed);
      setSelectedSquare(null);
      setViewMode("live");
      setMessage(uiStatusText.success.gameResumedWithTurn(gameId, turnStatusLabel(resumed.status.turn)));
      setResumeMessage(uiStatusText.success.gameResumed(gameId));
    } catch (error) {
      setResumeMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.resumeGame);
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
        setMessage(checkmateMessage(next.status.winner));
      } else if (next.status.is_stalemate) {
        setMessage(uiStatusText.stalemate);
      } else if (next.status.is_draw) {
        setMessage(drawMessage(next.status.draw_reason));
      } else if (next.status.is_check) {
        setMessage(checkMessage(turnStatusLabel(next.status.turn)));
      } else if (next.feedback) {
        setMessage(moveAppliedWithQualityMessage(next.feedback.played_move_san, translateMoveQuality(next.feedback.move_quality_label)));
      } else if (next.analysis && next.analysis.fen === next.fen) {
        setMessage(moveAppliedWithBestReplyMessage(lastHistoryMove(next)?.move_san ?? moveUci, next.analysis.best_move.move_san));
      } else if (next.analysis_error) {
        setMessage(moveAppliedWithoutAnalysisMessage(lastHistoryMove(next)?.move_san ?? moveUci));
      } else {
        setMessage(moveAppliedMessage(lastHistoryMove(next)?.move_san ?? moveUci));
      }
    } catch (error) {
      setSelectedSquare(null);
      setMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.moveFailed);
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
        setMessage(selectionMessage(square.square));
      }
      return;
    }

    if (selectedSquare === square.square) {
      setSelectedSquare(null);
      setMessage(uiStatusText.selectionCleared);
      return;
    }

    if (isInteractivePiece(snapshot, square)) {
      setSelectedSquare(square.square);
      setMessage(selectionMessage(square.square));
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
    return <main className="loading-shell">{uiStatusText.loading.newGame}</main>;
  }

  return (
    <main className="study-shell">
      <aside className="workspace-sidebar">
        <section className="panel-card brand-card">
          <p className="eyebrow">{uiGlossary.product.eyebrow}</p>
          <h1>{uiGlossary.product.title}</h1>
          <p className="support-copy compact-copy">{uiGlossary.product.shellDescription}</p>
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.sections.workspace}</p>
              <h3>{viewLabel(viewMode)}</h3>
            </div>
          </div>
          <div className="nav-stack">
            <button type="button" className={`nav-button ${viewMode === "live" ? "active" : ""}`} onClick={() => setViewMode("live")}>
              {uiGlossary.views.live}
            </button>
            <button type="button" className={`nav-button ${viewMode === "review" ? "active" : ""}`} onClick={() => setViewMode("review")}>
              {uiGlossary.views.review}
            </button>
            <button type="button" className={`nav-button ${viewMode === "archive" ? "active" : ""}`} onClick={() => setViewMode("archive")}>
              {uiGlossary.views.archive}
            </button>
            <button type="button" className={`nav-button ${viewMode === "weakness" ? "active" : ""}`} onClick={() => setViewMode("weakness")}>
              {uiGlossary.views.weakness}
            </button>
          </div>
        </section>

        <details className="panel-card collapsible-panel">
          <summary className="panel-summary">
            <div>
              <p className="eyebrow">{uiGlossary.sections.currentStatus}</p>
              <h3>{uiGlossary.sections.liveSyncSummary}</h3>
            </div>
            <div className="status-strip">
              <span className="status-pill accent">{turnStatusLabel(snapshot.status.turn)}</span>
              <span className="status-pill">{snapshot.move_history.length}수</span>
            </div>
          </summary>
          <div className="info-grid compact">
            <div>
              <span className="muted-label">{uiGlossary.labels.turn}</span>
              <strong>{turnStatusLabel(snapshot.status.turn)}</strong>
            </div>
            <div>
              <span className="muted-label">{uiGlossary.labels.progressMoves}</span>
              <strong>{snapshot.move_history.length}</strong>
            </div>
            <div>
              <span className="muted-label">{uiGlossary.labels.analysis}</span>
              <strong>{analysisStatusLabel(snapshot.analysis?.fen === snapshot.fen, Boolean(snapshot.analysis_error))}</strong>
            </div>
            <div>
              <span className="muted-label">{uiGlossary.labels.review}</span>
              <strong>{hasReviewReady ? uiStatusText.saved : uiStatusText.preparing}</strong>
            </div>
          </div>
          <p className="helper-note subtle-note">FEN: {snapshot.fen}</p>
        </details>

        <details className="panel-card collapsible-panel">
          <summary className="panel-summary">
            <div>
              <p className="eyebrow">{uiGlossary.sections.resume}</p>
              <h3>{uiGlossary.sections.savedInProgressGames}</h3>
            </div>
            <span className="status-pill">{inProgressList.length}개</span>
          </summary>
          <div className="panel-head compact">
            <p className="helper-note">{resumeMessage}</p>
            <button type="button" className="secondary-button" onClick={() => void refreshInProgressList()}>
              {uiGlossary.buttons.refresh}
            </button>
          </div>
          <ol className="archive-list compact-list">
            {inProgressList.map((item) => (
              <li key={`checkpoint-${item.game_id}`}>
                <button type="button" className="archive-card compact-card" onClick={() => void resumeGame(item.game_id)}>
                  <div className="archive-card-head">
                    <strong>{checkpointStatusLabel(item.status)}</strong>
                    <span>{moveCountLabel(item.move_count)}</span>
                  </div>
                  <span>{formatTimestamp(item.updated_at)}</span>
                </button>
              </li>
            ))}
            {inProgressList.length === 0 ? <li>{uiStatusText.empty.noResumableGames}</li> : null}
          </ol>
        </details>
      </aside>

      <section className="content-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">{uiGlossary.sections.currentScreen}</p>
            <h2>{viewLabel(viewMode)}</h2>
          </div>
          <div className="status-strip">
            <span className="status-pill accent">{turnStatusLabel(snapshot.status.turn)}</span>
            <span className="status-pill">{archiveCountLabel(archiveList.length)}</span>
            <span className="status-pill">{weaknessCountLabel(weaknessPatterns.length)}</span>
          </div>
        </header>

        {viewMode === "live" ? (
          <LivePlayView
            snapshot={snapshot}
            message={message}
            selectedSquare={selectedSquare}
            overlays={overlays}
            checkedSquare={checkedSquare}
            studyPerspective={studyPerspective}
            isSubmitting={isSubmitting}
            hasReviewReady={hasReviewReady}
            onStudyPerspectiveChange={setStudyPerspective}
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
            studyPerspective={studyPerspective}
            onStudyPerspectiveChange={setStudyPerspective}
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
            studyPerspective={studyPerspective}
            onStudyPerspectiveChange={setStudyPerspective}
            onSelectArchivedGame={(gameId) => void openArchivedGame(gameId)}
            onSelectReplayPly={setSelectedReplayPly}
            onRefreshArchiveList={() => void refreshArchiveList()}
            onOpenReview={() => setViewMode("review")}
            onOpenWeakness={() => setViewMode("weakness")}
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
