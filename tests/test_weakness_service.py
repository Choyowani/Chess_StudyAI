import unittest

from backend.app.coaching.weakness_service import WeaknessService


class WeaknessServicePresentationTests(unittest.TestCase):
    def test_display_label_maps_known_patterns(self) -> None:
        self.assertEqual(
            WeaknessService.display_label("king_safety", "delayed_castling"),
            "캐슬링이 자주 늦어짐",
        )
        self.assertEqual(
            WeaknessService.display_label("structure", "pawn_structure:a2,b2|a7,b7"),
            "비슷한 폰 구조에서 실수가 반복됨",
        )

    def test_study_recommendation_maps_known_patterns(self) -> None:
        self.assertIn(
            "체크, 잡기, 직접 위협",
            WeaknessService.study_recommendation("tactics", "missed_tactical_pattern"),
        )
        self.assertIn(
            "나이트와 비숍",
            WeaknessService.study_recommendation("development", "delayed_piece_development"),
        )


if __name__ == "__main__":
    unittest.main()
