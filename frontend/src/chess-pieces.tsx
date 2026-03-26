type PieceColor = "white" | "black";
type PieceKind = "pawn" | "knight" | "bishop" | "rook" | "queen" | "king";

type PieceShapeProps = {
  fill: string;
  stroke: string;
  accent: string;
};

type ChessPieceSvgProps = {
  piece: string;
  className?: string;
};

function palette(color: PieceColor) {
  if (color === "white") {
    return {
      fill: "#f7fbff",
      stroke: "#14222a",
      accent: "#d6e2ea",
    };
  }

  return {
    fill: "#16242c",
    stroke: "#ecf5f8",
    accent: "#4b6772",
  };
}

function svgProps(fill: string, stroke: string) {
  return {
    fill,
    stroke,
    strokeWidth: 2.3,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
}

function BaseStand({ fill, stroke, accent }: PieceShapeProps) {
  return (
    <>
      <path d="M18.4 46.6h27.2l2.8 4.8H15.6l2.8-4.8Z" {...svgProps(fill, stroke)} />
      <rect x="13.4" y="51.1" width="37.2" height="5.7" rx="2.2" {...svgProps(fill, stroke)} />
      <path d="M20.3 49h23.4" stroke={accent} strokeWidth="1.4" strokeLinecap="round" />
    </>
  );
}

function PawnShape({ fill, stroke, accent }: PieceShapeProps) {
  return (
    <>
      <circle cx="32" cy="15.8" r="6.5" {...svgProps(fill, stroke)} />
      <path d="M28 24.6c.9-2.2 2.2-3.2 4-3.2s3.1 1 4 3.2l2.4 6H25.6l2.4-6Z" {...svgProps(fill, stroke)} />
      <path d="M24.7 30.6h14.6l2.6 16H22.1l2.6-16Z" {...svgProps(fill, stroke)} />
      <path d="M26.2 38.1h11.6" stroke={accent} strokeWidth="1.4" strokeLinecap="round" />
      <BaseStand fill={fill} stroke={stroke} accent={accent} />
    </>
  );
}

function KnightShape({ fill, stroke, accent }: PieceShapeProps) {
  return (
    <>
      <path
        d="M20.8 46.6c0-7.7 2.2-13.9 6.6-19 2.8-3.2 5-4.9 5-9.2 0-2-.5-3.8-1.4-5.5 5.8.5 10.1 2.5 13 6.2 2.1 2.8 3.2 5.9 3.3 9.8-2.7-.4-5.2.2-7.3 1.7-2.2 1.6-4.2 4.2-5.6 8l4.6 3.3c-1 1.7-2.4 3-4.2 3.9-1.9 1-4.2 1.5-6.7 1.5H20.8Z"
        {...svgProps(fill, stroke)}
      />
      <path d="M30.2 12.7c3 1 5.7 2.9 7.8 5.8" stroke={accent} strokeWidth="1.8" />
      <path d="M29 20.3 36.3 15l-.2 6.3" stroke={accent} strokeWidth="1.6" />
      <circle cx="38.1" cy="24.5" r="1.8" fill={stroke} />
      <path d="M27.2 33.6c2.5-.8 4.8-.6 6.8.6" stroke={accent} strokeWidth="1.5" />
      <BaseStand fill={fill} stroke={stroke} accent={accent} />
    </>
  );
}

function BishopShape({ fill, stroke, accent }: PieceShapeProps) {
  return (
    <>
      <circle cx="32" cy="12.2" r="3.7" {...svgProps(fill, stroke)} />
      <path d="M32 16.2c5.3 5.4 8.2 9.7 8.2 14.5 0 4.7-3.6 8-8.2 8-4.6 0-8.2-3.3-8.2-8 0-4.8 2.9-9.1 8.2-14.5Z" {...svgProps(fill, stroke)} />
      <path d="M27.9 18.5 36.7 31.5" stroke={accent} strokeWidth="2.1" strokeLinecap="round" />
      <path d="M24.9 38.8h14.2l3.6 7.8H21.3l3.6-7.8Z" {...svgProps(fill, stroke)} />
      <BaseStand fill={fill} stroke={stroke} accent={accent} />
    </>
  );
}

function RookShape({ fill, stroke, accent }: PieceShapeProps) {
  return (
    <>
      <path d="M17 13.8h7v7h3v-7h10v7h3v-7h7v11H17v-11Z" {...svgProps(fill, stroke)} />
      <path d="M21.7 24.8h20.6l-2.2 11H23.9l-2.2-11Z" {...svgProps(fill, stroke)} />
      <rect x="20.8" y="35.8" width="22.4" height="10.8" rx="1.8" {...svgProps(fill, stroke)} />
      <path d="M24 30.9h16" stroke={accent} strokeWidth="1.5" />
      <path d="M24 40.8h16" stroke={accent} strokeWidth="1.5" />
      <BaseStand fill={fill} stroke={stroke} accent={accent} />
    </>
  );
}

function QueenShape({ fill, stroke, accent }: PieceShapeProps) {
  return (
    <>
      <circle cx="17.4" cy="16.4" r="3.5" {...svgProps(fill, stroke)} />
      <circle cx="25.8" cy="12.9" r="3.2" {...svgProps(fill, stroke)} />
      <circle cx="32" cy="10.9" r="3.2" {...svgProps(fill, stroke)} />
      <circle cx="38.2" cy="12.9" r="3.2" {...svgProps(fill, stroke)} />
      <circle cx="46.6" cy="16.4" r="3.5" {...svgProps(fill, stroke)} />
      <path d="M18.7 21.3 22.8 37.4h18.4l4.1-16.1-6.5 5.3L32 17.1l-6.8 9.5-6.5-5.3Z" {...svgProps(fill, stroke)} />
      <path d="M22.4 37.4h19.2l3.4 9.2H19l3.4-9.2Z" {...svgProps(fill, stroke)} />
      <path d="M24.4 31.5h15.2" stroke={accent} strokeWidth="1.4" />
      <BaseStand fill={fill} stroke={stroke} accent={accent} />
    </>
  );
}

function KingShape({ fill, stroke, accent }: PieceShapeProps) {
  return (
    <>
      <path d="M32 8.5v9.7" stroke={stroke} strokeWidth="2.8" strokeLinecap="round" />
      <path d="M26.1 13.4h11.8" stroke={stroke} strokeWidth="2.8" strokeLinecap="round" />
      <path d="M25 22c1.8-2.3 4.1-3.5 7-3.5s5.2 1.2 7 3.5l2.4 4.6H22.6L25 22Z" {...svgProps(fill, stroke)} />
      <path d="M22.4 26.6h19.2l2.8 20H19.6l2.8-20Z" {...svgProps(fill, stroke)} />
      <path d="M25.8 36.6h12.4" stroke={accent} strokeWidth="1.4" />
      <BaseStand fill={fill} stroke={stroke} accent={accent} />
    </>
  );
}

function resolvePiece(piece: string): { kind: PieceKind; color: PieceColor } | null {
  const color: PieceColor = piece === piece.toUpperCase() ? "white" : "black";
  const kind = {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
    k: "king",
  }[piece.toLowerCase()] as PieceKind | undefined;

  if (!kind) {
    return null;
  }

  return { kind, color };
}

function PieceShape({ kind, color }: { kind: PieceKind; color: PieceColor }) {
  const { fill, stroke, accent } = palette(color);
  const props = { fill, stroke, accent };

  if (kind === "pawn") return <PawnShape {...props} />;
  if (kind === "knight") return <KnightShape {...props} />;
  if (kind === "bishop") return <BishopShape {...props} />;
  if (kind === "rook") return <RookShape {...props} />;
  if (kind === "queen") return <QueenShape {...props} />;
  return <KingShape {...props} />;
}

export function ChessPieceSvg({ piece, className = "" }: ChessPieceSvgProps) {
  const resolved = resolvePiece(piece);
  if (!resolved) {
    return null;
  }

  return (
    <span className={`piece-shell ${className}`.trim()} aria-hidden="true">
      <svg
        viewBox="0 0 64 64"
        className={`piece-svg piece-svg-${resolved.color}`}
        focusable="false"
      >
        <PieceShape kind={resolved.kind} color={resolved.color} />
      </svg>
    </span>
  );
}
