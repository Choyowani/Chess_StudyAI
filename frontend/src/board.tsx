import type { BoardSquare, CandidateOverlay, GameSnapshot, PieceColor, PromotionPieceCode } from "./types";
import { ChessPieceSvg } from "./chess-pieces";
import { boardSquareAriaLabel, uiGlossary } from "./ui-text";

const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

export function fenToBoard(fen: string): BoardSquare[] {
  const [placement] = fen.split(" ");
  const rows = placement.split("/");
  const squares: BoardSquare[] = [];

  rows.forEach((row, rowIndex) => {
    let fileIndex = 0;
    for (const symbol of row) {
      if (/\d/.test(symbol)) {
        const empties = Number(symbol);
        for (let i = 0; i < empties; i += 1) {
          squares.push({
            square: `${files[fileIndex]}${8 - rowIndex}`,
            piece: null,
          });
          fileIndex += 1;
        }
      } else {
        squares.push({
          square: `${files[fileIndex]}${8 - rowIndex}`,
          piece: symbol,
        });
        fileIndex += 1;
      }
    }
  });

  return squares;
}

export function pieceColor(piece: string | null): PieceColor | null {
  if (piece === null) {
    return null;
  }
  return piece === piece.toUpperCase() ? "w" : "b";
}

export function sideToMove(fen: string): PieceColor {
  const parts = fen.split(" ");
  return parts[1] === "w" ? "w" : "b";
}

export function isInteractivePiece(snapshot: GameSnapshot, square: BoardSquare): boolean {
  if (square.piece === null) {
    return false;
  }
  return pieceColor(square.piece) === sideToMove(snapshot.fen);
}

export function promotionRequired(snapshot: GameSnapshot, from: string, to: string): boolean {
  const board = fenToBoard(snapshot.fen);
  const source = board.find((square) => square.square === from);
  const rank = Number(to[1]);
  const movingPiece = source?.piece ?? null;
  return (
    movingPiece !== null &&
    movingPiece.toLowerCase() === "p" &&
    ((movingPiece === "P" && rank === 8) || (movingPiece === "p" && rank === 1))
  );
}

export function promotionColorForMove(snapshot: GameSnapshot, from: string): PieceColor | null {
  const board = fenToBoard(snapshot.fen);
  const source = board.find((square) => square.square === from);
  return pieceColor(source?.piece ?? null);
}

export function toMoveUci(from: string, to: string, promotionPiece: PromotionPieceCode | null = null): string {
  return `${from}${to}${promotionPiece ?? ""}`;
}

export function lastMoveSquares(lastMoveUci: string | null): [string, string] | null {
  if (!lastMoveUci || lastMoveUci.length < 4) {
    return null;
  }
  return [lastMoveUci.slice(0, 2), lastMoveUci.slice(2, 4)];
}

export function checkedKingSquare(snapshot: GameSnapshot): string | null {
  if (!snapshot.status.is_check) {
    return null;
  }

  const board = fenToBoard(snapshot.fen);
  const kingPiece = snapshot.status.turn === "white" ? "K" : "k";
  return board.find((square) => square.piece === kingPiece)?.square ?? null;
}

export function candidateForSquare(
  overlays: CandidateOverlay[],
  square: string,
): { fromRanks: CandidateOverlay[]; toRanks: CandidateOverlay[] } {
  return {
    fromRanks: overlays.filter((overlay) => overlay.from === square).sort((left, right) => left.rank - right.rank),
    toRanks: overlays.filter((overlay) => overlay.to === square).sort((left, right) => left.rank - right.rank),
  };
}

type BoardViewProps = {
  fen: string;
  lastMoveUci: string | null;
  checkedSquare: string | null;
  overlays: CandidateOverlay[];
  activeCandidateMoveUci?: string | null;
  selectedSquare?: string | null;
  interactive?: boolean;
  disabled?: boolean;
  onSquareClick?: (square: BoardSquare) => void;
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>, square: BoardSquare) => void;
  onDrop?: (event: React.DragEvent<HTMLButtonElement>, square: BoardSquare) => void;
};

export function BoardView({
  fen,
  lastMoveUci,
  checkedSquare,
  overlays,
  activeCandidateMoveUci = null,
  selectedSquare = null,
  interactive = false,
  disabled = false,
  onSquareClick,
  onDragStart,
  onDrop,
}: BoardViewProps) {
  const board = fenToBoard(fen);
  const highlightedMove = lastMoveSquares(lastMoveUci);

  return (
    <div className="board-grid" role="grid" aria-label={uiGlossary.board.ariaLabel}>
      {board.map((square, index) => {
        const fileIndex = index % 8;
        const rankIndex = Math.floor(index / 8);
        const isDark = (fileIndex + rankIndex) % 2 === 1;
        const isSelected = selectedSquare === square.square;
        const isLastMove = highlightedMove?.includes(square.square) ?? false;
        const isCheckSquare = checkedSquare === square.square;
        const candidate = candidateForSquare(overlays, square.square);
        const isCandidateActive =
          activeCandidateMoveUci === null ||
          candidate.fromRanks.some((overlay) => overlay.moveUci === activeCandidateMoveUci) ||
          candidate.toRanks.some((overlay) => overlay.moveUci === activeCandidateMoveUci);
        const classes = [
          "board-square",
          isDark ? "dark" : "light",
          isSelected ? "selected" : "",
          isLastMove ? "last-move" : "",
          isCheckSquare ? "check-square" : "",
          !isCandidateActive && overlays.length > 0 && activeCandidateMoveUci ? "candidate-muted" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={square.square}
            type="button"
            className={classes}
            onClick={() => onSquareClick?.(square)}
            draggable={interactive}
            onDragStart={(event) => onDragStart?.(event, square)}
            onDragOver={(event) => {
              if (interactive) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => onDrop?.(event, square)}
            aria-label={boardSquareAriaLabel(square.square, square.piece)}
            disabled={disabled}
          >
            {candidate.fromRanks.map((overlay, overlayIndex) => (
              <span
                key={`from-${overlay.moveUci}`}
                className={`candidate-origin rank-${overlay.rank} layer-${overlayIndex + 1} ${
                  activeCandidateMoveUci === overlay.moveUci ? "active" : ""
                }`}
                aria-hidden="true"
              />
            ))}
            {candidate.toRanks.map((overlay, overlayIndex) => (
              <span
                key={`to-${overlay.moveUci}`}
                className={`candidate-target rank-${overlay.rank} layer-${overlayIndex + 1} ${
                  activeCandidateMoveUci === overlay.moveUci ? "active" : ""
                }`}
                aria-hidden="true"
              />
            ))}
            {candidate.toRanks.length > 0 ? (
              <span className="candidate-badge-stack" aria-hidden="true">
                {candidate.toRanks.map((overlay) => (
                  <span
                    key={`badge-${overlay.moveUci}`}
                    className={`candidate-badge rank-${overlay.rank} ${
                      activeCandidateMoveUci === overlay.moveUci ? "active" : ""
                    }`}
                  >
                    {overlay.rank}
                  </span>
                ))}
              </span>
            ) : null}
            <span className="square-label file-label">{rankIndex === 7 ? square.square[0] : ""}</span>
            <span className="square-label rank-label">{fileIndex === 0 ? square.square[1] : ""}</span>
            {square.piece ? <ChessPieceSvg piece={square.piece} /> : null}
          </button>
        );
      })}
    </div>
  );
}
