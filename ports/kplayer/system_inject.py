#!/usr/bin/env python3
"""System-wide KPlayer Mini-Player injector for R36S (dArkOS / ArkOS / PortMaster — v2.1.7).

Invoked exclusively from inside KPlayer (`SELECT -> Opções -> Mini-Player no Sistema Inteiro`):
  - `status`                  : Print JSON status of system-wide injection & daemon.
  - `install [audio.json]`    : Disable EmulationStation background music cleanly & reversibly,
                                copy `libkp_overlay.so` to `/usr/local/lib/libkp_overlay.so`,
                                register it in `/etc/ld.so.preload` + `/etc/profile.d/`,
                                configure shared ALSA dmix if PulseAudio/PipeWire is absent,
                                install & enable `kplayer-miniplayer.service` (survives reboots),
                                and start the native Mini-Player daemon (`./kplayer --bg-audio <json> 0`).
  - `uninstall`               : Stop & remove `kplayer-miniplayer.service`, remove preload & profile
                                hooks, restore `/etc/asound.conf`, and restore EmulationStation BGM
                                settings/services cleanly.
  - `sync-audio <audio.json>` : Sync latest KPlayer playlist/radio/theme to the system daemon config.
  - `enforce-es-bgm-off`      : Lightweight boot hook executed by `kplayer-system-daemon.sh` to keep
                                EmulationStation BGM muted even if ES rewrote `es_settings.cfg`.

Safety guarantees:
  - NEVER touches, edits, or creates any `gamelist.xml`.
  - Copies `libkp_overlay.so` onto root ext4 (`/usr/local/lib/`) after validating ELF header, so
    early boot before `/roms` mounts is 100% safe.
  - Strictly reversible: every modified file/setting is backed up in `.system-inject-state.json`.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from bg_audio import (
    MAX_TRACKS,
    detect_alsa_hw_device,
    detect_audio_backend,
)

STATE_FILENAME = ".system-inject-state.json"
LOCAL_AUDIO_FILENAME = "system-audio.json"
SYSTEM_AUDIO_REL = Path("var/lib/kplayer/system-audio.json")
SYSTEM_OVERLAY_REL = Path("usr/local/lib/libkp_overlay.so")
SYSTEM_DAEMON_SH_REL = Path("usr/local/bin/kplayer-system-daemon.sh")
SYSTEM_UNIT_REL = Path("etc/systemd/system/kplayer-miniplayer.service")
SYSTEM_PRELOAD_REL = Path("etc/ld.so.preload")
SYSTEM_PROFILE_REL = Path("etc/profile.d/kplayer-miniplayer.sh")
SYSTEM_ASOUND_REL = Path("etc/asound.conf")
SYSTEM_RC_LOCAL_REL = Path("etc/rc.local")
SYSTEM_SHM_PATH = "/dev/shm/kplayer-overlay.shm"
MAIN_LOCK_PATH = "/dev/shm/kplayer-main.lock"
SERVICE_NAME = "kplayer-miniplayer.service"

ES_BGM_SETTINGS_KEYS = (
    "audio.bgmusic",
    "BackgroundMusic",
    "EnableBackgroundMusic",
)
ES_BGM_SERVICES = (
    "bgm.service",
    "es-bgm.service",
    "background-music.service",
    "emulationstation-bgm.service",
)
ES_BGM_PROCS = ("ogg123", "mpg123", "mpg321", "bgm.py", "bgm_player.py")
AUDIO_EXTS = {".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus", ".wma"}
RC_LOCAL_MARKER = "# KPLAYER-SYSTEM-MINIPLAYER"


def _root_path(root: Path, rel: Path | str) -> Path:
    return root / str(rel).lstrip("/")


def _default_es_settings_paths(root: Path) -> list[Path]:
    candidates = [
        _root_path(root, "home/ark/.emulationstation/es_settings.cfg"),
        _root_path(root, "root/.emulationstation/es_settings.cfg"),
        _root_path(root, "etc/emulationstation/es_settings.cfg"),
    ]
    home = os.environ.get("HOME", "").strip()
    if home and root == Path("/"):
        p = Path(home) / ".emulationstation" / "es_settings.cfg"
        if p not in candidates:
            candidates.insert(0, p)
    return candidates


def _run_cmd(argv: list[str], timeout: float = 10.0) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(
            argv,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout,
            check=False,
        )
        return proc.returncode, proc.stdout.strip(), proc.stderr.strip()
    except (OSError, subprocess.SubprocessError) as exc:
        return 127, "", str(exc)


def _atomic_write_text(path: Path, text: str, mode: int = 0o644) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".kp-tmp-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.chmod(tmp_name, mode)
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _atomic_copy_file(src: Path, dst: Path, mode: int = 0o644) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    data = src.read_bytes()
    fd, tmp_name = tempfile.mkstemp(prefix=".kp-tmp-", dir=str(dst.parent))
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        os.chmod(tmp_name, mode)
        os.replace(tmp_name, dst)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _validate_elf_so(so_path: Path) -> bool:
    if not so_path.is_file():
        return False
    try:
        head = so_path.read_bytes()[:4]
        return head == b"\x7fELF"
    except OSError:
        return False


def discover_fallback_tracks(
    gamedir: Path,
    music_dirs: list[Path] | None = None,
) -> list[dict[str, str]]:
    """Collect local music and saved user radio stations so rebooted daemon always has tracks."""
    tracks: list[dict[str, str]] = []
    seen: set[str] = set()

    dirs = music_dirs if music_dirs is not None else [
        Path("/roms/bgmusic"),
        Path("/roms2/bgmusic"),
        Path("/roms/music"),
        Path("/roms2/music"),
        gamedir / "midias",
    ]
    for mdir in dirs:
        if not mdir.is_dir():
            continue
        try:
            for item in sorted(mdir.rglob("*"), key=lambda p: p.name.lower()):
                if len(tracks) >= MAX_TRACKS:
                    break
                if not item.is_file() or item.name.startswith("."):
                    continue
                if item.suffix.lower() not in AUDIO_EXTS:
                    continue
                s = str(item)
                if s in seen:
                    continue
                seen.add(s)
                tracks.append({"uri": s, "title": item.stem[:120] or item.name[:120], "type": "music"})
        except OSError:
            continue

    radios_dir = gamedir / "radios_usuario"
    if radios_dir.is_dir() and len(tracks) < MAX_TRACKS:
        for pls in sorted(radios_dir.glob("*.pls"), key=lambda p: p.name.lower()):
            if len(tracks) >= MAX_TRACKS:
                break
            try:
                text = pls.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            url = ""
            title = pls.stem
            for line in text.splitlines():
                ls = line.strip()
                if ls.lower().startswith("file1="):
                    url = ls.split("=", 1)[1].strip()
                elif ls.lower().startswith("title1="):
                    t = ls.split("=", 1)[1].strip()
                    if t:
                        title = t
            if url.startswith(("http://", "https://")) and url not in seen:
                seen.add(url)
                tracks.append({"uri": url, "title": title[:120], "type": "radio"})

    return tracks


def normalize_system_audio_payload(
    raw_payload: dict[str, Any] | None,
    gamedir: Path,
    music_dirs: list[Path] | None = None,
) -> dict[str, Any]:
    """Normalize a persistent system-wide Mini-Player audio descriptor."""
    data = raw_payload if isinstance(raw_payload, dict) else {}
    tracks: list[dict[str, str]] = []
    seen: set[str] = set()

    raw_tracks = data.get("tracks")
    if isinstance(raw_tracks, list):
        for entry in raw_tracks[:MAX_TRACKS]:
            if not isinstance(entry, dict):
                continue
            ttype = str(entry.get("type") or "music").strip().lower()
            if ttype not in {"music", "radio"}:
                continue
            turi = str(entry.get("uri") or "").strip()
            if not turi or any(ord(c) < 32 or ord(c) == 127 for c in turi):
                continue
            if ttype == "music" and not (Path(turi).is_absolute() and Path(turi).is_file()):
                continue
            if ttype == "radio" and not turi.lower().startswith(("http://", "https://")):
                continue
            if turi in seen:
                continue
            seen.add(turi)
            ttitle = str(entry.get("title") or "").strip()[:120]
            if not ttitle:
                ttitle = Path(turi).stem if ttype == "music" else turi
            tracks.append({"uri": turi, "title": ttitle, "type": ttype})

    if not tracks:
        tracks = discover_fallback_tracks(gamedir, music_dirs=music_dirs)

    try:
        track_index = int(data.get("track_index", 0))
    except (TypeError, ValueError):
        track_index = 0
    if not tracks or track_index < 0 or track_index >= len(tracks):
        track_index = 0

    try:
        volume_pct = max(10, min(100, int(data.get("volume_pct", 55))))
    except (TypeError, ValueError):
        volume_pct = 55

    try:
        media_pos_ms = max(0, int(data.get("media_pos_ms", 0)))
    except (TypeError, ValueError):
        media_pos_ms = 0

    accent = str(data.get("theme_accent") or "#1db954").strip()
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", accent):
        accent = "#1db954"

    auto_play = bool(data.get("auto_play", True)) and bool(tracks)
    first = tracks[track_index] if tracks else None

    return {
        "target_path": "",
        "is_script": False,
        "bg_audio_enabled": True,
        "system_wide": True,
        "auto_play": auto_play,
        "media_type": first["type"] if first else "none",
        "media_uri": first["uri"] if first else "",
        "media_pos_ms": media_pos_ms,
        "volume_pct": volume_pct,
        "title": first["title"] if first else "",
        "theme_accent": accent,
        "track_index": track_index,
        "tracks": tracks,
    }


def _patch_es_settings_xml(xml_text: str, disable: bool) -> tuple[str, dict[str, str | None]]:
    """Disable EmulationStation BGM XML keys and return original values for reversible restore."""
    original: dict[str, str | None] = {}
    out = xml_text
    target_val = "false" if disable else "true"
    for key in ES_BGM_SETTINGS_KEYS:
        pat = re.compile(
            rf'(<bool\s+name="{re.escape(key)}"\s+value=")(true|false)("\s*/>)',
            re.IGNORECASE,
        )
        m = pat.search(out)
        if m:
            original[key] = m.group(2).lower()
            out = pat.sub(rf"\g<1>{target_val}\g<3>", out, count=1)
        else:
            original[key] = None
            if disable and key == "audio.bgmusic":
                line = f'<bool name="{key}" value="false" />\n'
                if out and not out.endswith("\n"):
                    out += "\n"
                out += line
    return out, original


def _restore_es_settings_xml(xml_text: str, original: dict[str, str | None]) -> str:
    out = xml_text
    for key, orig_val in original.items():
        pat = re.compile(
            rf'(<bool\s+name="{re.escape(key)}"\s+value=")(true|false)("\s*/>)',
            re.IGNORECASE,
        )
        if orig_val is None:
            out = re.sub(
                rf'^\s*<bool\s+name="{re.escape(key)}"\s+value="false"\s*/>\s*\n?',
                "",
                out,
                flags=re.MULTILINE | re.IGNORECASE,
            )
        else:
            out = pat.sub(rf"\g<1>{orig_val}\g<3>", out, count=1)
    return out


def disable_emulationstation_bgm(
    root: Path = Path("/"),
    settings_paths: list[Path] | None = None,
    existing_backups: dict[str, dict[str, str | None]] | None = None,
    run_system_cmds: bool = True,
) -> dict[str, Any]:
    """Reversibly disable EmulationStation BGM settings, BGM services, and running BGM players."""
    backups: dict[str, dict[str, str | None]] = dict(existing_backups or {})
    modified_files: list[str] = []
    stopped_procs: list[str] = []
    disabled_services: list[str] = []

    paths = settings_paths if settings_paths is not None else _default_es_settings_paths(root)
    for cfg in paths:
        if not cfg.is_file():
            continue
        try:
            text = cfg.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        patched, orig = _patch_es_settings_xml(text, disable=True)
        key_str = str(cfg)
        if key_str not in backups:
            backups[key_str] = orig
        if patched != text:
            try:
                _atomic_write_text(cfg, patched, mode=0o644)
                modified_files.append(key_str)
            except OSError:
                pass

    if run_system_cmds:
        # Stop and disable ArkOS/dArkOS BGM services if installed
        if shutil.which("systemctl"):
            for svc in ES_BGM_SERVICES:
                rc_en, out_en, _ = _run_cmd(["systemctl", "is-enabled", svc])
                rc_act, out_act, _ = _run_cmd(["systemctl", "is-active", svc])
                if rc_en == 0 or out_en == "enabled" or rc_act == 0 or out_act == "active":
                    disabled_services.append(svc)
                    _run_cmd(["systemctl", "disable", "--now", svc])

        # Stop standalone BGM players (never kills emulationstation itself)
        pkill = shutil.which("pkill")
        if pkill:
            for proc_name in ES_BGM_PROCS:
                rc, _, _ = _run_cmd([pkill, "-f", proc_name])
                if rc == 0:
                    stopped_procs.append(proc_name)

        # Mute active emulationstation PulseAudio/PipeWire sink-inputs if pactl is available
        pactl = shutil.which("pactl")
        if pactl:
            rc, out, _ = _run_cmd([pactl, "list", "sink-inputs"])
            if rc == 0 and out:
                cur_id = ""
                for line in out.splitlines():
                    m_id = re.match(r"^\s*Sink Input #(\d+)", line)
                    if m_id:
                        cur_id = m_id.group(1)
                    elif cur_id and "emulationstation" in line.lower():
                        _run_cmd([pactl, "set-sink-input-mute", cur_id, "1"])

    return {
        "es_settings_backups": backups,
        "modified_files": modified_files,
        "disabled_services": disabled_services,
        "stopped_procs": stopped_procs,
    }


def restore_emulationstation_bgm(
    state: dict[str, Any],
    run_system_cmds: bool = True,
) -> dict[str, Any]:
    """Restore EmulationStation BGM settings, PulseAudio mute, and BGM services."""
    restored_files: list[str] = []
    restored_services: list[str] = []

    backups = state.get("es_settings_backups") or {}
    if isinstance(backups, dict):
        for cfg_str, orig_map in backups.items():
            cfg = Path(cfg_str)
            if not cfg.is_file() or not isinstance(orig_map, dict):
                continue
            try:
                text = cfg.read_text(encoding="utf-8", errors="ignore")
                restored = _restore_es_settings_xml(text, orig_map)
                if restored != text:
                    _atomic_write_text(cfg, restored, mode=0o644)
                restored_files.append(cfg_str)
            except OSError:
                continue

    if run_system_cmds:
        if shutil.which("systemctl"):
            for svc in state.get("disabled_es_services") or []:
                if isinstance(svc, str) and svc.endswith(".service"):
                    rc, _, _ = _run_cmd(["systemctl", "enable", "--now", svc])
                    if rc == 0:
                        restored_services.append(svc)
        pactl = shutil.which("pactl")
        if pactl:
            rc, out, _ = _run_cmd([pactl, "list", "sink-inputs"])
            if rc == 0 and out:
                cur_id = ""
                for line in out.splitlines():
                    m_id = re.match(r"^\s*Sink Input #(\d+)", line)
                    if m_id:
                        cur_id = m_id.group(1)
                    elif cur_id and "emulationstation" in line.lower():
                        _run_cmd([pactl, "set-sink-input-mute", cur_id, "0"])

    return {
        "restored_files": restored_files,
        "restored_services": restored_services,
    }


def _update_ld_so_preload(preload_path: Path, lib_entry: str, add: bool) -> dict[str, Any]:
    existed_before = preload_path.is_file()
    lines: list[str] = []
    if existed_before:
        try:
            lines = [
                ln.strip()
                for ln in preload_path.read_text(encoding="utf-8", errors="ignore").splitlines()
                if ln.strip()
            ]
        except OSError:
            lines = []

    if add:
        if lib_entry not in lines:
            lines.append(lib_entry)
        _atomic_write_text(preload_path, "\n".join(lines) + "\n", mode=0o644)
        return {"preload_existed_before": existed_before, "active": True}

    new_lines = [ln for ln in lines if ln != lib_entry]
    if new_lines:
        _atomic_write_text(preload_path, "\n".join(new_lines) + "\n", mode=0o644)
    elif preload_path.is_file():
        preload_path.unlink(missing_ok=True)
    return {"active": False}


def _build_daemon_script(gamedir: Path, config_path: Path, system_audio_path: Path) -> str:
    gdir_str = str(gamedir)
    cfg_str = str(config_path)
    sys_cfg_str = str(system_audio_path)
    return f"""#!/bin/bash
