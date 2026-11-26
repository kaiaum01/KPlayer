#!/usr/bin/env python3
"""Build the R36S install ZIP from an explicit runtime allowlist; no personal media.

v2.0.9+:
- Always ships the stable `KPlayer.sh` launcher (no spaces in filename, so
  EmulationStation/dArkOS never breaks across updates), with the updated
  `# KPlayer v<VERSION>` header and `KPLAYER_VERSION="<VERSION>"` stamped inside.
- Bundles high-resolution vinyl-disc scraper artwork inside `kplayer/scraper/`
  (transparent 1200x1200 Cover, transparent 1600x490 Marquee, 900x1200 Boxart,
  1920x1080 Fanart) without touching or modifying any user `gamelist.xml`.
"""
from pathlib import Path
import hashlib
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

launcher_src = BASE / "ports" / "KPlayer.sh"
if not launcher_src.is_file():
    raise SystemExit(f"Missing launcher script: {launcher_src}")

files = [
    BASE / "ports" / "images" / "KPlayer-image.png",
    runtime / "kplayer",
    runtime / "libkp_overlay.so",
    runtime / "kplayer.gptk",
    runtime / "cover.png",
    runtime / "scraper" / "kplayer-image.png",
    runtime / "scraper" / "kplayer-thumb.png",
    runtime / "scraper" / "kplayer-marquee.png",
    runtime / "scraper" / "kplayer-fanart.png",
    runtime / "iptv_fetch.py",
    runtime / "football_fetch.py",
    runtime / "weather_fetch.py",
    runtime / "news_fetch.py",
    runtime / "news.cfg.example",
    runtime / "file_ops.py",
    runtime / "bg_audio.py",
    runtime / "pdf_ops.py",
    runtime / "7zzs",
    runtime / "updater.py",
    runtime / "golazo",
    runtime / "fonts" / "Interface.ttf",
    runtime / "fonts" / "Bold.ttf",
    runtime / "sprites" / "botoes.png",
    runtime / "sprites" / "categorias.png",
    runtime / "sprites" / "controles.png",
    runtime / "sprites" / "README.txt",
    runtime / "lib" / "libvlc.so.5",
    runtime / "lib" / "libvlccore.so.9",
    runtime / "midias" / "README.txt",
    runtime / "iptv" / "README.txt",
    runtime / "iptv_usuario" / "README.txt",
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
if (runtime / "update-repo.txt").is_file():
    files.append(runtime / "update-repo.txt")

EXECUTABLE_NAMES = {
    "kplayer",
    "iptv_fetch.py",
    "football_fetch.py",
    "weather_fetch.py",
    "news_fetch.py",
    "file_ops.py",
    "bg_audio.py",
    "pdf_ops.py",
    "7zzs",
    "updater.py",
    "golazo",
}

for path in files:
    if not path.is_file():
        raise SystemExit(f"Missing runtime file: {path}")


def stamp_launcher_text(raw: str, ver: str) -> bytes:
    out = re.sub(
        r"^#\s*K\s*PLAYER(?:\s+v?\d+\.\d+\.\d+)?\b.*$",
        f"# KPlayer v{ver} - dArkOS / Debian 13 ARM64 / PortMaster",
        raw,
        count=1,
        flags=re.MULTILINE | re.IGNORECASE,
    )
    if re.search(r'^KPLAYER_VERSION="[^"]*"', out, flags=re.MULTILINE):
        out = re.sub(
            r'^KPLAYER_VERSION="[^"]*"',
            f'KPLAYER_VERSION="{ver}"',
            out,
            count=1,
            flags=re.MULTILINE,
        )
    return out.encode("utf-8")


with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as out:
    # Always write fixed `KPlayer.sh` (version stamped inside) so EmulationStation never loses the port
    launcher_arcname = "KPlayer.sh"
    launcher_bytes = stamp_launcher_text(launcher_src.read_text(encoding="utf-8"), VERSION)
    linfo = zipfile.ZipInfo(launcher_arcname)
    linfo.compress_type = zipfile.ZIP_DEFLATED
    linfo.external_attr = (0o100000 | 0o755) << 16
    out.writestr(linfo, launcher_bytes)

    # Also keep an internal template inside kplayer/ so updater.py can always refresh KPlayer.sh
    tinfo = zipfile.ZipInfo("kplayer/KPlayer.sh.tmpl")
    tinfo.compress_type = zipfile.ZIP_DEFLATED
    tinfo.external_attr = (0o100000 | 0o644) << 16
    out.writestr(tinfo, launcher_bytes)

    for path in files:
        arcname = path.relative_to(BASE / "ports").as_posix()
        info = zipfile.ZipInfo(arcname)
        info.compress_type = zipfile.ZIP_DEFLATED
        mode = 0o755 if path.name in EXECUTABLE_NAMES else 0o644
        info.external_attr = (0o100000 | mode) << 16
        out.writestr(info, path.read_bytes())

    out.write(BASE / "docs" / "INSTALL.md", "README_INSTALL.md")
    out.write(BASE / "TERMS.md", "TERMS.md")
    out.write(BASE / "LICENSE", "LICENSE")
    for vname in ("kplayer/installed-version.txt", "kplayer/app-version.txt"):
        vinfo = zipfile.ZipInfo(vname)
        vinfo.compress_type = zipfile.ZIP_DEFLATED
        vinfo.external_attr = (0o100000 | 0o644) << 16
        out.writestr(vinfo, (VERSION + "\n").encode("utf-8"))
    notes_file = BASE / "releases" / "RELEASE_NOTES.md"
    changelog_lines = []
    if notes_file.is_file():
        for raw in notes_file.read_text(encoding="utf-8", errors="ignore").splitlines():
            s = raw.strip()
            if s.startswith("- "):
                cleaned = re.sub(r"\*\*(.+?)\*\*", r"\1", s[2:].strip())
                cleaned = cleaned.replace("`", "")
                if cleaned:
                    changelog_lines.append(cleaned)
    if not changelog_lines:
        changelog_lines = [
            f"K PLAYER v{VERSION} instalado com sucesso no R36S.",
            "Todas as suas configurações, favoritos e mídias foram preservados.",
        ]
    cinfo = zipfile.ZipInfo("kplayer/changelog.txt")
    cinfo.compress_type = zipfile.ZIP_DEFLATED
    cinfo.external_attr = (0o100000 | 0o644) << 16
    out.writestr(cinfo, ("\n".join(changelog_lines[:8]) + "\n").encode("utf-8"))
    out.writestr(
        "SOURCE.txt",
        (
            f"KPlayer v{VERSION} — corresponding source\n"
            "The source is distributed in this release's repository/tag.\n"
            "Download the repository source archive for the same tag.\n"
            "It includes source/, tests/, upstream/vlc-3.0.23.tar.xz,\n"
            "patches/kplayer-vlc.patch, build.sh and all component notices.\n"
            "Original interface code: GPL-2.0-or-later. See LICENSE and kplayer/licencas/.\n"
        ).encode("utf-8"),
    )

with zipfile.ZipFile(archive) as check:
    if check.testzip() is not None:
        raise SystemExit("Install ZIP integrity check failed")

checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(archive.suffix + ".sha256").write_text(
    f"{checksum}  {archive.name}\n", encoding="utf-8"
)
print(f"Created {archive.name}: {archive.stat().st_size} bytes (sha256: {checksum[:16]}...)")
