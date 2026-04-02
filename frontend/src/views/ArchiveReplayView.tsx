import { EvaluationBar } from "../components/EvaluationBar";
import {
  MoveClassificationBadge,
  moveBadgeDescriptorForArchivedMove,
} from "../components/MoveClassificationBadge";
import { BoardView } from "../board";
import {
  parseArchivedCandidateMove,
  replayLandingSummary,
  replayEvaluationForPly,
  replayImportantMoments,
  replayMomentsByPly,
  type ReplayMoment,
} from "../archive";
import type { ArchiveStage, ArchivedGame, ArchivedGameSummary, CandidateMove, ColorName } from "../types";
import {
  archiveLandingScoreLabel,
  archiveResultLabel,
  colorPerspectiveLabel,
  localizeStudyText,
  moveBadgeToneClass,
  moveClassificationLabel,
  moveClassificationDescription,
  moveClassificationSymbol,
  moveCountLabel,
  replayMoveStudyLead,
  replayPerspectiveStatusLabel,
  replayPerspectiveSummary,
  replayPlanLead,
  replayProgressLabel,
  replayReviewNotesLead,
  resignationReasonLabel,
  reviewContextChipLabel,
  studyPerspectiveOptionLabel,
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
  pgnImportText: string;
  pgnImportMessage: string;
  isArchiveLoading: boolean;
  isImportingPgn: boolean;
  archiveStage: ArchiveStage;
  selectedReplayPly: number;
  replayContext: ReplayMoveContext;
  studyPerspective: ColorName;
  onStudyPerspectiveChange: (value: ColorName) => void;
  onSelectArchivedGame: (gameId: string) => void;
  onStartReplay: () => void;
  onSelectReplayPly: (ply: number) => void;
  onRefreshArchiveList: () => void;
  onPgnImportTextChange: (value: string) => void;
  onImportPgn: () => void;
  onOpenReview: () => void;
  onOpenWeakness: () => void;
};

