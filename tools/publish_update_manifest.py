#!/usr/bin/env python3
"""Publish the current KPlayer R36S version into updates/latest.json,
updates/history.json, and updates/v<VERSION>/ for seamless auto-updates from GitHub.
"""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import re
import shutil

BASE = Path(__file__).resolve().parents[1]
VERSION_H = BASE / "source" / "version.h"
UPDATES_DIR = BASE / "updates"
RELEASES_DIR = BASE / "releases"


def read_version() -> str:
    text = VERSION_H.read_text(encoding="utf-8")
    m = re.search(r'^#define KPLAYER_VERSION "(\d+\.\d+\.\d+)"$', text, re.M)
    if not m:
        raise SystemExit("Valid KPLAYER_VERSION not found in source/version.h")
    return m.group(1)


def bump_patch(version: str) -> str:
    major, minor, patch = (int(x) for x in version.split("."))
    return f"{major}.{minor}.{patch + 1}"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def extract_notes(version: str) -> list[str]:
    notes_file = RELEASES_DIR / "RELEASE_NOTES.md"
    if not notes_file.is_file():
        return [f"Atualização KPlayer R36S v{version} com melhorias gerais e preservação de dados."]
    raw_text = notes_file.read_text(encoding="utf-8", errors="replace")
    # Prefer section matching current version if multiple sections exist
    target_block = raw_text
    sec_re = re.compile(rf"^##\s+.*v{re.escape(version)}\b.*$", re.M | re.I)
    m = sec_re.search(raw_text)
    if m:
        rest = raw_text[m.end():]
        nxt = re.search(r"^##\s+", rest, re.M)
        target_block = rest[: nxt.start()] if nxt else rest

    lines: list[str] = []
    for raw in target_block.splitlines():
        s = raw.strip()
        if s.startswith("- ") or s.startswith("* "):
            clean = re.sub(r"\*\*([^*]+)\*\*", r"\1", s[2:]).strip()
            clean = re.sub(r"`([^`]+)`", r"\1", clean)
            if clean:
                lines.append(clean[:180])
        if len(lines) >= 6:
            break
    return lines or [f"Nova versão KPlayer R36S v{version} disponível."]


def main() -> None:
    version = read_version()
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    branch = os.environ.get("KPLAYER_UPDATE_BRANCH", "main").strip() or "main"

    UPDATES_DIR.mkdir(parents=True, exist_ok=True)
    ver_dir = UPDATES_DIR / f"v{version}"
    ver_dir.mkdir(parents=True, exist_ok=True)

    raw_base = f"https://raw.githubusercontent.com/{repo}/{branch}" if repo else ""
    rel_base = f"https://github.com/{repo}/releases/download/v{version}" if repo else ""
    rel_page = f"https://github.com/{repo}/releases/tag/v{version}" if repo else ""

    def stage_artifact(filename: str) -> dict[str, object]:
        src = RELEASES_DIR / filename
        dst = ver_dir / filename
        rel_path = f"updates/v{version}/{filename}"
        sha = ""
        size = 0
        if src.is_file():
            size = src.stat().st_size
            sha = sha256_file(src)
            # Keep packages <= 45 MB directly inside updates/vX.Y.Z/ on GitHub
            if size <= 45 * 1024 * 1024:
                shutil.copy2(src, dst)
                (ver_dir / f"{filename}.sha256").write_text(
                    f"{sha}  {filename}\n", encoding="utf-8"
                )
        elif dst.is_file():
            size = dst.stat().st_size
            sha = sha256_file(dst)

        raw_url = f"{raw_base}/{rel_path}" if (dst.is_file() and raw_base) else ""
        release_url = f"{rel_base}/{filename}" if rel_base else ""
        primary_url = raw_url or release_url
        sha_url = (
            f"{raw_base}/{rel_path}.sha256"
            if (ver_dir / f"{filename}.sha256").is_file() and raw_base
            else (f"{rel_base}/{filename}.sha256" if rel_base else "")
        )

        return {
            "filename": filename,
            "path": rel_path,
            "url": primary_url,
            "releaseUrl": release_url,
            "sha256Url": sha_url,
            "sha256": sha,
            "sizeBytes": size,
        }

    r36s_info = stage_artifact(f"KPlayer-v{version}-R36S.zip")
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    notes = extract_notes(version)

    latest = {
        "schemaVersion": 2,
        "version": version,
        "nextVersion": bump_patch(version),
        "channel": "stable",
        "platform": "r36s",
        "releaseTag": f"v{version}",
        "releasePageUrl": rel_page,
        "releasedAt": now_iso,
        "repository": repo,
        "branch": branch,
        "updatesDir": "updates",
        "preserveUserPaths": [
            "iptv_usuario/",
            "radios_usuario/",
            "midias/",
            "settings.cfg",
            "preferences.cfg",
            "weather.cfg",
            "news.cfg",
            "gamelist.xml",
            "history.txt",
            "favorites.txt",
            "radio-favorites.tsv",
            "resume.cfg",
        ],
        "notes": notes,
        "r36s": r36s_info,
        "web": {
            "version": version,
            "reloadRequired": True,
        },
    }

    (UPDATES_DIR / "latest.json").write_text(
        json.dumps(latest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    hist_path = UPDATES_DIR / "history.json"
    history_entries: list[dict[str, object]] = []
    if hist_path.is_file():
        try:
            old = json.loads(hist_path.read_text(encoding="utf-8"))
            if isinstance(old.get("releases"), list):
                history_entries = [e for e in old["releases"] if e.get("version") != version]
        except Exception:
            history_entries = []

    history_entries.insert(
        0,
        {
            "version": version,
            "releaseTag": f"v{version}",
            "releasedAt": now_iso,
            "r36s": r36s_info["path"],
            "sha256": r36s_info["sha256"],
            "notes": notes,
        },
    )
    hist_path.write_text(
        json.dumps(
            {"schemaVersion": 2, "latest": version, "releases": history_entries[:30]},
            indent=2,
            ensure_ascii=False,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Published KPlayer R36S v{version} auto-update manifest into updates/latest.json")


if __name__ == "__main__":
    main()
