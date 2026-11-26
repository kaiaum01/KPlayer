#!/usr/bin/env python3
"""Background audio, EmulationStation detached daemon & BGM silencer for KPlayer R36S (v2.1.6).

Supports two modes, BOTH activated/deactivated exclusively inside KPlayer:
  1) `run <handoff.json>` (exit code 43 from ./kplayer):
     Runs a `.sh` game script or EmulationStation executable with `libkp_overlay.so`
     and `./kplayer --bg-audio <json> <game_pid>`, returning to KPlayer on exit.
  2) `start-daemon <daemon.json>` (exit code 44 from ./kplayer):
     Detaches `./kplayer --bg-audio <json> 0` so KPlayer's music/radio and L3+R3
     Mini-Player keep working outside the app in EmulationStation and games, while
     safely & reversibly silencing EmulationStation's own background music (BGM).
  3) `stop-daemon [--keep-es-mute]`:
     Stops any detached KPlayer background daemon (called when re-opening KPlayer or
     disabling background audio inside KPlayer) and restores EmulationStation BGM.
  4) `es-bgm-mute` / `es-bgm-restore`:
     Reversibly mutes or restores EmulationStation's BGM (`es_settings.cfg`,
     standalone `ogg123`/`mpg123`/`bgm` players, and PulseAudio/PipeWire ES streams)
     without ever touching `gamelist.xml`.

Controls (handled natively via Linux evdev in `./kplayer --bg-audio`):
  - L3 + R3: Open / Hide KPlayer Mini-Player (click both sticks)
  - UP / DOWN (when open): Navigate menu rows
  - LEFT / RIGHT (when open): Volume +/- 10% or switch track on track rows
  - B / START (when open): Confirm highlighted option
  - R2 / L2 (when open): Instant Next / Previous track from any row
  - A / L3 + R3 (when open): Hide Mini-Player
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
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ALLOWED_SCHEMES = {"http", "https"}
MAX_PAYLOAD_BYTES = 256 * 1024
MAX_TRACKS = 128

DAEMON_STATE_FILE = Path("/tmp/kplayer_bg_daemon.json")
DAEMON_SHM_PATH = Path("/tmp/kplayer_overlay.shm")
DAEMON_LOG_PATH = Path("/tmp/kplayer_bg_daemon.log")

ES_BGM_KEYS = ("audio.bgmusic", "BackgroundMusic")
ES_BGM_PROCS = ("ogg123", "mpg123", "mpg321", "bgm.py", "bgmusic.py", "es_bgm", "es-bgm")


def _has_ctrl_chars(text: str) -> bool:
    return any(ord(ch) < 32 or ord(ch) == 127 for ch in text)


def _is_valid_media_uri(uri: str, media_type: str) -> bool:
    if not uri or _has_ctrl_chars(uri):
        return False
    if media_type == "music":
        p = Path(uri)
        return p.is_absolute() and p.is_file()
    if media_type == "radio":
        parsed = urlparse(uri)
        return parsed.scheme.lower() in ALLOWED_SCHEMES and bool(parsed.netloc)
    return False


def _validate_media_fields(payload: dict[str, Any]) -> dict[str, Any]:
    bg_enabled = bool(payload.get("bg_audio_enabled", False))
    auto_play = bool(payload.get("auto_play", True))
    media_type = str(payload.get("media_type") or "none").strip().lower()
    if media_type not in {"none", "music", "radio"}:
        media_type = "none"

    media_uri = str(payload.get("media_uri") or "").strip()
    if not bg_enabled or not _is_valid_media_uri(media_uri, media_type):
        media_type = "none"
        media_uri = ""

    validated_tracks: list[dict[str, str]] = []
    raw_tracks = payload.get("tracks")
    if bg_enabled and isinstance(raw_tracks, list):
        for entry in raw_tracks[:MAX_TRACKS]:
            if not isinstance(entry, dict):
                continue
            ttype = str(entry.get("type") or "music").strip().lower()
            if ttype not in {"music", "radio"}:
                continue
            turi = str(entry.get("uri") or "").strip()
            if not _is_valid_media_uri(turi, ttype):
                continue
            ttitle = str(entry.get("title") or "").strip()[:120]
            if not ttitle:
                ttitle = Path(turi).name if ttype == "music" else turi
            validated_tracks.append({"uri": turi, "title": ttitle, "type": ttype})

    if bg_enabled and not validated_tracks and media_type != "none" and media_uri:
        title_fallback = str(payload.get("title") or "").strip()[:120]
        if not title_fallback:
            title_fallback = Path(media_uri).name if media_type == "music" else media_uri
        validated_tracks.append(
            {"uri": media_uri, "title": title_fallback, "type": media_type}
        )

    raw_idx = payload.get("track_index", 0)
    try:
        track_index = int(raw_idx)
    except (TypeError, ValueError):
        track_index = 0
    if validated_tracks:
        if track_index < 0 or track_index >= len(validated_tracks):
            track_index = 0
        if media_type == "none":
            media_type = validated_tracks[track_index]["type"]
            media_uri = validated_tracks[track_index]["uri"]
    else:
        track_index = 0

    raw_pos = payload.get("media_pos_ms", 0)
    try:
        media_pos_ms = max(0, int(raw_pos))
    except (TypeError, ValueError):
        media_pos_ms = 0

    raw_vol = payload.get("volume_pct", 55)
    try:
        volume_pct = max(10, min(100, int(raw_vol)))
    except (TypeError, ValueError):
        volume_pct = 55

    theme_accent = str(payload.get("theme_accent") or "#1db954").strip()
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", theme_accent):
        theme_accent = "#1db954"

    has_playable = bg_enabled and (media_type != "none" or len(validated_tracks) > 0)

    return {
        "bg_audio_enabled": has_playable,
        "auto_play": auto_play if has_playable else False,
        "media_type": media_type if has_playable else "none",
        "media_uri": media_uri if has_playable else "",
        "media_pos_ms": media_pos_ms,
        "volume_pct": volume_pct,
        "title": str(payload.get("title") or "").strip()[:120],
        "theme_accent": theme_accent,
        "track_index": track_index,
        "tracks": validated_tracks if has_playable else [],
    }


def validate_launch_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalize a KPlayer game-handoff payload without side effects."""
    if not isinstance(payload, dict):
        raise ValueError("Payload de lançamento inválido.")

    target = str(payload.get("target_path") or "").strip()
    if not target or _has_ctrl_chars(target):
        raise ValueError("Caminho do alvo ausente ou inválido.")
    target_path = Path(target)
    if not target_path.is_absolute():
        raise ValueError("O alvo precisa ser um caminho absoluto.")
    if not target_path.is_file():
        raise ValueError(f"Alvo não encontrado: {target}")

    is_script = bool(payload.get("is_script", target.lower().endswith(".sh")))

    target_args: list[str] = []
    raw_args = payload.get("target_args")
    if isinstance(raw_args, list):
        for item in raw_args[:8]:
            s = str(item)
            if s and not _has_ctrl_chars(s):
                target_args.append(s)

    media = _validate_media_fields(payload)
    return {
        "target_path": str(target_path),
        "target_args": target_args,
        "is_script": is_script,
        **media,
    }