export function ArchiveReplayView({
  archivedGame,
  archiveList,
  archiveMessage,
  pgnImportText,
  pgnImportMessage,
  isArchiveLoading,
  isImportingPgn,
  archiveStage,
  selectedReplayPly,
  replayContext,
  studyPerspective,
  onStudyPerspectiveChange,
  onSelectArchivedGame,
  onStartReplay,
  onSelectReplayPly,
  onRefreshArchiveList,
  onPgnImportTextChange,
  onImportPgn,
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
  const landingSummary = replayLandingSummary(archivedGame);
  const currentMomentKinds = replayContext?.matchedMoments ?? [];
  const replayTurnAfterMove: ColorName | null = replayMove
    ? replayMove.side_to_move_before === "white"
      ? "black"
      : "white"
    : null;
  const replayEvaluation = replayEvaluationForPly(archivedGame, selectedReplayPly);
  const replayMoveBadge = replayMove
    ? moveBadgeDescriptorForArchivedMove({
        moveUci: replayMove.move_uci,
        moveQualityLabel: replayMove.move_quality_label,
        bestMoveUci: replayMove.best_move_uci,
        note: replayMove.short_coaching_note,
        patternKeys: replayMove.pattern_tags.map((tag) => tag.pattern_key),
        reviewKind: currentMomentKinds.some((moment) => moment.kind === "mistake")
          ? "mistake"
          : currentMomentKinds.some((moment) => moment.kind === "good")
            ? "good"
            : null,
      })
    : null;

  function moveBadgeForPly(plyIndex: number) {
    const move = archivedGame?.move_logs.find((entry) => entry.ply_index === plyIndex);
    if (!move) {
      return null;
    }

    const matchedMoments = momentsByPly.get(plyIndex) ?? [];
    return moveBadgeDescriptorForArchivedMove({
      moveUci: move.move_uci,
      moveQualityLabel: move.move_quality_label,
      bestMoveUci: move.best_move_uci,
      note: move.short_coaching_note,
      patternKeys: move.pattern_tags.map((tag) => tag.pattern_key),
      reviewKind: matchedMoments.some((moment) => moment.kind === "mistake")
        ? "mistake"
        : matchedMoments.some((moment) => moment.kind === "good")
          ? "good"
          : null,
    });
  }

  const reviewLanding = archivedGame ? (
    <>
      <div className="panel-head">
        <div>
          <p className="eyebrow">{uiScreenText.archive.landingTitle}</p>
          <h2>{archiveResultLabel(archivedGame.result, archivedGame.terminal_reason)}</h2>
        </div>
        <div className="toolbar-row">
          <button type="button" className="primary-button" onClick={onStartReplay}>
            {uiGlossary.buttons.startReviewFlow}
          </button>
          <button type="button" className="secondary-button" onClick={() => { onSelectReplayPly(archivedGame.move_logs.length); onStartReplay(); }}>
            {uiGlossary.buttons.jumpStraightToReplay}
          </button>
        </div>
      </div>

      <div className="archive-landing-layout">
        <section className="archive-landing-main stack-sm">
          <div className="helper-callout">
            <strong>{uiGlossary.labels.coachSummary}</strong>
            <p>
              {archivedGame.summary_text
                ? localizeStudyText(archivedGame.summary_text)
                : uiStatusText.empty.storedReviewSummary}
            </p>
          </div>

          <div className="archive-landing-board-card">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">{uiGlossary.labels.overallFlow}</p>
                <h3>{uiScreenText.archive.landingGraphTitle}</h3>
              </div>
              <span className="status-pill">{moveCountLabel(archivedGame.move_logs.length)}</span>
            </div>
            <p className="helper-note subtle-note">{uiScreenText.archive.landingBody}</p>
            <div className="archive-landing-trend" aria-label={uiGlossary.labels.overallFlow}>
              {landingSummary?.trendCategories.length ? (
                landingSummary.trendCategories.map((category, index) => (
                  <span
                    key={`trend-${index + 1}`}
                    className={`archive-trend-segment ${moveBadgeToneClass(category)}`}
                    title={`${index + 1}수째 · ${moveClassificationLabel(category)}`}
                  />
                ))
              ) : (
                <span className="helper-note">{uiStatusText.empty.noReplayMoves}</span>
              )}
            </div>
            <div className="archive-landing-score-grid">
              {landingSummary?.sideScores.map((score) => (
                <div key={`score-${score.side}`} className="archive-score-card">
                  <span className="muted-label">{colorPerspectiveLabel(score.side)}</span>
                  <strong>{archiveLandingScoreLabel(score.value)}</strong>
                  <span className="move-jump-subtext">{uiGlossary.labels.summaryScore}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="archive-landing-side stack-sm">
          <section className="panel-card compact-panel">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">{uiGlossary.labels.classificationSummary}</p>
                <h3>{uiScreenText.archive.landingCountsTitle}</h3>
              </div>
            </div>
            {landingSummary?.classificationCounts.length ? (
              <div className="archive-badge-summary-grid">
                {landingSummary.classificationCounts.map((item) => (
                  <div key={`badge-count-${item.category}`} className="archive-badge-summary-card">
                    <MoveClassificationBadge
                      descriptor={{
                        category: item.category,
                        label: moveClassificationLabel(item.category),
                        symbol: moveClassificationSymbol(item.category),
                        description: moveClassificationDescription(item.category),
                        toneClass: moveBadgeToneClass(item.category),
                      }}
                    />
                    <strong>{item.count}개</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="helper-note">{uiStatusText.empty.noReplayMoves}</p>
            )}
          </section>

          <section className="panel-card compact-panel">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">{uiGlossary.labels.keyMoments}</p>
                <h3>{uiScreenText.archive.landingMomentsTitle}</h3>
              </div>
            </div>
            {importantMoments.length ? (
              <div className="moment-grid replay-moment-grid">
                {importantMoments.slice(0, 4).map((moment) => (
                  <button
                    key={`landing-${moment.kind}-${moment.plyIndex}`}
                    type="button"
                    className={`moment-card ${moment.kind === "mistake" ? "moment-card-danger" : moment.kind === "good" ? "moment-card-good" : "moment-card-shift"}`}
                    onClick={() => {
                      onSelectReplayPly(moment.plyIndex);
                      onStartReplay();
                    }}
                  >
                    <div className="archive-moment-meta">
                      <span className={`status-pill replay-moment-pill replay-moment-pill-${moment.kind}`}>
                        {reviewContextChipLabel(moment.kind)}
                      </span>
                      <span>{moment.plyIndex}수째</span>
                    </div>
                    <strong>{moment.moveSan}</strong>
                    <p className="line-clamp-2">{localizeStudyText(moment.note)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="helper-note">{uiStatusText.empty.noImportantMoments}</p>
            )}
          </section>

          <section className="panel-card compact-panel">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">{uiGlossary.concepts.nextStudyFocus}</p>
                <h3>{uiScreenText.archive.landingStudyTitle}</h3>
              </div>
            </div>
            <p className="helper-note subtle-note">{uiScreenText.archive.landingReplayCtaBody}</p>
            {reviewReport?.study_points.length ? (
              <ol className="detail-list compact-detail-list">
                {reviewReport.study_points.slice(0, 4).map((point, index) => (
                  <li key={`landing-study-point-${index + 1}`}>{localizeStudyText(point)}</li>
                ))}
              </ol>
            ) : (
              <p className="helper-note">{uiStatusText.empty.noStudyFocus}</p>
            )}
          </section>
        </aside>
      </div>
    </>
  ) : null;

  return (
    <div className={`content-grid content-grid-archive ${archiveStage === "landing" ? "archive-stage-landing" : ""}`}>
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
        <section className="pgn-import-panel">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.concepts.savedGames}</p>
              <h3>{uiScreenText.archive.importTitle}</h3>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={onImportPgn}
              disabled={isImportingPgn || pgnImportText.trim().length === 0}
            >
              {uiGlossary.buttons.importPgn}
            </button>
          </div>
          <p className="helper-note subtle-note">{uiScreenText.archive.importBody}</p>
          <textarea
            className="pgn-import-textarea"
            value={pgnImportText}
            onChange={(event) => onPgnImportTextChange(event.target.value)}
            placeholder={uiScreenText.archive.importPlaceholder}
            rows={10}
            spellCheck={false}
          />
          <p className="helper-note">{pgnImportMessage}</p>
        </section>
        <p className="helper-note subtle-note">{archiveMessage}</p>
        <ol className="archive-list compact-list">
          {archiveList.map((item) => (
            <li key={item.game_id}>
              <button
                type="button"
                className={`archive-card compact-card ${archivedGame?.id === item.game_id ? "selected" : ""}`}
                onClick={() => onSelectArchivedGame(item.game_id)}
                disabled={isArchiveLoading}
              >
                <div className="archive-card-head">
                  <strong>{archiveResultLabel(item.result, item.terminal_reason)}</strong>
                  <span>{moveCountLabel(item.move_count)}</span>
                </div>
                <span>{new Date(item.finished_at).toLocaleDateString()}</span>
                <div className="line-clamp-2">{item.summary_preview ? localizeStudyText(item.summary_preview) : uiStatusText.empty.replayReadySummary}</div>
              </button>
            </li>
          ))}
          {archiveList.length === 0 ? <li>{uiStatusText.empty.archiveList}</li> : null}
        </ol>
      </section>

      <section className="hero-panel">
        {archivedGame && replayContext ? (
          <>
            {archiveStage === "landing" ? reviewLanding : (
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

            <div className="board-stage">
              <EvaluationBar score={replayEvaluation?.score ?? null} turn={replayEvaluation?.turn ?? null} />
              <div className="hero-board-wrap">
                <BoardView
                  fen={replayContext.boardFen}
                  lastMoveUci={replayMove?.move_uci ?? null}
                  checkedSquare={null}
                  overlays={[]}
                  disabled
                />
              </div>
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
                        {moveBadgeForPly(moment.plyIndex) ? (
                          <MoveClassificationBadge descriptor={moveBadgeForPly(moment.plyIndex)!} subtle />
                        ) : null}
                      </div>
                      <strong>{moment.moveSan}</strong>
                      <p className="line-clamp-2">{localizeStudyText(moment.note)}</p>
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
                <span className="status-pill">{archiveResultLabel(archivedGame.result, archivedGame.terminal_reason)}</span>
                {archivedGame.terminal_reason ? <span className="status-pill">{resignationReasonLabel(archivedGame.terminal_reason)}</span> : null}
                <span className="status-pill">{colorPerspectiveLabel(archivedGame.user_color)}</span>
                <span className="status-pill accent">{replayPerspectiveStatusLabel(studyPerspective)}</span>
                {currentMomentKinds.map((moment) => (
                  <span key={`${moment.kind}-${moment.plyIndex}`} className={`status-pill replay-moment-pill replay-moment-pill-${moment.kind}`}>
                    {reviewContextChipLabel(moment.kind)}
                  </span>
                ))}
              </div>
              <p className="support-copy">
                {replayMove
                  ? `${uiScreenText.archive.replaySyncedBody} ${replayPerspectiveSummary(studyPerspective, replayTurnAfterMove ?? "white")}`
                  : uiScreenText.archive.replayStartBody}
              </p>
            </div>
              </>
            )}
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
        {archiveStage === "replay" ? (
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
          <div className="perspective-toggle-group" role="group" aria-label={uiGlossary.sections.replayPerspective}>
            {(["white", "black"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`perspective-toggle ${studyPerspective === option ? "active" : ""}`}
                onClick={() => onStudyPerspectiveChange(option)}
              >
                {studyPerspectiveOptionLabel(option)}
              </button>
            ))}
          </div>
          <p className="helper-note subtle-note">{uiScreenText.archive.moveListHelper}</p>
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
                      <div className="move-jump-primary">
                        <strong>{move.ply_index}. {move.move_san}</strong>
                        <MoveClassificationBadge
                          descriptor={moveBadgeDescriptorForArchivedMove({
                            moveUci: move.move_uci,
                            moveQualityLabel: move.move_quality_label,
                            bestMoveUci: move.best_move_uci,
                            note: move.short_coaching_note,
                            patternKeys: move.pattern_tags.map((tag) => tag.pattern_key),
                            reviewKind: momentsByPly.get(move.ply_index)?.some((moment) => moment.kind === "mistake")
                              ? "mistake"
                              : momentsByPly.get(move.ply_index)?.some((moment) => moment.kind === "good")
                                ? "good"
                                : null,
                          })}
                          subtle
                        />
                      </div>
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
        ) : null}

        {archiveStage === "replay" ? (
        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.sections.currentLearningFocus}</p>
              <h3>{uiScreenText.archive.learningPanelTitle}</h3>
            </div>
          </div>
          {replayMove ? (
            <div className="stack-sm">
              <div className="helper-callout subtle-callout">
                <strong>{uiGlossary.sections.replayPerspective}</strong>
                <p>{replayMoveStudyLead(studyPerspective, replayMove.side_to_move_before)}</p>
              </div>
              <div className="status-strip">
                {replayMoveBadge ? <MoveClassificationBadge descriptor={replayMoveBadge} /> : null}
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
                <p>{replayReviewNotesLead(studyPerspective, replayMove.side_to_move_before)}</p>
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
                <p>{replayPlanLead(studyPerspective, replayMove.side_to_move_before)}</p>
                <p>{replayMove.current_plan ? localizeStudyText(replayMove.current_plan) : uiStatusText.empty.noStoredPlan}</p>
              </div>
              <details className="details-block">
                <summary>세부 기록 보기</summary>
                <div className="details-body stack-sm">
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
              </details>
            </div>
          ) : (
            <p className="helper-note">{uiStatusText.empty.noSelectedMove}</p>
          )}
        </section>
        ) : null}

        {archiveStage === "replay" ? (
        <details className="panel-card collapsible-panel">
          <summary className="panel-summary">
            <div>
              <p className="eyebrow">{uiGlossary.concepts.candidateMoves} 복기</p>
              <h3>{uiScreenText.archive.candidateReviewTitle}</h3>
            </div>
            <span className="status-pill">{replayCandidates.length}개</span>
          </summary>
          {replayCandidates.length > 0 ? (
            <ol className="detail-list">
              {replayCandidates.map((move) => (
                <li key={`candidate-${move.rank}-${move.move_uci}`} className="candidate-review-item">
                  <div className="archive-moment-meta">
                    <span className={`candidate-rank rank-${move.rank}`}>{move.rank}</span>
                    <strong>{move.move_san}</strong>
                  </div>
                  <div>{uiGlossary.labels.representativeLine}: {move.principal_variation_san.slice(0, 4).join(" ") || uiStatusText.empty.noStoredLine}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="helper-note">{uiStatusText.empty.noStoredCandidates}</p>
          )}
        </details>
        ) : null}

        {archiveStage === "replay" ? (
        <details className="panel-card collapsible-panel">
          <summary className="panel-summary">
            <div>
              <p className="eyebrow">{uiGlossary.concepts.nextStudyFocus}</p>
              <h3>{uiScreenText.archive.studyFocusTitle}</h3>
            </div>
            <span className="status-pill">
              {reviewReport?.study_points.length ?? 0}개
            </span>
          </summary>
          {reviewReport?.study_points.length ? (
            <div className="stack-sm">
              <ol className="detail-list compact-detail-list">
                {reviewReport.study_points.map((point, index) => (
                  <li key={`study-point-${index + 1}`}>{localizeStudyText(point)}</li>
                ))}
              </ol>
              <button type="button" className="secondary-button" onClick={onOpenWeakness}>
                {uiGlossary.buttons.openWeaknessFromReplay}
              </button>
            </div>
          ) : (
            <p className="helper-note">{uiStatusText.empty.noStudyFocus}</p>
          )}
        </details>
        ) : null}
      </aside>
    </div>
  );
}
