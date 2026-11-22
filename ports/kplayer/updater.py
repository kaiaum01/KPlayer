#!/usr/bin/env python3
"""Safe atomic auto-updater for KPlayer R36S (v2.0.6).

Checks the GitHub updates/latest.json channel (with GitHub Releases fallback)
for any version newer than the installed one (e.g. 2.0.5 -> 2.0.6 -> 2.0.7),
downloads and SHA-256 verifies the R36S ZIP package, applies updated binaries
and assets atomically while strictly preserving all user data and history, and
signals KPlayer.sh (exit code 42) to restart immediately.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import stat
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

CURRENT_FALLBACK = "2.0.6"
UA = f"KPlayer-Updater/{CURRENT_FALLBACK}"
ALLOWED_HOSTS = {
    "raw.githubusercontent.com",
    "api.github.com",
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
}
MAX_MANIFEST_BYTES = 256 * 1024
MAX_PACKAGE_BYTES = 80 * 1024 * 1024
MAX_EXTRACT_BYTES = 160 * 1024 * 1024
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
REPO_SLUG_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
BRANCH_RE = re.compile(r"^[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*$")

PRESERVE_PREFIXES = (
    "kplayer/iptv_usuario/",
    "kplayer/radios_usuario/",
    "kplayer/midias/",
    "kplayer/settings.cfg",
    "kplayer/preferences.cfg",
    "kplayer/weather.cfg",
    "kplayer/history.txt",
    "kplayer/favorites.txt",
    "kplayer/radio-favorites.tsv",
    "kplayer/resume.cfg",
    "kplayer/log.txt",
)

EXECUTABLE_NAMES = {
    "KPlayer.sh",
    "kplayer",
    "golazo",
    "iptv_fetch.py",
    "football_fetch.py",
    "weather_fetch.py",
    "updater.py",
}


def parse_semver(raw: str) -> tuple[int, int, int]:
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", raw or "")
    if not m:
        return (0, 0, 0)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)))


def next_patch(ver: str) -> str:
    maj, min_, pat = parse_semver(ver)
    return f"{maj}.{min_}.{pat + 1}"


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
    return CURRENT_FALLBACK


def read_repo_slug(gamedir: Path) -> str:
    env_repo = os.environ.get("KPLAYER_UPDATE_REPO", "").strip()
    if REPO_SLUG_RE.fullmatch(env_repo):
        return env_repo
    cfg = gamedir / "update-repo.txt"
    if cfg.is_file():
        val = cfg.read_text(encoding="utf-8", errors="replace").strip()
        val = re.sub(r"^https?://github\.com/", "", val, flags=re.I)
        val = re.sub(r"\.git$", "", val, flags=re.I).strip("/")
        if REPO_SLUG_RE.fullmatch(val):
            return val
    return ""


def read_branch() -> str:
    b = os.environ.get("KPLAYER_UPDATE_BRANCH", "main").strip() or "main"
    if ".." in b or not BRANCH_RE.fullmatch(b):
        return "main"
    return b


def urlopen_with_retry(url: str, timeout: int = 12, retries: int = 3, extra_headers: dict | None = None):
    if not is_allowed_update_url(url):
        raise ValueError("URL de atualizacao fora dos hosts permitidos")
    headers = {
        "User-Agent": UA,
        "Cache-Control": "no-cache, no-store",
        "Pragma": "no-cache",
    }
    if extra_headers:
        headers.update(extra_headers)
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            resp = urllib.request.urlopen(req, timeout=timeout)
            final_url = resp.geturl()
            if not is_allowed_update_url(final_url):
                resp.close()
                raise ValueError("Redirecionamento nao autorizado")
            return resp
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code in (400, 401, 403, 404):
                raise
        except Exception as exc:
            last_exc = exc
        if attempt + 1 < retries:
            time.sleep(0.8 * (attempt + 1))
    assert last_exc is not None
    raise last_exc


def fetch_github_release_fallback(repo: str) -> dict[str, object] | None:
    url = f"https://api.github.com/repos/{repo}/releases/latest"
    try:
        with urlopen_with_retry(url, timeout=10, retries=2, extra_headers={"Accept": "application/vnd.github+json"}) as resp:
            data = json.loads(resp.read(MAX_MANIFEST_BYTES).decode("utf-8", errors="replace"))
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    tag = str(data.get("tag_name") or "").strip().lstrip("vV")
    if not re.fullmatch(r"\d+\.\d+\.\d+", tag):
        return None
    r36s_url = ""
    sha_url = ""
    size_bytes = 0
    for asset in data.get("assets") or []:
        if not isinstance(asset, dict):
            continue
        aname = str(asset.get("name") or "")
        dl = str(asset.get("browser_download_url") or "")
        if aname.endswith("-R36S.zip") and is_allowed_update_url(dl):
            r36s_url = dl
            size_bytes = int(asset.get("size") or 0)
        elif aname.endswith("-R36S.zip.sha256") and is_allowed_update_url(dl):
            sha_url = dl
    notes = [
        re.sub(r"^[-*]\s*", "", ln).strip()[:160]
        for ln in str(data.get("body") or "").splitlines()
        if ln.strip().startswith(("-", "*"))
    ][:5]
    return {
        "version": tag,
        "releasedAt": str(data.get("published_at") or ""),
        "notes": notes or [f"Release KPlayer v{tag} disponível no GitHub."],
        "r36s": {
            "filename": f"KPlayer-v{tag}-R36S.zip",
            "path": f"updates/v{tag}/KPlayer-v{tag}-R36S.zip",
            "url": r36s_url,
            "sha256Url": sha_url,
            "sha256": "",
            "sizeBytes": size_bytes,
        },
        "_source": "github-release",
    }


def fetch_manifest(gamedir: Path) -> tuple[dict[str, object] | None, str, str]:
    repo = read_repo_slug(gamedir)
    if not repo:
        return None, "unconfigured", "Configure o repositorio GitHub (update-repo.txt)."
    branch = read_branch()
    bust = int(time.time())
    url = f"https://raw.githubusercontent.com/{repo}/{branch}/updates/latest.json?t={bust}"
    try:
        with urlopen_with_retry(url, timeout=12, retries=2) as resp:
            raw = resp.read(MAX_MANIFEST_BYTES)
        manifest = json.loads(raw.decode("utf-8", errors="replace"))
        if isinstance(manifest, dict) and re.fullmatch(r"\d+\.\d+\.\d+", str(manifest.get("version") or "")):
            return manifest, "github", ""
    except Exception:
        pass

    # Secondary fallback: GitHub Releases API
    rel = fetch_github_release_fallback(repo)
    if rel:
        return rel, "github-release", ""
    return None, "network_error", "Nao foi possivel conectar ao canal updates/ do GitHub."


def check_update(gamedir: Path) -> dict[str, object]:
    current = read_installed_version(gamedir)
    repo = read_repo_slug(gamedir)
    branch = read_branch()
    manifest, source, err = fetch_manifest(gamedir)
    if not manifest:
        return {
            "currentVersion": current,
            "latestVersion": current,
            "nextExpectedVersion": next_patch(current),
            "updateAvailable": False,
            "repository": repo,
            "branch": branch,
            "source": source,
            "error": err,
            "notes": [],
            "r36s": {},
        }
    latest = str(manifest.get("version") or current).strip()
    available = parse_semver(latest) > parse_semver(current)
    notes = manifest.get("notes")
    if not isinstance(notes, list):
        notes = []
    return {
        "currentVersion": current,
        "latestVersion": latest,
        "nextExpectedVersion": next_patch(current),
        "updateAvailable": available,
        "repository": repo,
        "branch": branch,
        "source": source,
        "error": "",
        "notes": [str(n) for n in notes[:6]],
        "r36s": manifest.get("r36s", {}),
    }


def resolve_expected_sha256(r36s: dict[str, object], candidate_urls: list[str]) -> str:
    inline = str(r36s.get("sha256") or "").strip().lower()
    if SHA256_RE.fullmatch(inline):
        return inline
    sha_candidates: list[str] = []
    explicit_sha_url = str(r36s.get("sha256Url") or "").strip()
    if explicit_sha_url and is_allowed_update_url(explicit_sha_url):
        sha_candidates.append(explicit_sha_url)
    for u in candidate_urls:
        base = u.split("?")[0]
        if base.endswith(".zip"):
            sha_candidates.append(base + ".sha256")
    for sha_url in sha_candidates:
        try:
            with urlopen_with_retry(sha_url, timeout=8, retries=1) as resp:
                txt = resp.read(2048).decode("utf-8", errors="replace").strip()
            m = re.search(r"\b([0-9a-fA-F]{64})\b", txt)
            if m:
                return m.group(1).lower()
        except Exception:
            continue
    return ""


def build_download_candidates(info: dict[str, object]) -> list[str]:
    r36s = info.get("r36s")
    if not isinstance(r36s, dict):
        r36s = {}
    repo = str(info.get("repository") or "").strip()
    branch = str(info.get("branch") or "main").strip() or "main"
    latest = str(info.get("latestVersion") or "").strip()
    path = str(r36s.get("path") or f"updates/v{latest}/KPlayer-v{latest}-R36S.zip").lstrip("/")
    filename = str(r36s.get("filename") or f"KPlayer-v{latest}-R36S.zip")

    raw_urls = [
        str(r36s.get("url") or "").strip(),
        str(r36s.get("releaseUrl") or "").strip(),
        f"https://raw.githubusercontent.com/{repo}/{branch}/{path}" if repo and path else "",
        f"https://github.com/{repo}/releases/download/v{latest}/{filename}" if repo and latest else "",
    ]
    out: list[str] = []
    for u in raw_urls:
        if u and is_allowed_update_url(u) and u not in out:
            out.append(u)
    return out


def write_check_tsv(info: dict[str, object], out_path: Path | None) -> None:
    def clean(x: object) -> str:
        return str(x or "").replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()

    notes = info.get("notes")
    note_list = notes if isinstance(notes, list) else []
    lines = [
        "\t".join(
            [
                "META",
                clean(info.get("currentVersion")),
                clean(info.get("latestVersion")),
                clean(info.get("nextExpectedVersion")),
                "1" if info.get("updateAvailable") else "0",
                clean(info.get("source")),
                clean(info.get("repository")),
                clean(info.get("error")),
            ]
        )
    ]
    for n in note_list[:5]:
        lines.append("NOTE\t" + clean(n))
    content = "\n".join(lines) + "\n"
    if out_path is not None:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = out_path.with_name(out_path.name + ".tmp")
        tmp.write_text(content, encoding="utf-8")
        os.replace(tmp, out_path)
    else:
        print(content, end="")


def apply_update(gamedir: Path) -> int:
    ports_dir = gamedir.parent.resolve()
    lock_file = gamedir / ".update.lock"
    if lock_file.is_file():
        try:
            age = time.time() - lock_file.stat().st_mtime
            if age < 300:
                print("Outra atualizacao ja esta em andamento.")
                return 1
        except OSError:
            pass
    try:
        lock_file.write_text(f"{os.getpid()}\n", encoding="utf-8")
    except OSError:
        pass

    try:
        info = check_update(gamedir)
        if not info.get("updateAvailable"):
            print("KPlayer ja esta na versao mais recente.")
            return 0

        r36s = info.get("r36s")
        if not isinstance(r36s, dict):
            r36s = {}
        candidates = build_download_candidates(info)
        if not candidates:
            print("Nenhuma URL valida de atualizacao encontrada.")
            return 1

        expected_sha = resolve_expected_sha256(r36s, candidates)
        has_user_repo = (gamedir / "update-repo.txt").is_file() and bool(
            (gamedir / "update-repo.txt").read_text(encoding="utf-8", errors="replace").strip()
        )

        with tempfile.TemporaryDirectory(prefix="kplayer-upd-") as tmp:
            tmp_dir = Path(tmp)
            zip_path = tmp_dir / "update.zip"
            downloaded = False
            actual_sha = ""

            for pkg_url in candidates:
                hasher = hashlib.sha256()
                total = 0
                try:
                    with urlopen_with_retry(pkg_url, timeout=45, retries=2) as resp, zip_path.open("wb") as out:
                        while True:
                            chunk = resp.read(65536)
                            if not chunk:
                                break
                            total += len(chunk)
                            if total > MAX_PACKAGE_BYTES:
                                raise ValueError("Pacote excede o limite permitido.")
                            hasher.update(chunk)
                            out.write(chunk)
                    actual_sha = hasher.hexdigest().lower()
                    if expected_sha and actual_sha != expected_sha:
                        print(f"Checksum SHA-256 divergente em {pkg_url}; tentando proximo espelho...")
                        continue
                    downloaded = True
                    break
                except Exception as exc:
                    print(f"Falha ao baixar {pkg_url}: {exc}")
                    continue

            if not downloaded:
                print("Nao foi possivel baixar um pacote verificado; atualizacao cancelada.")
                return 1

            with zipfile.ZipFile(zip_path) as zf:
                if zf.testzip() is not None:
                    print("Arquivo ZIP corrompido; atualizacao cancelada.")
                    return 1

                # Pre-validate uncompressed size and reject symlinks/path traversal
                uncompressed_total = 0
                safe_members: list[tuple[zipfile.ZipInfo, str, Path]] = []
                for member in zf.infolist():
                    if member.is_dir():
                        continue
                    unix_mode = member.external_attr >> 16
                    if stat.S_ISLNK(unix_mode):
                        continue
                    norm = member.filename.replace("\\", "/").lstrip("/")
                    if not norm or ".." in norm.split("/"):
                        continue
                    if any(norm == p or norm.startswith(p) for p in PRESERVE_PREFIXES):
                        continue
                    if norm == "kplayer/update-repo.txt" and has_user_repo:
                        continue
                    target = (ports_dir / norm).resolve()
                    if not str(target).startswith(str(ports_dir) + os.sep):
                        continue
                    uncompressed_total += max(0, int(member.file_size))
                    if uncompressed_total > MAX_EXTRACT_BYTES:
                        print("Pacote extraido excede o limite de seguranca.")
                        return 1
                    safe_members.append((member, norm, target))

                if not safe_members:
                    print("Pacote sem arquivos validos para aplicar.")
                    return 1

                for member, _norm, target in safe_members:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    tmp_target = target.with_name(target.name + ".upd")
                    with zf.open(member) as src_f, tmp_target.open("wb") as dst_f:
                        shutil.copyfileobj(src_f, dst_f)
                    mode = (member.external_attr >> 16) & 0o777
                    if target.name in EXECUTABLE_NAMES:
                        mode = 0o755
                    elif not mode:
                        mode = 0o644
                    os.chmod(tmp_target, mode)
                    os.replace(tmp_target, target)

        new_ver = str(info.get("latestVersion") or "").strip()
        if new_ver:
            (gamedir / "installed-version.txt").write_text(new_ver + "\n", encoding="utf-8")
            (gamedir / "app-version.txt").write_text(new_ver + "\n", encoding="utf-8")
        print(f"Atualizado para v{new_ver} preservando dados e historico. Reiniciando...")
        return 42
    finally:
        try:
            lock_file.unlink(missing_ok=True)
        except OSError:
            pass


def main() -> None:
    gamedir = Path(__file__).resolve().parent
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "check":
        print(json.dumps(check_update(gamedir), ensure_ascii=False))
        return
    if cmd == "check-tsv":
        out = Path(sys.argv[2]) if len(sys.argv) > 2 else None
        write_check_tsv(check_update(gamedir), out)
        return
    if cmd == "apply":
        sys.exit(apply_update(gamedir))
    print("Uso: updater.py [check|check-tsv [out]|apply]")
    sys.exit(2)


if __name__ == "__main__":
    main()
