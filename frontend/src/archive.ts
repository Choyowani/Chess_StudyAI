import type {
  ArchivedGame,
  ArchivedMoveLog,
  CandidateMove,
  ColorName,
  EvaluationScore,
  MoveBadgeCategory,
} from "./types";
import { reviewContextNote } from "./ui-text";

export type ReplayMomentKind = "mistake" | "good" | "turning";

export type ReplayMoment = {
  plyIndex: number;
  kind: ReplayMomentKind;
  moveSan: string;
  note: string;
};

export type ReplayContext = {
  boardFen: string;
  currentMove: ArchivedMoveLog | null;
  reviewNotes: string[];
  matchedMoments: ReplayMoment[];
};

export type ReplayEvaluationContext = {
  score: EvaluationScore | null;
  turn: ColorName | null;
};

export type ReplayLandingScore = {
  side: ColorName;
  value: number | null;
};

export type ReplayLandingSummary = {
  classificationCounts: Array<{ category: MoveBadgeCategory; count: number }>;
  trendCategories: MoveBadgeCategory[];
  sideScores: ReplayLandingScore[];
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
      matchedMoments: [],
    };
  }

  const currentMove = archivedGame.move_logs[selectedPly - 1] ?? null;
  if (!currentMove) {
    return null;
  }

  const reviewNotes: string[] = [];
  const matchedMoments: ReplayMoment[] = [];
  const report = archivedGame.review_report;
  if (report) {
    report.critical_mistakes
      .filter((item) => item.ply_index === currentMove.ply_index)
      .forEach((item) => {
        reviewNotes.push(reviewContextNote("mistake", item.note));
        matchedMoments.push({
          plyIndex: item.ply_index,
          kind: "mistake",
          moveSan: item.move_san,
          note: item.note,
        });
      });
    report.good_moves
      .filter((item) => item.ply_index === currentMove.ply_index)
      .forEach((item) => {
        reviewNotes.push(reviewContextNote("good", item.note));
        matchedMoments.push({
          plyIndex: item.ply_index,
          kind: "good",
          moveSan: item.move_san,
          note: item.note,
        });
      });
    report.turning_points
      .filter((item) => item.ply_index === currentMove.ply_index)
      .forEach((item) => {
        reviewNotes.push(reviewContextNote("turning", item.note));
        matchedMoments.push({
          plyIndex: item.ply_index,
          kind: "turning",
          moveSan: item.move_san,
          note: item.note,
        });
      });
  }

  return {
    boardFen: currentMove.after_fen,
    currentMove,
    reviewNotes,
    matchedMoments,
  };
}

export function replayImportantMoments(archivedGame: ArchivedGame | null): ReplayMoment[] {
  if (!archivedGame?.review_report) {
    return [];
  }

  return [
    ...archivedGame.review_report.critical_mistakes.map((item) => ({
      plyIndex: item.ply_index,
      kind: "mistake" as const,
      moveSan: item.move_san,
      note: item.note,
    })),
    ...archivedGame.review_report.good_moves.map((item) => ({
      plyIndex: item.ply_index,
      kind: "good" as const,
      moveSan: item.move_san,
      note: item.note,
    })),
    ...archivedGame.review_report.turning_points.map((item) => ({
      plyIndex: item.ply_index,
      kind: "turning" as const,
      moveSan: item.move_san,
      note: item.note,
    })),
  ].sort((left, right) => left.plyIndex - right.plyIndex);
}

export function replayMomentsByPly(archivedGame: ArchivedGame | null): Map<number, ReplayMoment[]> {
  const grouped = new Map<number, ReplayMoment[]>();

  for (const moment of replayImportantMoments(archivedGame)) {
    const current = grouped.get(moment.plyIndex) ?? [];
    current.push(moment);
    grouped.set(moment.plyIndex, current);
  }

  return grouped;
}

function turnFromFen(fen: string): ColorName | null {
  const sideToken = fen.split(" ")[1];
  if (sideToken === "w") {
    return "white";
  }
  if (sideToken === "b") {
    return "black";
  }
  return null;
}

