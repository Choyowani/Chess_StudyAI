import type { ArchivedGame, ArchivedMoveLog, CandidateMove, EvaluationScore } from "./types";

export type ReplayContext = {
  boardFen: string;
  currentMove: ArchivedMoveLog | null;
  reviewNotes: string[];
};

export function parseArchivedCandidateMove(candidate: Record<string, unknown>): CandidateMove | null {
  const score = candidate.score;
  if (
    typeof candidate.rank !== "number" ||
    typeof candidate.move_uci !== "string" ||
    typeof candidate.move_san !== "string" ||
    typeof score !== "object" ||
    score === null
  ) {
    return null;
  }

  const typedScore = score as Record<string, unknown>;
  const normalizedScore: EvaluationScore = {
    perspective: typeof typedScore.perspective === "string" ? typedScore.perspective : "side_to_move",
    centipawns: typeof typedScore.centipawns === "number" ? typedScore.centipawns : null,
    mate: typeof typedScore.mate === "number" ? typedScore.mate : null,
  };

  return {
    rank: candidate.rank,
    move_uci: candidate.move_uci,
    move_san: candidate.move_san,
    score: normalizedScore,
    principal_variation_uci: Array.isArray(candidate.principal_variation_uci)
      ? candidate.principal_variation_uci.filter((item): item is string => typeof item === "string")
      : [],
    principal_variation_san: Array.isArray(candidate.principal_variation_san)
      ? candidate.principal_variation_san.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export function replayContextForPly(archivedGame: ArchivedGame | null, selectedPly: number): ReplayContext | null {
  if (!archivedGame) {
    return null;
  }

  if (selectedPly <= 0) {
    return {
      boardFen: archivedGame.initial_fen,
      currentMove: null,
      reviewNotes: [],
    };
  }

  const currentMove = archivedGame.move_logs[selectedPly - 1] ?? null;
  if (!currentMove) {
    return null;
  }

  const reviewNotes: string[] = [];
  const report = archivedGame.review_report;
  if (report) {
    report.critical_mistakes
      .filter((item) => item.ply_index === currentMove.ply_index)
      .forEach((item) => reviewNotes.push(`Critical mistake: ${item.note}`));
    report.good_moves
      .filter((item) => item.ply_index === currentMove.ply_index)
      .forEach((item) => reviewNotes.push(`Good move: ${item.note}`));
    report.turning_points
      .filter((item) => item.ply_index === currentMove.ply_index)
      .forEach((item) => reviewNotes.push(`Turning point: ${item.note}`));
  }

  return {
    boardFen: currentMove.after_fen,
    currentMove,
    reviewNotes,
  };
}
