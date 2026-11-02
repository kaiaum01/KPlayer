#!/usr/bin/env python3
"""KPlayer updater: explicit file allowlist, backups, and no shell execution."""
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import shutil
import stat
import sys
import tempfile
import urllib.request
import zipfile

REPO = "kaiaum01/KPLAYER-v1.0.0"
API = "https://api.github.com/repos/" + REPO + "/releases/latest"
GAME = Path(__file__).resolve().parent
PORTS = GAME.parent
VERSION = GAME / "installed-version.txt"
ALLOWED = ("kplayer/kplayer", "kplayer/kplayer.gptk",
           "kplayer/lib/libvlc.so.5", "kplayer/lib/libvlccore.so.9",
           "kplayer/fonts/Interface.ttf", "kplayer/fonts/Bold.ttf")
MAX_DOWNLOAD = 32 * 1024 * 1024
JOURNAL = ".kplayer-update-transaction.json"


class UpdateCancelled(Exception):
    pass


def cancel_update(signum, frame):
    del signum, frame
    raise UpdateCancelled("Atualização cancelada ou tempo limite atingido")


class HTTPSOnly(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not newurl.startswith("https://"):
            raise ValueError("Redirecionamento inseguro")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def get(url, limit):
    if not url.startswith("https://"):
        raise ValueError("Endereço inseguro")
    req = urllib.request.Request(url, headers={"User-Agent": "KPlayer/1.0.0",
                                               "Accept": "application/vnd.github+json"})
    with urllib.request.build_opener(HTTPSOnly()).open(req, timeout=15) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("Download excedeu o limite")
    return data


def version(value):
    match = re.fullmatch(r"v?(\d+)\.(\d+)\.(\d+)", value)
    if not match:
        raise ValueError("Versão inválida")
    return tuple(map(int, match.groups()))


def release_info(release, installed):
    tag = release.get("tag_name", "")
    if release.get("draft") or release.get("prerelease") or version(tag) <= version(installed):
        return None
    tag = "v" + ".".join(str(x) for x in version(tag))
    name = "KPlayer-" + tag + "-R36S.zip"
    assets = release.get("assets", [])
    if not isinstance(assets, list):
        raise ValueError("Lista de assets inválida")
    out = {}
    for suffix in ("", ".sha256"):
        matches = [a for a in assets if isinstance(a, dict) and a.get("name") == name + suffix]
        if len(matches) != 1:
            raise ValueError("Pacote ou checksum ausente")
        url = matches[0].get("browser_download_url", "")
        expected = "https://github.com/" + REPO + "/releases/download/" + tag + "/" + name + suffix
        if url != expected:
            raise ValueError("Endereço do pacote inesperado")
        out[suffix] = url
    return tag, out


def get_release(installed):
    return release_info(json.loads(get(API, 1024 * 1024)), installed)


def validate_archive(blob, checksum, tag):
    if not re.fullmatch(r"[0-9a-fA-F]{64}", checksum):
        raise ValueError("Checksum inválido")
    if hashlib.sha256(blob).hexdigest() != checksum.lower():
        raise ValueError("Checksum não confere")
    result = {}
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        entries = z.infolist()
        if len(entries) > 200 or sum(e.file_size for e in entries) > 64 * 1024 * 1024:
            raise ValueError("Pacote grande demais")
        seen = set()
        for entry in entries:
            name = entry.filename
            if (name.startswith("/") or "\\" in name or ".." in PurePosixPath(name).parts
                    or name in seen or stat.S_ISLNK(entry.external_attr >> 16)):
                raise ValueError("Caminho inseguro")
            seen.add(name)
            if name in ALLOWED:
                if entry.is_dir():
                    raise ValueError("Entrada inválida")
                result[name] = z.read(entry)
        if set(result) != set(ALLOWED) or z.testzip() is not None:
            raise ValueError("Pacote incompleto ou corrompido")
        try:
            manifest_info = z.getinfo("kplayer/update-manifest.json")
            if manifest_info.file_size > 4096:
                raise ValueError("Manifesto muito grande")
            manifest = json.loads(z.read(manifest_info))
        except (KeyError, json.JSONDecodeError) as exc:
            raise ValueError("Manifesto de atualização ausente ou inválido") from exc
        if (manifest.get("schema") != 1 or version(manifest.get("version", "")) != version(tag)
                or manifest.get("update_files") != list(ALLOWED)):
            raise ValueError("Manifesto incompatível")
    exe = result["kplayer/kplayer"]
    if len(exe) < 64 or exe[:6] != b"\x7fELF\x02\x01" or exe[18:20] != b"\xb7\x00":
        raise ValueError("Executável não é ARM64")
    return result


def sync_dir(path):
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def sync_file(path):
    with open(path, "rb") as f:
        os.fsync(f.fileno())


def recover_transaction(ports):
    """Idempotently restore a fully prepared backup; never consume it."""
    ports = Path(ports)
    journal = ports / "kplayer" / JOURNAL
    if journal.is_symlink():
        raise ValueError("Registro de atualização é link simbólico")
    if not journal.exists():
        return False
    if journal.stat().st_size > 2048:
        raise ValueError("Registro de atualização inválido")
    data = json.loads(journal.read_text(encoding="utf-8"))
    name = data.get("backup", "")
    if not isinstance(name, str) or not re.fullmatch(r"\.kplayer-backup-[a-z0-9_]{8}", name):
        raise ValueError("Nome de backup inválido")
    if type(data.get("version_exists")) is not bool:
        raise ValueError("Registro de versão inválido")
    backup = ports / name
    if backup.is_symlink() or not backup.is_dir():
        raise ValueError("Backup indisponível")
    paths = list(ALLOWED) + (["kplayer/installed-version.txt"] if data["version_exists"] else [])
    for path in paths:
        source = backup / path
        target = ports / path
        if any(p.is_symlink() for p in (source, source.parent, source.parent.parent,
                                        target, target.parent, target.parent.parent)):
            raise ValueError("Caminho da restauração contém link simbólico")
        if not source.is_file() or not target.parent.is_dir():
            raise ValueError("Backup incompleto")
    for path in paths:
        target = ports / path
        fd, temp = tempfile.mkstemp(prefix=".kplayer-restore-", dir=target.parent)
        os.close(fd)
        try:
            shutil.copy2(backup / path, temp)
            sync_file(temp)
            os.replace(temp, target)
            sync_dir(target.parent)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)
    version_path = ports / "kplayer/installed-version.txt"
    if not data["version_exists"]:
        if version_path.is_symlink():
            raise ValueError("Arquivo de versão é link simbólico")
        version_path.unlink(missing_ok=True)
        sync_dir(version_path.parent)
    journal.unlink()
    sync_dir(journal.parent)
    return True


