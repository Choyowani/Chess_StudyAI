import { BoardView } from "../board";
import { parseArchivedCandidateMove, replayImportantMoments, replayMomentsByPly, type ReplayMoment } from "../archive";
import type { ArchivedGame, ArchivedGameSummary, CandidateMove } from "../types";
import {
  archiveResultLabel,
  colorPerspectiveLabel,
  localizeStudyText,
  moveCountLabel,
  replayProgressLabel,
  reviewContextChipLabel,
  uiGlossary,
  uiScreenText,
  uiStatusText,
  translateMoveQuality,
  weaknessTagLabel,
} from "../ui-text";

type ReplayMoveContext = {
  boardFen: string;
  currentMove: ArchivedGame["move_logs"][number] | null;
  reviewNotes: string[];
  matchedMoments: ReplayMoment[];
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
  onOpenWeakness: () => void;
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
  onOpenWeakness,
}: ArchiveReplayViewProps) {
  const replayMove = replayContext?.currentMove ?? null;
  const importantMoments = replayImportantMoments(archivedGame);
  const momentsByPly = replayMomentsByPly(archivedGame);
  const replayCandidates: CandidateMove[] = replayMove
    ? replayMove.top_candidate_moves
        .map((candidate) => parseArchivedCandidateMove(candidate))
        .filter((candidate): candidate is CandidateMove => candidate !== null)
        .sort((left, right) => left.rank - right.rank)
    : [];
  const reviewReport = archivedGame?.review_report ?? null;
  const currentMomentKinds = replayContext?.matchedMoments ?? [];

  return (
    <div className="content-grid content-grid-archive">
      <section className="panel-card archive-browser">
        <div className="panel-head">
          <div>
            <p className="eyebrow">{uiGlossary.concepts.savedGames}</p>
            <h2>{uiScreenText.archive.listTitle}</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onRefreshArchiveList}>
            {uiGlossary.buttons.refresh}
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
                  <strong>{archiveResultLabel(item.result)}</strong>
                  <span>{moveCountLabel(item.move_count)}</span>
                </div>
                <span>{new Date(item.finished_at).toLocaleString()}</span>
                <span>{colorPerspectiveLabel(item.user_color)}</span>
                <div>{item.summary_preview ? localizeStudyText(item.summary_preview) : uiStatusText.empty.replayReadySummary}</div>
              </button>
            </li>
          ))}
          {archiveList.length === 0 ? <li>{uiStatusText.empty.archiveList}</li> : null}
        </ol>
      </section>

      <section className="hero-panel">
        {archivedGame && replayContext ? (
          <>
            <div className="panel-head">
              <div>
                <p className="eyebrow">{uiGlossary.concepts.replay}</p>
                <h2>{replayMove ? `${replayMove.move_san} · ${selectedReplayPly}수째` : uiStatusText.startPosition}</h2>
              </div>
              <div className="toolbar-row">
                <button type="button" className="secondary-button" onClick={() => onSelectReplayPly(0)} disabled={selectedReplayPly === 0}>
                  {uiGlossary.buttons.replayFirst}
                </button>
                <button type="button" className="secondary-button" onClick={() => onSelectReplayPly(Math.max(0, selectedReplayPly - 1))} disabled={selectedReplayPly === 0}>
                  {uiGlossary.buttons.replayPrevious}
                </button>
                <button type="button" className="secondary-button" onClick={() => onSelectReplayPly(Math.min(archivedGame.move_logs.length, selectedReplayPly + 1))} disabled={selectedReplayPly >= archivedGame.move_logs.length}>
                  {uiGlossary.buttons.replayNext}
                </button>
                <button type="button" className="secondary-button" onClick={() => onSelectReplayPly(archivedGame.move_logs.length)} disabled={selectedReplayPly >= archivedGame.move_logs.length}>
                  {uiGlossary.buttons.replayLast}
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

            <section className="replay-important-strip">
              <div className="panel-head compact">
                <div>
                  <p className="eyebrow">{uiGlossary.sections.importantMoments}</p>
                  <h3>{uiScreenText.archive.importantMomentsTitle}</h3>
                </div>
              </div>
              {importantMoments.length > 0 ? (
                <div className="moment-grid replay-moment-grid">
                  {importantMoments.map((moment) => (
                    <button
                      key={`${moment.kind}-${moment.plyIndex}`}
                      type="button"
                      className={`moment-card ${moment.kind === "mistake" ? "moment-card-danger" : moment.kind === "good" ? "moment-card-good" : "moment-card-shift"} ${selectedReplayPly === moment.plyIndex ? "selected" : ""}`}
                      onClick={() => onSelectReplayPly(moment.plyIndex)}
                    >
                      <div className="archive-moment-meta">
                        <span className={`status-pill replay-moment-pill replay-moment-pill-${moment.kind}`}>
                          {reviewContextChipLabel(moment.kind)}
                        </span>
                        <span>{moment.plyIndex}수째</span>
                      </div>
                      <strong>{moment.moveSan}</strong>
                      <p>{localizeStudyText(moment.note)}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="helper-note">{uiStatusText.empty.noImportantMoments}</p>
              )}
            </section>

            <div className="hero-footer">
              <div className="status-strip">
                <span className="status-pill">{replayProgressLabel(selectedReplayPly, archivedGame.move_logs.length)}</span>
                <span className="status-pill">{archiveResultLabel(archivedGame.result)}</span>
                <span className="status-pill">{colorPerspectiveLabel(archivedGame.user_color)}</span>
                {currentMomentKinds.map((moment) => (
                  <span key={`${moment.kind}-${moment.plyIndex}`} className={`status-pill replay-moment-pill replay-moment-pill-${moment.kind}`}>
                    {reviewContextChipLabel(moment.kind)}
                  </span>
                ))}
              </div>
              <p className="support-copy">
                {replayMove
                  ? uiScreenText.archive.replaySyncedBody
                  : uiScreenText.archive.replayStartBody}
              </p>
            </div>
          </>
        ) : (
          <section className="empty-screen">
            <p className="eyebrow">{uiGlossary.views.archive}</p>
            <h2>{uiStatusText.empty.noArchiveSelectedTitle}</h2>
            <p>{uiStatusText.empty.noArchiveSelectedBody}</p>
          </section>
        )}
      </section>

      <aside className="study-column">
        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">수순 이동</p>
              <h3>{uiScreenText.archive.moveListTitle}</h3>
            </div>
            <div className="toolbar-row">
              {archivedGame ? (
                <button type="button" className="secondary-button" onClick={onOpenReview}>
                  {uiGlossary.buttons.openReviewSummary}
                </button>
              ) : null}
            </div>
          </div>
          <p className="helper-note">{uiScreenText.archive.moveListHelper}</p>
          {archivedGame ? (
            <ol className="replay-jump-list">
              <li>
                <button
                  type="button"
                  className={`move-jump ${selectedReplayPly === 0 ? "selected" : ""}`}
                  onClick={() => onSelectReplayPly(0)}
                >
                  {uiStatusText.startPosition}
                </button>
              </li>
              {archivedGame.move_logs.map((move) => (
                <li key={`ply-${move.ply_index}`}>
                  <button
                    type="button"
                    className={`move-jump ${selectedReplayPly === move.ply_index ? "selected" : ""} ${momentsByPly.has(move.ply_index) ? "important" : ""}`}
                    onClick={() => onSelectReplayPly(move.ply_index)}
                  >
                    <div className="move-jump-head">
                      <strong>{move.ply_index}. {move.move_san}</strong>
                      {momentsByPly.get(move.ply_index)?.length ? (
                        <span className="move-jump-markers">
                          {momentsByPly.get(move.ply_index)?.map((moment) => (
                            <span
                              key={`${moment.kind}-${moment.plyIndex}`}
                              className={`mini-pill mini-pill-${moment.kind}`}
                            >
                              {reviewContextChipLabel(moment.kind)}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </div>
                    <span className="move-jump-subtext">
                      {move.move_quality_label ? translateMoveQuality(move.move_quality_label) : uiStatusText.unavailable}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="helper-note">{uiStatusText.empty.noReplayMoves}</p>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.sections.currentLearningFocus}</p>
              <h3>{uiScreenText.archive.learningPanelTitle}</h3>
            </div>
          </div>
          {replayMove ? (
            <div className="stack-sm">
              <div className="status-strip">
                <span className={`quality-chip ${replayMove.move_quality_label ? `quality-${replayMove.move_quality_label.toLowerCase()}` : ""}`}>
                  {replayMove.move_quality_label ? translateMoveQuality(replayMove.move_quality_label) : "평가 없음"}
                </span>
                <span className="status-pill">{replayMove.move_san}</span>
                <span className="status-pill">{replayProgressLabel(selectedReplayPly, archivedGame?.move_logs.length ?? selectedReplayPly)}</span>
              </div>
              <div className="helper-callout">
                <strong>{uiGlossary.labels.moveMeaning}</strong>
                <p>{replayMove.short_coaching_note ? localizeStudyText(replayMove.short_coaching_note) : uiStatusText.empty.noStoredNote}</p>
              </div>
              <div className="helper-callout">
                <strong>{uiGlossary.sections.whyItMatters}</strong>
                {replayContext?.reviewNotes.length ? (
                  <ol className="detail-list">
                    {replayContext.reviewNotes.map((note, index) => (
                      <li key={`review-note-${index + 1}`}>{localizeStudyText(note)}</li>
                    ))}
                  </ol>
                ) : (
                  <p>{uiStatusText.empty.noReplayHighlight}</p>
                )}
              </div>
              <div className="helper-callout">
                <strong>{uiGlossary.sections.nextToStudy}</strong>
                <p>{replayMove.current_plan ? localizeStudyText(replayMove.current_plan) : uiStatusText.empty.noStoredPlan}</p>
              </div>
              <div className="info-grid compact">
                <div>
                  <span className="muted-label">{uiGlossary.labels.beforeFen}</span>
                  <strong className="mono-text">{replayMove.before_fen}</strong>
                </div>
                <div>
                  <span className="muted-label">{uiGlossary.labels.afterFen}</span>
                  <strong className="mono-text">{replayMove.after_fen}</strong>
                </div>
              </div>
              <p><strong>{uiGlossary.labels.userMove}:</strong> {replayMove.move_san} ({replayMove.move_uci})</p>
              <p><strong>{uiGlossary.labels.bestMove}:</strong> {replayMove.best_move_san && replayMove.best_move_uci ? `${replayMove.best_move_san} (${replayMove.best_move_uci})` : uiStatusText.empty.noStoredInfo}</p>
              {replayMove.pattern_tags.length ? (
                <div className="tag-row">
                  {replayMove.pattern_tags.map((tag, index) => (
                    <span key={`${tag.pattern_type}-${tag.pattern_key}-${index + 1}`} className="tag-pill">
                      {weaknessTagLabel(tag.pattern_type, tag.pattern_key)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="helper-note">{uiStatusText.empty.noSelectedMove}</p>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.concepts.candidateMoves} 복기</p>
              <h3>{uiScreenText.archive.candidateReviewTitle}</h3>
            </div>
          </div>
          {replayCandidates.length > 0 ? (
            <ol className="detail-list">
              {replayCandidates.map((move) => (
                <li key={`candidate-${move.rank}-${move.move_uci}`} className="candidate-review-item">
                  <div className="archive-moment-meta">
                    <span className={`candidate-rank rank-${move.rank}`}>{move.rank}</span>
                    <strong>{move.move_san}</strong>
                  </div>
                  <span>{move.move_uci}</span>
                  <div>{uiGlossary.labels.representativeLine}: {move.principal_variation_san.join(" ") || uiStatusText.empty.noStoredLine}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="helper-note">{uiStatusText.empty.noStoredCandidates}</p>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.concepts.nextStudyFocus}</p>
              <h3>{uiScreenText.archive.studyFocusTitle}</h3>
            </div>
            <button type="button" className="secondary-button" onClick={onOpenWeakness}>
              {uiGlossary.buttons.openWeaknessFromReplay}
            </button>
          </div>
          {reviewReport?.study_points.length ? (
            <ol className="detail-list">
              {reviewReport.study_points.map((point, index) => (
                <li key={`study-point-${index + 1}`}>{localizeStudyText(point)}</li>
              ))}
            </ol>
          ) : (
            <p className="helper-note">{uiStatusText.empty.noStudyFocus}</p>
          )}
        </section>
      </aside>
    </div>
  );
}
