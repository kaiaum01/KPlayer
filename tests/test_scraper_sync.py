#!/usr/bin/env python3
"""Unit tests for ports/kplayer/scraper_sync.py:
- Non-destructive merge into existing /roms/ports & /roms2/ports gamelist.xml
- Automatic creation of gamelist.xml when absent
- In-place update when upgrading from v2.0.7 -> v2.0.8 -> v2.0.9 without duplicates
- Malformed third-party XML fallback without losing existing entries
- Automatic versioned .sh renaming and internal KPLAYER_VERSION stamping on updates
"""
from pathlib import Path
import importlib.util
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
MOD_PATH = ROOT / "ports" / "kplayer" / "scraper_sync.py"
spec = importlib.util.spec_from_file_location("scraper_sync", MOD_PATH)
assert spec and spec.loader
scraper_sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scraper_sync)


class ScraperSyncTest(unittest.TestCase):
    def _make_env(self, base: Path) -> tuple[Path, Path, Path]:
        ports1 = base / "roms" / "ports"
        ports2 = base / "roms2" / "ports"
        gamedir = ports1 / "kplayer"
        scraper_dir = gamedir / "scraper"
        scraper_dir.mkdir(parents=True)
        ports2.mkdir(parents=True)
        for img in ("kplayer-image.png", "kplayer-thumb.png", "kplayer-marquee.png", "kplayer-fanart.png"):
            (scraper_dir / img).write_bytes(b"PNG")
        (ports1 / "KPlayer.sh").write_text(
            '#!/bin/bash\n# K PLAYER - dArkOS\necho hi\n',
            encoding="utf-8",
        )
        return ports1, ports2, gamedir

    def test_preserves_existing_games_and_creates_missing_gamelist(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ports1, ports2, gamedir = self._make_env(Path(tmp))
            existing_xml = (
                '<?xml version="1.0" encoding="utf-8"?>\n'
                "<gameList>\n"
                "  <game>\n"
                "    <path>./Celeste.sh</path>\n"
                "    <name>Celeste</name>\n"
                "    <desc>Classic platformer</desc>\n"
                "  </game>\n"
                "  <game>\n"
                "    <path>./StardewValley.sh</path>\n"
                "    <name>Stardew Valley</name>\n"
                "  </game>\n"
                "</gameList>\n"
            )
            (ports1 / "gamelist.xml").write_text(existing_xml, encoding="utf-8")
            self.assertFalse((ports2 / "gamelist.xml").exists())

            res = scraper_sync.sync_all(gamedir, version="2.0.8", extra_ports_dirs=[ports1, ports2])
            self.assertEqual(res["version"], "2.0.8")

            # Versioned .sh created & old KPlayer.sh removed
            new_sh = ports1 / "KPlayer v2.0.8.sh"
            self.assertTrue(new_sh.is_file())
            self.assertFalse((ports1 / "KPlayer.sh").exists())
            sh_txt = new_sh.read_text(encoding="utf-8")
            self.assertIn('KPLAYER_VERSION="2.0.8"', sh_txt)
            self.assertIn("# KPlayer v2.0.8", sh_txt)

            # ports1/gamelist.xml kept Celeste + Stardew Valley AND added KPlayer v2.0.8
            root1 = ET.parse(ports1 / "gamelist.xml").getroot()
            names1 = [g.findtext("name") for g in root1.findall("game")]
            self.assertIn("Celeste", names1)
            self.assertIn("Stardew Valley", names1)
            self.assertIn("KPlayer v2.0.8", names1)
            kp1 = [g for g in root1.findall("game") if g.findtext("name") == "KPlayer v2.0.8"][0]
            self.assertEqual(kp1.findtext("path"), "./KPlayer v2.0.8.sh")
            self.assertEqual(kp1.findtext("image"), "./kplayer/scraper/kplayer-image.png")
            self.assertEqual(kp1.findtext("thumbnail"), "./kplayer/scraper/kplayer-thumb.png")
            self.assertEqual(kp1.findtext("marquee"), "./kplayer/scraper/kplayer-marquee.png")
            self.assertEqual(kp1.findtext("fanart"), "./kplayer/scraper/kplayer-fanart.png")

            # ports2/gamelist.xml was created automatically with KPlayer metadata
            self.assertTrue((ports2 / "gamelist.xml").is_file())
            root2 = ET.parse(ports2 / "gamelist.xml").getroot()
            names2 = [g.findtext("name") for g in root2.findall("game")]
            self.assertEqual(names2, ["KPlayer v2.0.8"])

            # Internal metadata inside kplayer/ also updated
            self.assertTrue((gamedir / "KPlayer-metadata.xml").is_file())
            self.assertTrue((gamedir / "gamelist.xml").is_file())

    def test_update_version_updates_sh_and_gamelist_in_place(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ports1, ports2, gamedir = self._make_env(Path(tmp))
            (ports1 / "gamelist.xml").write_text(
                '<?xml version="1.0"?>\n<gameList><game><path>./Doom.sh</path><name>Doom</name></game></gameList>\n',
                encoding="utf-8",
            )
            scraper_sync.sync_all(gamedir, version="2.0.8", extra_ports_dirs=[ports1, ports2])
            scraper_sync.sync_all(gamedir, version="2.0.9", extra_ports_dirs=[ports1, ports2])

            self.assertFalse((ports1 / "KPlayer v2.0.8.sh").exists())
            self.assertTrue((ports1 / "KPlayer v2.0.9.sh").is_file())
            self.assertIn('KPLAYER_VERSION="2.0.9"', (ports1 / "KPlayer v2.0.9.sh").read_text(encoding="utf-8"))

            root1 = ET.parse(ports1 / "gamelist.xml").getroot()
            games = root1.findall("game")
            self.assertEqual(len(games), 2)
            self.assertEqual([g.findtext("name") for g in games], ["Doom", "KPlayer v2.0.9"])
            self.assertEqual(games[1].findtext("path"), "./KPlayer v2.0.9.sh")

    def test_malformed_existing_xml_is_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ports1, _ports2, gamedir = self._make_env(Path(tmp))
            # Unescaped & in an existing third-party game entry
            malformed = (
                '<?xml version="1.0"?>\n<gameList>\n'
                '  <game><path>./Sonic.sh</path><name>Sonic & Knuckles</name></game>\n'
                "</gameList>\n"
            )
            (ports1 / "gamelist.xml").write_text(malformed, encoding="utf-8")
            scraper_sync.sync_all(gamedir, version="2.0.8", extra_ports_dirs=[ports1])
            txt = (ports1 / "gamelist.xml").read_text(encoding="utf-8")
            self.assertIn("Sonic", txt)
            self.assertIn("KPlayer v2.0.8", txt)


if __name__ == "__main__":
    unittest.main()
