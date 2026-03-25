import unittest

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


if __name__ == "__main__":
    unittest.main()