# KPlayer v2.1.7 - System-Wide Native Mini-Player Daemon (R36S / dArkOS / PortMaster)
set -u
GAMEDIR="{gdir_str}"
LOCAL_CFG="{cfg_str}"
SYSTEM_CFG="{sys_cfg_str}"
SHM_PATH="{SYSTEM_SHM_PATH}"

# Wait up to 30s on cold boot for /roms or /roms2 to finish mounting
for _i in $(seq 1 30); do
    if [ -x "$GAMEDIR/kplayer" ]; then
        break
    fi
    sleep 1
done

if [ ! -x "$GAMEDIR/kplayer" ]; then
    echo "kplayer-system-daemon: binario nao encontrado em $GAMEDIR/kplayer" >&2
    exit 0
fi

# Keep EmulationStation BGM muted on boot even if ES saved es_settings.cfg on shutdown
if [ -f "$GAMEDIR/system_inject.py" ] && command -v python3 >/dev/null 2>&1; then
    python3 "$GAMEDIR/system_inject.py" enforce-es-bgm-off >/dev/null 2>&1 || true
fi

# Prepare world-accessible shared memory for libkp_overlay.so
if [ ! -f "$SHM_PATH" ]; then
    dd if=/dev/zero of="$SHM_PATH" bs=4096 count=1 >/dev/null 2>&1 || true
