#!/usr/bin/env python3
"""Scraper artwork, EmulationStation gamelist.xml merger, and versioned .sh launcher sync for KPlayer R36S.

Runs automatically on KPlayer startup and after every auto-update:
1. Updates/renames the launcher .sh in the active ports directory to `KPlayer v<VERSION>.sh`
   (and stamps KPLAYER_VERSION inside it), cleaning up older `KPlayer*.sh` launchers so
   EmulationStation never shows duplicate entries.
2. Safely merges complete KPlayer scraper metadata (cover image, boxart thumbnail, marquee
   logo, widescreen fanart, rating, genre, developer, release date, description) into
   `gamelist.xml` inside `/roms/ports`, `/roms2/ports`, and the active ports directory
   WITHOUT deleting or altering any existing ports/games. Creates `gamelist.xml` if absent.
3. Keeps standalone `kplayer/KPlayer-metadata.xml` and `kplayer/gamelist.xml` synchronized
   inside the `kplayer/` folder alongside `kplayer/scraper/`.
"""
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape
import argparse
import os
import re
import sys
import xml.etree.ElementTree as ET

DEFAULT_VERSION = "2.0.8"
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")
KPLAYER_SH_RE = re.compile(r"^KPlayer(?:\s+v?\d+\.\d+\.\d+)?\.sh$", re.IGNORECASE)
BARE_AMP_RE = re.compile(r"&(?!amp;|lt;|gt;|quot;|apos;|#[0-9]+;|#x[0-9a-fA-F]+;)")

DESCRIPTION_PT = (
    "Central de mídia portátil nativa para R36S (dArkOS / PortMaster) com interface "
    "moderna adaptativa. Reproduz músicas locais com letras sincronizadas (.LRC), "
    "equalizador e protetor de tela estilo Windows Media Player (30s), vídeos via "
    "libVLC ARM64, Rádio Online, IPTV ao vivo com EPG e pesquisa digitada, Clima "
    "Open-Meteo inteligente, Placar da Bola em tempo real e Auto-Update integrado."
)

RELEASE_DATE = "20261122T000000"


def detect_version(gamedir: Path, explicit: str | None = None) -> str:
    if explicit:
        v = explicit.strip().lstrip("vV")
        if SEMVER_RE.match(v):
            return v
    for fname in ("installed-version.txt", "app-version.txt"):
        p = gamedir / fname
        if p.is_file():
            txt = p.read_text(encoding="utf-8", errors="replace").strip().lstrip("vV")
            if SEMVER_RE.match(txt):
                return txt
    return DEFAULT_VERSION


def launcher_filename(version: str) -> str:
    return f"KPlayer v{version}.sh"


def stamp_sh_content(content: str, version: str) -> str:
    """Update the version comment and KPLAYER_VERSION variable inside a KPlayer .sh script."""
    if not content.strip():
        return content
    out = re.sub(
        r"^#\s*K\s*PLAYER(?:\s+v?\d+\.\d+\.\d+)?\b.*$",
        f"# KPlayer v{version} - dArkOS / Debian 13 ARM64 / PortMaster",
        content,
        count=1,
        flags=re.MULTILINE | re.IGNORECASE,
    )
    if re.search(r'^KPLAYER_VERSION="[^"]*"', out, flags=re.MULTILINE):
        out = re.sub(
            r'^KPLAYER_VERSION="[^"]*"',
            f'KPLAYER_VERSION="{version}"',
            out,
            count=1,
            flags=re.MULTILINE,
        )
    else:
        lines = out.splitlines(keepends=True)
        insert_at = 2 if len(lines) >= 2 and lines[0].startswith("#!") else (1 if lines and lines[0].startswith("#!") else 0)
        lines.insert(insert_at, f'KPLAYER_VERSION="{version}"\n')
        out = "".join(lines)
    return out


