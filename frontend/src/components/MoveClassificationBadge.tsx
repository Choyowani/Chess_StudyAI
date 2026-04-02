import type { MoveBadgeCategory } from "../types";
import {
  moveBadgeToneClass,
  moveClassificationDescription,
  moveClassificationLabel,
  moveClassificationSymbol,
} from "../ui-text";

type ReviewKind = "mistake" | "good" | "turning" | null;

export type MoveBadgeDescriptor = {
  category: MoveBadgeCategory;
  label: string;
  symbol: string;
  description: string;
  toneClass: string;
};

type MoveBadgeInput = {
  moveQualityLabel?: string | null;
  isBestMoveMatch?: boolean;
  hasMissedTacticalTag?: boolean;
  note?: string | null;
  reviewKind?: ReviewKind;
};

type MoveClassificationBadgeProps = {
  descriptor: MoveBadgeDescriptor;
  subtle?: boolean;
};

export function moveBadgeDescriptor(input: MoveBadgeInput): MoveBadgeDescriptor {
  const category = classifyMove(input);
  return {
    category,
    label: moveClassificationLabel(category),
    symbol: moveClassificationSymbol(category),
    description: moveClassificationDescription(category),
    toneClass: moveBadgeToneClass(category),
  };
}

function classifyMove({
  moveQualityLabel,
  isBestMoveMatch = false,
  hasMissedTacticalTag = false,
  note = null,
  reviewKind = null,
}: MoveBadgeInput): MoveBadgeCategory {
  const normalizedLabel = (moveQualityLabel ?? "").toLowerCase();
  const normalizedNote = (note ?? "").toLowerCase();

  if (isBestMoveMatch) {
    return "best";
  }
  if (normalizedNote.includes("이론") || normalizedNote.includes("theory") || normalizedNote.includes("book move")) {
    return "theory";
  }
  if (
    hasMissedTacticalTag ||
    normalizedNote.includes("놓친 기회") ||
    normalizedNote.includes("전술 기회") ||
    normalizedNote.includes("missed chance") ||
    normalizedNote.includes("missed tactical")
  ) {
    return "missed";
  }
  if (reviewKind === "good") {
    return "excellent";
  }
  if (normalizedLabel === "blunder") {
    return "blunder";
  }
  if (normalizedLabel === "mistake") {
    return "mistake";
  }
  if (normalizedLabel === "inaccuracy") {
    return "inaccuracy";
  }
  if (normalizedLabel === "good" || normalizedLabel === "playable") {
    return "good";
  }
  if (reviewKind === "mistake") {
    return "mistake";
  }
  return "neutral";
}

export function moveBadgeDescriptorForArchivedMove(input: {
  moveUci: string;
  moveQualityLabel?: string | null;
  bestMoveUci?: string | null;
  note?: string | null;
  reviewKind?: ReviewKind;
  patternKeys?: string[];
}): MoveBadgeDescriptor {
  const patternKeys = input.patternKeys ?? [];
  return moveBadgeDescriptor({
    moveQualityLabel: input.moveQualityLabel,
    isBestMoveMatch: Boolean(input.bestMoveUci && input.moveUci === input.bestMoveUci),
    hasMissedTacticalTag: patternKeys.includes("missed_tactical_pattern"),
    note: input.note,
    reviewKind: input.reviewKind ?? null,
  });
}

export function MoveClassificationBadge({ descriptor, subtle = false }: MoveClassificationBadgeProps) {
  return (
    <span
      className={`move-classification-badge ${descriptor.toneClass} ${subtle ? "subtle" : ""}`}
      title={`${descriptor.label}: ${descriptor.description}`}
      aria-label={`${descriptor.label}: ${descriptor.description}`}
    >
      <span className="move-classification-symbol" aria-hidden="true">
        {descriptor.symbol}
      </span>
      <span className="move-classification-label">{descriptor.label}</span>
    </span>
  );
}