fi
chmod 0666 "$SHM_PATH" 2>/dev/null || true

# Load PortMaster controller mapping so L3+R3 matches R36S hardware exactly
for candidate in /opt/system/Tools/PortMaster /opt/tools/PortMaster /roms/ports/PortMaster /roms2/ports/PortMaster; do
    if [ -f "$candidate/control.txt" ]; then
        # Extract sdl_controllerconfig without triggering full port lifecycle
        if [ -f "$candidate/gamecontrollerdb.txt" ]; then
            export SDL_GAMECONTROLLERCONFIG_FILE="$candidate/gamecontrollerdb.txt"
        fi
        break
    fi
done

# Auto-detect PulseAudio/PipeWire vs ALSA dmix
AOUT="alsa"
for sock in /run/user/*/pulse/native /run/user/*/pipewire-0; do
    if [ -S "$sock" ]; then
        AOUT="pulse"
        export XDG_RUNTIME_DIR="$(dirname "$(dirname "$sock")")"
        if [ -S "$(dirname "$sock")/native" ]; then
            export PULSE_SERVER="unix:$sock"
        fi
        break
    fi
done

ACTIVE_CFG="$SYSTEM_CFG"
if [ -f "$LOCAL_CFG" ]; then
    ACTIVE_CFG="$LOCAL_CFG"
