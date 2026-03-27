import type { DragEvent } from "react";
import { BoardView } from "../board";
import type { BoardSquare, CandidateOverlay, ColorName, GameSnapshot, PromotionPieceCode, PromotionPrompt } from "../types";
import {
  feedbackSummaryMessage,
  formatEvaluation,
  formatScoreLoss,
  legalMovesCountLabel,
  localizeBackendMessage,
  localizeStudyText,
  movesPlayedLabel,
  studyCandidateLead,
  studyEvaluationSummary,
  studyFeedbackLead,
  studyPerspectiveOptionLabel,
  studyPerspectiveStatusLabel,
  studyPerspectiveSummary,
  studyPlanLead,
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
  activeCandidateMoveUci: string | null;
  checkedSquare: string | null;
  studyPerspective: ColorName;
  isSubmitting: boolean;
  isSavingStudy: boolean;
  hasReviewReady: boolean;
  pendingPromotion: PromotionPrompt | null;
  onStudyPerspectiveChange: (value: ColorName) => void;
  onSquareClick: (square: BoardSquare) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, square: BoardSquare) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>, square: BoardSquare) => void;
  onPromotionSelect: (piece: PromotionPieceCode) => void;
  onPromotionCancel: () => void;
  onCandidateHover: (moveUci: string | null) => void;
  onUndo: () => void;
  onSaveStudy: () => void;
  onCreateGame: () => void;
  onOpenArchive: () => void;
  onOpenReview: () => void;
  onOpenWeakness: () => void;
};

