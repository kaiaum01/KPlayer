#!/usr/bin/env python3
"""Tests verifying versioned .sh launcher updates without touching any gamelist.xml."""
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
    def test_updates_versioned_sh_and_never_touches_gamelist_xml(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ports = Path(tmp) / "ports"
            gamedir = ports / "kplayer"
            gamedir.mkdir(parents=True)

            old_sh = ports / "KPlayer v2.0.7.sh"
            old_sh.write_text(
                '#!/bin/bash\n# KPlayer v2.0.7 - dArkOS\nKPLAYER_VERSION="2.0.7"\necho ok\n',
                encoding="utf-8",
            )
            legacy_sh = ports / "KPlayer.sh"
            legacy_sh.write_text('#!/bin/bash\necho legacy\n', encoding="utf-8")

            existing_xml = '<?xml version="1.0"?>\n<gameList><game><name>Celeste</name></game></gameList>\n'
            gamelist = ports / "gamelist.xml"
            gamelist.write_text(existing_xml, encoding="utf-8")

            res = updater.sync_versioned_launcher(ports, gamedir, "2.0.8")
            self.assertIsNotNone(res)
            new_sh = ports / "KPlayer v2.0.8.sh"
            self.assertTrue(new_sh.is_file())
            self.assertFalse(old_sh.exists())
            self.assertFalse(legacy_sh.exists())

            sh_text = new_sh.read_text(encoding="utf-8")
            self.assertIn('KPLAYER_VERSION="2.0.8"', sh_text)
            self.assertIn("# KPlayer v2.0.8", sh_text)

            # Confirm gamelist.xml is 100% untouched byte-for-byte
            self.assertEqual(gamelist.read_text(encoding="utf-8"), existing_xml)
            self.assertFalse((gamedir / "gamelist.xml").exists())


if __name__ == "__main__":
    unittest.main()
