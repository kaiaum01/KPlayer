#!/usr/bin/env python3
"""Unit tests for v2.1.4 bg_audio.py (Teste prévio) and pdf_ops.py (PdfCraft R36S compatible)."""
from pathlib import Path
import importlib.util
import json
import os
import stat
import sys
import tempfile
import unittest
from unittest import mock

BASE = Path(__file__).resolve().parents[1]


def _load_module(name: str, rel_path: str):
    spec = importlib.util.spec_from_file_location(name, BASE / rel_path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


bg_audio = _load_module("kp_bg_audio", "ports/kplayer/bg_audio.py")
pdf_ops = _load_module("kp_pdf_ops", "ports/kplayer/pdf_ops.py")


def _build_minimal_two_page_pdf() -> bytes:
    """Create a valid 2-page PDF with Helvetica text streams."""
    objs = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Length 58 >>\nstream\nBT /F1 18 Tf 50 720 Td (KPlayer v2.1.4 Page One) Tj ET\nendstream\nendobj\n",
        b"5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>\nendobj\n",
        b"6 0 obj\n<< /Length 62 >>\nstream\nBT /F1 18 Tf 50 720 Td (PdfCraft R36S Compatible Page Two) Tj ET\nendstream\nendobj\n",
        b"7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        b"8 0 obj\n<< /Title (Manual R36S Test) >>\nendobj\n",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objs:
        offsets.append(len(out))
        out.extend(obj)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode("ascii"))
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("ascii"))
    out.extend(
        f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R /Info 8 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("ascii")
    )
    return bytes(out)


