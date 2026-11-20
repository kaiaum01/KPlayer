import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("football_fetch", Path(__file__).resolve().parents[1] / "ports/kplayer/football_fetch.py")
football = importlib.util.module_from_spec(spec)
spec.loader.exec_module(football)

class FootballTests(unittest.TestCase):
    def test_score_and_text(self):
        data = {"status": "ok", "data": [{"league": {"name": "Liga"}, "home_team": {"name": "São Paulo"}, "away_team": {"name": "Santos"}, "home_score": 0, "away_score": 2, "live_time": "45'"}]}
        self.assertEqual(football.convert(data), "Liga\tSão Paulo\t0 - 2\tSantos\t45'\n")

    def test_empty_and_malformed(self):
        self.assertEqual(football.convert({"status": "ok", "data": []}), "")
        with self.assertRaises(ValueError):
            football.convert({"status": "error", "data": []})

    def test_limit_and_untrusted_fields(self):
        data = {"status": "ok", "data": [{"league": {"name": "A\tB"}}] * 200}
        rows = football.convert(data).splitlines()
        self.assertEqual(len(rows), 150)
        self.assertEqual(rows[0].count("\t"), 4)

if __name__ == "__main__":
    unittest.main()