def sync_launcher_sh(ports_dir: Path, gamedir: Path, version: str) -> Path | None:
    """Ensure `KPlayer v<version>.sh` exists with updated version text and clean up old KPlayer*.sh launchers."""
    if not ports_dir.is_dir():
        return None
    target_name = launcher_filename(version)
    target_path = ports_dir / target_name

    # Find existing KPlayer launcher scripts in ports_dir
    existing_kplayer: list[Path] = []
    try:
        for entry in ports_dir.iterdir():
            if entry.is_file() and KPLAYER_SH_RE.match(entry.name):
                existing_kplayer.append(entry)
    except OSError:
        return None

    # Pick best source content: target itself -> newest existing KPlayer*.sh -> kplayer/KPlayer.sh.tmpl
    src_path: Path | None = None
    if target_path.is_file():
        src_path = target_path
    elif existing_kplayer:
        existing_kplayer.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        src_path = existing_kplayer[0]
    elif (gamedir / "KPlayer.sh.tmpl").is_file():
        src_path = gamedir / "KPlayer.sh.tmpl"

    if src_path is None:
        return None

    try:
        raw = src_path.read_text(encoding="utf-8", errors="replace")
        stamped = stamp_sh_content(raw, version)
        tmp = ports_dir / f".{target_name}.tmp"
        tmp.write_text(stamped, encoding="utf-8")
        os.chmod(tmp, 0o755)
        os.replace(tmp, target_path)
    except OSError:
        return None

    # Remove obsolete KPlayer.sh / KPlayer v<old>.sh launchers in the same ports_dir
    for old in existing_kplayer:
        if old.name != target_name:
            try:
                old.unlink()
            except OSError:
                pass

    return target_path


def build_metadata_fields(
    ports_dir: Path,
    gamedir: Path,
    version: str,
    use_relative_kplayer: bool | None = None,
) -> dict[str, str]:
    """Build complete EmulationStation / ScreenScraper metadata fields for KPlayer."""
    if use_relative_kplayer is None:
        use_relative_kplayer = (ports_dir / "kplayer" / "scraper").is_dir() or (
            ports_dir.resolve() == gamedir.parent.resolve()
        )

    sh_name = launcher_filename(version)
    if (ports_dir / sh_name).is_file():
        sh_path = f"./{sh_name}"
    elif (ports_dir / "KPlayer.sh").is_file():
        sh_path = "./KPlayer.sh"
    else:
        sh_path = f"./{sh_name}"

    if use_relative_kplayer:
        art_base = "./kplayer/scraper"
    else:
        art_base = str((gamedir / "scraper").resolve())

    return {
        "path": sh_path,
        "name": f"KPlayer v{version}",
        "sortname": "KPlayer",
        "desc": DESCRIPTION_PT,
        "image": f"{art_base}/kplayer-image.png",
        "thumbnail": f"{art_base}/kplayer-thumb.png",
        "marquee": f"{art_base}/kplayer-marquee.png",
        "fanart": f"{art_base}/kplayer-fanart.png",
        "rating": "1.0",
        "releasedate": RELEASE_DATE,
        "developer": "KPlayer Team",
        "publisher": "KPlayer R36S",
        "genre": "Multimídia / Media Player",
        "family": "KPlayer",
        "players": "1",
        "lang": "pt,en,es",
        "region": "br",
        "kidgame": "true",
    }


def is_kplayer_game_node(game_el: ET.Element) -> bool:
    path_text = (game_el.findtext("path") or "").strip()
    name_text = (game_el.findtext("name") or "").strip()
    if path_text:
        base = path_text.replace("\\", "/").rsplit("/", 1)[-1]
        if KPLAYER_SH_RE.match(base) or base.lower() == "kplayer.sh":
            return True
    if name_text.lower().startswith("kplayer"):
        return True
    return False


def apply_fields_to_game_element(game_el: ET.Element, fields: dict[str, str]) -> None:
    for tag, val in fields.items():
        child = game_el.find(tag)
        if child is None:
            child = ET.SubElement(game_el, tag)
        child.text = val


