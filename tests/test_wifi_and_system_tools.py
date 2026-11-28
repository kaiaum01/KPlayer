import os
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "ports", "kplayer")))

import system_tools
import wifi_transfer


class WifiTransferTests(unittest.TestCase):
    def test_qr_encoder_produces_valid_square_matrix(self):
        mat = wifi_transfer.encode_qr_matrix("http://192.168.1.42:8088/?p=123456")
        self.assertGreaterEqual(len(mat), 21)
        self.assertEqual(len(mat), len(mat[0]))
        # Top-left 7x7 finder pattern must match ISO-18004 dark/light pattern
        self.assertEqual(mat[0][0], "#")
        self.assertEqual(mat[0][6], "#")
        self.assertEqual(mat[6][0], "#")
        self.assertEqual(mat[1][1], ".")
        self.assertEqual(mat[3][3], "#")

    def test_sanitize_filename_and_path_confinement(self):
        self.assertEqual(wifi_transfer.sanitize_filename("../../evil/song.mp3"), "song.mp3")
        self.assertEqual(wifi_transfer.sanitize_filename("movie.mkv"), "movie.mkv")
        self.assertEqual(wifi_transfer.sanitize_filename("canais.m3u8"), "canais.m3u8")
        self.assertEqual(wifi_transfer.sanitize_filename("estacao.pls"), "estacao.pls")
        with self.assertRaises(ValueError):
            wifi_transfer.sanitize_filename(".hidden")
        with self.assertRaises(ValueError):
            wifi_transfer.sanitize_filename("..")
        with self.assertRaises(ValueError):
            wifi_transfer.sanitize_filename("payload.sh")
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "music"
            target = wifi_transfer.safe_target_path(base, "../../nested/ok.flac")
            self.assertTrue(str(target).startswith(str(base.resolve()) + os.sep))
            self.assertEqual(target.name, "ok.flac")


class SystemToolsTests(unittest.TestCase):
    def test_diagnostics_returns_expected_fields(self):
        diag = system_tools.collect_diagnostics(Path.cwd())
        self.assertTrue(diag.get("ok"))
        for key in ("ip", "audio", "battery", "disks", "miniplayer_installed", "miniplayer_running"):
            self.assertIn(key, diag)

    def test_backup_and_restore_roundtrip_and_zipslip_guard(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            (tmp_path / "settings.cfg").write_text("KPLAYER_SETTINGS 10\ntheme 3\n", encoding="utf-8")
            (tmp_path / "iptv_favorites.cfg").write_text("Canal 1\thttps://example.org/1.m3u8\n", encoding="utf-8")
            pl_dir = tmp_path / "playlists"
            pl_dir.mkdir(parents=True, exist_ok=True)
            (pl_dir / "mix.m3u").write_text("#EXTM3U\n/roms/bgmusic/a.mp3\n", encoding="utf-8")

            res = system_tools.create_backup(tmp_path)
            self.assertTrue(res["ok"])
            zip_path = Path(res["zip_path"])
            self.assertTrue(zip_path.is_file())
            self.assertGreaterEqual(res["files_count"], 3)

            # Modify config, then restore and confirm original returns
            (tmp_path / "settings.cfg").write_text("CORRUPT\n", encoding="utf-8")
            r_res = system_tools.restore_backup(tmp_path, zip_path)
            self.assertTrue(r_res["ok"])
            self.assertGreaterEqual(r_res["restored_count"], 3)
            self.assertIn("theme 3", (tmp_path / "settings.cfg").read_text(encoding="utf-8"))

            # Zip-slip & unlisted files must be skipped safely
            bad_zip = tmp_path / "evil.zip"
            with zipfile.ZipFile(bad_zip, "w") as zf:
                zf.writestr("../../pwned.txt", "evil")
                zf.writestr("random_unlisted.exe", "evil")
            bad_res = system_tools.restore_backup(tmp_path, bad_zip)
            self.assertEqual(bad_res.get("restored_count", 0), 0)
            self.assertFalse((tmp_path.parent / "pwned.txt").exists())


if __name__ == "__main__":
    unittest.main()
