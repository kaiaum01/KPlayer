#!/usr/bin/env python3
"""System diagnostics & safe settings backup/restore for KPlayer R36S (v2.1.7+).

Subcommands:
  - diagnostics [--gamedir PATH]
  - backup [--gamedir PATH] [--out PATH]
  - restore [--gamedir PATH] [--zip PATH]
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import shutil
import socket
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

try:
    import bg_audio
    import system_inject
except Exception:
    bg_audio = None  # type: ignore
    system_inject = None  # type: ignore

BACKUP_FILES = (
    "settings.cfg",
    "favorites.cfg",
    "resume.cfg",
    "watch_history.cfg",
    "iptv_favorites.cfg",
    "radio-favorites.tsv",
    "weather.cfg",
    "system-audio.json",
)

BACKUP_DIRS = (
    "playlists",
    "radios_usuario",
    "iptv_usuario",
)

MAX_RESTORE_FILE_BYTES = 20 * 1024 * 1024  # 20 MiB per entry
MAX_RESTORE_FILES = 512


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore").strip()
    except OSError:
        return ""


def read_battery_info() -> dict[str, Any]:
    base = Path("/sys/class/power_supply")
    if base.is_dir():
        for name in ("battery", "BAT0", "BAT1", "rk817-battery", "axp20x-battery"):
            cand = base / name
            cap_file = cand / "capacity"
            if cap_file.is_file():
                raw = _read_text(cap_file)
                status = _read_text(cand / "status") or "Unknown"
                try:
                    return {"percent": max(0, min(100, int(raw))), "status": status}
                except ValueError:
                    pass
        for cand in sorted(base.iterdir()):
            cap_file = cand / "capacity"
            if cap_file.is_file():
                raw = _read_text(cap_file)
                status = _read_text(cand / "status") or "Unknown"
                try:
                    return {"percent": max(0, min(100, int(raw))), "status": status}
                except ValueError:
                    pass
    return {"percent": -1, "status": "Indisponível"}


def read_cpu_temp_c() -> float | None:
    for p in (
        Path("/sys/class/thermal/thermal_zone0/temp"),
        Path("/sys/class/thermal/thermal_zone1/temp"),
    ):
        raw = _read_text(p)
        if raw:
            try:
                val = int(raw)
                return round(val / 1000.0 if val > 200 else float(val), 1)
            except ValueError:
                pass
    return None


def detect_lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127."):
                return ip
    except OSError:
        pass
    return "Offline"


def detect_wifi_ssid() -> str:
    if shutil.which("iwgetid"):
        try:
            cp = subprocess.run(
                ["iwgetid", "-r"],
                capture_output=True,
                text=True,
                timeout=2,
                check=False,
            )
            if cp.returncode == 0 and cp.stdout.strip():
                return cp.stdout.strip()[:48]
        except OSError:
            pass
    return ""


def disk_usage_gb(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        du = shutil.disk_usage(path)
        return {
            "path": str(path),
            "free_gb": round(du.free / (1024 ** 3), 2),
            "total_gb": round(du.total / (1024 ** 3), 2),
        }
    except OSError:
        return None


def collect_diagnostics(gamedir: Path) -> dict[str, Any]:
    audio_backend = "alsa"
    if bg_audio is not None:
        audio_backend = bg_audio.detect_audio_backend(os.environ)
    alsa_hw = bg_audio.detect_alsa_hw_device() if bg_audio is not None else "hw:0,0"

    # Distinguish PipeWire vs PulseAudio if sockets exist
    audio_label = f"ALSA ({alsa_hw})"
    if Path("/run/user").is_dir():
        for p in sorted(Path("/run/user").glob("*/pipewire-0")):
            if p.is_socket():
                audio_label = f"PipeWire + ALSA ({alsa_hw})"
                break
        else:
            for p in sorted(Path("/run/user").glob("*/pulse/native")):
                if p.is_socket():
                    audio_label = f"PulseAudio + ALSA ({alsa_hw})"
                    break
    elif audio_backend == "pulse":
        audio_label = "PulseAudio"

    mini_status: dict[str, Any] = {"installed": False, "daemon_running": False, "tracks_count": 0}
    if system_inject is not None:
        try:
            mini_status = system_inject.get_status(gamedir, check_live_procs=True)
        except Exception:
            pass

    disks: list[dict[str, Any]] = []
    seen_devs: set[int] = set()
    for p in (Path("/roms"), Path("/roms2"), Path("/")):
        if p.exists():
            try:
                dev = os.stat(p).st_dev
            except OSError:
                continue
            if dev in seen_devs and p != Path("/"):
                continue
            seen_devs.add(dev)
            info = disk_usage_gb(p)
            if info:
                disks.append(info)

    return {
        "ok": True,
        "miniplayer_installed": bool(mini_status.get("installed")),
        "miniplayer_running": bool(mini_status.get("daemon_running")),
        "miniplayer_tracks": int(mini_status.get("tracks_count", 0)),
        "audio": audio_label,
        "ip": detect_lan_ip(),
        "ssid": detect_wifi_ssid(),
        "battery": read_battery_info(),
        "cpu_temp_c": read_cpu_temp_c(),
        "disks": disks,
    }


def create_backup(gamedir: Path, out_zip: Path | None = None) -> dict[str, Any]:
    gdir = gamedir.resolve()
    backups_dir = gdir / "backups"
    backups_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    target = out_zip.resolve() if out_zip else (backups_dir / f"kplayer-backup-{stamp}.zip")
    target.parent.mkdir(parents=True, exist_ok=True)

    tmp_zip = target.with_suffix(".zip.tmp")
    files_added = 0
    with zipfile.ZipFile(tmp_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for fname in BACKUP_FILES:
            src = gdir / fname
            if src.is_file() and not src.is_symlink():
                zf.write(src, arcname=fname)
                files_added += 1
        for dname in BACKUP_DIRS:
            dpath = gdir / dname
            if not dpath.is_dir() or dpath.is_symlink():
                continue
            for item in sorted(dpath.rglob("*")):
                if not item.is_file() or item.is_symlink():
                    continue
                rel = item.relative_to(gdir).as_posix()
                zf.write(item, arcname=rel)
                files_added += 1
    os.replace(tmp_zip, target)

    # Also keep a convenient copy at backups/kplayer-backup-latest.zip
    latest = backups_dir / "kplayer-backup-latest.zip"
    if target != latest:
        try:
            shutil.copy2(target, latest)
        except OSError:
            pass

    return {
        "ok": True,
        "zip_path": str(target),
        "files_count": files_added,
        "size_bytes": target.stat().st_size if target.is_file() else 0,
    }


def _is_allowed_backup_member(name: str) -> bool:
    if not name or name.startswith("/") or "\\" in name:
        return False
    parts = Path(name).parts
    if not parts or any(p in {"", ".", ".."} for p in parts):
        return False
    if len(parts) == 1:
        return parts[0] in BACKUP_FILES
    return parts[0] in BACKUP_DIRS


def find_latest_backup(gamedir: Path) -> Path | None:
    backups_dir = gamedir.resolve() / "backups"
    if not backups_dir.is_dir():
        return None
    zips = sorted(
        (p for p in backups_dir.glob("kplayer-backup-*.zip") if p.is_file() and p.name != "kplayer-backup-latest.zip"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if zips:
        return zips[0]
    latest = backups_dir / "kplayer-backup-latest.zip"
    return latest if latest.is_file() else None


def restore_backup(gamedir: Path, zip_path: Path | None = None) -> dict[str, Any]:
    gdir = gamedir.resolve()
    src = zip_path.resolve() if zip_path else find_latest_backup(gdir)
    if not src or not src.is_file():
        return {"ok": False, "error": "Nenhum backup encontrado em backups/."}

    restored = 0
    gdir_prefix = str(gdir) + os.sep
    with zipfile.ZipFile(src, "r") as zf:
        infos = zf.infolist()
        if len(infos) > MAX_RESTORE_FILES:
            return {"ok": False, "error": "Arquivo de backup excede o limite de entradas."}
        for info in infos:
            if info.is_dir():
                continue
            # Reject symlinks stored in zip
            unix_mode = (info.external_attr >> 16) & 0o170000
            if unix_mode == 0o120000:
                continue
            if info.file_size > MAX_RESTORE_FILE_BYTES:
                return {"ok": False, "error": f"Arquivo muito grande no backup: {info.filename}"}
            if not _is_allowed_backup_member(info.filename):
                continue
            dest = (gdir / info.filename).resolve()
            if not str(dest).startswith(gdir_prefix):
                return {"ok": False, "error": "Caminho inseguro detectado no backup."}
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_name(f".{dest.name}.restore.tmp")
            with zf.open(info, "r") as zstream, tmp.open("wb") as out:
                remaining = MAX_RESTORE_FILE_BYTES
                while True:
                    chunk = zstream.read(65536)
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    if remaining < 0:
                        tmp.unlink(missing_ok=True)
                        return {"ok": False, "error": "Entrada excedeu limite durante extração."}
                    out.write(chunk)
            os.replace(tmp, dest)
            restored += 1

    return {
        "ok": True,
        "zip_path": str(src),
        "restored_count": restored,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="KPlayer R36S Diagnostics & Backup")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_diag = sub.add_parser("diagnostics")
    p_diag.add_argument("--gamedir", default=str(SCRIPT_DIR))

    p_bak = sub.add_parser("backup")
    p_bak.add_argument("--gamedir", default=str(SCRIPT_DIR))
    p_bak.add_argument("--out", default="")

    p_res = sub.add_parser("restore")
    p_res.add_argument("--gamedir", default=str(SCRIPT_DIR))
    p_res.add_argument("--zip", default="")

    args = parser.parse_args(argv)
    if args.cmd == "diagnostics":
        res = collect_diagnostics(Path(args.gamedir))
    elif args.cmd == "backup":
        out_p = Path(args.out) if args.out else None
        res = create_backup(Path(args.gamedir), out_zip=out_p)
    else:
        zip_p = Path(args.zip) if args.zip else None
        res = restore_backup(Path(args.gamedir), zip_path=zip_p)

    print(json.dumps(res, ensure_ascii=False))
    return 0 if res.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
