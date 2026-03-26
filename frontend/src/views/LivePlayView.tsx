import type { DragEvent } from "react";
import { BoardView } from "../board";
import type { BoardSquare, CandidateOverlay, GameSnapshot } from "../types";
import {
  feedbackSummaryMessage,
  formatEvaluation,
  formatScoreLoss,
  legalMovesCountLabel,
  localizeBackendMessage,
  localizeStudyText,
  movesPlayedLabel,
  translateMoveQuality,
  turnStatusLabel,
  uiGlossary,
  uiScreenText,
  uiStatusText,
  liveStatusMessage,
} from "../ui-text";

type LivePlayViewProps = {
  snapshot: GameSnapshot;
  message: string;
  selectedSquare: string | null;
  overlays: CandidateOverlay[];
  checkedSquare: string | null;
  isSubmitting: boolean;
  hasReviewReady: boolean;
  onSquareClick: (square: BoardSquare) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, square: BoardSquare) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>, square: BoardSquare) => void;
  onCreateGame: () => void;
  onOpenArchive: () => void;
  onOpenReview: () => void;
  onOpenWeakness: () => void;
};

function qualityTone(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized === "good") return "quality-good";
  if (normalized === "playable") return "quality-playable";
  if (normalized === "inaccuracy") return "quality-inaccuracy";
  if (normalized === "mistake") return "quality-mistake";
  if (normalized === "blunder") return "quality-blunder";
  return "";
}

