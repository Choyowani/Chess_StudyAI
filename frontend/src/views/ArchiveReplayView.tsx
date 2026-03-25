import { BoardView } from "../board";
import { parseArchivedCandidateMove } from "../archive";
import type { ArchivedGame, ArchivedGameSummary, CandidateMove } from "../types";

type ReplayMoveContext = {
  boardFen: string;
  currentMove: ArchivedGame["move_logs"][number] | null;
  reviewNotes: string[];
} | null;

type ArchiveReplayViewProps = {
  archivedGame: ArchivedGame | null;
  archiveList: ArchivedGameSummary[];
  archiveMessage: string;
  isArchiveLoading: boolean;
  selectedReplayPly: number;
  replayContext: ReplayMoveContext;
  onSelectArchivedGame: (gameId: string) => void;
  onSelectReplayPly: (ply: number) => void;
  onRefreshArchiveList: () => void;
  onOpenReview: () => void;
};

export function ArchiveReplayView({
  archivedGame,
  archiveList,
  archiveMessage,
  isArchiveLoading,
  selectedReplayPly,
  replayContext,
  onSelectArchivedGame,
  onSelectReplayPly,
  onRefreshArchiveList,
  onOpenReview,
}: ArchiveReplayViewProps) {
  const replayMove = replayContext?.currentMove ?? null;
  const replayCandidates: CandidateMove[] = replayMove
    ? replayMove.top_candidate_moves
        .map((candidate) => parseArchivedCandidateMove(candidate))
        .filter((candidate): candidate is CandidateMove => candidate !== null)
        .sort((left, right) => left.rank - right.rank)
    : [];

  return (
    <div className="content-grid content-grid-archive">
      <section className="panel-card archive-browser">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Archive browser</p>
            <h2>Saved completed games</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onRefreshArchiveList}>
            Refresh
          </button>
        </div>
        <p className="support-copy">{archiveMessage}</p>
        <ol className="archive-list">
          {archiveList.map((item) => (
            <li key={item.game_id}>
              <button
                type="button"
                className={`archive-card ${archivedGame?.id === item.game_id ? "selected" : ""}`}
                onClick={() => onSelectArchivedGame(item.game_id)}
                disabled={isArchiveLoading}
              >
                <div className="archive-card-head">
                  <strong>{item.result ?? "*"}</strong>
                  <span>{item.move_count} plies</span>
                </div>
                <span>{new Date(item.finished_at).toLocaleString()}</span>
                <span>{item.user_color} perspective</span>
                <div>{item.summary_preview ?? "Saved game ready for replay."}</div>
              </button>
            </li>
          ))}
          {archiveList.length === 0 ? <li>No archived games available.</li> : null}
        </ol>
      </section>

      <section className="hero-panel">
        {archivedGame && replayContext ? (
          <>
            <div className="panel-head">
              <div>
                <p className="eyebrow">Replay board</p>
                <h2>{replayMove ? `${replayMove.move_san} on ply ${replayMove.ply_index}` : "Initial position"}</h2>
              </div>
              <div className="toolbar-row">
                <button type="button" className="secondary-button" onClick={() => onSelectReplayPly(0)} disabled={selectedReplayPly === 0}>
                  First
                </button>
                <button type="button" className="secondary-button" onClick={() => onSelectReplayPly(Math.max(0, selectedReplayPly - 1))} disabled={selectedReplayPly === 0}>
                  Previous
                </button>
                <button type="button" className="secondary-button" onClick={() => onSelectReplayPly(Math.min(archivedGame.move_logs.length, selectedReplayPly + 1))} disabled={selectedReplayPly >= archivedGame.move_logs.length}>
                  Next
                </button>
                <button type="button" className="secondary-button" onClick={() => onSelectReplayPly(archivedGame.move_logs.length)} disabled={selectedReplayPly >= archivedGame.move_logs.length}>
                  Last
                </button>
              </div>
            </div>

            <div className="hero-board-wrap">
              <BoardView
                fen={replayContext.boardFen}
                lastMoveUci={replayMove?.move_uci ?? null}
                checkedSquare={null}
                overlays={[]}
                disabled
              />
            </div>

            <div className="hero-footer">
              <div className="status-strip">
                <span className="status-pill">Ply {selectedReplayPly}/{archivedGame.move_logs.length}</span>
                <span className="status-pill">{archivedGame.result ?? "*"}</span>
                <span className="status-pill">{archivedGame.user_color} side</span>
              </div>
              <p className="support-copy">
                {replayMove
                  ? "Replay renders the stored position for the selected ply, so the board and saved coaching data stay aligned."
                  : "Start position loaded. Step through the saved move log to inspect coaching at each ply."}
              </p>
            </div>
          </>
        ) : (
          <section className="empty-screen">
            <p className="eyebrow">Archive replay</p>
            <h2>Select a saved game</h2>
            <p>Choose an archived game from the list to inspect moves, stored feedback, and post-game review context.</p>
          </section>
        )}
      </section>

      <aside className="study-column">
        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Replay navigation</p>
              <h3>Move list</h3>
            </div>
            {archivedGame ? (
              <button type="button" className="secondary-button" onClick={onOpenReview}>
                Full review
              </button>
            ) : null}
          </div>
          {archivedGame ? (
            <ol className="replay-jump-list">
              <li>
                <button
                  type="button"
                  className={`move-jump ${selectedReplayPly === 0 ? "selected" : ""}`}
                  onClick={() => onSelectReplayPly(0)}
                >
                  Start position
                </button>
              </li>
              {archivedGame.move_logs.map((move) => (
                <li key={`ply-${move.ply_index}`}>
                  <button
                    type="button"
                    className={`move-jump ${selectedReplayPly === move.ply_index ? "selected" : ""}`}
                    onClick={() => onSelectReplayPly(move.ply_index)}
                  >
                    {move.ply_index}. {move.move_san}
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="helper-note">No replay moves to show yet.</p>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Selected ply</p>
              <h3>Move context</h3>
            </div>
          </div>
          {replayMove ? (
            <div className="stack-sm">
              <div className="info-grid compact">
                <div>
                  <span className="muted-label">Before FEN</span>
                  <strong className="mono-text">{replayMove.before_fen}</strong>
                </div>
                <div>
                  <span className="muted-label">After FEN</span>
                  <strong className="mono-text">{replayMove.after_fen}</strong>
                </div>
              </div>
              <p><strong>User move:</strong> {replayMove.move_san} ({replayMove.move_uci})</p>
              <p><strong>Best move:</strong> {replayMove.best_move_san && replayMove.best_move_uci ? `${replayMove.best_move_san} (${replayMove.best_move_uci})` : "Not stored"}</p>
              <p><strong>Quality:</strong> {replayMove.move_quality_label ?? "Not graded"}</p>
              <p><strong>Coaching note:</strong> {replayMove.short_coaching_note ?? "No short coaching note stored."}</p>
              <p><strong>Plan:</strong> {replayMove.current_plan ?? "No one-line plan stored."}</p>
            </div>
          ) : (
            <p className="helper-note">Select a ply to see the stored before/after FEN and coaching details for that move.</p>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Candidate review</p>
              <h3>Best alternatives</h3>
            </div>
          </div>
          {replayCandidates.length > 0 ? (
            <ol className="detail-list">
              {replayCandidates.map((move) => (
                <li key={`candidate-${move.rank}-${move.move_uci}`}>
                  <strong>{move.rank}. {move.move_san}</strong>
                  <span>{move.move_uci}</span>
                  <div>PV: {move.principal_variation_san.join(" ") || "No PV stored"}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="helper-note">Stored top candidate moves appear here for the selected played move.</p>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Review context</p>
              <h3>Learning notes</h3>
            </div>
          </div>
          {replayContext?.reviewNotes.length ? (
            <ol className="detail-list">
              {replayContext.reviewNotes.map((note, index) => (
                <li key={`review-note-${index + 1}`}>{note}</li>
              ))}
            </ol>
          ) : (
            <p className="helper-note">This ply has no dedicated review highlight. Use the full review screen for broader game themes.</p>
          )}
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
      </aside>
    </div>
  );
}
