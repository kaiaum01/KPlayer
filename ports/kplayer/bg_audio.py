#!/usr/bin/env python3
"""Background audio & external launch handoff for KPlayer R36S (v2.1.4 — Teste prévio).

Invoked by KPlayer.sh when ./kplayer exits with code 43 after writing a JSON
handoff descriptor (e.g. ./.bg-launch.json). Safely runs a `.sh` game script,
EmulationStation binary, or PdfCraft.sh while optionally keeping local music or
online radio playing in the background at ducked volume via ALSA/Pulse/PipeWire.
Always stops the background audio cleanly before returning control to KPlayer.
"""
from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


ALLOWED_SCHEMES = {"http", "https"}
MAX_PAYLOAD_BYTES = 32 * 1024


def _has_ctrl_chars(text: str) -> bool:
    return any(ord(ch) < 32 or ord(ch) == 127 for ch in text)


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
    media_type = str(payload.get("media_type") or "none").strip().lower()
    if media_type not in {"none", "music", "radio"}:
        media_type = "none"

    media_uri = str(payload.get("media_uri") or "").strip()
    if _has_ctrl_chars(media_uri):
        media_uri = ""
        media_type = "none"

    if bg_enabled and media_type == "music":
        if not media_uri or not Path(media_uri).is_file():
            media_type = "none"
            media_uri = ""
    elif bg_enabled and media_type == "radio":
        parsed = urlparse(media_uri)
        if parsed.scheme.lower() not in ALLOWED_SCHEMES or not parsed.netloc:
            media_type = "none"
            media_uri = ""
    else:
        media_type = "none"
        media_uri = ""

    raw_pos = payload.get("media_pos_ms", 0)
    try:
        media_pos_ms = max(0, int(raw_pos))
    except (TypeError, ValueError):
        media_pos_ms = 0

    raw_vol = payload.get("volume_pct", 50)
    try:
        volume_pct = max(15, min(100, int(raw_vol)))
    except (TypeError, ValueError):
        volume_pct = 50

    target_args: list[str] = []
    raw_args = payload.get("target_args")
    if isinstance(raw_args, list):
        for item in raw_args[:8]:
            s = str(item)
            if s and not _has_ctrl_chars(s):
                target_args.append(s)

    return {
        "target_path": str(target_path),
        "target_args": target_args,
        "is_script": is_script,
        "bg_audio_enabled": bg_enabled and media_type != "none",
        "media_type": media_type,
        "media_uri": media_uri,
        "media_pos_ms": media_pos_ms,
        "volume_pct": volume_pct,
        "title": str(payload.get("title") or "").strip()[:120],
    }


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
) -> list[str] | None:
    """Build headless background audio player argv (cvlc -> mpv -> ffplay)."""
    if not validated.get("bg_audio_enabled"):
        return None
    uri = validated.get("media_uri") or ""
    media_type = validated.get("media_type") or "none"
    if not uri or media_type == "none":
        return None

    vol_pct = int(validated.get("volume_pct", 50))
    gain = max(0.15, min(1.0, vol_pct / 100.0))
    start_sec = int(validated.get("media_pos_ms", 0) // 1000)

    cvlc = which_fn("cvlc") or which_fn("vlc")
    if cvlc:
        cmd = [
            cvlc,
            "--intf",
            "dummy",
            "--no-video",
            "--quiet",
            "--aout=alsa",
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

    audio_proc: subprocess.Popen | None = None
    target_proc: subprocess.Popen | None = None

    def _on_signal(_signum, _frame):
        _stop_proc(target_proc)
        _stop_proc(audio_proc)
        raise SystemExit(130)

    old_int = signal.signal(signal.SIGINT, _on_signal)
    old_term = signal.signal(signal.SIGTERM, _on_signal)

    try:
        audio_cmd = build_audio_cmd(validated)
        if audio_cmd:
            try:
                audio_proc = subprocess.Popen(
                    audio_cmd,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    close_fds=True,
                )
            except OSError:
                audio_proc = None

        target_cmd = build_target_cmd(validated)
        work_dir = str(Path(validated["target_path"]).parent)
        target_proc = subprocess.Popen(
            target_cmd,
            cwd=work_dir if os.path.isdir(work_dir) else None,
            close_fds=True,
        )
        return int(target_proc.wait())
    finally:
        _stop_proc(audio_proc)
        signal.signal(signal.SIGINT, old_int)
        signal.signal(signal.SIGTERM, old_term)
        try:
            payload_path.unlink(missing_ok=True)
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
