import unittest

from backend.app.coaching.weakness_service import WeaknessService


class WeaknessServicePresentationTests(unittest.TestCase):
    def test_display_label_maps_known_patterns(self) -> None:
        self.assertEqual(
            WeaknessService.display_label("king_safety", "delayed_castling"),
            "Delayed Castling",
        )
        self.assertEqual(
            WeaknessService.display_label("structure", "pawn_structure:a2,b2|a7,b7"),
            "Repeated Pawn Structure Mistakes",
        )

    def test_study_recommendation_maps_known_patterns(self) -> None:
        self.assertIn(
            "checks, captures, and direct threats",
            WeaknessService.study_recommendation("tactics", "missed_tactical_pattern"),
        )
        self.assertIn(
            "knights and bishops",
            WeaknessService.study_recommendation("development", "delayed_piece_development"),
        )


if __name__ == "__main__":
    unittest.main()
