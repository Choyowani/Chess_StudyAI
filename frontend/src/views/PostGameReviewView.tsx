import type { ArchivedGame } from "../types";

type PostGameReviewViewProps = {
  archivedGame: ArchivedGame | null;
  onReplayFromPly: (plyIndex: number) => void;
  onOpenArchive: () => void;
  onOpenWeakness: () => void;
};

function resultLabel(result: string | null): string {
  if (result === "1-0") return "White won";
  if (result === "0-1") return "Black won";
  if (result === "1/2-1/2") return "Draw";
  return "Review unavailable";
}

export function PostGameReviewView({
  archivedGame,
  onReplayFromPly,
  onOpenArchive,
  onOpenWeakness,
}: PostGameReviewViewProps) {
  if (!archivedGame || !archivedGame.review_report) {
    return (
      <section className="empty-screen">
        <p className="eyebrow">Post-game review</p>
        <h2>No completed review yet</h2>
        <p>Finish a game first, or open an archived game that already has a stored review report.</p>
        <div className="toolbar-row">
          <button type="button" className="secondary-button" onClick={onOpenArchive}>
            Open archive
          </button>
          <button type="button" className="secondary-button" onClick={onOpenWeakness}>
            Open weakness dashboard
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
            <p className="eyebrow">Post-game review</p>
            <h2>{resultLabel(archivedGame.result)}</h2>
          </div>
          <div className="status-strip">
            <span className="status-pill">{archivedGame.move_logs.length} plies</span>
            <span className="status-pill">{archivedGame.user_color} perspective</span>
          </div>
        </div>
        <p className="support-copy">
          {archivedGame.summary_text ?? "Stored review summary is available for this game."}
        </p>
        <div className="toolbar-row">
          <button type="button" className="secondary-button" onClick={onOpenArchive}>
            Open replay
          </button>
          <button type="button" className="secondary-button" onClick={onOpenWeakness}>
            Open weakness dashboard
          </button>
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-head compact">
          <div>
            <p className="eyebrow">Critical mistakes</p>
            <h3>The biggest losses</h3>
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
                <span>Ply {item.ply_index}</span>
                <p>{item.note}</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state-inline">
            <strong>No major mistakes recorded</strong>
            <p>This game did not cross the current critical-mistake threshold.</p>
          </div>
        )}
      </section>

      <div className="split-review-grid">
        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Good moves</p>
              <h3>What to keep repeating</h3>
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
                  <span>Ply {item.ply_index}</span>
                  <p>{item.note}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="helper-note">The current review did not flag standout strong moves for this game.</p>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Turning points</p>
              <h3>Where the game swung</h3>
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
                  <span>Ply {item.ply_index}</span>
                  <p>{item.note}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="helper-note">No large evaluation swings were stored for this game.</p>
          )}
        </section>
      </div>

      <section className="panel-card emphasis-card">
        <div className="panel-head compact">
          <div>
            <p className="eyebrow">Next study focus</p>
            <h3>What to work on next</h3>
          </div>
        </div>
        <ol className="detail-list">
          {report.study_points.map((point, index) => (
            <li key={`study-${index + 1}`}>{point}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