class BgAudioPreviewTest(unittest.TestCase):
    def test_validate_payload_and_build_commands(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            game_sh = Path(tmp) / "Celeste.sh"
            game_sh.write_text("#!/bin/bash\necho ok\n", encoding="utf-8")
            song = Path(tmp) / "tema.mp3"
            song.write_bytes(b"ID3" + b"\x00" * 64)

            v_music = bg_audio.validate_launch_payload(
                {
                    "target_path": str(game_sh),
                    "is_script": True,
                    "bg_audio_enabled": True,
                    "media_type": "music",
                    "media_uri": str(song),
                    "media_pos_ms": 15000,
                    "volume_pct": 55,
                    "media_title": "Tema Legal",
                }
            )
            self.assertEqual(v_music["media_type"], "music")
            self.assertEqual(v_music["volume_pct"], 55)
            self.assertEqual(bg_audio.build_target_cmd(v_music), ["/bin/bash", str(game_sh)])

            cmd = bg_audio.build_audio_cmd(
                v_music,
                which_fn=lambda name: f"/usr/bin/{name}" if name == "cvlc" else None,
            )
            assert cmd is not None
            self.assertEqual(cmd[0], "/usr/bin/cvlc")
            self.assertIn("--start-time=15", cmd)
            self.assertIn(str(song), cmd)

            # Radio URL validation: accepts https, rejects file:// or control chars
            v_radio = bg_audio.validate_launch_payload(
                {
                    "target_path": str(game_sh),
                    "is_script": True,
                    "bg_audio_enabled": True,
                    "media_type": "radio",
                    "media_uri": "https://stream.example.org/radio.mp3",
                    "volume_pct": 50,
                }
            )
            self.assertEqual(v_radio["media_type"], "radio")

            v_bad_radio = bg_audio.validate_launch_payload(
                {
                    "target_path": str(game_sh),
                    "is_script": True,
                    "bg_audio_enabled": True,
                    "media_type": "radio",
                    "media_uri": "file:///etc/passwd",
                }
            )
            self.assertEqual(v_bad_radio["media_type"], "none")
            self.assertFalse(v_bad_radio["bg_audio_enabled"])

            with self.assertRaises(ValueError):
                bg_audio.validate_launch_payload({"target_path": "relative/path.sh"})

    def test_run_handoff_executes_script_and_cleans_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            marker = Path(tmp) / "ran.txt"
            game_sh = Path(tmp) / "test_game.sh"
            game_sh.write_text(f"#!/bin/bash\necho executed > '{marker}'\n", encoding="utf-8")
            game_sh.chmod(0o755)
            payload_file = Path(tmp) / ".bg-launch.json"
            payload_file.write_text(
                json.dumps(
                    {
                        "target_path": str(game_sh),
                        "is_script": True,
                        "bg_audio_enabled": False,
                        "media_type": "none",
                        "media_uri": "",
                    }
                ),
                encoding="utf-8",
            )
            rc = bg_audio.run_handoff(payload_file)
            self.assertEqual(rc, 0)
            self.assertEqual(marker.read_text(encoding="utf-8").strip(), "executed")
            self.assertFalse(payload_file.exists())

    def test_native_bg_audio_cmd_dmix_and_env_isolation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            game_sh = tmp_dir / "Port.sh"
            game_sh.write_text("#!/bin/bash\nexit 0\n", encoding="utf-8")
            s1 = tmp_dir / "a.mp3"
            s2 = tmp_dir / "b.mp3"
            s1.write_bytes(b"ID3" + b"\x00" * 32)
            s2.write_bytes(b"ID3" + b"\x00" * 32)
            fake_kplayer = tmp_dir / "kplayer"
            fake_kplayer.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
            fake_kplayer.chmod(0o755)
            payload_p = tmp_dir / "handoff.json"

            validated = bg_audio.validate_launch_payload(
                {
                    "target_path": str(game_sh),
                    "is_script": True,
                    "bg_audio_enabled": True,
                    "auto_play": False,
                    "media_type": "music",
                    "media_uri": str(s1),
                    "volume_pct": 60,
                    "theme_accent": "#22d3ee",
                    "track_index": 1,
                    "tracks": [
                        {"uri": str(s1), "title": "Song A", "type": "music"},
                        {"uri": str(s2), "title": "Song B", "type": "music"},
                        {"uri": "file:///etc/passwd", "title": "Bad", "type": "radio"},
                    ],
                }
            )
            self.assertTrue(validated["bg_audio_enabled"])
            self.assertEqual(len(validated["tracks"]), 2)
            self.assertEqual(validated["track_index"], 1)
            self.assertEqual(validated["theme_accent"], "#22d3ee")

            # Prefers native ./kplayer --bg-audio <json> <game_pid>
            cmd = bg_audio.build_audio_cmd(
                validated,
                kplayer_bin=fake_kplayer,
                payload_path=payload_p,
                game_pid=4321,
                backend="alsa",
            )
            self.assertEqual(cmd, [str(fake_kplayer), "--bg-audio", str(payload_p), "4321"])

            # ALSA dmix config must include /usr/share/alsa/alsa.conf and detected hw:1,2
            fake_pcm = tmp_dir / "pcm"
            fake_pcm.write_text("01-02: RK3326 Audio : : playback 1\n", encoding="utf-8")
            hw = bg_audio.detect_alsa_hw_device(fake_pcm)
            self.assertEqual(hw, "hw:1,2")
            dmix_conf = bg_audio.create_alsa_dmix_config(hw, base_dir=tmp_dir)
            assert dmix_conf is not None and dmix_conf.is_file()
            text = dmix_conf.read_text(encoding="utf-8")
            self.assertTrue(text.startswith("</usr/share/alsa/alsa.conf>"))
            self.assertIn('pcm "hw:1,2"', text)
            self.assertIn("type dmix", text)

            # Game env restores KPLAYER_ORIG_LD_LIBRARY_PATH, strips VLC env vars, and injects libkp_overlay.so
            fake_overlay = tmp_dir / "libkp_overlay.so"
            fake_overlay.write_bytes(b"\x7fELF")
            fake_shm = tmp_dir / "kp-ov-test.shm"
            base_env = {
                "LD_LIBRARY_PATH": "/roms/ports/kplayer/lib:/usr/local/lib",
                "KPLAYER_ORIG_LD_LIBRARY_PATH": "/usr/local/lib",
                "VLC_PLUGIN_PATH": "/usr/lib/aarch64-linux-gnu/vlc/plugins",
                "VLC_DATA_PATH": "/usr/share/vlc",
                "LD_PRELOAD": "/usr/lib/existing.so",
            }
            game_env = bg_audio.build_target_env(
                base_env, dmix_conf, overlay_so=fake_overlay, overlay_shm=fake_shm
            )
            self.assertEqual(game_env["LD_LIBRARY_PATH"], "/usr/local/lib")
            self.assertNotIn("VLC_PLUGIN_PATH", game_env)
            self.assertEqual(game_env["ALSA_CONFIG_PATH"], str(dmix_conf))
            self.assertEqual(game_env["KPLAYER_OVERLAY_SHM"], str(fake_shm))
            self.assertEqual(game_env["LD_PRELOAD"], f"{fake_overlay}:/usr/lib/existing.so")

            # Audio daemon env keeps KPLAYER_BG_AOUT, ALSA_CONFIG_PATH, KPLAYER_OVERLAY_SHM and drops LD_PRELOAD
            audio_env = bg_audio.build_audio_env(
                base_env, "alsa", dmix_conf, tmp_dir, overlay_shm=fake_shm
            )
            self.assertEqual(audio_env["KPLAYER_BG_AOUT"], "alsa")
            self.assertEqual(audio_env["ALSA_CONFIG_PATH"], str(dmix_conf))
            self.assertEqual(audio_env["KPLAYER_OVERLAY_SHM"], str(fake_shm))
            self.assertNotIn("LD_PRELOAD", audio_env)

    def test_es_daemon_payload_and_reversible_es_bgm_silencer(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            song = tmp_dir / "es_track.mp3"
            song.write_bytes(b"ID3" + b"\x00" * 32)

            v_daemon = bg_audio.validate_daemon_payload(
                {
                    "bg_audio_enabled": True,
                    "auto_play": True,
                    "media_type": "music",
                    "media_uri": str(song),
                    "volume_pct": 65,
                    "theme_accent": "#1db954",
                    "tracks": [{"uri": str(song), "title": "ES Track", "type": "music"}],
                    "track_index": 0,
                }
            )
            self.assertTrue(v_daemon["bg_audio_enabled"])
            self.assertEqual(v_daemon["target_path"], "")
            self.assertEqual(len(v_daemon["tracks"]), 1)

            # Reversible ES BGM silencer on a temp es_settings.cfg (never touches gamelist.xml)
            es_cfg = tmp_dir / "es_settings.cfg"
            es_cfg.write_text(
                '<?xml version="1.0"?>\n'
                '<bool name="audio.bgmusic" value="true" />\n'
                '<bool name="BackgroundMusic" value="true" />\n'
                '<string name="ThemeSet" value="es-theme-epic-noir" />\n',
                encoding="utf-8",
            )
            gamelist = tmp_dir / "gamelist.xml"
            gamelist_orig = "<gameList><game><name>KPlayer</name></game></gameList>\n"
            gamelist.write_text(gamelist_orig, encoding="utf-8")
            state_file = tmp_dir / ".es-bgm-state.json"

            res_mute = bg_audio.silence_es_bgm(
                state_file=state_file,
                settings_paths=[es_cfg],
                stop_procs=False,
                touch_pulse=False,
            )
            self.assertEqual(res_mute["modified_files"], [str(es_cfg)])
            muted_xml = es_cfg.read_text(encoding="utf-8")
            self.assertIn('<bool name="audio.bgmusic" value="false" />', muted_xml)
            self.assertIn('<bool name="BackgroundMusic" value="false" />', muted_xml)
            self.assertTrue(state_file.is_file())

            # Calling silence_es_bgm a second time must preserve the original "true" backup
            bg_audio.silence_es_bgm(
                state_file=state_file,
                settings_paths=[es_cfg],
                stop_procs=False,
                touch_pulse=False,
            )

            res_restore = bg_audio.restore_es_bgm(state_file=state_file, touch_pulse=False)
            self.assertEqual(res_restore["restored_files"], [str(es_cfg)])
            restored_xml = es_cfg.read_text(encoding="utf-8")
            self.assertIn('<bool name="audio.bgmusic" value="true" />', restored_xml)
            self.assertIn('<bool name="BackgroundMusic" value="true" />', restored_xml)
            self.assertFalse(state_file.exists())
            self.assertEqual(gamelist.read_text(encoding="utf-8"), gamelist_orig)


class PdfOpsPdfCraftCompatTest(unittest.TestCase):
    def test_pure_python_pdf_inspect_and_text_extraction(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf_file = Path(tmp) / "Manual.pdf"
            pdf_file.write_bytes(_build_minimal_two_page_pdf())

            info = pdf_ops.pure_python_pdf_inspect(pdf_file)
            self.assertEqual(info["pages"], 2)
            self.assertFalse(info["encrypted"])
            self.assertEqual(info["title"], "Manual R36S Test")
            self.assertIn("KPlayer v2.1.4 Page One", info["page_texts"][0])
            self.assertIn("PdfCraft R36S Compatible Page Two", info["page_texts"][1])

            with mock.patch.object(pdf_ops, "find_pdfcraft_core", return_value=None):
                res = pdf_ops.pdf_extract_text(pdf_file, 2)
                self.assertTrue(res["ok"])
                self.assertIn("Page Two", res["text"])

    def test_pdfcraft_serve_atomic_json_ipc_protocol(self) -> None:
        """Verify pdf_ops.py speaks the exact atomic-rename JSON IPC of kaiaum01/PdfReader-R36s."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            pdf_file = tmp_dir / "Sample.pdf"
            pdf_file.write_bytes(_build_minimal_two_page_pdf())

            # Mock pdfcraft-core.aarch64 binary speaking the real PdfCraft `serve <session_dir>` protocol
            mock_core = tmp_dir / "pdfcraft-core.aarch64"
            mock_core.write_text(
                f"""#!{sys.executable}
import base64, json, os, sys, time
from pathlib import Path

assert len(sys.argv) >= 3 and sys.argv[1] == "serve"
sdir = Path(sys.argv[2])
(sdir / "ready.json").write_text(json.dumps({{"ok": True, "version": "0.6.0"}}), encoding="utf-8")

req_p = sdir / "request.json"
resp_p = sdir / "response.json"
# 1x1 PNG
TINY_PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")

deadline = time.monotonic() + 8.0
while time.monotonic() < deadline:
    if not req_p.is_file():
        time.sleep(0.01)
        continue
    req = json.loads(req_p.read_text(encoding="utf-8"))
    req_p.unlink(missing_ok=True)
    op = req.get("op")
    if op == "open":
        out = {{"id": req["id"], "ok": True, "count": 2, "pages": [{{"width": 612, "height": 792}}, {{"width": 612, "height": 792}}], "title": "PdfCraft Mock Doc"}}
    elif op == "render":
        (sdir / "page.png").write_bytes(TINY_PNG)
        out = {{"id": req["id"], "ok": True, "width": 640, "height": 480}}
    elif op == "text":
        out = {{"id": req["id"], "ok": True, "text": "Texto extraido via PdfCraft serve IPC"}}
    elif op == "quit":
        out = {{"id": req["id"], "ok": True}}
        (sdir / "response.tmp").write_text(json.dumps(out), encoding="utf-8")
        os.replace(sdir / "response.tmp", resp_p)
        break
    else:
        out = {{"id": req["id"], "ok": False, "error": "unknown op"}}
    (sdir / "response.tmp").write_text(json.dumps(out), encoding="utf-8")
    os.replace(sdir / "response.tmp", resp_p)
""",
                encoding="utf-8",
            )
            mock_core.chmod(mock_core.stat().st_mode | stat.S_IXUSR)

            with mock.patch.object(pdf_ops, "find_pdfcraft_core", return_value=mock_core):
                info = pdf_ops.pdf_info(pdf_file)
                self.assertTrue(info["ok"])
                self.assertEqual(info["engine"], "PdfCraft R36S")
                self.assertEqual(info["pages"], 2)
                self.assertEqual(info["title"], "PdfCraft Mock Doc")

                out_png = tmp_dir / "rendered.png"
                rendered = pdf_ops.pdf_render_page(pdf_file, 1, 1.0, 0, 0, 640, 480, out_png)
                self.assertTrue(rendered["ok"])
                self.assertEqual(rendered["engine"], "PdfCraft R36S")
                self.assertTrue(out_png.is_file() and out_png.stat().st_size > 20)

                text_res = pdf_ops.pdf_extract_text(pdf_file, 1)
                self.assertTrue(text_res["ok"])
                self.assertEqual(text_res["engine"], "PdfCraft R36S")
                self.assertIn("PdfCraft serve IPC", text_res["text"])


if __name__ == "__main__":
    unittest.main()
