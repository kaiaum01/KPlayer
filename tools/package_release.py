#!/usr/bin/env python3
"""Build the install ZIP from an explicit runtime allowlist; no personal media."""
from pathlib import Path
import hashlib
import json
import os
import re
import zipfile

BASE = Path(__file__).resolve().parents[1]
version_header = (BASE / "source/version.h").read_text(encoding="utf-8")
match = re.search(r'^#define KPLAYER_VERSION "(\d+\.\d+\.\d+)"$', version_header, re.M)
if not match:
    raise SystemExit("source/version.h has no valid KPLAYER_VERSION")
VERSION = match.group(1)
requested = (os.environ.get("KPLAYER_VERSION") or VERSION).removeprefix("v")
if requested != VERSION:
    raise SystemExit(f"Tag version {requested} differs from source/version.h ({VERSION})")
if not re.fullmatch(r"\d+\.\d+\.\d+", VERSION):
    raise SystemExit("KPLAYER_VERSION must be X.Y.Z or vX.Y.Z")
release = BASE / "releases"
release.mkdir(exist_ok=True)
archive = release / f"KPlayer-v{VERSION}-R36S.zip"
runtime = BASE / "ports" / "kplayer"
files = [
    BASE / "ports" / "KPlayer.sh",
    runtime / "kplayer", runtime / "kplayer.gptk",
    runtime / "updater.py", runtime / "football_fetch.py", runtime / "golazo",
    runtime / "fonts" / "Interface.ttf", runtime / "fonts" / "Bold.ttf",
    runtime / "lib" / "libvlc.so.5", runtime / "lib" / "libvlccore.so.9",
    runtime / "midias" / "README.txt",
    runtime / "iptv" / "README.txt",
    runtime / "radios_usuario" / "README.txt",
    runtime / "radios_usuario" / "Radio_Ilha_107_1.pls",
    runtime / "radios_usuario" / "Radio Massa.pls",
    runtime / "radios_usuario" / "Aline FM.pls",
    runtime / "radios_usuario" / "Web Radio Capital da Amizade.pls",
    runtime / "radios_usuario" / "Amizade FM.pls",
    runtime / "radios_usuario" / "Abdala FM.pls",
    runtime / "radios_usuario" / "Ilustrada FM 102.3.pls",
]
files += sorted((runtime / "licencas").glob("*.txt"))
for path in files:
    if not path.is_file():
        raise SystemExit(f"Missing runtime file: {path}")
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as out:
    for path in files:
        out.write(path, path.relative_to(BASE / "ports").as_posix())
    out.write(BASE / "docs" / "INSTALL.md", "README_INSTALL.md")
    out.write(BASE / "LICENSE", "LICENSE")
    out.writestr("kplayer/installed-version.txt", VERSION + "\n")
    out.writestr("kplayer/app-version.txt", VERSION + "\n")
    out.writestr("kplayer/update-manifest.json", json.dumps({
        "schema": 1, "version": VERSION,
        "update_files": ["kplayer/kplayer", "kplayer/kplayer.gptk",
                         "kplayer/lib/libvlc.so.5", "kplayer/lib/libvlccore.so.9",
                         "kplayer/fonts/Interface.ttf", "kplayer/fonts/Bold.ttf"],
    }))
    out.writestr("SOURCE.txt", (
        f"KPlayer v{VERSION} — corresponding source\n"
        "The source is distributed in this release's repository/tag.\n"
        "Download the repository source archive for the same tag.\n"
        "It includes source/, tests/, upstream/vlc-3.0.23.tar.xz,\n"
        "patches/kplayer-vlc.patch, build.sh and all component notices.\n"
        "Original interface code: GPL-2.0-or-later. See LICENSE and kplayer/licencas/.\n"
    ).encode("utf-8"))
with zipfile.ZipFile(archive) as check:
    if check.testzip() is not None:
        raise SystemExit("Install ZIP integrity check failed")
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(archive.suffix + ".sha256").write_text(
    f"{checksum}  {archive.name}\n", encoding="utf-8"
)
print(f"Created {archive.name}: {archive.stat().st_size} bytes")
