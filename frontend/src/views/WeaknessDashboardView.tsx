import type { UserWeaknessSummary, WeaknessPattern } from "../types";
import {
  frequencyLabel,
  frequencyOccurredLabel,
  localizeStudyText,
  patternCountLabel,
  relatedGameButtonLabel,
  uiGlossary,
  uiScreenText,
  uiStatusText,
  weaknessDisplayLabel,
  weaknessPriorityLabel,
  weaknessPriorityTone,
  weaknessRecencyLabel,
  weaknessReplayAvailabilityLabel,
  weaknessTypeLabel,
} from "../ui-text";

type WeaknessDashboardViewProps = {
  summary: UserWeaknessSummary | null;
  selectedWeakness: WeaknessPattern | null;
  weaknessMessage: string;
  isWeaknessLoading: boolean;
  onSelectWeakness: (key: string) => void;
  onRefresh: () => void;
  onOpenArchivedGame: (gameId: string) => void;
};

function weaknessKey(pattern: WeaknessPattern): string {
  return `${pattern.pattern_type}:${pattern.pattern_key}`;
}

function sortByRecency(patterns: WeaknessPattern[]): WeaknessPattern[] {
  return [...patterns].sort((left, right) => right.last_seen_at.localeCompare(left.last_seen_at));
}