def indent_xml(elem: ET.Element, level: int = 0) -> None:
    """Pretty-print XML indentation compatible with Python 3.8+ (including older dArkOS Python)."""
    indent = "\n" + level * "  "
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = indent + "  "
        if not elem.tail or not elem.tail.strip():
            elem.tail = indent
        for child in elem:
            indent_xml(child, level + 1)
        if not elem[-1].tail or not elem[-1].tail.strip():
            elem[-1].tail = indent
    else:
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = indent


def render_game_block_xml(fields: dict[str, str], indent: str = "  ") -> str:
    lines = [f"{indent}<game>"]
    for tag, val in fields.items():
        lines.append(f"{indent}  <{tag}>{xml_escape(val)}</{tag}>")
    lines.append(f"{indent}</game>")
    return "\n".join(lines)


def merge_gamelist_text_fallback(raw: str, fields: dict[str, str]) -> str:
    """Fallback non-destructive merger if an existing gamelist.xml contains third-party XML syntax quirks."""
    block = render_game_block_xml(fields, indent="  ")
    game_re = re.compile(r"[ \t]*<game\b[^>]*>.*?</game>", re.DOTALL | re.IGNORECASE)
    replaced = False

    def _repl(match: re.Match[str]) -> str:
        nonlocal replaced
        chunk = match.group(0)
        if not replaced and re.search(
            r"<path>\s*(?:\./)?KPlayer(?:\s+v?\d+\.\d+\.\d+)?\.sh\s*</path>|<name>\s*KPlayer\b",
            chunk,
            re.IGNORECASE,
        ):
            replaced = True
            return block
        return chunk

    updated = game_re.sub(_repl, raw)
    if replaced:
        return updated

    close_re = re.compile(r"</gameList\s*>", re.IGNORECASE)
    if close_re.search(updated):
        return close_re.sub(block + "\n</gameList>", updated, count=1)

    # No closing tag found: append safely
    sep = "" if updated.endswith("\n") else "\n"
    return f"{updated}{sep}{block}\n</gameList>\n"


def sync_gamelist_file(
    gamelist_path: Path,
    ports_dir: Path,
    gamedir: Path,
    version: str,
    use_relative_kplayer: bool | None = None,
) -> bool:
    """Insert or update KPlayer metadata inside `gamelist_path` without erasing any existing entries."""
    fields = build_metadata_fields(ports_dir, gamedir, version, use_relative_kplayer)
    tmp_path = gamelist_path.with_name(".gamelist.xml.kplayer.tmp")

    try:
        gamelist_path.parent.mkdir(parents=True, exist_ok=True)
        if gamelist_path.is_file():
            raw = gamelist_path.read_text(encoding="utf-8", errors="replace")
            root: ET.Element | None = None
            if raw.strip():
                try:
                    root = ET.fromstring(raw)
                except ET.ParseError:
                    # Retry after escaping stray unescaped '&' commonly produced by scrapers
                    try:
                        root = ET.fromstring(BARE_AMP_RE.sub("&amp;", raw))
                    except ET.ParseError:
                        root = None

            if root is None and raw.strip():
                # Preserve 100% of original malformed XML via safe text-level insertion
                merged = merge_gamelist_text_fallback(raw, fields)
                tmp_path.write_text(merged, encoding="utf-8")
                os.replace(tmp_path, gamelist_path)
                return True

            if root is None:
                root = ET.Element("gameList")
        else:
            root = ET.Element("gameList")

        # Update existing KPlayer node in-place (and collapse any duplicate KPlayer entries only)
        matches = [el for el in list(root) if el.tag == "game" and is_kplayer_game_node(el)]
        if matches:
            apply_fields_to_game_element(matches[0], fields)
            for dup in matches[1:]:
                root.remove(dup)
        else:
            game_el = ET.SubElement(root, "game")
            apply_fields_to_game_element(game_el, fields)

        indent_xml(root)
        xml_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=True)
        tmp_path.write_bytes(xml_bytes + (b"" if xml_bytes.endswith(b"\n") else b"\n"))
        os.replace(tmp_path, gamelist_path)
        return True
    except OSError:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass
        return False


