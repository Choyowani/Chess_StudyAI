import type { BoardSquare, CandidateOverlay, GameSnapshot, PieceColor } from "./types";

const files = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

export const pieceGlyphs: Record<string, string> = {
  P: "♙",
  N: "♘",
  B: "♗",
  R: "♖",
  Q: "♕",
  K: "♔",
  p: "♟",
  n: "♞",
  b: "♝",
  r: "♜",
  q: "♛",
  k: "♚",
};

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

export function toMoveUci(snapshot: GameSnapshot, from: string, to: string): string {
  const board = fenToBoard(snapshot.fen);
  const source = board.find((square) => square.square === from);
  const rank = Number(to[1]);
  const movingPiece = source?.piece ?? null;
  const isPromotion =
    movingPiece !== null &&
    movingPiece.toLowerCase() === "p" &&
    ((movingPiece === "P" && rank === 8) || (movingPiece === "p" && rank === 1));

  return `${from}${to}${isPromotion ? "q" : ""}`;
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
): { fromRank: number | null; toRank: number | null } {
  let fromRank: number | null = null;
  let toRank: number | null = null;

  overlays.forEach((overlay) => {
    if (overlay.from === square) {
      fromRank = overlay.rank;
    }
    if (overlay.to === square) {
      toRank = overlay.rank;
    }
  });

  return { fromRank, toRank };
}

type BoardViewProps = {
  fen: string;
  lastMoveUci: string | null;
  checkedSquare: string | null;
  overlays: CandidateOverlay[];
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
    <div className="board-grid" role="grid" aria-label="Chess board">
      {board.map((square, index) => {
        const fileIndex = index % 8;
        const rankIndex = Math.floor(index / 8);
        const isDark = (fileIndex + rankIndex) % 2 === 1;
        const isSelected = selectedSquare === square.square;
        const isLastMove = highlightedMove?.includes(square.square) ?? false;
        const isCheckSquare = checkedSquare === square.square;
        const candidate = candidateForSquare(overlays, square.square);
        const classes = [
          "board-square",
          isDark ? "dark" : "light",
          isSelected ? "selected" : "",
          isLastMove ? "last-move" : "",
          isCheckSquare ? "check-square" : "",
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
            aria-label={`${square.square}${square.piece ? ` ${square.piece}` : ""}`}
            disabled={disabled}
          >
            {candidate.fromRank ? (
              <span className={`candidate-origin rank-${candidate.fromRank}`} aria-hidden="true" />
            ) : null}
            {candidate.toRank ? (
              <>
                <span className={`candidate-target rank-${candidate.toRank}`} aria-hidden="true" />
                <span className={`candidate-badge rank-${candidate.toRank}`} aria-hidden="true">
                  {candidate.toRank}
                </span>
              </>
            ) : null}
            <span className="square-label file-label">{rankIndex === 7 ? square.square[0] : ""}</span>
            <span className="square-label rank-label">{fileIndex === 0 ? square.square[1] : ""}</span>
            <span className="piece-glyph">{square.piece ? pieceGlyphs[square.piece] : ""}</span>
          </button>
        );
      })}
    </div>
  );
}
