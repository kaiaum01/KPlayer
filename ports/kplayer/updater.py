#!/usr/bin/env python3
"""Safe atomic auto-updater for KPlayer R36S.

Checks the GitHub updates/latest.json channel for any version newer than the installed
one (e.g. 2.0.3 -> 2.0.4 -> ...), downloads the verified ZIP package, applies updated
binaries/assets while strictly preserving all user data and history, and signals
KPlayer.sh (exit code 42) to restart immediately.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.parse
import urllib.request
import zipfile

UA = "KPlayer-Updater/2.0.3"
ALLOWED_HOSTS = {
    "raw.githubusercontent.com",
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
}
MAX_PACKAGE_BYTES = 80 * 1024 * 1024

PRESERVE_PREFIXES = (
    "kplayer/iptv_usuario/",
    "kplayer/radios_usuario/",
    "kplayer/midias/",
    "kplayer/settings.cfg",
    "kplayer/preferences.cfg",
    "kplayer/history.txt",
    "kplayer/favorites.txt",
    "kplayer/log.txt",
)


def parse_semver(raw: str) -> tuple[int, int, int]:
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", raw or "")
    if not m:
        return (0, 0, 0)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)))


def is_allowed_update_url(url: str) -> bool:
    try:
        p = urllib.parse.urlparse(url.strip())
    except Exception:
        return False
    return p.scheme == "https" and (p.hostname or "").lower() in ALLOWED_HOSTS


def read_installed_version(gamedir: Path) -> str:
    for name in ("installed-version.txt", "app-version.txt"):
        p = gamedir / name
        if p.is_file():
            v = p.read_text(encoding="utf-8", errors="replace").strip()
            if re.fullmatch(r"\d+\.\d+\.\d+", v):
                return v
    return "2.0.3"


def read_repo_slug(gamedir: Path) -> str:
    env_repo = os.environ.get("KPLAYER_UPDATE_REPO", "").strip()
    if re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", env_repo):
        return env_repo
    cfg = gamedir / "update-repo.txt"
    if cfg.is_file():
        val = cfg.read_text(encoding="utf-8", errors="replace").strip()
        if re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", val):
            return val
    return ""


def fetch_manifest(gamedir: Path) -> dict[str, object] | None:
    repo = read_repo_slug(gamedir)
    if not repo:
        return None
    branch = os.environ.get("KPLAYER_UPDATE_BRANCH", "main").strip() or "main"
    url = f"https://raw.githubusercontent.com/{repo}/{branch}/updates/latest.json"
    if not is_allowed_update_url(url):
        return None
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=12) as resp:
        data = resp.read(256 * 1024)
    return json.loads(data.decode("utf-8"))


def check_update(gamedir: Path) -> dict[str, object]:
    current = read_installed_version(gamedir)
    try:
        manifest = fetch_manifest(gamedir)
    except Exception as exc:
        return {"currentVersion": current, "updateAvailable": False, "error": str(exc)}
    if not manifest:
        return {"currentVersion": current, "updateAvailable": False}
    latest = str(manifest.get("version") or current)
    available = parse_semver(latest) > parse_semver(current)
    return {
        "currentVersion": current,
        "latestVersion": latest,
        "updateAvailable": available,
        "notes": manifest.get("notes", []),
        "r36s": manifest.get("r36s", {}),
    }


def apply_update(gamedir: Path) -> int:
    ports_dir = gamedir.parent.resolve()
    info = check_update(gamedir)
    if not info.get("updateAvailable"):
        print("KPlayer ja esta na versao mais recente.")
        return 0
    r36s = info.get("r36s")
    if not isinstance(r36s, dict):
        print("Manifesto sem pacote R36S.")
        return 1
    pkg_url = str(r36s.get("url") or "").strip()
    expected_sha = str(r36s.get("sha256") or "").strip().lower()
    if not is_allowed_update_url(pkg_url):
        print("URL de atualizacao nao autorizada.")
        return 1

    with tempfile.TemporaryDirectory(prefix="kplayer-upd-") as tmp:
        tmp_dir = Path(tmp)
        zip_path = tmp_dir / "update.zip"
        req = urllib.request.Request(pkg_url, headers={"User-Agent": UA})
        hasher = hashlib.sha256()
        total = 0
        with urllib.request.urlopen(req, timeout=45) as resp, zip_path.open("wb") as out:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_PACKAGE_BYTES:
                    print("Pacote excede o limite permitido.")
                    return 1
                hasher.update(chunk)
                out.write(chunk)

        if expected_sha and hasher.hexdigest().lower() != expected_sha:
            print("Checksum SHA-256 invalido; atualizacao cancelada.")
            return 1

        with zipfile.ZipFile(zip_path) as zf:
            if zf.testzip() is not None:
                print("Arquivo ZIP corrompido; atualizacao cancelada.")
                return 1
            for member in zf.infolist():
                if member.is_dir():
                    continue
                norm = member.filename.replace("\\", "/").lstrip("/")
                if ".." in norm.split("/"):
                    continue
                if any(norm == p or norm.startswith(p) for p in PRESERVE_PREFIXES):
                    continue
                target = (ports_dir / norm).resolve()
                if not str(target).startswith(str(ports_dir) + os.sep):
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                tmp_target = target.with_name(target.name + ".upd")
                with zf.open(member) as src_f, tmp_target.open("wb") as dst_f:
                    shutil.copyfileobj(src_f, dst_f)
                mode = (member.external_attr >> 16) & 0o777
                if mode:
                    os.chmod(tmp_target, mode)
                os.replace(tmp_target, target)

    new_ver = str(info.get("latestVersion") or "")
    if new_ver:
        (gamedir / "installed-version.txt").write_text(new_ver + "\n", encoding="utf-8")
        (gamedir / "app-version.txt").write_text(new_ver + "\n", encoding="utf-8")
    print(f"Atualizado para v{new_ver} preservando dados e historico. Reiniciando...")
    return 42


def main() -> None:
    gamedir = Path(__file__).resolve().parent
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "check":
        print(json.dumps(check_update(gamedir), ensure_ascii=False))
        return
    if cmd == "apply":
        sys.exit(apply_update(gamedir))
    print("Uso: updater.py [check|apply]")
    sys.exit(2)


if __name__ == "__main__":
    main()