export function WeaknessDashboardView({
  summary,
  selectedWeakness,
  weaknessMessage,
  isWeaknessLoading,
  onSelectWeakness,
  onRefresh,
  onOpenArchivedGame,
}: WeaknessDashboardViewProps) {
  const patterns = summary?.patterns ?? [];
  const recentPatterns = sortByRecency(patterns);
  const topPriorityPattern = patterns[0] ?? null;
  const recentPattern = recentPatterns[0] ?? null;
  const immediateActionPattern = selectedWeakness ?? topPriorityPattern;
  const studyFocusPatterns = patterns.slice(0, 3);

  return (
    <div className="content-grid content-grid-weakness">
      <section className="panel-card emphasis-card weakness-overview-card">
        <div className="panel-head">
          <div>
            <p className="eyebrow">{uiGlossary.views.weakness}</p>
            <h2>{uiScreenText.weakness.title}</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onRefresh} disabled={isWeaknessLoading}>
            {uiGlossary.buttons.refresh}
          </button>
        </div>
        <p className="helper-note subtle-note">{weaknessMessage}</p>
        <div className="status-strip">
          <span className="status-pill">{patternCountLabel(patterns.length)}</span>
        </div>

        <div className="weakness-summary-grid">
          <article className="helper-callout weakness-summary-block">
            <span className="muted-label">{uiGlossary.sections.topPriorityWeakness}</span>
            <strong>{uiScreenText.weakness.topPriorityTitle}</strong>
            {topPriorityPattern ? (
              <>
                <h3>{weaknessDisplayLabel(topPriorityPattern.display_label)}</h3>
                <p className="line-clamp-3">{localizeStudyText(topPriorityPattern.notes)}</p>
                <div className="status-strip">
                  <span className={`status-pill weakness-tone-${weaknessPriorityTone(topPriorityPattern.frequency)}`}>
                    {weaknessPriorityLabel(topPriorityPattern.frequency)}
                  </span>
                  <span className="status-pill">{frequencyLabel(topPriorityPattern.frequency)}</span>
                </div>
              </>
            ) : (
              <p>{uiStatusText.empty.noActionableWeakness}</p>
            )}
          </article>

          <article className="helper-callout weakness-summary-block">
            <span className="muted-label">{uiGlossary.sections.recentWeakness}</span>
            <strong>{uiScreenText.weakness.recentTitle}</strong>
            {recentPattern ? (
              <>
                <h3>{weaknessDisplayLabel(recentPattern.display_label)}</h3>
                <p>{weaknessRecencyLabel(recentPattern.last_seen_at)}</p>
                <div className="status-strip">
                  <span className="status-pill">{new Date(recentPattern.last_seen_at).toLocaleDateString()}</span>
                  <span className="status-pill">{weaknessReplayAvailabilityLabel(recentPattern.related_game_ids.length)}</span>
                </div>
              </>
            ) : (
              <p>{uiStatusText.empty.noActionableWeakness}</p>
            )}
          </article>

          <article className="helper-callout weakness-summary-block">
            <span className="muted-label">{uiGlossary.sections.recommendedAction}</span>
            <strong>{uiScreenText.weakness.actionTitle}</strong>
            {immediateActionPattern ? (
              <>
                <h3>{weaknessDisplayLabel(immediateActionPattern.display_label)}</h3>
                <p className="line-clamp-3">{localizeStudyText(immediateActionPattern.study_recommendation)}</p>
                {immediateActionPattern.related_game_ids[0] ? (
                  <button
                    type="button"
                    className="secondary-button card-button"
                    onClick={() => onOpenArchivedGame(immediateActionPattern.related_game_ids[0])}
                  >
                    {uiGlossary.buttons.openExampleReplay}
                  </button>
                ) : null}
              </>
            ) : (
              <p>{uiStatusText.empty.noActionableWeakness}</p>
            )}
          </article>
        </div>
      </section>

      <section className="weakness-card-grid">
        {patterns.map((pattern) => (
          <article
            key={weaknessKey(pattern)}
            className={`weakness-card weakness-card-shell ${selectedWeakness && weaknessKey(selectedWeakness) === weaknessKey(pattern) ? "selected" : ""}`}
          >
            <div className="weakness-card-head">
              <p className="eyebrow">{weaknessTypeLabel(pattern.pattern_type)}</p>
              <span className={`status-pill weakness-tone-${weaknessPriorityTone(pattern.frequency)}`}>
                {weaknessPriorityLabel(pattern.frequency)}
              </span>
            </div>
            <h3>{weaknessDisplayLabel(pattern.display_label)}</h3>
            <p className="line-clamp-3">{localizeStudyText(pattern.notes)}</p>
            <div className="status-strip">
              <span className="status-pill">{uiGlossary.labels.frequency} {frequencyLabel(pattern.frequency)}</span>
              <span className="status-pill">{weaknessRecencyLabel(pattern.last_seen_at)}</span>
            </div>
            <div className="weakness-card-actions">
              <button
                type="button"
                className="secondary-button card-button"
                onClick={() => onSelectWeakness(weaknessKey(pattern))}
              >
                {uiGlossary.buttons.selectWeakness}
              </button>
              {pattern.related_game_ids[0] ? (
                <button
                  type="button"
                  className="secondary-button card-button"
                  onClick={() => onOpenArchivedGame(pattern.related_game_ids[0])}
                >
                  {uiGlossary.buttons.openExampleReplay}
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {!isWeaknessLoading && patterns.length === 0 ? (
          <section className="panel-card empty-card weakness-empty-card">
            <p className="eyebrow">{uiStatusText.empty.noWeaknessPatternsTitle}</p>
            <h3>몇 판 더 두고 복기하면 패턴이 보이기 시작합니다</h3>
            <p>{uiStatusText.empty.noWeaknessPatternsBody}</p>
          </section>
        ) : null}
      </section>

      <aside className="study-column">
        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">{uiGlossary.concepts.nextStudyFocus}</p>
              <h3>{uiScreenText.weakness.nextFocusTitle}</h3>
            </div>
          </div>
          {studyFocusPatterns.length > 0 ? (
            <ol className="detail-list compact-detail-list">
              {studyFocusPatterns.map((pattern) => (
                <li key={`focus-${weaknessKey(pattern)}`}>
                  <strong>{weaknessDisplayLabel(pattern.display_label)}</strong>
                  <div className="line-clamp-2">{localizeStudyText(pattern.study_recommendation)}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="helper-note">{uiStatusText.empty.noStudyFocus}</p>
          )}
        </section>

        <details className="panel-card collapsible-panel">
          <summary className="panel-summary">
            <div>
              <p className="eyebrow">{uiGlossary.sections.selectedPattern}</p>
              <h3>{uiScreenText.weakness.selectedPatternTitle}</h3>
            </div>
            {selectedWeakness ? (
              <span className={`status-pill weakness-tone-${weaknessPriorityTone(selectedWeakness.frequency)}`}>
                {weaknessPriorityLabel(selectedWeakness.frequency)}
              </span>
            ) : null}
          </summary>
          {selectedWeakness ? (
            <div className="stack-sm">
              <p><strong>{weaknessDisplayLabel(selectedWeakness.display_label)}</strong></p>
              <div className="status-strip">
                <span className={`status-pill weakness-tone-${weaknessPriorityTone(selectedWeakness.frequency)}`}>
                  {weaknessPriorityLabel(selectedWeakness.frequency)}
                </span>
                <span className="status-pill">{frequencyOccurredLabel(selectedWeakness.frequency)}</span>
                <span className="status-pill">{weaknessRecencyLabel(selectedWeakness.last_seen_at)}</span>
              </div>
              <div className="helper-callout">
                <strong>{uiGlossary.sections.weaknessSummary}</strong>
                <p>{localizeStudyText(selectedWeakness.notes)}</p>
              </div>
              <div className="helper-callout">
                <strong>{uiGlossary.concepts.nextStudyFocus}</strong>
                <p>{localizeStudyText(selectedWeakness.study_recommendation)}</p>
              </div>
            </div>
          ) : (
            <p className="helper-note">{uiStatusText.empty.noSelectedPattern}</p>
          )}
        </details>

        <details className="panel-card collapsible-panel">
          <summary className="panel-summary">
            <div>
              <p className="eyebrow">{uiGlossary.sections.relatedGames}</p>
              <h3>{uiScreenText.weakness.replayBridgeTitle}</h3>
            </div>
            <span className="status-pill">{selectedWeakness?.related_game_ids.length ?? 0}개</span>
          </summary>
          {selectedWeakness?.related_game_ids.length ? (
            <div className="stack-sm">
              {selectedWeakness.related_game_ids.map((gameId) => (
                <button
                  key={`related-${gameId}`}
                  type="button"
                  className="secondary-button card-button"
                  onClick={() => onOpenArchivedGame(gameId)}
                >
                  {relatedGameButtonLabel(gameId)}
                </button>
              ))}
            </div>
          ) : (
            <p className="helper-note">{uiStatusText.empty.noLinkedArchives}</p>
          )}
        </details>

        <details className="panel-card future-card collapsible-panel">
          <summary className="panel-summary">
            <div>
              <p className="eyebrow">{uiGlossary.sections.futureTools}</p>
              <h3>{uiScreenText.weakness.futureToolsTitle}</h3>
            </div>
          </summary>
          <p>{uiGlossary.placeholder.futureTools}</p>
        </details>
      </aside>
    </div>
  );
}