def write_kplayer_internal_metadata(gamedir: Path, version: str) -> None:
    """Keep `kplayer/KPlayer-metadata.xml` and `kplayer/gamelist.xml` up-to-date inside kplayer/."""
    fields = build_metadata_fields(gamedir.parent, gamedir, version, use_relative_kplayer=True)
    fields["path"] = f"./{launcher_filename(version)}"

    meta_header = (
        "<!--\n"
        f"  Metadados completos de scraper do KPlayer v{version} para EmulationStation / dArkOS (R36S).\n"
        "  Inserido automaticamente pelo KPlayer em /roms/ports/gamelist.xml e /roms2/ports/gamelist.xml\n"
        "  sem apagar seus outros jogos/ports.\n"
        "-->\n"
    )
    meta_xml = meta_header + render_game_block_xml(fields, indent="") + "\n"
    gamelist_xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<gameList>\n"
        + render_game_block_xml(fields, indent="  ")
        + "\n</gameList>\n"
    )

    for fname, content in (("KPlayer-metadata.xml", meta_xml), ("gamelist.xml", gamelist_xml)):
        target = gamedir / fname
        tmp = gamedir / f".{fname}.tmp"
        try:
            tmp.write_text(content, encoding="utf-8")
            os.replace(tmp, target)
        except OSError:
            try:
                tmp.unlink(missing_ok=True)
            except OSError:
                pass


def sync_all(
    gamedir: Path,
    version: str | None = None,
    extra_ports_dirs: list[Path] | None = None,
    sync_sh: bool = True,
) -> dict[str, object]:
    """Synchronize versioned .sh launcher, internal kplayer/ metadata, and gamelist.xml files."""
    gamedir = gamedir.resolve()
    ver = detect_version(gamedir, version)
    active_ports = gamedir.parent

    sh_updated: str | None = None
    if sync_sh:
        res_sh = sync_launcher_sh(active_ports, gamedir, ver)
        if res_sh is not None:
            sh_updated = str(res_sh)

    write_kplayer_internal_metadata(gamedir, ver)

    candidates: list[Path] = []
    if extra_ports_dirs is not None:
        candidates.extend(extra_ports_dirs)
    else:
        candidates.append(active_ports)
        for std in (Path("/roms/ports"), Path("/roms2/ports")):
            if std.is_dir():
                candidates.append(std)

    seen: set[Path] = set()
    synced_gamelists: list[str] = []
    for pdir in candidates:
        try:
            resolved = pdir.resolve()
        except OSError:
            continue
        if resolved in seen or not resolved.is_dir():
            continue
        seen.add(resolved)
        gl = resolved / "gamelist.xml"
        if sync_gamelist_file(gl, resolved, gamedir, ver):
            synced_gamelists.append(str(gl))

    return {
        "version": ver,
        "launcher": sh_updated,
        "gamelists": synced_gamelists,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="KPlayer R36S scraper & gamelist.xml sync")
    parser.add_argument("--version", default=None, help="Explicit KPlayer version (e.g. 2.0.8)")
    parser.add_argument(
        "--ports-dirs",
        default=None,
        help="Comma-separated list of ports directories to sync (overrides /roms/ports & /roms2/ports)",
    )
    parser.add_argument("--no-sh", action="store_true", help="Skip renaming/updating launcher .sh")
    args = parser.parse_args()

    gamedir = Path(__file__).resolve().parent
    extra: list[Path] | None = None
    if args.ports_dirs:
        extra = [Path(p.strip()) for p in args.ports_dirs.split(",") if p.strip()]

    sync_all(gamedir, version=args.version, extra_ports_dirs=extra, sync_sh=not args.no_sh)


if __name__ == "__main__":
    main()
