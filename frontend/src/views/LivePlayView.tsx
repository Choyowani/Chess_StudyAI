import type { DragEvent } from "react";
import { BoardView } from "../board";
import type { BoardSquare, CandidateOverlay, EvaluationScore, GameSnapshot } from "../types";

type LivePlayViewProps = {
  snapshot: GameSnapshot;
  message: string;
  selectedSquare: string | null;
  overlays: CandidateOverlay[];
  checkedSquare: string | null;
  isSubmitting: boolean;
  hasReviewReady: boolean;
  formatEvaluation: (score: EvaluationScore | null) => string;
  formatScoreLoss: (scoreLossCentipawns: number) => string;
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

function phaseGuidance(moveCount: number): string {
  if (moveCount <= 2) {
    return "Start with center control and simple development. Choose moves that claim space without creating early weaknesses.";
  }
  if (moveCount <= 8) {
    return "Keep developing toward the center and look for a safe castling plan before chasing side pawns.";
  }
  if (moveCount <= 18) {
    return "Coordinate pieces before forcing tactics. Ask which side has the safer king and the easier central breaks.";
  }
  return "Use the engine line as direction, then focus on the plan behind it: king safety, loose pieces, and active squares.";
}

export function LivePlayView({
  snapshot,
  message,
  selectedSquare,
  overlays,
  checkedSquare,
  isSubmitting,
  hasReviewReady,
  formatEvaluation,
  formatScoreLoss,
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
            <p className="eyebrow">Live play</p>
            <h2>Study board</h2>
          </div>
          <div className="toolbar-row">
            <button type="button" className="secondary-button" onClick={onCreateGame}>
              New game
            </button>
            <button type="button" className="secondary-button" onClick={onOpenArchive}>
              Open archive
            </button>
            <button type="button" className="secondary-button" onClick={onOpenWeakness}>
              Weakness dashboard
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
            <span className="status-pill accent">{snapshot.status.turn} to move</span>
            <span className="status-pill">{snapshot.move_history.length} plies played</span>
            <span className="status-pill">{snapshot.legal_moves.length} legal moves</span>
            {snapshot.status.is_check ? <span className="status-pill warning">Check</span> : null}
          </div>
          <p className="support-copy">{message}</p>
          <div className="helper-callout">
            <strong>Board sync rule:</strong> the board only changes after backend validation succeeds. Analysis and coaching can fail independently without breaking play.
          </div>
        </div>
      </section>

      <aside className="study-column">
        <section className="panel-card emphasis-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Immediate feedback</p>
              <h3>What your last move did</h3>
            </div>
            {feedback ? (
              <span className={`quality-chip ${qualityTone(feedback.move_quality_label)}`}>
                {feedback.move_quality_label}
              </span>
            ) : null}
          </div>
          {feedback ? (
            <div className="stack-sm">
              <p className="body-strong">
                {feedback.played_move_san} compared with best move {feedback.best_move_san}
              </p>
              <p>{feedback.short_explanation}</p>
              <div className="info-grid compact">
                <div>
                  <span className="muted-label">Best-move gap</span>
                  <strong>{formatScoreLoss(feedback.score_loss_centipawns)}</strong>
                </div>
                <div>
                  <span className="muted-label">Recommended plan</span>
                  <strong>{feedback.current_plan}</strong>
                </div>
              </div>
            </div>
          ) : snapshot.feedback_error ? (
            <div className="empty-state-inline">
              <strong>Feedback unavailable</strong>
              <p>{snapshot.feedback_error}</p>
            </div>
          ) : (
            <div className="empty-state-inline">
              <strong>Waiting for your move</strong>
              <p>After a legal move is accepted, the coaching summary will appear here.</p>
            </div>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Position guidance</p>
              <h3>What matters now</h3>
            </div>
          </div>
          <p>{phaseGuidance(snapshot.move_history.length)}</p>
          <div className="tag-row">
            <span className="tag-pill">Last move highlight</span>
            <span className="tag-pill">Check emphasis</span>
            <span className="tag-pill">Top 3 overlay</span>
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Candidate moves</p>
              <h3>Overlay legend</h3>
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
              <p className="helper-note">Overlay markers stay pointer-free so click-to-move and drag-and-drop remain stable.</p>
            </div>
          ) : snapshot.analysis_error ? (
            <div className="empty-state-inline">
              <strong>Analysis unavailable</strong>
              <p>{snapshot.analysis_error.message}</p>
            </div>
          ) : (
            <div className="empty-state-inline">
              <strong>No candidates yet</strong>
              <p>Top 3 move overlays will appear after the backend returns analysis for the new position.</p>
            </div>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Engine detail</p>
              <h3>Secondary context</h3>
            </div>
          </div>
          {analysisReady ? (
            <div className="stack-sm">
              <div className="info-grid compact">
                <div>
                  <span className="muted-label">Evaluation</span>
                  <strong>{formatEvaluation(analysis.evaluation)}</strong>
                </div>
                <div>
                  <span className="muted-label">Best move</span>
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
                    <div>PV: {move.principal_variation_san.join(" ") || "No PV stored"}</div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="helper-note">Raw engine data stays secondary. The learning flow should remain useful even when analysis is delayed or unavailable.</p>
          )}
        </section>

        <section className="panel-card future-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">After the game</p>
              <h3>Review handoff</h3>
            </div>
          </div>
          {hasReviewReady ? (
            <div className="stack-sm">
              <p>A saved review is ready for this finished game.</p>
              <button type="button" className="primary-button" onClick={onOpenReview}>
                Open post-game review
              </button>
            </div>
          ) : (
            <div className="stack-sm">
              <p>When the game finishes, this area becomes the entry point to archived review and replay.</p>
              <button type="button" className="secondary-button" onClick={onOpenReview} disabled>
                Review pending
              </button>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
