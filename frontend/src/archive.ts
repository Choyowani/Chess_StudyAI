import type { ArchivedGame, ArchivedMoveLog, CandidateMove, EvaluationScore } from "./types";
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
