import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";

import { replayContextForPly } from "./archive";
import { checkedKingSquare, isInteractivePiece, promotionColorForMove, promotionRequired, toMoveUci } from "./board";
import type {
  ArchiveStage,
  ArchivedGame,
  ArchivedGameSummary,
  BoardSquare,
  CandidateOverlay,
  ColorName,
  GameSnapshot,
  InProgressGameSummary,
  MoveRecord,
  PromotionPieceCode,
  PromotionPrompt,
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
  drawMessage,
  checkMessage,
  checkmateMessage,
  gameOverHeadline,
  gameOverResultSummary,
  gameOverStudyLead,
  localizeBackendMessage,
  moveAppliedMessage,
  moveAppliedWithBestReplyMessage,
  moveAppliedWithQualityMessage,
  moveAppliedWithoutAnalysisMessage,
  moveCountLabel,
  selectionMessage,
  uiGlossary,
  uiScreenText,
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
    moveUci: move.move_uci,
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
  const liveSessionEpochRef = useRef(0);
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
  const [activeCandidateMoveUci, setActiveCandidateMoveUci] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PromotionPrompt | null>(null);
  const [dismissedGameOverModalKey, setDismissedGameOverModalKey] = useState<string | null>(null);
  const [isResignationPromptOpen, setIsResignationPromptOpen] = useState(false);
  const [message, setMessage] = useState<string>(uiStatusText.loading.newGame);
  const [archiveMessage, setArchiveMessage] = useState<string>(uiStatusText.loading.archiveList);
  const [pgnImportText, setPgnImportText] = useState("");
  const [pgnImportMessage, setPgnImportMessage] = useState<string>(uiScreenText.archive.importHelper);
  const [resumeMessage, setResumeMessage] = useState<string>(uiStatusText.loading.resumeList);
  const [weaknessMessage, setWeaknessMessage] = useState<string>(uiStatusText.loading.weaknessSummary);
  const [viewMode, setViewMode] = useState<ViewMode>("live");
  const [archiveStage, setArchiveStage] = useState<ArchiveStage>("landing");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingStudy, setIsSavingStudy] = useState(false);
  const [isResigning, setIsResigning] = useState(false);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);
  const [isImportingPgn, setIsImportingPgn] = useState(false);
  const [isWeaknessLoading, setIsWeaknessLoading] = useState(false);

  function currentLiveSessionEpoch(): number {
    return liveSessionEpochRef.current;
  }

  function beginLiveSessionTransition(): number {
    liveSessionEpochRef.current += 1;
    return liveSessionEpochRef.current;
  }

  function clearLiveTransientState() {
    setSelectedSquare(null);
    setActiveCandidateMoveUci(null);
    setPendingPromotion(null);
    setIsResignationPromptOpen(false);
  }

  async function resyncCanonicalSnapshot(gameId: string, requestEpoch: number): Promise<GameSnapshot | null> {
    try {
      const canonical = await requestJson<GameSnapshot>(`/api/games/${gameId}`);
      if (currentLiveSessionEpoch() !== requestEpoch) {
        return null;
      }
      setSnapshot(canonical);
      clearLiveTransientState();
      return canonical;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.sessionStorage.setItem("studyPerspective", studyPerspective);
  }, [studyPerspective]);

  async function createGame() {
    const requestEpoch = beginLiveSessionTransition();
    setIsSubmitting(true);
    setMessage(uiStatusText.loading.newGame);
    try {
      const created = await requestJson<GameSnapshot>("/api/games", { method: "POST" });
      if (currentLiveSessionEpoch() !== requestEpoch) {
        return;
      }
      setSnapshot(created);
      clearLiveTransientState();
      setArchivedGame(null);
      setArchiveStage("landing");
      setSelectedReplayPly(0);
      setDismissedGameOverModalKey(null);
      setIsResignationPromptOpen(false);
      setViewMode("live");
      setMessage(uiStatusText.success.newGameReady);
    } catch (error) {
      if (currentLiveSessionEpoch() === requestEpoch) {
        setMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.createGame);
      }
    } finally {
      if (currentLiveSessionEpoch() === requestEpoch) {
        setIsSubmitting(false);
      }
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

  async function loadInProgressList(): Promise<InProgressGameSummary[]> {
    const resumableGames = await requestJson<InProgressGameSummary[]>("/api/checkpoints/games");
    setInProgressList(resumableGames);
    setResumeMessage(resumableGames.length > 0 ? uiStatusText.success.resumableListLoaded : uiStatusText.empty.resumableList);
    return resumableGames;
  }

  async function refreshInProgressList() {
    try {
      await loadInProgressList();
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
          setArchiveStage("landing");
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
  const gameOverModalKey = snapshot?.status.is_game_over
    ? `${snapshot.game_id}:${snapshot.last_move_uci ?? snapshot.move_history.length}`
    : null;
  const shouldShowGameOverModal =
    gameOverModalKey !== null && dismissedGameOverModalKey !== gameOverModalKey;

  async function openArchivedGame(gameId: string) {
    setIsArchiveLoading(true);
    setArchiveMessage(uiStatusText.loading.openingArchive);
    try {
      const archive = await requestJson<ArchivedGame>(`/api/archive/games/${gameId}`);
      setArchivedGame(archive);
      setArchiveStage("landing");
      setSelectedReplayPly(archive.move_logs.length);
      setViewMode("archive");
      setArchiveMessage(uiStatusText.success.archiveOpened(gameId));
    } catch (error) {
      setArchiveMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.loadArchive);
    } finally {
      setIsArchiveLoading(false);
    }
  }

  async function importArchiveFromPgn() {
    const trimmedPgn = pgnImportText.trim();
    if (!trimmedPgn) {
      setPgnImportMessage(uiStatusText.error.emptyPgnImport);
      return;
    }

    setIsImportingPgn(true);
    setPgnImportMessage(uiStatusText.loading.importingPgn);
    try {
      const archive = await requestJson<ArchivedGame>("/api/archive/import-pgn", {
        method: "POST",
        body: JSON.stringify({
          user_id: activeUserId,
          pgn_text: trimmedPgn,
        }),
      });
      setArchivedGame(archive);
      setArchiveStage("landing");
      setSelectedReplayPly(archive.move_logs.length);
      setViewMode("archive");
      setPgnImportText("");
      setPgnImportMessage(uiStatusText.success.pgnImported(archive.id));
      setArchiveMessage(uiStatusText.success.archiveOpened(archive.id));
      await refreshArchiveList();
      await refreshWeaknessSummary();
    } catch (error) {
      setPgnImportMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.importPgn);
    } finally {
      setIsImportingPgn(false);
    }
  }

  async function ensureArchivedGameLoaded(gameId: string): Promise<ArchivedGame | null> {
    if (archivedGame?.id === gameId) {
      return archivedGame;
    }

    setIsArchiveLoading(true);
    setArchiveMessage(uiStatusText.loading.openingArchive);
    try {
      const archive = await requestJson<ArchivedGame>(`/api/archive/games/${gameId}`);
      setArchivedGame(archive);
      setSelectedReplayPly(archive.move_logs.length);
      setArchiveMessage(uiStatusText.success.archiveOpened(gameId));
      return archive;
    } catch (error) {
      setArchiveMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.loadArchive);
      return null;
    } finally {
      setIsArchiveLoading(false);
    }
  }

  async function openReviewForCurrentGame() {
    const currentSnapshot = snapshot;
    if (!currentSnapshot) {
      return;
    }
    if (currentSnapshot.archived_game_id) {
      await ensureArchivedGameLoaded(currentSnapshot.archived_game_id);
    }
    setViewMode("review");
  }

  async function openArchiveForCurrentGame() {
    const currentSnapshot = snapshot;
    if (!currentSnapshot) {
      return;
    }
    if (currentSnapshot.archived_game_id) {
      await ensureArchivedGameLoaded(currentSnapshot.archived_game_id);
    }
    setViewMode("archive");
  }

  async function resumeGame(gameId: string) {
    const requestEpoch = beginLiveSessionTransition();
    setIsSubmitting(true);
    setResumeMessage(uiStatusText.loading.resumingGame);
    try {
      const resumed = await requestJson<GameSnapshot>(`/api/checkpoints/games/${gameId}/resume`);
      if (currentLiveSessionEpoch() !== requestEpoch) {
        return;
      }
      setSnapshot(resumed);
      clearLiveTransientState();
      setArchivedGame(null);
      setArchiveStage("landing");
      setSelectedReplayPly(0);
      setDismissedGameOverModalKey(null);
      setIsResignationPromptOpen(false);
      setViewMode("live");
      setMessage(
        resumed.move_history.length > 0
          ? uiStatusText.success.gameResumedWithUndoReady(gameId, turnStatusLabel(resumed.status.turn))
          : uiStatusText.success.gameResumedWithTurn(gameId, turnStatusLabel(resumed.status.turn)),
      );
      setResumeMessage(uiStatusText.success.gameResumed(gameId));
    } catch (error) {
      if (currentLiveSessionEpoch() === requestEpoch) {
        setResumeMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.resumeGame);
      }
    } finally {
      if (currentLiveSessionEpoch() === requestEpoch) {
        setIsSubmitting(false);
      }
    }
  }

  async function saveCurrentStudy() {
    if (!snapshot || isSubmitting || snapshot.status.is_game_over) {
      return;
    }

    if (snapshot.move_history.length === 0) {
      setMessage(uiStatusText.success.studySaveReadyAfterFirstMove);
      return;
    }

    setIsSavingStudy(true);
    setMessage(uiStatusText.loading.savingStudy);
    try {
      const resumableGames = await loadInProgressList();
      const currentGameSaved = resumableGames.some((item) => item.game_id === snapshot.game_id);
      setMessage(currentGameSaved ? uiStatusText.success.studySaved : uiStatusText.success.studySavedPendingList);
    } catch (error) {
      setMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.saveStudy);
    } finally {
      setIsSavingStudy(false);
    }
  }

  async function resignGame(side: ColorName) {
    if (!snapshot || isSubmitting || isResigning || snapshot.status.is_game_over) {
      return;
    }

    const gameId = snapshot.game_id;
    const requestEpoch = currentLiveSessionEpoch();
    setIsResigning(true);
    setIsResignationPromptOpen(false);
    setMessage(uiStatusText.loading.resigningGame);
    try {
      const resigned = await requestJson<GameSnapshot>(`/api/games/${gameId}/resign`, {
        method: "POST",
        body: JSON.stringify({ side }),
      });
      if (currentLiveSessionEpoch() !== requestEpoch) {
        return;
      }
      setSnapshot(resigned);
      clearLiveTransientState();
      setDismissedGameOverModalKey(null);
      setMessage(uiStatusText.success.resigned(side));
    } catch (error) {
      if (currentLiveSessionEpoch() === requestEpoch) {
        setMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.resignGame);
      }
    } finally {
      if (currentLiveSessionEpoch() === requestEpoch) {
        setIsResigning(false);
      }
    }
  }

  async function submitMove(from: string, to: string, promotionPiece: PromotionPieceCode | null = null) {
    if (!snapshot || isSubmitting) {
      return;
    }

    const gameId = snapshot.game_id;
    const requestEpoch = currentLiveSessionEpoch();
    const moveUci = toMoveUci(from, to, promotionPiece);
    setIsSubmitting(true);
    try {
      const next = await requestJson<GameSnapshot>(`/api/games/${gameId}/moves`, {
        method: "POST",
        body: JSON.stringify({
          move_uci: moveUci,
          promotion_piece: promotionPiece,
        }),
      });
      if (currentLiveSessionEpoch() !== requestEpoch) {
        return;
      }
      setSnapshot(next);
      clearLiveTransientState();
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
      if (currentLiveSessionEpoch() !== requestEpoch) {
        return;
      }
      const recovered = await resyncCanonicalSnapshot(gameId, requestEpoch);
      if (recovered) {
        setMessage(uiStatusText.error.moveRejectedAndResynced);
      } else {
        clearLiveTransientState();
        setMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.moveFailed);
      }
    } finally {
      if (currentLiveSessionEpoch() === requestEpoch) {
        setIsSubmitting(false);
      }
    }
  }

  function queuePromotionIfNeeded(from: string, to: string): boolean {
    if (!snapshot || !promotionRequired(snapshot, from, to)) {
      return false;
    }

    const color = promotionColorForMove(snapshot, from);
    setPendingPromotion({
      from,
      to,
      color: color === "b" ? "black" : "white",
    });
    setSelectedSquare(from);
    setMessage(uiStatusText.promotion.prompt);
    return true;
  }

  function handleSquareClick(square: BoardSquare) {
    if (!snapshot || isSubmitting || pendingPromotion) {
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

    if (queuePromotionIfNeeded(selectedSquare, square.square)) {
      return;
    }

    void submitMove(selectedSquare, square.square);
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, square: BoardSquare) {
    if (!snapshot || isSubmitting || pendingPromotion || !isInteractivePiece(snapshot, square)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", square.square);
    setSelectedSquare(square.square);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>, targetSquare: BoardSquare) {
    event.preventDefault();
    if (pendingPromotion) {
      return;
    }
    const from = event.dataTransfer.getData("text/plain");
    if (!from || from === targetSquare.square) {
      return;
    }
    if (queuePromotionIfNeeded(from, targetSquare.square)) {
      return;
    }
    void submitMove(from, targetSquare.square);
  }

  function handlePromotionSelect(promotionPiece: PromotionPieceCode) {
    if (!pendingPromotion) {
      return;
    }
    void submitMove(pendingPromotion.from, pendingPromotion.to, promotionPiece);
  }

  function handlePromotionCancel() {
    setPendingPromotion(null);
    setSelectedSquare(null);
    setActiveCandidateMoveUci(null);
    setMessage(uiStatusText.promotion.cancelled);
  }

  async function undoLastMove() {
    if (!snapshot || isSubmitting || snapshot.status.is_game_over || snapshot.move_history.length === 0) {
      return;
    }

    const gameId = snapshot.game_id;
    const requestEpoch = currentLiveSessionEpoch();
    setIsSubmitting(true);
    try {
      const reverted = await requestJson<GameSnapshot>(`/api/games/${gameId}/undo`, {
        method: "POST",
      });
      if (currentLiveSessionEpoch() !== requestEpoch) {
        return;
      }
      setSnapshot(reverted);
      clearLiveTransientState();
      setMessage(uiStatusText.success.undoReady(turnStatusLabel(reverted.status.turn)));
    } catch (error) {
      if (currentLiveSessionEpoch() !== requestEpoch) {
        return;
      }
      const recovered = await resyncCanonicalSnapshot(gameId, requestEpoch);
      if (recovered) {
        setMessage(uiStatusText.error.undoRejectedAndResynced);
      } else {
        clearLiveTransientState();
        setMessage(error instanceof Error ? localizeBackendMessage(error.message) : uiStatusText.error.undoFailed);
      }
    } finally {
      if (currentLiveSessionEpoch() === requestEpoch) {
        setIsSubmitting(false);
      }
    }
  }

  function openReplayFromPly(plyIndex: number) {
    setSelectedReplayPly(plyIndex);
    setArchiveStage("replay");
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
                <button
                  type="button"
                  className="archive-card compact-card"
                  onClick={() => void resumeGame(item.game_id)}
                  disabled={isSubmitting}
                >
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
            activeCandidateMoveUci={activeCandidateMoveUci}
            checkedSquare={checkedSquare}
            studyPerspective={studyPerspective}
            isSubmitting={isSubmitting}
            isSavingStudy={isSavingStudy}
            isResigning={isResigning}
            hasReviewReady={hasReviewReady}
            pendingPromotion={pendingPromotion}
            onStudyPerspectiveChange={setStudyPerspective}
            onSquareClick={handleSquareClick}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onPromotionSelect={handlePromotionSelect}
            onPromotionCancel={handlePromotionCancel}
            onCandidateHover={setActiveCandidateMoveUci}
            onUndo={() => void undoLastMove()}
            onSaveStudy={() => void saveCurrentStudy()}
            onOpenResignationPrompt={() => setIsResignationPromptOpen(true)}
            onCreateGame={() => void createGame()}
            onOpenArchive={() => void openArchiveForCurrentGame()}
            onOpenReview={() => void openReviewForCurrentGame()}
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
            pgnImportText={pgnImportText}
            pgnImportMessage={pgnImportMessage}
            isArchiveLoading={isArchiveLoading}
            isImportingPgn={isImportingPgn}
            archiveStage={archiveStage}
            selectedReplayPly={selectedReplayPly}
            replayContext={replayContext}
            studyPerspective={studyPerspective}
            onStudyPerspectiveChange={setStudyPerspective}
            onSelectArchivedGame={(gameId) => void openArchivedGame(gameId)}
            onStartReplay={() => setArchiveStage("replay")}
            onSelectReplayPly={setSelectedReplayPly}
            onRefreshArchiveList={() => void refreshArchiveList()}
            onPgnImportTextChange={setPgnImportText}
            onImportPgn={() => void importArchiveFromPgn()}
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

      {shouldShowGameOverModal ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="game-over-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-over-modal-title"
            aria-describedby="game-over-modal-description"
          >
            <div className="panel-head">
              <div>
                <p className="eyebrow">{uiGlossary.sections.learningComplete}</p>
                <h2 id="game-over-modal-title">{gameOverHeadline(snapshot.status)}</h2>
              </div>
              <span className="status-pill accent">{uiGlossary.sections.afterGame}</span>
            </div>

            <div className="stack-sm">
              <p className="body-strong">{gameOverResultSummary(snapshot.status)}</p>
              <p id="game-over-modal-description" className="helper-note">
                {uiScreenText.live.gameOverModalBody}
              </p>
              <div className="helper-callout">
                <strong>{uiGlossary.sections.afterGame}</strong>
                <p>{gameOverStudyLead(hasReviewReady, snapshot.archived_game_id)}</p>
                {snapshot.archived_game_id ? <p className="subtle-note">{uiStatusText.success.archiveSaved}</p> : null}
              </div>
              <div className="modal-action-row">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    if (gameOverModalKey) {
                      setDismissedGameOverModalKey(gameOverModalKey);
                    }
                    void openReviewForCurrentGame();
                  }}
                >
                  {uiGlossary.buttons.openReviewSummary}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    if (gameOverModalKey) {
                      setDismissedGameOverModalKey(gameOverModalKey);
                    }
                    void openArchiveForCurrentGame();
                  }}
                >
                  {uiGlossary.buttons.openSavedReplay}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    if (gameOverModalKey) {
                      setDismissedGameOverModalKey(gameOverModalKey);
                    }
                    void createGame();
                  }}
                >
                  {uiGlossary.buttons.startNewStudy}
                </button>
              </div>
              <button
                type="button"
                className="modal-dismiss-button"
                onClick={() => {
                  if (gameOverModalKey) {
                    setDismissedGameOverModalKey(gameOverModalKey);
                  }
                }}
              >
                {uiGlossary.buttons.closeModal}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isResignationPromptOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="game-over-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resign-modal-title"
            aria-describedby="resign-modal-description"
          >
            <div className="panel-head">
              <div>
                <p className="eyebrow">{uiGlossary.buttons.resign}</p>
                <h2 id="resign-modal-title">어느 쪽이 기권할지 확인하세요</h2>
              </div>
              <span className="status-pill warning">{uiGlossary.buttons.resign}</span>
            </div>
            <div className="stack-sm">
              <p id="resign-modal-description" className="body-strong">
                기권은 즉시 학습 종료로 처리되며, 종료 사유가 저장된 대국과 복기에 함께 남습니다.
              </p>
              <p className="helper-note">{uiScreenText.live.resignationPrompt}</p>
              <div className="modal-action-row">
                <button
                  type="button"
                  className="secondary-button warning-action"
                  onClick={() => void resignGame("white")}
                  disabled={isSubmitting || isResigning}
                >
                  {uiGlossary.buttons.resignWhite}
                </button>
                <button
                  type="button"
                  className="secondary-button warning-action"
                  onClick={() => void resignGame("black")}
                  disabled={isSubmitting || isResigning}
                >
                  {uiGlossary.buttons.resignBlack}
                </button>
              </div>
              <button
                type="button"
                className="modal-dismiss-button"
                onClick={() => setIsResignationPromptOpen(false)}
              >
                {uiGlossary.buttons.cancelResignation}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