def install_files(files, tag, ports):
    # Only known application files; never touch user media, preferences or radios.
    ports = Path(ports)
    if (ports / "kplayer" / JOURNAL).exists():
        raise ValueError("Há uma atualização interrompida; restaure antes de continuar")
    for name in ALLOWED:
        path = ports / name
        if any(part.is_symlink() for part in (path, path.parent, path.parent.parent)):
            raise ValueError("Caminho de destino contém link simbólico")
        if not path.is_file():
            raise ValueError("Instalação incompleta")
    backup = Path(tempfile.mkdtemp(prefix=".kplayer-backup-", dir=ports))
    staged = Path(tempfile.mkdtemp(prefix=".kplayer-stage-", dir=ports))
    replaced = []
    version_path = ports / "kplayer" / "installed-version.txt"
    if version_path.is_symlink():
        raise ValueError("Arquivo de versão é link simbólico")
    old_version = version_path.read_bytes() if version_path.exists() else None
    version_touched = False
    journal = ports / "kplayer" / JOURNAL
    journal_written = False
    try:
        for name in ALLOWED:
            target = ports / name
            destination = staged / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(files[name])
            os.chmod(destination, target.stat().st_mode & 0o777)
            backup_file = backup / name
            backup_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, backup_file)
            sync_file(destination)
            sync_file(backup_file)
            sync_dir(backup_file.parent)
        if old_version is not None:
            old_version_file = backup / "kplayer/installed-version.txt"
            old_version_file.write_bytes(old_version)
            sync_file(old_version_file)
        sync_dir(backup / "kplayer")
        sync_dir(backup)
        sync_dir(ports)
        marker_temp = staged / "journal.json"
        marker_temp.write_text(json.dumps({"backup": backup.name, "version_exists": old_version is not None}), encoding="utf-8")
        sync_file(marker_temp)
        # Mark as prepared before renaming: cancellation can happen immediately after it.
        journal_written = True
        os.replace(marker_temp, journal)
        sync_dir(journal.parent)
        for name in ALLOWED:
            replaced.append(name)
            os.replace(staged / name, ports / name)
            sync_dir((ports / name).parent)
        temp_version = staged / "installed-version.txt"
        temp_version.write_text(tag + "\n", encoding="ascii")
        sync_file(temp_version)
        version_touched = True
        os.replace(temp_version, version_path)
        sync_dir(version_path.parent)
        journal.unlink()
        sync_dir(journal.parent)
        journal_written = False
    except BaseException:
        # Do not let a second cancellation interrupt the rollback.
        previous_handler = signal.getsignal(signal.SIGTERM)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        try:
            if journal_written and journal.exists():
                recover_transaction(ports)
        finally:
            signal.signal(signal.SIGTERM, previous_handler)
        raise
    finally:
        shutil.rmtree(staged, ignore_errors=True)
    return backup


def main():
    try:
        if len(sys.argv) == 2 and sys.argv[1] == "recover":
            print("RECOVERED" if recover_transaction(PORTS) else "NO_TRANSACTION")
            return 0
        installed = VERSION.read_text(encoding="ascii").strip() if VERSION.exists() else "1.0.0"
        found = get_release(installed)
        if not found:
            print("LATEST")
            return 0
        tag, urls = found
        if len(sys.argv) == 1 or sys.argv[1] == "check":
            print("NEW " + tag)
            return 0
        if sys.argv[1] != "install" or len(sys.argv) != 3 or sys.argv[2] != tag:
            raise ValueError("A release mudou; verifique novamente")
        checksum_data = get(urls[".sha256"], 4096).decode("ascii").strip()
        expected_name = "KPlayer-" + tag + "-R36S.zip"
        match = re.fullmatch(r"([0-9a-fA-F]{64})\s+\*?([^\s]+)", checksum_data)
        if not match or match.group(2) != expected_name:
            raise ValueError("Checksum não corresponde ao pacote")
        payload = get(urls[""], MAX_DOWNLOAD)
        files = validate_archive(payload, match.group(1), tag)
        install_files(files, tag, PORTS)
        print("OK " + tag)
        return 0
    except Exception as exc:
        print("ERROR", file=sys.stdout)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, cancel_update)
    raise SystemExit(main())
