import type { ArchivedGame } from "../types";
import {
  colorPerspectiveLabel,
  localizeStudyText,
  movesPlayedLabel,
  replayPlyLabel,
  reviewResultLabel,
  uiGlossary,
  uiScreenText,
  uiStatusText,
} from "../ui-text";

type PostGameReviewViewProps = {
  archivedGame: ArchivedGame | null;
  onReplayFromPly: (plyIndex: number) => void;
  onOpenArchive: () => void;
  onOpenWeakness: () => void;
};

export function PostGameReviewView({
  archivedGame,
  onReplayFromPly,
  onOpenArchive,
  onOpenWeakness,
}: PostGameReviewViewProps) {
  if (!archivedGame || !archivedGame.review_report) {
    return (
      <section className="empty-screen">
        <p className="eyebrow">{uiGlossary.views.review}</p>
        <h2>{uiStatusText.empty.noReviewYet}</h2>
        <p>{uiStatusText.empty.noReviewBody}</p>
        <div className="toolbar-row">
          <button type="button" className="secondary-button" onClick={onOpenArchive}>
            {uiGlossary.buttons.openSavedGames}
          </button>
          <button type="button" className="secondary-button" onClick={onOpenWeakness}>
            {uiGlossary.buttons.openWeakness}
          </button>
        </div>
      </section>
    );
  }

  const report = archivedGame.review_report;

  return (
    <div className="review-layout">
      <section className="panel-card review-summary-card">
        <div className="panel-head">
          <div>
            <p className="eyebrow">{uiGlossary.views.review}</p>
            <h2>{reviewResultLabel(archivedGame.result)}</h2>
          </div>
          <div className="status-strip">
            <span className="status-pill">{movesPlayedLabel(archivedGame.move_logs.length)}</span>
            <span className="status-pill">{colorPerspectiveLabel(archivedGame.user_color)}</span>
          </div>
        </div>
        <p className="support-copy">
          {archivedGame.summary_text ? localizeStudyText(archivedGame.summary_text) : uiStatusText.empty.storedReviewSummary}
        </p>
        <div className="toolbar-row">
          <button type="button" className="secondary-button" onClick={onOpenArchive}>
            {uiGlossary.buttons.startReplay}
          </button>
          <button type="button" className="secondary-button" onClick={onOpenWeakness}>
            {uiGlossary.buttons.openWeakness}
          </button>
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head compact">
          <div>
            <p className="eyebrow">{uiGlossary.sections.importantMistakes}</p>
            <h3>{uiScreenText.review.mistakesTitle}</h3>
          </div>
        </div>
        {report.critical_mistakes.length > 0 ? (
          <div className="moment-grid">
            {report.critical_mistakes.map((item) => (
              <button
                key={`mistake-${item.ply_index}`}
                type="button"
                className="moment-card moment-card-danger"
                onClick={() => onReplayFromPly(item.ply_index)}
              >
                <strong>{item.move_san}</strong>
                <span>{replayPlyLabel(item.ply_index)}</span>
                <p>{localizeStudyText(item.note)}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state-inline">
            <strong>{uiStatusText.empty.noRecordedMistakesTitle}</strong>
            <p>{uiStatusText.empty.noRecordedMistakesBody}</p>
          </div>
        )}
      </section>

      <div className="split-review-grid">
        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.sections.goodMoves}</p>
              <h3>{uiScreenText.review.goodMovesTitle}</h3>
            </div>
          </div>
          {report.good_moves.length > 0 ? (
            <div className="moment-grid">
              {report.good_moves.map((item) => (
                <button
                  key={`good-${item.ply_index}`}
                type="button"
                className="moment-card moment-card-good"
                onClick={() => onReplayFromPly(item.ply_index)}
              >
                <strong>{item.move_san}</strong>
                <span>{replayPlyLabel(item.ply_index)}</span>
                <p>{localizeStudyText(item.note)}</p>
              </button>
            ))}
          </div>
          ) : (
            <p className="helper-note">{uiStatusText.empty.noGoodMoves}</p>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.sections.turningPoints}</p>
              <h3>{uiScreenText.review.turningPointsTitle}</h3>
            </div>
          </div>
          {report.turning_points.length > 0 ? (
            <div className="moment-grid">
              {report.turning_points.map((item) => (
                <button
                  key={`turning-${item.ply_index}`}
                type="button"
                className="moment-card moment-card-shift"
                onClick={() => onReplayFromPly(item.ply_index)}
              >
                <strong>{item.move_san}</strong>
                <span>{replayPlyLabel(item.ply_index)}</span>
                <p>{localizeStudyText(item.note)}</p>
              </button>
            ))}
          </div>
          ) : (
            <p className="helper-note">{uiStatusText.empty.noTurningPoints}</p>
          )}
        </section>
      </div>

      <section className="panel-card emphasis-card">
        <div className="panel-head compact">
          <div>
            <p className="eyebrow">{uiGlossary.concepts.nextStudyFocus}</p>
            <h3>{uiScreenText.review.studyFocusTitle}</h3>
          </div>
        </div>
        <ol className="detail-list">
          {report.study_points.map((point, index) => (
            <li key={`study-${index + 1}`}>{localizeStudyText(point)}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