def validate_daemon_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate a standalone EmulationStation background daemon payload."""
    if not isinstance(payload, dict):
        raise ValueError("Payload do serviço em 2º plano inválido.")
    media = _validate_media_fields(payload)
    return {
        "target_path": "",
        "target_args": [],
        "is_script": False,
        **media,
    }


# ==================== EMULATIONSTATION BGM SILENCER ====================


def default_es_settings_paths() -> list[Path]:
    """Locate EmulationStation es_settings.cfg paths on R36S / dArkOS / ArkOS."""
    home = Path.home()
    raw_candidates = [
        home / ".emulationstation" / "es_settings.cfg",
        home / ".config" / "emulationstation" / "es_settings.cfg",
        Path("/home/ark/.emulationstation/es_settings.cfg"),
        Path("/home/ark/.config/emulationstation/es_settings.cfg"),
        Path("/root/.emulationstation/es_settings.cfg"),
    ]
    seen: set[str] = set()
    out: list[Path] = []
    for p in raw_candidates:
        key = str(p)
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


def _atomic_write_text(path: Path, text: str) -> bool:
    try:
        fd, tmp = tempfile.mkstemp(prefix=".kp-es-", suffix=".tmp", dir=str(path.parent))
        try:
            os.write(fd, text.encode("utf-8"))
        finally:
            os.close(fd)
        os.replace(tmp, path)
        return True
    except OSError:
        return False


def _stop_external_es_bgm_procs() -> int:
    """Stop standalone ES background music players (ogg123, mpg123, bgm.py) without touching KPlayer or ES."""
    stopped = 0
    proc_root = Path("/proc")
    if not proc_root.is_dir():
        return 0
    my_pid = os.getpid()
    for entry in proc_root.iterdir():
        if not entry.name.isdigit():
            continue
        pid = int(entry.name)
        if pid <= 1 or pid == my_pid:
            continue
        try:
            raw_cmd = (entry / "cmdline").read_bytes()
        except OSError:
            continue
        if not raw_cmd:
            continue
        parts = [p.decode("utf-8", errors="ignore") for p in raw_cmd.split(b"\x00") if p]
        if not parts:
            continue
        joined = " ".join(parts).lower()
        if "kplayer" in joined or "bg_audio.py" in joined:
            continue
        exe_name = Path(parts[0]).name.lower()
        matched = exe_name in ES_BGM_PROCS or any(
            tok in joined for tok in ("bgm.py", "bgmusic.py", "es_bgm", "es-bgm")
        )
        if not matched:
            continue
        try:
            os.kill(pid, signal.SIGTERM)
            stopped += 1
        except OSError:
            continue
    return stopped


def _pactl_set_es_mute(mute: bool) -> int:
    """Mute or unmute EmulationStation's own PulseAudio/PipeWire audio stream(s) if pactl is available."""
    pactl = shutil.which("pactl")
    if not pactl:
        return 0
    try:
        res = subprocess.run(
            [pactl, "list", "sink-inputs"],
            capture_output=True,
            text=True,
            timeout=2.0,
            check=False,
        )
    except Exception:
        return 0
    if res.returncode != 0 or not res.stdout:
        return 0

    changed = 0
    cur_id: str | None = None
    cur_is_es = False
    target_val = "1" if mute else "0"

    def _flush() -> None:
        nonlocal changed
        if cur_id is not None and cur_is_es:
            try:
                subprocess.run(
                    [pactl, "set-sink-input-mute", cur_id, target_val],
                    capture_output=True,
                    timeout=1.5,
                    check=False,
                )
                changed += 1
            except Exception:
                pass

    for line in res.stdout.splitlines():
        m = re.match(r"^\s*Sink Input #(\d+)", line)
        if m:
            _flush()
            cur_id = m.group(1)
            cur_is_es = False
            continue
        low = line.lower()
        if (
            'application.process.binary = "emulationstation"' in low
            or 'application.name = "emulationstation"' in low
            or 'application.process.binary = "ogg123"' in low
            or 'application.process.binary = "mpg123"' in low
        ):
            cur_is_es = True
    _flush()
    return changed