const promotionChoices: Array<{ piece: PromotionPieceCode; label: string }> = [
  { piece: "q", label: "퀸" },
  { piece: "r", label: "룩" },
  { piece: "b", label: "비숍" },
  { piece: "n", label: "나이트" },
];

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
  activeCandidateMoveUci,
  checkedSquare,
  studyPerspective,
  isSubmitting,
  isSavingStudy,
  hasReviewReady,
  pendingPromotion,
  onStudyPerspectiveChange,
  onSquareClick,
  onDragStart,
  onDrop,
  onPromotionSelect,
  onPromotionCancel,
  onCandidateHover,
  onUndo,
  onSaveStudy,
  onCreateGame,
  onOpenArchive,
  onOpenReview,
  onOpenWeakness,
}: LivePlayViewProps) {
  const feedback = snapshot.feedback;
  const analysis = snapshot.analysis;
  const analysisReady = analysis && analysis.fen === snapshot.fen;
  const playedSide = snapshot.move_history.length > 0 ? snapshot.move_history[snapshot.move_history.length - 1].side_to_move_before : null;

  return (
    <div className="content-grid content-grid-live">
      <section className="hero-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">{uiGlossary.views.live}</p>
            <h2>{uiGlossary.concepts.liveBoard}</h2>
          </div>
          <div className="toolbar-row">
            <button type="button" className="secondary-button" onClick={onCreateGame} disabled={isSubmitting}>
              {uiGlossary.buttons.createGame}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={onSaveStudy}
              disabled={isSubmitting || isSavingStudy || snapshot.status.is_game_over}
            >
              {uiGlossary.buttons.saveStudy}
            </button>
            <button type="button" className="secondary-button" onClick={onOpenArchive} disabled={isSubmitting}>
              {uiGlossary.buttons.openSavedGames}
            </button>
            <button type="button" className="secondary-button" onClick={onOpenWeakness} disabled={isSubmitting}>
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
            activeCandidateMoveUci={activeCandidateMoveUci}
            selectedSquare={selectedSquare}
            interactive
            disabled={isSubmitting || snapshot.status.is_game_over || Boolean(pendingPromotion)}
            onSquareClick={onSquareClick}
            onDragStart={onDragStart}
            onDrop={onDrop}
          />
        </div>

        {pendingPromotion ? (
          <section className="promotion-panel">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">{uiGlossary.sections.promotion}</p>
                <h3>{uiGlossary.labels.choosePromotionPiece}</h3>
              </div>
              <span className="status-pill accent">{pendingPromotion.color === "white" ? "백 승격" : "흑 승격"}</span>
            </div>
            <p className="helper-note">{uiScreenText.live.promotionPrompt}</p>
            <div className="promotion-choice-grid">
              {promotionChoices.map((choice) => (
                <button
                  key={choice.piece}
                  type="button"
                  className={`secondary-button promotion-choice ${choice.piece === "q" ? "primary-choice" : ""}`}
                  onClick={() => onPromotionSelect(choice.piece)}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <button type="button" className="secondary-button promotion-cancel-button" onClick={onPromotionCancel}>
              {uiGlossary.buttons.cancelPromotion}
            </button>
          </section>
        ) : null}

        <div className="hero-footer">
          <div className="status-strip">
            <span className="status-pill accent">{turnStatusLabel(snapshot.status.turn)}</span>
            <span className="status-pill">{movesPlayedLabel(snapshot.move_history.length)}</span>
            <span className="status-pill">{legalMovesCountLabel(snapshot.legal_moves.length)}</span>
            {snapshot.status.is_check ? <span className="status-pill warning">{uiGlossary.concepts.check}</span> : null}
            <button
              type="button"
              className="secondary-button inline-action-button"
              onClick={onUndo}
              disabled={isSubmitting || snapshot.status.is_game_over || snapshot.move_history.length === 0}
            >
              {uiGlossary.buttons.undoMove}
            </button>
          </div>
          <p className="support-copy">{message}</p>
          <p className="helper-note subtle-note">{uiScreenText.live.saveStudyHelper}</p>
          <div className="helper-callout subtle-callout">
            <strong>동기화 원칙:</strong> {uiScreenText.live.syncPrinciple}
          </div>
        </div>
      </section>

      <aside className="study-column">
        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.sections.studyPerspective}</p>
              <h3>{uiScreenText.live.perspectiveTitle}</h3>
            </div>
            <span className="status-pill accent">{studyPerspectiveStatusLabel(studyPerspective)}</span>
          </div>
          <p className="helper-note">{uiScreenText.live.perspectiveBody}</p>
          <div className="perspective-toggle-group" role="group" aria-label={uiGlossary.concepts.studyPerspective}>
            {(["white", "black"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`perspective-toggle ${studyPerspective === option ? "active" : ""}`}
                onClick={() => onStudyPerspectiveChange(option)}
                disabled={isSubmitting}
              >
                {studyPerspectiveOptionLabel(option)}
              </button>
            ))}
          </div>
          <div className="helper-callout subtle-callout">
            <strong>{uiGlossary.labels.studySide}:</strong> {studyPerspectiveSummary(studyPerspective, snapshot.status.turn)}
          </div>
        </section>

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
              <p className="helper-note">{studyFeedbackLead(studyPerspective, playedSide)}</p>
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
              <p className="helper-note">{studyPlanLead(studyPerspective, snapshot.status.turn)}</p>
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
          <p className="body-strong">
            {studyEvaluationSummary(analysisReady ? analysis.evaluation : null, snapshot.status.turn, studyPerspective)}
          </p>
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
              <p className="helper-note">{studyCandidateLead(studyPerspective, snapshot.status.turn)}</p>
              <div className="candidate-legend">
                {analysis.top_moves.slice(0, 3).map((move) => (
                  <div
                    key={`${move.rank}-${move.move_uci}`}
                    className={`candidate-row ${activeCandidateMoveUci === move.move_uci ? "active" : ""}`}
                    onMouseEnter={() => onCandidateHover(move.move_uci)}
                    onMouseLeave={() => onCandidateHover(null)}
                  >
                    <span className={`candidate-rank rank-${move.rank}`}>{move.rank}</span>
                    <div>
                      <strong>{move.move_san}</strong>
                      <p>{move.principal_variation_san.slice(0, 3).join(" ") || move.move_uci}</p>
                    </div>
                  </div>
                ))}
              </div>
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

        <details className="panel-card collapsible-panel">
          <summary className="panel-summary">
            <div>
              <p className="eyebrow">{uiGlossary.sections.analysisDetails}</p>
              <h3>{uiScreenText.live.analysisDetailsTitle}</h3>
            </div>
            {analysisReady ? <span className="status-pill">{formatEvaluation(analysis.evaluation)}</span> : null}
          </summary>
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
              <p className="helper-note">{studyPlanLead(studyPerspective, snapshot.status.turn)}</p>
              <ol className="detail-list">
                {analysis.top_moves.slice(0, 3).map((move) => (
                  <li key={`analysis-${move.rank}`}>
                    <strong>
                      {move.rank}. {move.move_san}
                    </strong>
                    <div>{uiGlossary.labels.representativeLine}: {move.principal_variation_san.slice(0, 4).join(" ") || uiStatusText.empty.noStoredLine}</div>
                  </li>
                ))}
              </ol>
              <p className="helper-note subtle-note">{uiScreenText.live.overlayHelper}</p>
            </div>
          ) : (
            <p className="helper-note">{uiScreenText.live.analysisFallback}</p>
          )}
        </details>

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
              <button type="button" className="primary-button" onClick={onOpenReview} disabled={isSubmitting}>
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
