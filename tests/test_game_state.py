import unittest

import chess

from backend.app.domain.game_state import ChessGameState, InvalidMoveError


class ChessGameStateTests(unittest.TestCase):
    def test_rejects_illegal_move(self) -> None:
        game = ChessGameState()

        with self.assertRaises(InvalidMoveError):
            game.apply_uci_move("e2e5")

    def test_apply_and_undo_restores_position_and_history(self) -> None:
        game = ChessGameState()
        start_fen = game.current_fen()

        record = game.apply_uci_move("e2e4")

        self.assertEqual(record.move_uci, "e2e4")
        self.assertEqual(record.side_to_move_before, "white")
        self.assertEqual(len(game.move_history), 1)
        self.assertNotEqual(game.current_fen(), start_fen)

        undone = game.undo_last_move()

        self.assertEqual(undone.move_uci, "e2e4")
        self.assertEqual(game.current_fen(), start_fen)
        self.assertEqual(len(game.move_history), 0)

    def test_fen_can_reconstruct_position(self) -> None:
        game = ChessGameState()
        game.apply_uci_move("e2e4")
        game.apply_uci_move("e7e5")
        game.apply_uci_move("g1f3")

        reconstructed = ChessGameState(initial_fen=game.current_fen())

        self.assertEqual(reconstructed.current_fen(), game.current_fen())
        self.assertEqual(reconstructed.status().turn, "black")

    def test_detects_checkmate(self) -> None:
        game = ChessGameState()
        for move in ("f2f3", "e7e5", "g2g4", "d8h4"):
            game.apply_uci_move(move)

        status = game.status()

        self.assertTrue(status.is_check)
        self.assertTrue(status.is_checkmate)
        self.assertTrue(status.is_game_over)
        self.assertEqual(status.result, "0-1")
        self.assertEqual(status.winner, "black")

    def test_detects_stalemate_draw(self) -> None:
        game = ChessGameState("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")

        status = game.status()

        self.assertTrue(status.is_stalemate)
        self.assertTrue(status.is_draw)
        self.assertEqual(status.draw_reason, "stalemate")
        self.assertEqual(status.result, "1/2-1/2")

    def test_detects_insufficient_material_draw(self) -> None:
        game = ChessGameState("8/8/8/8/8/8/2k5/3K4 w - - 0 1")

        status = game.status()

        self.assertTrue(status.is_draw)
        self.assertEqual(status.draw_reason, "insufficient_material")
        self.assertEqual(status.result, "1/2-1/2")

    def test_detects_threefold_repetition_claim_draw(self) -> None:
        game = ChessGameState()

        for move in ("g1f3", "g8f6", "f3g1", "f6g8") * 2:
            game.apply_uci_move(move)

        status = game.status()

        self.assertTrue(status.is_draw)
        self.assertEqual(status.draw_reason, "threefold_repetition_claim")
        self.assertEqual(status.result, "1/2-1/2")

    def test_side_to_move_and_legal_moves_stay_consistent(self) -> None:
        game = ChessGameState()
        game.apply_uci_move("e2e4")

        self.assertEqual(game.status().turn, "black")
        self.assertTrue(game.is_legal_uci_move("e7e5"))
        self.assertFalse(game.is_legal_uci_move("e2e4"))

    def test_check_state_restricts_legal_moves(self) -> None:
        game = ChessGameState("4k3/8/8/8/8/8/4r3/R3K3 w Q - 0 1")

        self.assertTrue(game.status().is_check)
        self.assertFalse(game.is_legal_uci_move("a1a2"))

        with self.assertRaises(InvalidMoveError):
            game.apply_uci_move("a1a2")

    def test_castling_is_legal_when_path_is_clear_and_safe(self) -> None:
        game = ChessGameState("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")

        self.assertTrue(game.is_legal_uci_move("e1g1"))
        self.assertTrue(game.is_legal_uci_move("e1c1"))

        record = game.apply_uci_move("e1g1")
        board = chess.Board(game.current_fen())

        self.assertEqual(record.move_san, "O-O")
        self.assertEqual(board.piece_at(chess.G1), chess.Piece(chess.KING, chess.WHITE))
        self.assertEqual(board.piece_at(chess.F1), chess.Piece(chess.ROOK, chess.WHITE))

    def test_castling_is_illegal_when_king_passes_through_check(self) -> None:
        game = ChessGameState("4k3/8/8/8/8/5r2/8/R3K2R w KQ - 0 1")

        self.assertFalse(game.is_legal_uci_move("e1g1"))
        self.assertTrue(game.is_legal_uci_move("e1c1"))

        with self.assertRaises(InvalidMoveError):
            game.apply_uci_move("e1g1")

    def test_en_passant_is_legal_when_available(self) -> None:
        game = ChessGameState("4k3/8/8/3pPp2/8/8/8/4K3 w - f6 0 1")

        self.assertTrue(game.is_legal_uci_move("e5f6"))
        record = game.apply_uci_move("e5f6")
        board = chess.Board(game.current_fen())

        self.assertEqual(record.move_san, "exf6")
        self.assertEqual(board.piece_at(chess.F6), chess.Piece(chess.PAWN, chess.WHITE))
        self.assertIsNone(board.piece_at(chess.F5))

    def test_en_passant_is_illegal_when_it_exposes_king(self) -> None:
        game = ChessGameState("4r2k/8/8/3pP3/8/8/8/4K3 w - d6 0 1")

        self.assertFalse(game.is_legal_uci_move("e5d6"))

        with self.assertRaises(InvalidMoveError):
            game.apply_uci_move("e5d6")

    def test_supports_white_underpromotion(self) -> None:
        game = ChessGameState("k7/4P3/8/8/8/8/8/4K3 w - - 0 1")

        record = game.apply_uci_move("e7e8n")

        self.assertEqual(record.move_uci, "e7e8n")
        self.assertEqual(record.move_san, "e8=N")
        board = chess.Board(game.current_fen())
        self.assertEqual(board.piece_at(chess.E8), chess.Piece(chess.KNIGHT, chess.WHITE))

    def test_supports_black_underpromotion(self) -> None:
        game = ChessGameState("4k3/8/8/8/8/8/4p3/K7 b - - 0 1")

        record = game.apply_uci_move("e2e1r")

        self.assertEqual(record.move_uci, "e2e1r")
        self.assertIn("=R", record.move_san)
        board = chess.Board(game.current_fen())
        self.assertEqual(board.piece_at(chess.E1), chess.Piece(chess.ROOK, chess.BLACK))

    def test_rejects_invalid_promotion_choice(self) -> None:
        game = ChessGameState("k7/4P3/8/8/8/8/8/4K3 w - - 0 1")

        with self.assertRaises(InvalidMoveError):
            game.apply_uci_move("e7e8p")

    def test_undo_restores_special_move_legality(self) -> None:
        game = ChessGameState("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")
        game.apply_uci_move("e1g1")

        game.undo_last_move()

        self.assertEqual(game.status().turn, "white")
        self.assertTrue(game.is_legal_uci_move("e1g1"))
        self.assertTrue(game.is_legal_uci_move("e1c1"))


if __name__ == "__main__":
    unittest.main()