def silence_es_bgm(
    state_file: Path | None = None,
    settings_paths: list[Path] | None = None,
    stop_procs: bool = True,
    touch_pulse: bool = True,
) -> dict[str, Any]:
    """Reversibly disable EmulationStation's own BGM so it never clashes with KPlayer.

    Saves original `es_settings.cfg` boolean values into `state_file` (never
    overwriting an existing backup) and never modifies `gamelist.xml`.
    """
    gamedir = Path(os.environ.get("KPLAYER_GAMEDIR") or Path(__file__).resolve().parent)
    backup_path = state_file or (gamedir / ".es-bgm-state.json")
    candidates = settings_paths if settings_paths is not None else default_es_settings_paths()

    backup: dict[str, dict[str, str]] = {}
    if backup_path.is_file():
        try:
            loaded = json.loads(backup_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                backup = {
                    str(k): dict(v) for k, v in loaded.items() if isinstance(v, dict)
                }
        except Exception:
            backup = {}

    modified_files: list[str] = []
    for cfg_path in candidates:
        if not cfg_path.is_file():
            continue
        try:
            text = cfg_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        new_text = text
        cfg_key = str(cfg_path)
        file_changed = False
        for key in ES_BGM_KEYS:
            pat = re.compile(
                rf'(<bool\s+name="{re.escape(key)}"\s+value=")(true|false)("\s*/>)',
                re.IGNORECASE,
            )

            def _repl(match: re.Match[str], _key: str = key) -> str:
                nonlocal file_changed
                cur_val = match.group(2).lower()
                if cur_val == "true":
                    backup.setdefault(cfg_key, {})
                    if _key not in backup[cfg_key]:
                        backup[cfg_key][_key] = "true"
                    file_changed = True
                    return f"{match.group(1)}false{match.group(3)}"
                return match.group(0)

            new_text = pat.sub(_repl, new_text)

        if file_changed and new_text != text:
            if _atomic_write_text(cfg_path, new_text):
                modified_files.append(cfg_key)

    if backup:
        try:
            backup_path.parent.mkdir(parents=True, exist_ok=True)
            _atomic_write_text(backup_path, json.dumps(backup, indent=2))
        except OSError:
            pass

    procs_stopped = _stop_external_es_bgm_procs() if stop_procs else 0
    pulse_muted = _pactl_set_es_mute(True) if touch_pulse else 0
    return {
        "modified_files": modified_files,
        "procs_stopped": procs_stopped,
        "pulse_muted": pulse_muted,
    }


def restore_es_bgm(
    state_file: Path | None = None,
    touch_pulse: bool = True,
) -> dict[str, Any]:
    """Restore EmulationStation's original BGM settings backed up by `silence_es_bgm()`."""
    gamedir = Path(os.environ.get("KPLAYER_GAMEDIR") or Path(__file__).resolve().parent)
    backup_path = state_file or (gamedir / ".es-bgm-state.json")

    restored_files: list[str] = []
    if backup_path.is_file():
        try:
            backup = json.loads(backup_path.read_text(encoding="utf-8"))
        except Exception:
            backup = {}
        if isinstance(backup, dict):
            for cfg_str, key_map in backup.items():
                if not isinstance(key_map, dict):
                    continue
                cfg_path = Path(cfg_str)
                if not cfg_path.is_file():
                    continue
                try:
                    text = cfg_path.read_text(encoding="utf-8", errors="ignore")
                except OSError:
                    continue
                new_text = text
                for key, orig_val in key_map.items():
                    if key not in ES_BGM_KEYS:
                        continue
                    val = "true" if str(orig_val).lower() == "true" else "false"
                    pat = re.compile(
                        rf'(<bool\s+name="{re.escape(key)}"\s+value=")(true|false)("\s*/>)',
                        re.IGNORECASE,
                    )
                    new_text = pat.sub(rf"\g<1>{val}\g<3>", new_text)
                if new_text != text and _atomic_write_text(cfg_path, new_text):
                    restored_files.append(cfg_str)
        try:
            backup_path.unlink(missing_ok=True)
        except OSError:
            pass

    pulse_unmuted = _pactl_set_es_mute(False) if touch_pulse else 0
    return {"restored_files": restored_files, "pulse_unmuted": pulse_unmuted}


# ==================== AUDIO BACKEND & ENV HELPERS ====================


def detect_audio_backend(env: dict[str, str] | None = None) -> str:
    """Detect whether PulseAudio/PipeWire is active; otherwise use ALSA dmix."""
    env_map = env if env is not None else os.environ
    candidates: list[Path] = []
    xdg = env_map.get("XDG_RUNTIME_DIR")
    if xdg:
        candidates.append(Path(xdg) / "pulse" / "native")
        candidates.append(Path(xdg) / "pipewire-0")
    try:
        uid = os.getuid()
        candidates.append(Path(f"/run/user/{uid}/pulse/native"))
        candidates.append(Path(f"/run/user/{uid}/pipewire-0"))
    except AttributeError:
        pass
    for sock in candidates:
        try:
            if sock.exists():
                return "pulse"
        except OSError:
            continue
    return "alsa"


def detect_alsa_hw_device(pcm_path: Path = Path("/proc/asound/pcm")) -> str:
    """Find the first ALSA playback hardware device (e.g. hw:0,0) on R36S."""
    try:
        if pcm_path.is_file():
            for line in pcm_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                if "playback" not in line.lower():
                    continue
                m = re.match(r"^\s*(\d+)-(\d+):", line)
                if m:
                    card = int(m.group(1))
                    dev = int(m.group(2))
                    return f"hw:{card},{dev}"
    except OSError:
        pass
    return "hw:0,0"


def create_alsa_dmix_config(
    hw_device: str = "hw:0,0",
    base_dir: Path | None = None,
) -> Path | None:
    """Create a temporary ALSA config enabling shared dmix playback for game + KPlayer."""
    if not re.fullmatch(r"hw:\d+,\d+", hw_device):
        hw_device = "hw:0,0"
    dir_str = str(base_dir) if base_dir is not None else tempfile.gettempdir()
    conf_text = (
        "</usr/share/alsa/alsa.conf>\n"
        "\n"
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
        "}\n"
        "\n"
        "pcm.!default {\n"
        "    type plug\n"
        '    slave.pcm "kp_dmix"\n'
        "}\n"
    )
    try:
        fd, raw_path = tempfile.mkstemp(prefix="kp-alsa-dmix-", suffix=".conf", dir=dir_str)
        try:
            os.write(fd, conf_text.encode("utf-8"))
        finally:
            os.close(fd)
        return Path(raw_path)
    except OSError:
        return None


def build_target_env(
    base_env: dict[str, str],
    alsa_conf_path: Path | None = None,
    overlay_so: Path | None = None,
    overlay_shm: Path | None = None,
) -> dict[str, str]:
    """Build clean environment for the launched game (no KPlayer VLC lib leakage)."""
    env = dict(base_env)
    orig_ld = env.get("KPLAYER_ORIG_LD_LIBRARY_PATH")
    if orig_ld is not None:
        if orig_ld.strip():
            env["LD_LIBRARY_PATH"] = orig_ld
        else:
            env.pop("LD_LIBRARY_PATH", None)
    env.pop("VLC_PLUGIN_PATH", None)
    env.pop("VLC_DATA_PATH", None)
    if alsa_conf_path is not None:
        env["ALSA_CONFIG_PATH"] = str(alsa_conf_path)
    if overlay_shm is not None:
        env["KPLAYER_OVERLAY_SHM"] = str(overlay_shm)
    if overlay_so is not None and overlay_so.is_file():
        cur_preload = env.get("LD_PRELOAD", "").strip()
        so_str = str(overlay_so)
        parts = [p for p in cur_preload.split(":") if p]
        if so_str not in parts:
            parts.insert(0, so_str)
            env["LD_PRELOAD"] = ":".join(parts)
    return env


def build_audio_env(
    base_env: dict[str, str],
    backend: str,
    alsa_conf_path: Path | None = None,
    gamedir: Path | None = None,
    overlay_shm: Path | None = None,
) -> dict[str, str]:
    """Build environment for headless ./kplayer --bg-audio with bundled libvlc.so.5."""
    env = dict(base_env)
    env.pop("LD_PRELOAD", None)
    gdir = gamedir or Path(env.get("KPLAYER_GAMEDIR") or Path(__file__).resolve().parent)
    env["KPLAYER_GAMEDIR"] = str(gdir)
    lib_dir = gdir / "lib"
    if lib_dir.is_dir():
        cur_ld = env.get("LD_LIBRARY_PATH", "")
        parts = [p for p in cur_ld.split(":") if p]
        if str(lib_dir) not in parts:
            parts.insert(0, str(lib_dir))
            env["LD_LIBRARY_PATH"] = ":".join(parts)
    env["KPLAYER_BG_AOUT"] = backend
    env["KPLAYER_BG_ALSA_DEV"] = "default"
    if alsa_conf_path is not None and backend == "alsa":
        env["ALSA_CONFIG_PATH"] = str(alsa_conf_path)
    if overlay_shm is not None:
        env["KPLAYER_OVERLAY_SHM"] = str(overlay_shm)
    return env


def build_target_cmd(validated: dict[str, Any]) -> list[str]:
    """Build argv list to execute the target script or executable safely."""
    target = validated["target_path"]
    extra = validated.get("target_args") or []
    if validated["is_script"]:
        shell_bin = "/bin/bash" if Path("/bin/bash").is_file() else "/bin/sh"
        return [shell_bin, target, *extra]
    return [target, *extra]


def build_audio_cmd(
    validated: dict[str, Any],
    which_fn=shutil.which,
    kplayer_bin: Path | None = None,
    payload_path: Path | None = None,
    game_pid: int | None = None,
    backend: str = "alsa",
) -> list[str] | None:
    """Build headless background audio argv (native ./kplayer --bg-audio -> cvlc -> mpv -> ffplay)."""
    if not validated.get("bg_audio_enabled"):
        return None

    if kplayer_bin is not None and payload_path is not None:
        if kplayer_bin.is_file() and os.access(kplayer_bin, os.X_OK):
            cmd = [str(kplayer_bin), "--bg-audio", str(payload_path)]
            if game_pid is not None and game_pid >= 0:
                if game_pid > 1 or game_pid == 0:
                    cmd.append(str(game_pid))
            return cmd

    uri = validated.get("media_uri") or ""
    media_type = validated.get("media_type") or "none"
    if not uri or media_type == "none":
        return None
    if not validated.get("auto_play", True):
        return None

    vol_pct = int(validated.get("volume_pct", 55))
    gain = max(0.10, min(1.0, vol_pct / 100.0))
    start_sec = int(validated.get("media_pos_ms", 0) // 1000)
    aout_arg = "--aout=pulse" if backend == "pulse" else "--aout=alsa"

    cvlc = which_fn("cvlc") or which_fn("vlc")
    if cvlc:
        cmd = [
            cvlc,
            "--intf",
            "dummy",
            "--no-video",
            "--quiet",
            aout_arg,
            f"--gain={gain:.2f}",
        ]
        if media_type == "music":
            cmd.append("--loop")
            if start_sec > 0:
                cmd.append(f"--start-time={start_sec}")
        cmd.extend(["--", uri])
        return cmd

    mpv = which_fn("mpv")
    if mpv:
        cmd = [
            mpv,
            "--no-video",
            "--really-quiet",
            f"--volume={vol_pct}",
        ]
        if media_type == "music":
            cmd.append("--loop-file=inf")
            if start_sec > 0:
                cmd.append(f"--start={start_sec}")
        cmd.extend(["--", uri])
        return cmd

    ffplay = which_fn("ffplay")
    if ffplay:
        cmd = [
            ffplay,
            "-nodisp",
            "-loglevel",
            "quiet",
            "-volume",
            str(vol_pct),
        ]
        if media_type == "music" and start_sec > 0:
            cmd.extend(["-ss", str(start_sec)])
        cmd.append(uri)
        return cmd

    return None


def _resume_game_group(proc: subprocess.Popen | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGCONT)
    except OSError:
        try:
            proc.send_signal(signal.SIGCONT)
        except OSError:
            pass


def _stop_proc(proc: subprocess.Popen | None) -> None:
    if proc is None:
        return
    try:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=1.5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=1.0)
    except Exception:
        pass


def _pid_is_kplayer_audio(pid: int) -> bool:
    if pid <= 1:
        return False
    try:
        cmd = Path(f"/proc/{pid}/cmdline").read_bytes().decode("utf-8", errors="ignore").lower()
    except OSError:
        return False
    return any(tok in cmd for tok in ("--bg-audio", "kplayer", "cvlc", "mpv", "ffplay"))


# ==================== DETACHED EMULATIONSTATION DAEMON ====================


def stop_daemon(
    restore_es: bool = True,
    daemon_state_file: Path = DAEMON_STATE_FILE,
    es_state_file: Path | None = None,
) -> int:
    """Stop any running detached KPlayer background audio daemon and optionally restore ES BGM."""
    info: dict[str, Any] = {}
    if daemon_state_file.is_file():
        try:
            loaded = json.loads(daemon_state_file.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                info = loaded
        except Exception:
            info = {}

    pid = info.get("pid")
    if isinstance(pid, int) and pid > 1 and _pid_is_kplayer_audio(pid):
        try:
            os.kill(pid, signal.SIGTERM)
            deadline = time.monotonic() + 1.5
            while time.monotonic() < deadline:
                try:
                    os.kill(pid, 0)
                except OSError:
                    break
                time.sleep(0.05)
            else:
                try:
                    os.kill(pid, signal.SIGKILL)
                except OSError:
                    pass
        except OSError:
            pass

    for key in ("clean_json", "alsa_conf", "overlay_shm"):
        raw = info.get(key)
        if isinstance(raw, str) and raw:
            try:
                Path(raw).unlink(missing_ok=True)
            except OSError:
                pass

    try:
        daemon_state_file.unlink(missing_ok=True)
    except OSError:
        pass

    if restore_es:
        restore_es_bgm(state_file=es_state_file)
    return 0


def start_daemon(
    payload_path: Path,
    daemon_state_file: Path = DAEMON_STATE_FILE,
    shm_path: Path = DAEMON_SHM_PATH,
    es_state_file: Path | None = None,
) -> int:
    """Launch detached `./kplayer --bg-audio <json> 0` for EmulationStation & games outside KPlayer."""
    if not payload_path.is_file():
        return 1
    raw_bytes = payload_path.read_bytes()
    if len(raw_bytes) > MAX_PAYLOAD_BYTES:
        raise ValueError("Arquivo do serviço em 2º plano excede o tamanho permitido.")
    raw = json.loads(raw_bytes.decode("utf-8"))
    validated = validate_daemon_payload(raw)

    stop_daemon(restore_es=False, daemon_state_file=daemon_state_file, es_state_file=es_state_file)

    if not validated["bg_audio_enabled"]:
        try:
            payload_path.unlink(missing_ok=True)
        except OSError:
            pass
        return 0

    silence_es_bgm(state_file=es_state_file)

    gamedir = Path(os.environ.get("KPLAYER_GAMEDIR") or Path(__file__).resolve().parent)
    native_kplayer = gamedir / "kplayer"
    backend = detect_audio_backend(os.environ)
    alsa_conf: Path | None = None
    if backend == "alsa":
        hw_dev = detect_alsa_hw_device()
        alsa_conf = create_alsa_dmix_config(hw_dev)

    overlay_shm: Path | None = None
    try:
        fd_shm = os.open(str(shm_path), os.O_RDWR | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.ftruncate(fd_shm, 4096)
        finally:
            os.close(fd_shm)
        overlay_shm = shm_path
    except OSError:
        overlay_shm = None

    fd, tmp_json = tempfile.mkstemp(prefix="kp-daemon-", suffix=".json")
    try:
        os.write(fd, json.dumps(validated, ensure_ascii=False).encode("utf-8"))
    finally:
        os.close(fd)
    clean_json = Path(tmp_json)

    audio_cmd = build_audio_cmd(
        validated,
        kplayer_bin=native_kplayer if native_kplayer.is_file() else None,
        payload_path=clean_json,
        game_pid=0,
        backend=backend,
    )
    if not audio_cmd:
        for p in (clean_json, alsa_conf, overlay_shm, payload_path):
            if p is not None:
                try:
                    p.unlink(missing_ok=True)
                except OSError:
                    pass
        return 1

    audio_env = build_audio_env(
        os.environ,
        backend,
        alsa_conf,
        gamedir,
        overlay_shm=overlay_shm,
    )

    log_fd = None
    try:
        log_fd = open(DAEMON_LOG_PATH, "wb")
    except OSError:
        log_fd = None

    try:
        proc = subprocess.Popen(
            audio_cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=log_fd if log_fd is not None else subprocess.DEVNULL,
            env=audio_env,
            start_new_session=True,
            close_fds=True,
        )
    finally:
        if log_fd is not None:
            log_fd.close()

    meta = {
        "pid": proc.pid,
        "backend": backend,
        "clean_json": str(clean_json),
        "alsa_conf": str(alsa_conf) if alsa_conf else "",
        "overlay_shm": str(overlay_shm) if overlay_shm else "",
    }
    _atomic_write_text(daemon_state_file, json.dumps(meta, indent=2))
    try:
        payload_path.unlink(missing_ok=True)
    except OSError:
        pass
    sys.stderr.write(
        f"bg_audio: serviço em 2º plano iniciado para EmulationStation (pid={proc.pid}, faixas={len(validated['tracks'])})\n"
    )
    return 0


# ==================== IN-KPLAYER EXTERNAL GAME HANDOFF ====================


def run_handoff(payload_path: Path) -> int:
    """Execute the validated handoff descriptor and clean up background audio."""
    if not payload_path.is_file():
        return 1
    raw_bytes = payload_path.read_bytes()
    if len(raw_bytes) > MAX_PAYLOAD_BYTES:
        raise ValueError("Arquivo de lançamento excede o tamanho permitido.")
    raw = json.loads(raw_bytes.decode("utf-8"))
    validated = validate_launch_payload(raw)

    gamedir = Path(os.environ.get("KPLAYER_GAMEDIR") or Path(__file__).resolve().parent)
    native_kplayer = gamedir / "kplayer"
    overlay_so = gamedir / "libkp_overlay.so"
    backend = detect_audio_backend(os.environ)
    alsa_conf: Path | None = None
    clean_json_path: Path | None = None
    overlay_shm_path: Path | None = None

    if validated["bg_audio_enabled"]:
        silence_es_bgm()
        try:
            shm_fd, shm_raw = tempfile.mkstemp(prefix="kp-ov-", suffix=".shm")
            try:
                os.ftruncate(shm_fd, 4096)
            finally:
                os.close(shm_fd)
            overlay_shm_path = Path(shm_raw)
        except OSError:
            overlay_shm_path = None

    if validated["bg_audio_enabled"] and backend == "alsa":
        hw_dev = detect_alsa_hw_device()
        alsa_conf = create_alsa_dmix_config(hw_dev)
        if alsa_conf:
            sys.stderr.write(
                f"bg_audio: ALSA dmix ativado ({hw_dev}) em {alsa_conf}\n"
            )
    elif validated["bg_audio_enabled"]:
        sys.stderr.write("bg_audio: servidor PulseAudio/PipeWire detectado (mixagem nativa)\n")

    audio_proc: subprocess.Popen | None = None
    target_proc: subprocess.Popen | None = None

    def _on_signal(_signum, _frame):
        _resume_game_group(target_proc)
        _stop_proc(audio_proc)
        _stop_proc(target_proc)
        raise SystemExit(130)

    old_int = signal.signal(signal.SIGINT, _on_signal)
    old_term = signal.signal(signal.SIGTERM, _on_signal)

    try:
        target_cmd = build_target_cmd(validated)
        work_dir = str(Path(validated["target_path"]).parent)
        target_env = build_target_env(
            os.environ,
            alsa_conf,
            overlay_so=overlay_so if validated["bg_audio_enabled"] else None,
            overlay_shm=overlay_shm_path,
        )
        target_proc = subprocess.Popen(
            target_cmd,
            cwd=work_dir if os.path.isdir(work_dir) else None,
            env=target_env,
            start_new_session=True,
            close_fds=True,
        )

        if validated["bg_audio_enabled"]:
            fd, tmp_json = tempfile.mkstemp(prefix="kp-bg-", suffix=".json")
            try:
                os.write(fd, json.dumps(validated, ensure_ascii=False).encode("utf-8"))
            finally:
                os.close(fd)
            clean_json_path = Path(tmp_json)

            audio_cmd = build_audio_cmd(
                validated,
                kplayer_bin=native_kplayer if native_kplayer.is_file() else None,
                payload_path=clean_json_path,
                game_pid=target_proc.pid,
                backend=backend,
            )
            if audio_cmd:
                audio_env = build_audio_env(
                    os.environ,
                    backend,
                    alsa_conf,
                    gamedir,
                    overlay_shm=overlay_shm_path,
                )
                sys.stderr.write(
                    f"bg_audio: iniciando mini-player ({audio_cmd[0]}, backend={backend}, faixas={len(validated['tracks'])}, overlay={'sim' if overlay_so.is_file() else 'fb0'})\n"
                )
                try:
                    audio_proc = subprocess.Popen(
                        audio_cmd,
                        stdin=subprocess.DEVNULL,
                        stdout=subprocess.DEVNULL,
                        stderr=sys.stderr,
                        env=audio_env,
                        close_fds=True,
                    )
                except OSError as exc:
                    sys.stderr.write(f"bg_audio: falha ao iniciar daemon de áudio: {exc}\n")
                    audio_proc = None
            else:
                sys.stderr.write("bg_audio: nenhum motor de áudio disponível para reprodução em fundo.\n")

        return int(target_proc.wait())
    finally:
        _resume_game_group(target_proc)
        _stop_proc(audio_proc)
        signal.signal(signal.SIGINT, old_int)
        signal.signal(signal.SIGTERM, old_term)
        for p in (clean_json_path, alsa_conf, overlay_shm_path, payload_path):
            if p is not None:
                try:
                    p.unlink(missing_ok=True)
                except OSError:
                    pass


def main(argv: list[str]) -> int:
    if len(argv) >= 3 and argv[1] == "run":
        try:
            return run_handoff(Path(argv[2]))
        except Exception as exc:
            sys.stderr.write(f"bg_audio: {exc}\n")
            return 1
    if len(argv) >= 3 and argv[1] == "start-daemon":
        try:
            return start_daemon(Path(argv[2]))
        except Exception as exc:
            sys.stderr.write(f"bg_audio: {exc}\n")
            return 1
    if len(argv) >= 2 and argv[1] == "stop-daemon":
        keep_mute = "--keep-es-mute" in argv[2:]
        return stop_daemon(restore_es=not keep_mute)
    if len(argv) >= 2 and argv[1] == "es-bgm-mute":
        silence_es_bgm()
        return 0
    if len(argv) >= 2 and argv[1] == "es-bgm-restore":
        restore_es_bgm()
        return 0
    sys.stderr.write(
        "Uso: bg_audio.py <run|start-daemon> <json> | stop-daemon [--keep-es-mute] | es-bgm-mute | es-bgm-restore\n"
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