export function LivePlayView({
  snapshot,
  message,
  selectedSquare,
  overlays,
  checkedSquare,
  isSubmitting,
  hasReviewReady,
  onSquareClick,
  onDragStart,
  onDrop,
  onCreateGame,
  onOpenArchive,
  onOpenReview,
  onOpenWeakness,
}: LivePlayViewProps) {
  const feedback = snapshot.feedback;
  const analysis = snapshot.analysis;
  const analysisReady = analysis && analysis.fen === snapshot.fen;

  return (
    <div className="content-grid content-grid-live">
      <section className="hero-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">{uiGlossary.views.live}</p>
            <h2>{uiGlossary.concepts.liveBoard}</h2>
          </div>
          <div className="toolbar-row">
            <button type="button" className="secondary-button" onClick={onCreateGame}>
              {uiGlossary.buttons.createGame}
            </button>
            <button type="button" className="secondary-button" onClick={onOpenArchive}>
              {uiGlossary.buttons.openSavedGames}
            </button>
            <button type="button" className="secondary-button" onClick={onOpenWeakness}>
              {uiGlossary.buttons.openWeakness}
            </button>
          </div>
        </div>

        <div className="hero-board-wrap">
          <BoardView
            fen={snapshot.fen}
            lastMoveUci={snapshot.last_move_uci}
            checkedSquare={checkedSquare}
            overlays={overlays}
            selectedSquare={selectedSquare}
            interactive
            disabled={isSubmitting || snapshot.status.is_game_over}
            onSquareClick={onSquareClick}
            onDragStart={onDragStart}
            onDrop={onDrop}
          />
        </div>

        <div className="hero-footer">
          <div className="status-strip">
            <span className="status-pill accent">{turnStatusLabel(snapshot.status.turn)}</span>
            <span className="status-pill">{movesPlayedLabel(snapshot.move_history.length)}</span>
            <span className="status-pill">{legalMovesCountLabel(snapshot.legal_moves.length)}</span>
            {snapshot.status.is_check ? <span className="status-pill warning">{uiGlossary.concepts.check}</span> : null}
          </div>
          <p className="support-copy">{message}</p>
          <div className="helper-callout">
            <strong>동기화 원칙:</strong> {uiScreenText.live.syncPrinciple}
          </div>
        </div>
      </section>

      <aside className="study-column">
        <section className="panel-card emphasis-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.sections.immediateFeedback}</p>
              <h3>{uiScreenText.live.feedbackTitle}</h3>
            </div>
            {feedback ? (
              <span className={`quality-chip ${qualityTone(feedback.move_quality_label)}`}>
                {translateMoveQuality(feedback.move_quality_label)}
              </span>
            ) : null}
          </div>
          {feedback ? (
            <div className="stack-sm">
              <p className="body-strong">
                {feedbackSummaryMessage(feedback.played_move_san, feedback.best_move_san)}
              </p>
              <p>{localizeStudyText(feedback.short_explanation)}</p>
              <div className="info-grid compact">
                <div>
                  <span className="muted-label">{uiGlossary.labels.bestMoveGap}</span>
                  <strong>{formatScoreLoss(feedback.score_loss_centipawns)}</strong>
                </div>
                <div>
                  <span className="muted-label">{uiGlossary.labels.nextPlan}</span>
                  <strong>{localizeStudyText(feedback.current_plan)}</strong>
                </div>
              </div>
            </div>
          ) : snapshot.feedback_error ? (
            <div className="empty-state-inline">
              <strong>{uiStatusText.error.feedbackUnavailableTitle}</strong>
              <p>{localizeBackendMessage(snapshot.feedback_error)}</p>
            </div>
          ) : (
            <div className="empty-state-inline">
              <strong>{uiStatusText.empty.noFeedbackYetTitle}</strong>
              <p>{uiStatusText.empty.noFeedbackYetBody}</p>
            </div>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.sections.currentGuidance}</p>
              <h3>{uiScreenText.live.guidanceTitle}</h3>
            </div>
          </div>
          <p>{liveStatusMessage(snapshot.move_history.length)}</p>
          <div className="tag-row">
            <span className="tag-pill">{uiGlossary.concepts.lastMove} 강조</span>
            <span className="tag-pill">{uiGlossary.concepts.check} 강조</span>
            <span className="tag-pill">상위 3개 {uiGlossary.concepts.candidateMoves}</span>
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.concepts.recommendedMoves}</p>
              <h3>{uiScreenText.live.candidateOverlayTitle}</h3>
            </div>
          </div>
          {analysisReady ? (
            <div className="stack-sm">
              <div className="candidate-legend">
                {analysis.top_moves.slice(0, 3).map((move) => (
                  <div key={`${move.rank}-${move.move_uci}`} className="candidate-row">
                    <span className={`candidate-rank rank-${move.rank}`}>{move.rank}</span>
                    <div>
                      <strong>{move.move_san}</strong>
                      <p>{move.move_uci}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="helper-note">{uiScreenText.live.overlayHelper}</p>
            </div>
          ) : snapshot.analysis_error ? (
            <div className="empty-state-inline">
              <strong>{uiStatusText.error.analysisUnavailableTitle}</strong>
              <p>{localizeBackendMessage(snapshot.analysis_error.message)}</p>
            </div>
          ) : (
            <div className="empty-state-inline">
              <strong>{uiScreenText.live.analysisWaitingTitle}</strong>
              <p>{uiScreenText.live.analysisWaitingBody}</p>
            </div>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.sections.analysisDetails}</p>
              <h3>{uiScreenText.live.analysisDetailsTitle}</h3>
            </div>
          </div>
          {analysisReady ? (
            <div className="stack-sm">
              <div className="info-grid compact">
                <div>
                  <span className="muted-label">{uiGlossary.labels.evaluation}</span>
                  <strong>{formatEvaluation(analysis.evaluation)}</strong>
                </div>
                <div>
                  <span className="muted-label">{uiGlossary.labels.bestMove}</span>
                  <strong>{analysis.best_move.move_san}</strong>
                </div>
              </div>
              <ol className="detail-list">
                {analysis.top_moves.slice(0, 3).map((move) => (
                  <li key={`analysis-${move.rank}`}>
                    <strong>
                      {move.rank}. {move.move_san}
                    </strong>
                    <span>{move.move_uci}</span>
                    <div>{uiGlossary.labels.representativeLine}: {move.principal_variation_san.join(" ") || uiStatusText.empty.noStoredLine}</div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="helper-note">{uiScreenText.live.analysisFallback}</p>
          )}
        </section>

        <section className="panel-card future-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.sections.afterGame}</p>
              <h3>{uiScreenText.live.reviewEntryTitle}</h3>
            </div>
          </div>
          {hasReviewReady ? (
            <div className="stack-sm">
              <p>{uiStatusText.placeholder.reviewReady}</p>
              <button type="button" className="primary-button" onClick={onOpenReview}>
                {uiGlossary.buttons.openReview}
              </button>
            </div>
          ) : (
            <div className="stack-sm">
              <p>{uiStatusText.placeholder.reviewPreparing}</p>
              <button type="button" className="secondary-button" onClick={onOpenReview} disabled>
                {uiGlossary.buttons.preparingReview}
              </button>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
