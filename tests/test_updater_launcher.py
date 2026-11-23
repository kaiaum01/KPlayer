#!/usr/bin/env python3
"""Tests verifying stable KPlayer.sh launcher restoration without touching any gamelist.xml."""
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
            # Bundled fresh template from the v2.0.9 update package
            tmpl = gamedir / "KPlayer.sh.tmpl"
            tmpl.write_text(
                '#!/bin/bash\n# KPlayer v2.0.9 - dArkOS / Debian 13 ARM64 / PortMaster\nKPLAYER_VERSION="2.0.9"\nexec bash "$script_dir/KPlayer.sh"\n',
                encoding="utf-8",
            )

            existing_xml = '<?xml version="1.0"?>\n<gameList><game><name>Celeste</name></game></gameList>\n'
            gamelist = ports / "gamelist.xml"
            gamelist.write_text(existing_xml, encoding="utf-8")

            res = updater.ensure_stable_launcher(ports, gamedir, "2.0.9")
            self.assertIsNotNone(res)

            stable_sh = ports / "KPlayer.sh"
            self.assertTrue(stable_sh.is_file())
            self.assertFalse(broken_sh.exists())

            sh_text = stable_sh.read_text(encoding="utf-8")
            self.assertIn('KPLAYER_VERSION="2.0.9"', sh_text)
            self.assertIn("# KPlayer v2.0.9", sh_text)
            self.assertIn('exec bash "$script_dir/KPlayer.sh"', sh_text)

            # Confirm gamelist.xml is 100% untouched byte-for-byte
            self.assertEqual(gamelist.read_text(encoding="utf-8"), existing_xml)
            self.assertFalse((gamedir / "gamelist.xml").exists())


if __name__ == "__main__":
    unittest.main()