fi

export KPLAYER_GAMEDIR="$GAMEDIR"
export LD_LIBRARY_PATH="$GAMEDIR/lib${{LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}}"
export VLC_PLUGIN_PATH="/usr/lib/aarch64-linux-gnu/vlc/plugins"
export VLC_DATA_PATH="/usr/share/vlc"
export KPLAYER_BG_AOUT="$AOUT"
export KPLAYER_BG_ALSA_DEV="default"
export KPLAYER_OVERLAY_SHM="$SHM_PATH"
export KPLAYER_SYSTEM_MODE="1"
unset LD_PRELOAD

exec "$GAMEDIR/kplayer" --bg-audio "$ACTIVE_CFG" 0
"""


def _build_systemd_unit(daemon_sh: Path) -> str:
    return f"""[Unit]
Description=KPlayer v2.1.7 Native System-Wide Mini-Player (R36S)
After=local-fs.target sound.target multi-user.target
Wants=sound.target

[Service]
Type=simple
ExecStart={daemon_sh}
Restart=always
RestartSec=2
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
"""


def _build_profile_script() -> str:
    return f"""# KPlayer v2.1.7 System-Wide Native Mini-Player environment
export KPLAYER_OVERLAY_SHM="{SYSTEM_SHM_PATH}"
export KPLAYER_SYSTEM_MINIPLAYER="1"
"""


def _build_alsa_dmix_text(hw_device: str) -> str:
    if not re.fullmatch(r"hw:\d+,\d+", hw_device):
        hw_device = "hw:0,0"
    return (
        "# KPlayer v2.1.7 shared ALSA dmix (restored automatically on uninstall)\n"
        "pcm.kp_dmix {\n"
        "    type dmix\n"
        "    ipc_key 56789\n"
        "    ipc_perm 0666\n"
        "    slave {\n"
        f'        pcm "{hw_device}"\n'
        "        rate 48000\n"
        "        period_size 1024\n"
        "        buffer_size 4096\n"
        "    }\n"
        "}\n\n"
        "pcm.!default {\n"
        "    type plug\n"
        '    slave.pcm "kp_dmix"\n'
        "}\n"
    )


def _is_system_daemon_running() -> bool:
    if shutil.which("pgrep"):
        rc, out, _ = _run_cmd(["pgrep", "-f", "--", "--bg-audio .* 0"])
        if rc == 0 and out.strip():
            return True
    return False


def get_status(
    gamedir: Path,
    root: Path = Path("/"),
    check_live_procs: bool = True,
) -> dict[str, Any]:
    state_file = gamedir / STATE_FILENAME
    state: dict[str, Any] = {}
    if state_file.is_file():
        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            state = {}

    overlay_dst = _root_path(root, SYSTEM_OVERLAY_REL)
    preload_path = _root_path(root, SYSTEM_PRELOAD_REL)
    unit_path = _root_path(root, SYSTEM_UNIT_REL)
    daemon_sh = _root_path(root, SYSTEM_DAEMON_SH_REL)
    lib_entry = "/" + SYSTEM_OVERLAY_REL.as_posix()

    preload_active = False
    if preload_path.is_file():
        try:
            preload_active = lib_entry in [
                ln.strip()
                for ln in preload_path.read_text(encoding="utf-8", errors="ignore").splitlines()
            ]
        except OSError:
            preload_active = False

    installed = bool(
        state.get("installed")
        and overlay_dst.is_file()
        and preload_active
        and daemon_sh.is_file()
    )
    service_active = unit_path.is_file()
    daemon_running = _is_system_daemon_running() if (check_live_procs and installed) else False
    if check_live_procs and installed and shutil.which("systemctl") and root == Path("/"):
        rc, out, _ = _run_cmd(["systemctl", "is-active", SERVICE_NAME])
        if rc == 0 and out == "active":
            daemon_running = True

    tracks_count = 0
    local_cfg = gamedir / LOCAL_AUDIO_FILENAME
    if local_cfg.is_file():
        try:
            cfg = json.loads(local_cfg.read_text(encoding="utf-8"))
            tracks_count = len(cfg.get("tracks") or [])
        except (OSError, ValueError):
            pass

    return {
        "ok": True,
        "installed": installed,
        "preload_active": preload_active,
        "service_installed": service_active,
        "daemon_running": daemon_running,
        "es_bgm_muted": bool(state.get("installed")),
        "tracks_count": tracks_count,
        "version": "2.1.7",
    }


def sync_audio(
    gamedir: Path,
    audio_json_path: Path | None = None,
    root: Path = Path("/"),
    music_dirs: list[Path] | None = None,
) -> dict[str, Any]:
    """Write normalized playlist/theme JSON to GAMEDIR and /var/lib/kplayer/."""
    raw: dict[str, Any] | None = None
    if audio_json_path and audio_json_path.is_file():
        try:
            raw = json.loads(audio_json_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raw = None
    normalized = normalize_system_audio_payload(raw, gamedir, music_dirs=music_dirs)
    payload_text = json.dumps(normalized, ensure_ascii=False, indent=2) + "\n"

    local_cfg = gamedir / LOCAL_AUDIO_FILENAME
    _atomic_write_text(local_cfg, payload_text, mode=0o644)

    sys_cfg = _root_path(root, SYSTEM_AUDIO_REL)
    try:
        _atomic_write_text(sys_cfg, payload_text, mode=0o644)
    except OSError:
        pass
    return normalized


def install_system_miniplayer(
    gamedir: Path,
    audio_json_path: Path | None = None,
    root: Path = Path("/"),
    es_settings_paths: list[Path] | None = None,
    music_dirs: list[Path] | None = None,
    run_system_cmds: bool = True,
) -> dict[str, Any]:
    """Install the persistent, reboot-safe system-wide KPlayer Mini-Player on R36S."""
    overlay_src = gamedir / "libkp_overlay.so"
    if not _validate_elf_so(overlay_src):
        raise RuntimeError(f"libkp_overlay.so ausente ou inválido em {overlay_src}")

    state_file = gamedir / STATE_FILENAME
    prev_state: dict[str, Any] = {}
    if state_file.is_file():
        try:
            prev_state = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            prev_state = {}

    # 1. Sync persistent audio/playlist config
    normalized = sync_audio(
        gamedir,
        audio_json_path=audio_json_path,
        root=root,
        music_dirs=music_dirs,
    )

    # 2. Disable EmulationStation background music cleanly & reversibly (never touches gamelist.xml)
    es_res = disable_emulationstation_bgm(
        root=root,
        settings_paths=es_settings_paths,
        existing_backups=prev_state.get("es_settings_backups"),
        run_system_cmds=run_system_cmds,
    )

    # 3. Copy libkp_overlay.so to root ext4 (/usr/local/lib/) & register in /etc/ld.so.preload
    overlay_dst = _root_path(root, SYSTEM_OVERLAY_REL)
    _atomic_copy_file(overlay_src, overlay_dst, mode=0o644)

    preload_path = _root_path(root, SYSTEM_PRELOAD_REL)
    lib_entry = "/" + SYSTEM_OVERLAY_REL.as_posix()
    preload_res = _update_ld_so_preload(preload_path, lib_entry, add=True)

    # 4. Export environment helper in /etc/profile.d/
    profile_path = _root_path(root, SYSTEM_PROFILE_REL)
    _atomic_write_text(profile_path, _build_profile_script(), mode=0o644)

    # 5. Optional reversible shared ALSA dmix if no PulseAudio/PipeWire server is active
    asound_modified = bool(prev_state.get("asound_modified", False))
    asound_existed = prev_state.get("asound_existed")
    asound_backup = prev_state.get("asound_backup")
    if run_system_cmds and detect_audio_backend(os.environ) == "alsa":
        asound_path = _root_path(root, SYSTEM_ASOUND_REL)
        if not asound_modified:
            asound_existed = asound_path.is_file()
            asound_backup = (
                asound_path.read_text(encoding="utf-8", errors="ignore")
                if asound_existed
                else None
            )
        hw_dev = detect_alsa_hw_device()
        _atomic_write_text(asound_path, _build_alsa_dmix_text(hw_dev), mode=0o644)
        asound_modified = True

    # 6. Install persistent daemon wrapper + systemd unit (with rc.local fallback)
    daemon_sh = _root_path(root, SYSTEM_DAEMON_SH_REL)
    local_cfg = gamedir / LOCAL_AUDIO_FILENAME
    sys_cfg = Path("/") / SYSTEM_AUDIO_REL
    _atomic_write_text(
        daemon_sh,
        _build_daemon_script(gamedir, local_cfg, sys_cfg),
        mode=0o755,
    )

    unit_path = _root_path(root, SYSTEM_UNIT_REL)
    _atomic_write_text(
        unit_path,
        _build_systemd_unit(Path("/") / SYSTEM_DAEMON_SH_REL),
        mode=0o644,
    )

    rc_local_added = bool(prev_state.get("rc_local_added", False))
    service_started = False
    if run_system_cmds:
        # Ensure SHM exists right away
        shm_p = Path(SYSTEM_SHM_PATH)
        try:
            if not shm_p.exists():
                shm_p.write_bytes(b"\x00" * 4096)
            os.chmod(shm_p, 0o666)
        except OSError:
            pass

        if shutil.which("systemctl") and root == Path("/"):
            _run_cmd(["systemctl", "daemon-reload"])
            rc_en, _, _ = _run_cmd(["systemctl", "enable", SERVICE_NAME])
            rc_st, _, _ = _run_cmd(["systemctl", "restart", SERVICE_NAME])
            service_started = (rc_en == 0 and rc_st == 0)
        if not service_started:
            # Fallback for non-systemd CFWs: add hook to /etc/rc.local and start detached
            rc_local = _root_path(root, SYSTEM_RC_LOCAL_REL)
            rc_line = f"{Path('/') / SYSTEM_DAEMON_SH_REL} >/dev/null 2>&1 & {RC_LOCAL_MARKER}"
            if rc_local.is_file():
                rc_txt = rc_local.read_text(encoding="utf-8", errors="ignore")
                if RC_LOCAL_MARKER not in rc_txt:
                    if re.search(r"^\s*exit\s+0\b", rc_txt, flags=re.MULTILINE):
                        rc_txt = re.sub(
                            r"(^\s*exit\s+0\b)",
                            rc_line + "\n\\1",
                            rc_txt,
                            count=1,
                            flags=re.MULTILINE,
                        )
                    else:
                        rc_txt = rc_txt.rstrip("\n") + "\n" + rc_line + "\n"
                    _atomic_write_text(rc_local, rc_txt, mode=0o755)
                    rc_local_added = True
            if root == Path("/"):
                try:
                    subprocess.Popen(
                        ["/bin/bash", str(daemon_sh)],
                        stdin=subprocess.DEVNULL,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        start_new_session=True,
                        close_fds=True,
                    )
                    service_started = True
                except OSError:
                    pass

    disabled_svcs = list(
        dict.fromkeys(
            list(prev_state.get("disabled_es_services") or [])
            + list(es_res["disabled_services"])
        )
    )
    state = {
        "version": "2.1.7",
        "installed": True,
        "gamedir": str(gamedir),
        "preload_existed_before": prev_state.get(
            "preload_existed_before", preload_res["preload_existed_before"]
        ),
        "es_settings_backups": es_res["es_settings_backups"],
        "disabled_es_services": disabled_svcs,
        "asound_modified": asound_modified,
        "asound_existed": asound_existed,
        "asound_backup": asound_backup,
        "rc_local_added": rc_local_added,
    }
    _atomic_write_text(state_file, json.dumps(state, ensure_ascii=False, indent=2) + "\n", mode=0o644)

    return {
        "ok": True,
        "installed": True,
        "service_started": service_started,
        "tracks_count": len(normalized["tracks"]),
        "es_bgm_muted": True,
        "modified_es_files": es_res["modified_files"],
    }


def uninstall_system_miniplayer(
    gamedir: Path,
    root: Path = Path("/"),
    run_system_cmds: bool = True,
) -> dict[str, Any]:
    """Completely remove system-wide Mini-Player injection and restore EmulationStation BGM."""
    state_file = gamedir / STATE_FILENAME
    state: dict[str, Any] = {}
    if state_file.is_file():
        try:
            state = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            state = {}

    # 1. Stop & disable systemd service / detached daemon
    if run_system_cmds:
        if shutil.which("systemctl") and root == Path("/"):
            _run_cmd(["systemctl", "disable", "--now", SERVICE_NAME])
        pkill = shutil.which("pkill")
        if pkill and root == Path("/"):
            _run_cmd([pkill, "-TERM", "-f", "--", "--bg-audio .* 0"])

    # 2. Remove /etc/ld.so.preload entry & system files
    preload_path = _root_path(root, SYSTEM_PRELOAD_REL)
    lib_entry = "/" + SYSTEM_OVERLAY_REL.as_posix()
    _update_ld_so_preload(preload_path, lib_entry, add=False)

    for rel in (
        SYSTEM_OVERLAY_REL,
        SYSTEM_DAEMON_SH_REL,
        SYSTEM_UNIT_REL,
        SYSTEM_PROFILE_REL,
        SYSTEM_AUDIO_REL,
    ):
        p = _root_path(root, rel)
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass

    if root == Path("/"):
        try:
            Path(SYSTEM_SHM_PATH).unlink(missing_ok=True)
        except OSError:
            pass

    if run_system_cmds and shutil.which("systemctl") and root == Path("/"):
        _run_cmd(["systemctl", "daemon-reload"])

    # Remove rc.local hook if added
    rc_local = _root_path(root, SYSTEM_RC_LOCAL_REL)
    if rc_local.is_file():
        try:
            rc_txt = rc_local.read_text(encoding="utf-8", errors="ignore")
            if RC_LOCAL_MARKER in rc_txt:
                filtered = [ln for ln in rc_txt.splitlines() if RC_LOCAL_MARKER not in ln]
                _atomic_write_text(rc_local, "\n".join(filtered) + "\n", mode=0o755)
        except OSError:
            pass

    # 3. Restore /etc/asound.conf if we modified it
    if state.get("asound_modified"):
        asound_path = _root_path(root, SYSTEM_ASOUND_REL)
        if state.get("asound_existed") and isinstance(state.get("asound_backup"), str):
            _atomic_write_text(asound_path, state["asound_backup"], mode=0o644)
        else:
            try:
                asound_path.unlink(missing_ok=True)
            except OSError:
                pass

    # 4. Restore EmulationStation BGM settings & services (never touches gamelist.xml)
    es_restore = restore_emulationstation_bgm(state, run_system_cmds=run_system_cmds)

    # 5. Clean up local state file
    try:
        state_file.unlink(missing_ok=True)
    except OSError:
        pass

    return {
        "ok": True,
        "installed": False,
        "restored_es_files": es_restore["restored_files"],
        "restored_es_services": es_restore["restored_services"],
    }


def _reexec_with_sudo_if_needed(argv: list[str]) -> None:
    if os.geteuid() == 0:
        return
    if os.environ.get("KP_NO_SUDO") == "1":
        return
    sudo = shutil.which("sudo")
    if not sudo:
        return
    rc, _, _ = _run_cmd([sudo, "-n", "true"], timeout=3.0)
    if rc == 0:
        os.execv(sudo, [sudo, "-n", sys.executable, str(Path(__file__).resolve()), *argv[1:]])


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        sys.stderr.write(
            "Uso: system_inject.py <status|install|uninstall|sync-audio|enforce-es-bgm-off> [audio.json]\n"
        )
        return 2

    cmd = argv[1].strip().lower()
    gamedir = Path(os.environ.get("KPLAYER_GAMEDIR") or Path(__file__).resolve().parent)

    if cmd == "status":
        print(json.dumps(get_status(gamedir), ensure_ascii=False))
        return 0

    if cmd == "sync-audio":
        src = Path(argv[2]) if len(argv) >= 3 else None
        out = sync_audio(gamedir, audio_json_path=src)
        print(json.dumps({"ok": True, "tracks_count": len(out["tracks"])}, ensure_ascii=False))
        return 0

    if cmd == "enforce-es-bgm-off":
        state_file = gamedir / STATE_FILENAME
        existing: dict[str, Any] = {}
        if state_file.is_file():
            try:
                existing = json.loads(state_file.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                existing = {}
        res = disable_emulationstation_bgm(
            existing_backups=existing.get("es_settings_backups"),
            run_system_cmds=True,
        )
        print(json.dumps({"ok": True, "modified": res["modified_files"]}, ensure_ascii=False))
        return 0

    if cmd in {"install", "uninstall"}:
        _reexec_with_sudo_if_needed(argv)
        try:
            if cmd == "install":
                src = Path(argv[2]) if len(argv) >= 3 else None
                res = install_system_miniplayer(gamedir, audio_json_path=src)
            else:
                res = uninstall_system_miniplayer(gamedir)
            print(json.dumps(res, ensure_ascii=False))
            return 0
        except Exception as exc:
            print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
            return 1

    sys.stderr.write(f"system_inject: comando desconhecido: {cmd}\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
