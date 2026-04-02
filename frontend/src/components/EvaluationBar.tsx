import type { ColorName, EvaluationScore } from "../types";
import { evaluationBarReadout, evaluationTrendLabel, normalizeEvaluationForWhite } from "../ui-text";

type EvaluationBarProps = {
  score: EvaluationScore | null;
  turn: ColorName | null;
};

export function EvaluationBar({ score, turn }: EvaluationBarProps) {
  const whiteRatio = normalizeEvaluationForWhite(score, turn);
  const unavailable = whiteRatio === null;
  const blackRatio = unavailable ? 0.5 : 1 - whiteRatio;
  const label = evaluationTrendLabel(score, turn);
  const readout = evaluationBarReadout(score, turn);

  return (
    <div className={`evaluation-bar-shell ${unavailable ? "unavailable" : ""}`} aria-label={label} title={readout ?? label}>
      <span className="evaluation-bar-side evaluation-bar-side-black">흑</span>
      <div className="evaluation-bar-track" aria-hidden="true">
        <div className="evaluation-bar-segment evaluation-bar-segment-black" style={{ flexGrow: blackRatio }} />
        <div className="evaluation-bar-divider" />
        <div className="evaluation-bar-segment evaluation-bar-segment-white" style={{ flexGrow: unavailable ? 0.5 : whiteRatio }} />
        <div className="evaluation-bar-caption">{label}</div>
      </div>
      <span className="evaluation-bar-side evaluation-bar-side-white">백</span>
    </div>
  );
}
