import type { UserWeaknessSummary, WeaknessPattern } from "../types";

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
  const studyFocusPatterns = patterns.slice(0, 3);

  return (
    <div className="content-grid content-grid-weakness">
      <section className="panel-card emphasis-card">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Weakness summary</p>
            <h2>Repeated learning patterns</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onRefresh} disabled={isWeaknessLoading}>
            Refresh
          </button>
        </div>
        <p className="support-copy">{weaknessMessage}</p>
        <div className="status-strip">
          <span className="status-pill">{patterns.length} tracked patterns</span>
          <span className="status-pill">{summary?.user_id ?? "local-user"}</span>
        </div>
      </section>

      <section className="weakness-card-grid">
        {patterns.map((pattern) => (
          <button
            key={weaknessKey(pattern)}
            type="button"
            className={`weakness-card ${selectedWeakness && weaknessKey(selectedWeakness) === weaknessKey(pattern) ? "selected" : ""}`}
            onClick={() => onSelectWeakness(weaknessKey(pattern))}
          >
            <div className="weakness-card-head">
              <p className="eyebrow">{pattern.pattern_type}</p>
              <span className="status-pill">{pattern.frequency} times</span>
            </div>
            <h3>{pattern.display_label}</h3>
            <p>{pattern.notes}</p>
            <span className="muted-label">Last seen {new Date(pattern.last_seen_at).toLocaleString()}</span>
          </button>
        ))}
        {!isWeaknessLoading && patterns.length === 0 ? (
          <section className="panel-card empty-card">
            <p className="eyebrow">No repeated patterns yet</p>
            <h3>Play and review more games</h3>
            <p>The current rule-based tracker needs completed archived games before repeated weaknesses become meaningful.</p>
          </section>
        ) : null}
      </section>

      <aside className="study-column">
        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Next to focus on</p>
              <h3>Study recommendation</h3>
            </div>
          </div>
          {studyFocusPatterns.length > 0 ? (
            <ol className="detail-list">
              {studyFocusPatterns.map((pattern) => (
                <li key={`focus-${weaknessKey(pattern)}`}>
                  <strong>{pattern.display_label}</strong>
                  <div>{pattern.study_recommendation}</div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="helper-note">Recommendations will appear after repeated weaknesses are recorded.</p>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Selected pattern</p>
              <h3>Why it matters</h3>
            </div>
          </div>
          {selectedWeakness ? (
            <div className="stack-sm">
              <p><strong>{selectedWeakness.display_label}</strong></p>
              <p>{selectedWeakness.notes}</p>
              <p>{selectedWeakness.study_recommendation}</p>
              <div className="status-strip">
                <span className="status-pill">{selectedWeakness.frequency} occurrences</span>
                <span className="status-pill">Last seen {new Date(selectedWeakness.last_seen_at).toLocaleDateString()}</span>
              </div>
            </div>
          ) : (
            <p className="helper-note">Select a weakness card to inspect its note and recommendation.</p>
          )}
        </section>

        <section className="panel-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Related games</p>
              <h3>Jump into replay</h3>
            </div>
          </div>
          {selectedWeakness?.related_game_ids.length ? (
            <div className="stack-sm">
              {selectedWeakness.related_game_ids.map((gameId) => (
                <button
                  key={`related-${gameId}`}
                  type="button"
                  className="secondary-button card-button"
                  onClick={() => onOpenArchivedGame(gameId)}
                >
                  Open archived game {gameId}
                </button>
              ))}
            </div>
          ) : (
            <p className="helper-note">No related archived games were attached to this pattern yet.</p>
          )}
        </section>

        <section className="panel-card future-card">
          <div className="panel-head compact">
            <div>
              <p className="eyebrow">Future area</p>
              <h3>Study tools</h3>
            </div>
          </div>
          <p>Pattern-specific exercises and richer motifs are still placeholders. The current dashboard stays tied to stored heuristic tags only.</p>
        </section>
      </aside>
    </div>
  );
}
