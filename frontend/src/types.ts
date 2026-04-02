export type ColorName = "white" | "black";
export type PromotionPieceCode = "q" | "r" | "b" | "n";

export type MoveRecord = {
  ply_index: number;
  side_to_move_before: ColorName;
  before_fen: string;
  move_uci: string;
  move_san: string;
  after_fen: string;
};

export type GameStatus = {
  turn: ColorName;
  is_check: boolean;
  is_checkmate: boolean;
  is_stalemate: boolean;
  is_draw: boolean;
  draw_reason: string | null;
  is_game_over: boolean;
  result: string | null;
  winner: ColorName | null;
  terminal_reason: string | null;
};

export type EvaluationScore = {
  perspective: string;
  centipawns: number | null;
  mate: number | null;
};

export type CandidateMove = {
  rank: number;
  move_uci: string;
  move_san: string;
  score: EvaluationScore;
  principal_variation_uci: string[];
  principal_variation_san: string[];
};

export type AnalysisData = {
  fen: string;
  best_move: CandidateMove;
  top_moves: CandidateMove[];
  evaluation: EvaluationScore;
};

export type AnalysisError = {
  fen: string;
  error_type: string;
  message: string;
};

export type MoveFeedback = {
  played_move_uci: string;
  played_move_san: string;
  best_move_uci: string;
  best_move_san: string;
  score_loss_centipawns: number;
  move_quality_label: "Good" | "Playable" | "Inaccuracy" | "Mistake" | "Blunder";
  short_explanation: string;
  current_plan: string;
};

export type ReviewItem = {
  ply_index: number;
  move_san: string;
  note: string;
  score_loss_centipawns: number | null;
};

export type TurningPoint = {
  ply_index: number;
  move_san: string;
  swing_centipawns: number;
  note: string;
};

export type ReviewReport = {
  critical_mistakes: ReviewItem[];
  good_moves: ReviewItem[];
  turning_points: TurningPoint[];
  study_points: string[];
};

export type ArchivedMoveLog = {
  ply_index: number;
  side_to_move_before: ColorName;
  before_fen: string;
  move_uci: string;
  move_san: string;
  after_fen: string;
  best_move_uci: string | null;
  best_move_san: string | null;
  top_candidate_moves: Array<Record<string, unknown>>;
  move_quality_label: string | null;
  short_coaching_note: string | null;
  current_plan: string | null;
  pattern_tags: Array<Record<string, string>>;
};

export type ArchivedGame = {
  id: string;
  user_id: string;
  started_at: string;
  finished_at: string;
  result: string | null;
  terminal_reason: string | null;
  user_color: string;
  initial_fen: string;
  final_fen: string;
  pgn: string;
  summary_text: string | null;
  review_report: ReviewReport | null;
  move_logs: ArchivedMoveLog[];
};

export type ArchivedGameSummary = {
  game_id: string;
  started_at: string;
  finished_at: string;
  result: string | null;
  terminal_reason: string | null;
  user_color: string;
  move_count: number;
  summary_preview: string | null;
};

export type InProgressGameSummary = {
  game_id: string;
  user_id: string;
  current_fen: string;
  started_at: string;
  updated_at: string;
  status: string;
  user_color: string;
  move_count: number;
};

export type WeaknessPattern = {
  pattern_type: string;
  pattern_key: string;
  display_label: string;
  frequency: number;
  last_seen_at: string;
  notes: string;
  study_recommendation: string;
  related_game_ids: string[];
};

export type UserWeaknessSummary = {
  user_id: string;
  patterns: WeaknessPattern[];
};

export type GameSnapshot = {
  game_id: string;
  fen: string;
  last_move_uci: string | null;
  move_history: MoveRecord[];
  status: GameStatus;
  legal_moves: string[];
  analysis: AnalysisData | null;
  analysis_error: AnalysisError | null;
  feedback: MoveFeedback | null;
  feedback_error: string | null;
  archived_game_id: string | null;
};

export type PieceColor = "w" | "b";
export type ViewMode = "live" | "review" | "archive" | "weakness";
export type ArchiveStage = "landing" | "replay";

export type BoardSquare = {
  square: string;
  piece: string | null;
};

export type CandidateOverlay = {
  rank: number;
  moveUci: string;
  from: string;
  to: string;
};

export type PromotionPrompt = {
  from: string;
  to: string;
  color: ColorName;
};

export type MoveBadgeCategory =
  | "best"
  | "excellent"
  | "good"
  | "theory"
  | "inaccuracy"
  | "mistake"
  | "missed"
  | "blunder"
  | "neutral";
