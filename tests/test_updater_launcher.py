#!/usr/bin/env python3
"""Tests verifying stable KPlayer.sh launcher restoration, v2.1.6 ES daemon handoff, and never touching gamelist.xml."""
from pathlib import Path
import importlib.util
import tempfile
import unittest

BASE = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("kp_updater", BASE / "ports/kplayer/updater.py")
assert SPEC and SPEC.loader
updater = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(updater)


class UpdaterLauncherTest(unittest.TestCase):
    def test_kplayer_sh_supports_v216_bg_audio_handoff_daemon_and_helpers(self) -> None:
        sh = (BASE / "ports/KPlayer.sh").read_text(encoding="utf-8")
        self.assertIn('KPLAYER_VERSION="2.1.6"', sh)
        self.assertIn('"$result" -eq 43', sh)
        self.assertIn('"$result" -eq 44', sh)
        self.assertIn("start-daemon", sh)
        self.assertIn("stop-daemon", sh)
        self.assertIn("bg_audio.py", sh)
        self.assertIn("pdf_ops.py", sh)
        self.assertTrue((BASE / "ports/kplayer/bg_audio.py").is_file())
        self.assertTrue((BASE / "ports/kplayer/pdf_ops.py").is_file())

    def test_restores_stable_kplayer_sh_cleans_broken_v208_and_never_touches_xml(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ports = Path(tmp) / "ports"
            gamedir = ports / "kplayer"
            gamedir.mkdir(parents=True)

            # Simulate a broken v2.0.8 installation where KPlayer.sh was replaced by KPlayer v2.0.8.sh
            broken_sh = ports / "KPlayer v2.0.8.sh"
            broken_sh.write_text(
                '#!/bin/bash\n# KPlayer v2.0.8 - dArkOS\nKPLAYER_VERSION="2.0.8"\necho old\n',
                encoding="utf-8",
            )
            # Bundled fresh template from the v2.1.6 update package
            tmpl = gamedir / "KPlayer.sh.tmpl"
            tmpl.write_text(
                '#!/bin/bash\n# KPlayer v2.1.6 - dArkOS / Debian 13 ARM64 / PortMaster\nKPLAYER_VERSION="2.1.6"\nexec bash "$script_dir/KPlayer.sh"\n',
                encoding="utf-8",
            )

            existing_xml = '<?xml version="1.0"?>\n<gameList><game><name>Celeste</name></game></gameList>\n'
            gamelist = ports / "gamelist.xml"
            gamelist.write_text(existing_xml, encoding="utf-8")

            res = updater.ensure_stable_launcher(ports, gamedir, "2.1.6")
            self.assertIsNotNone(res)

            stable_sh = ports / "KPlayer.sh"
            self.assertTrue(stable_sh.is_file())
            self.assertFalse(broken_sh.exists())

            sh_text = stable_sh.read_text(encoding="utf-8")
            self.assertIn('KPLAYER_VERSION="2.1.6"', sh_text)
            self.assertIn("# KPlayer v2.1.6", sh_text)
            self.assertIn('exec bash "$script_dir/KPlayer.sh"', sh_text)

            # Confirm gamelist.xml is 100% untouched byte-for-byte
            self.assertEqual(gamelist.read_text(encoding="utf-8"), existing_xml)
            self.assertFalse((gamedir / "gamelist.xml").exists())

    def test_same_version_update_requires_force_and_preserves_user_data(self) -> None:
        import hashlib
        import io
        import zipfile
        from unittest import mock

        with tempfile.TemporaryDirectory() as tmp:
            ports = Path(tmp) / "ports"
            gamedir = ports / "kplayer"
            gamedir.mkdir(parents=True)
            (gamedir / "installed-version.txt").write_text("2.1.6\n", encoding="utf-8")
            (gamedir / "favorites.txt").write_text("fav-track\n", encoding="utf-8")
            (gamedir / "news.cfg").write_text("api_key=local-test\n", encoding="utf-8")

            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as zf:
                zf.writestr("KPlayer.sh", '#!/bin/bash\n# KPlayer v2.1.6\nKPLAYER_VERSION="2.1.6"\n')
                zf.writestr("kplayer/changelog.txt", "KPlayer v2.1.6 test\n")
                zf.writestr("kplayer/favorites.txt", "SHOULD-NOT-OVERWRITE\n")
                zf.writestr("kplayer/news.cfg", "SHOULD-NOT-OVERWRITE\n")
            zip_bytes = buf.getvalue()
            zip_sha = hashlib.sha256(zip_bytes).hexdigest()

            fake_info = {
                "currentVersion": "2.1.6",
                "latestVersion": "2.1.6",
                "nextExpectedVersion": "2.1.7",
                "updateAvailable": False,
                "repository": "kaiaum01/KPlayer",
                "branch": "main",
                "source": "github",
                "error": "",
                "notes": ["Reinstall test"],
                "r36s": {
                    "filename": "KPlayer-v2.1.6-R36S.zip",
                    "path": "updates/v2.1.6/KPlayer-v2.1.6-R36S.zip",
                    "url": "https://raw.githubusercontent.com/kaiaum01/KPlayer/main/updates/v2.1.6/KPlayer-v2.1.6-R36S.zip",
                    "sha256": zip_sha,
                },
            }

            class _FakeResp(io.BytesIO):
                def __init__(self, data: bytes) -> None:
                    super().__init__(data)
                    self.headers = {"Content-Length": str(len(data))}

                def __enter__(self) -> "_FakeResp":
                    return self

                def __exit__(self, *args: object) -> None:
                    self.close()

            with mock.patch.object(updater, "check_update", return_value=fake_info):
                # Without --force, same version exits cleanly (0) without overwriting
                rc_no_force = updater.apply_update(gamedir, force=False)
                self.assertEqual(rc_no_force, 0)
                self.assertFalse((gamedir / "changelog.txt").exists())

                # With --force, same version reinstalls (returns 42) and preserves user files
                with mock.patch.object(updater, "urlopen_with_retry", return_value=_FakeResp(zip_bytes)):
                    rc_force = updater.apply_update(gamedir, force=True)
                self.assertEqual(rc_force, 42)
                self.assertEqual((gamedir / "changelog.txt").read_text(encoding="utf-8"), "KPlayer v2.1.6 test\n")
                self.assertEqual((gamedir / "favorites.txt").read_text(encoding="utf-8"), "fav-track\n")
                self.assertEqual((gamedir / "news.cfg").read_text(encoding="utf-8"), "api_key=local-test\n")


if __name__ == "__main__":
    unittest.main()
