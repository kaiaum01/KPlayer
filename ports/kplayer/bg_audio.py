#!/usr/bin/env python3
"""Background audio & external launch handoff for KPlayer R36S (v2.1.4 — Teste prévio).

Invoked by KPlayer.sh when ./kplayer exits with code 43 after writing a JSON
handoff descriptor (e.g. ./.bg-launch.json). Safely runs a `.sh` game script,
EmulationStation binary, or PdfCraft.sh while running KPlayer's native headless
`./kplayer --bg-audio <handoff.json> <game_pid>` Mini-Player daemon (with
PulseAudio/PipeWire or ALSA dmix shared mixing and isolated LD_LIBRARY_PATH).

In-game controls (handled natively via Linux evdev in `./kplayer --bg-audio`):
  - SELECT + R2: Open / Close In-Game Mini-Player (/dev/fb0 overlay)
  - R2 (when open): Next track / radio station
  - L2 (when open): Previous track / radio station (or SELECT + L2 when closed)
  - B / START (when open): Pause / Resume
  - UP / DOWN (when open): Background volume +/- 10%
  - A (when open): Close Mini-Player and resume game
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
from urllib.parse import urlparse


ALLOWED_SCHEMES = {"http", "https"}
MAX_PAYLOAD_BYTES = 256 * 1024
MAX_TRACKS = 128


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


def validate_launch_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalize a KPlayer handoff payload without side effects."""
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

    target_args: list[str] = []
    raw_args = payload.get("target_args")
    if isinstance(raw_args, list):
        for item in raw_args[:8]:
            s = str(item)
            if s and not _has_ctrl_chars(s):
                target_args.append(s)

    has_playable = bg_enabled and (media_type != "none" or len(validated_tracks) > 0)

    return {
        "target_path": str(target_path),
        "target_args": target_args,
        "is_script": is_script,
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
        f"        pcm \"{hw_device}\"\n"
        "        rate 48000\n"
        "        period_size 1024\n"
        "        buffer_size 4096\n"
        "    }\n"
        "}\n"
        "\n"
        "pcm.!default {\n"
        "    type plug\n"
        "    slave.pcm \"kp_dmix\"\n"
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
    return env


def build_audio_env(
    base_env: dict[str, str],
    backend: str,
    alsa_conf_path: Path | None = None,
    gamedir: Path | None = None,
) -> dict[str, str]:
    """Build environment for headless ./kplayer --bg-audio with bundled libvlc.so.5."""
    env = dict(base_env)
    gdir = gamedir or Path(env.get("KPLAYER_GAMEDIR") or Path(__file__).resolve().parent)
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
            if game_pid and game_pid > 1:
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
    backend = detect_audio_backend(os.environ)
    alsa_conf: Path | None = None
    clean_json_path: Path | None = None

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
        target_env = build_target_env(os.environ, alsa_conf)
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
                audio_env = build_audio_env(os.environ, backend, alsa_conf, gamedir)
                sys.stderr.write(
                    f"bg_audio: iniciando mini-player ({audio_cmd[0]}, backend={backend}, faixas={len(validated['tracks'])})\n"
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
        for p in (clean_json_path, alsa_conf, payload_path):
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
    sys.stderr.write("Uso: bg_audio.py run <handoff.json>\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