export function replayEvaluationForPly(
  archivedGame: ArchivedGame | null,
  selectedPly: number,
): ReplayEvaluationContext | null {
  if (!archivedGame) {
    return null;
  }

  const currentFen =
    selectedPly <= 0
      ? archivedGame.initial_fen
      : archivedGame.move_logs[selectedPly - 1]?.after_fen ?? archivedGame.final_fen;

  const turn = turnFromFen(currentFen);

  // Stored candidate scores belong to the position before a move.
  // To match the currently displayed board, use the next ply's stored
  // candidates when they exist. The final position has no following
  // analysis snapshot, so we surface "no evaluation" there.
  const nextMove = archivedGame.move_logs[selectedPly] ?? null;
  if (!nextMove) {
    return { score: null, turn };
  }

  const bestStoredCandidate = nextMove.top_candidate_moves
    .map((candidate) => parseArchivedCandidateMove(candidate))
    .filter((candidate): candidate is CandidateMove => candidate !== null)
    .sort((left, right) => left.rank - right.rank)[0];

  return {
    score: bestStoredCandidate?.score ?? null,
    turn,
  };
}

function classificationWeight(category: MoveBadgeCategory): number {
  if (category === "best") return 1;
  if (category === "excellent") return 0.95;
  if (category === "theory") return 0.9;
  if (category === "good") return 0.84;
  if (category === "neutral") return 0.74;
  if (category === "missed") return 0.42;
  if (category === "inaccuracy") return 0.56;
  if (category === "mistake") return 0.3;
  if (category === "blunder") return 0.08;
  return 0.74;
}

function moveCategoryFromArchivedMove(move: ArchivedMoveLog): MoveBadgeCategory {
  const quality = (move.move_quality_label ?? "").toLowerCase();
  const note = (move.short_coaching_note ?? "").toLowerCase();
  const patternKeys = move.pattern_tags.map((tag) => tag.pattern_key);

  if (move.best_move_uci && move.move_uci === move.best_move_uci) {
    return "best";
  }
  if (note.includes("이론") || note.includes("theory") || note.includes("book move")) {
    return "theory";
  }
  if (
    patternKeys.includes("missed_tactical_pattern") ||
    note.includes("놓친 기회") ||
    note.includes("전술 기회") ||
    note.includes("missed chance") ||
    note.includes("missed tactical")
  ) {
    return "missed";
  }
  if (quality === "blunder") {
    return "blunder";
  }
  if (quality === "mistake") {
    return "mistake";
  }
  if (quality === "inaccuracy") {
    return "inaccuracy";
  }
  if (quality === "good") {
    return "good";
  }
  if (quality === "playable") {
    return "good";
  }
  return "neutral";
}

export function replayLandingSummary(archivedGame: ArchivedGame | null): ReplayLandingSummary | null {
  if (!archivedGame) {
    return null;
  }

  const counts = new Map<MoveBadgeCategory, number>();
  const sideTotals: Record<ColorName, { score: number; count: number }> = {
    white: { score: 0, count: 0 },
    black: { score: 0, count: 0 },
  };

  const trendCategories = archivedGame.move_logs.map((move) => {
    const category = moveCategoryFromArchivedMove(move);
    counts.set(category, (counts.get(category) ?? 0) + 1);
    sideTotals[move.side_to_move_before].score += classificationWeight(category);
    sideTotals[move.side_to_move_before].count += 1;
    return category;
  });

  const orderedCategories: MoveBadgeCategory[] = [
    "best",
    "excellent",
    "good",
    "theory",
    "inaccuracy",
    "mistake",
    "missed",
    "blunder",
  ];

  return {
    classificationCounts: orderedCategories
      .map((category) => ({ category, count: counts.get(category) ?? 0 }))
      .filter((item) => item.count > 0),
    trendCategories,
    sideScores: (["white", "black"] as const).map((side) => ({
      side,
      value:
        sideTotals[side].count > 0
          ? Math.round((sideTotals[side].score / sideTotals[side].count) * 100)
          : null,
    })),
  };
}
