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


if str(BASE / "ports" / "kplayer") not in sys.path:
    sys.path.insert(0, str(BASE / "ports" / "kplayer"))

bg_audio = _load_module("kp_bg_audio", "ports/kplayer/bg_audio.py")
pdf_ops = _load_module("kp_pdf_ops", "ports/kplayer/pdf_ops.py")
system_inject = _load_module("kp_system_inject", "ports/kplayer/system_inject.py")


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
            self.assertNotIn("KPLAYER_DISABLE_OVERLAY", game_env)

            # Launching without Mini-Player sets KPLAYER_DISABLE_OVERLAY=1 even if system preload exists
            plain_env = bg_audio.build_target_env(base_env, None, overlay_so=None, overlay_shm=None)
            self.assertEqual(plain_env.get("KPLAYER_DISABLE_OVERLAY"), "1")

            # Audio daemon env keeps KPLAYER_BG_AOUT, ALSA_CONFIG_PATH, KPLAYER_OVERLAY_SHM and drops LD_PRELOAD
            audio_env = bg_audio.build_audio_env(
                base_env, "alsa", dmix_conf, tmp_dir, overlay_shm=fake_shm
            )
            self.assertEqual(audio_env["KPLAYER_BG_AOUT"], "alsa")
            self.assertEqual(audio_env["ALSA_CONFIG_PATH"], str(dmix_conf))
            self.assertEqual(audio_env["KPLAYER_OVERLAY_SHM"], str(fake_shm))
            self.assertNotIn("LD_PRELOAD", audio_env)


class SystemInjectTest(unittest.TestCase):
    def test_system_inject_install_and_full_reversible_uninstall(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            fake_root = tmp_dir / "rootfs"
            gamedir = tmp_dir / "ports" / "kplayer"
            music_dir = tmp_dir / "bgmusic"
            gamedir.mkdir(parents=True)
            music_dir.mkdir(parents=True)

            # Valid ELF header for libkp_overlay.so
            overlay_src = gamedir / "libkp_overlay.so"
            overlay_src.write_bytes(b"\x7fELF" + b"\x02\x01\x01\x00" + b"\x00" * 64)

            # Sample track & EmulationStation files
            song = music_dir / "theme.mp3"
            song.write_bytes(b"ID3" + b"\x00" * 32)

            es_cfg = fake_root / "home" / "ark" / ".emulationstation" / "es_settings.cfg"
            es_cfg.parent.mkdir(parents=True)
            orig_es_cfg = (
                '<?xml version="1.0"?>\n'
                '<bool name="BackgroundMusic" value="true" />\n'
                '<bool name="audio.bgmusic" value="true" />\n'
            )
            es_cfg.write_text(orig_es_cfg, encoding="utf-8")

            gamelist = fake_root / "roms" / "ports" / "gamelist.xml"
            gamelist.parent.mkdir(parents=True)
            orig_gamelist = "<gameList><game><name>KPlayer</name></game></gameList>\n"
            gamelist.write_text(orig_gamelist, encoding="utf-8")

            # Existing preload entry should be preserved alongside our lib
            preload_file = fake_root / "etc" / "ld.so.preload"
            preload_file.parent.mkdir(parents=True)
            preload_file.write_text("/usr/lib/other_existing.so\n", encoding="utf-8")

            # Install system-wide Mini-Player in isolated root
            inst = system_inject.install_system_miniplayer(
                gamedir,
                root=fake_root,
                music_dirs=[music_dir],
                run_system_cmds=False,
            )
            self.assertTrue(inst["ok"])
            self.assertTrue(inst["installed"])
            self.assertEqual(inst["tracks_count"], 1)

            # Verify installed artifacts
            self.assertTrue((fake_root / "usr/local/lib/libkp_overlay.so").is_file())
            self.assertTrue((fake_root / "usr/local/bin/kplayer-system-daemon.sh").is_file())
            self.assertTrue((fake_root / "etc/systemd/system/kplayer-miniplayer.service").is_file())
            self.assertTrue((fake_root / "etc/profile.d/kplayer-miniplayer.sh").is_file())

            preload_lines = preload_file.read_text(encoding="utf-8").splitlines()
            self.assertIn("/usr/lib/other_existing.so", preload_lines)
            self.assertIn("/usr/local/lib/libkp_overlay.so", preload_lines)

            # EmulationStation BGM disabled cleanly; gamelist.xml untouched
            es_after = es_cfg.read_text(encoding="utf-8")
            self.assertIn('name="BackgroundMusic" value="false"', es_after)
            self.assertIn('name="audio.bgmusic" value="false"', es_after)
            self.assertEqual(gamelist.read_text(encoding="utf-8"), orig_gamelist)

            st_on = system_inject.get_status(gamedir, root=fake_root, check_live_procs=False)
            self.assertTrue(st_on["installed"])
            self.assertTrue(st_on["preload_active"])
            self.assertTrue(st_on["service_installed"])
            self.assertEqual(st_on["tracks_count"], 1)

            # Full reversible uninstall
            uninst = system_inject.uninstall_system_miniplayer(
                gamedir,
                root=fake_root,
                run_system_cmds=False,
            )
            self.assertTrue(uninst["ok"])
            self.assertFalse(uninst["installed"])

            self.assertFalse((fake_root / "usr/local/lib/libkp_overlay.so").exists())
            self.assertFalse((fake_root / "usr/local/bin/kplayer-system-daemon.sh").exists())
            self.assertFalse((fake_root / "etc/systemd/system/kplayer-miniplayer.service").exists())
            self.assertFalse((fake_root / "etc/profile.d/kplayer-miniplayer.sh").exists())

            preload_after = preload_file.read_text(encoding="utf-8").splitlines()
            self.assertIn("/usr/lib/other_existing.so", preload_after)
            self.assertNotIn("/usr/local/lib/libkp_overlay.so", preload_after)

            # Original es_settings.cfg restored identically; gamelist.xml untouched
            self.assertEqual(es_cfg.read_text(encoding="utf-8"), orig_es_cfg)
            self.assertEqual(gamelist.read_text(encoding="utf-8"), orig_gamelist)

            st_off = system_inject.get_status(gamedir, root=fake_root, check_live_procs=False)
            self.assertFalse(st_off["installed"])
            self.assertFalse(st_off["preload_active"])


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


class Adult18FetchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.iptv_fetch = _load_module("kp_iptv_fetch", "ports/kplayer/iptv_fetch.py")

    def test_video_id_and_url_allowlist(self) -> None:
        f = self.iptv_fetch
        self.assertTrue(f.is_valid_adult_video_id("ph63a1b2c3d4e5f"))
        self.assertTrue(f.is_valid_adult_video_id("65f1a2b3c4d5e"))
        self.assertFalse(f.is_valid_adult_video_id("../etc/passwd"))
        self.assertFalse(f.is_valid_adult_video_id("ab"))
        self.assertFalse(f.is_valid_adult_video_id("id with space"))

        self.assertTrue(f.is_allowed_adult_url("https://www.pornhub.com/webmasters/categories"))
        self.assertTrue(f.is_allowed_adult_url("https://cv-h.phncdn.com/hls/videos/test.m3u8"))
        self.assertTrue(f.is_allowed_adult_url("https://www.xvideos.com/tags"))
        self.assertTrue(f.is_allowed_adult_url("https://hls-cdn77.xvideos-cdn.com/videos/hls/test.m3u8"))
        self.assertTrue(f.is_allowed_adult_url("https://thumb-cdn77.xnxx-cdn.com/thumb.jpg"))
        self.assertFalse(f.is_allowed_adult_url("http://www.pornhub.com/webmasters/categories"))
        self.assertFalse(f.is_allowed_adult_url("http://www.xvideos.com/tags"))
        self.assertFalse(f.is_allowed_adult_url("https://127.0.0.1/admin"))
        self.assertFalse(f.is_allowed_adult_url("https://evil.example.com/pornhub.com"))
        self.assertFalse(f.is_allowed_adult_url("https://evil.example.com/xvideos.com"))
        self.assertFalse(f.is_allowed_adult_url("file:///etc/passwd"))

    def test_stream_picker_and_mocked_catalog(self) -> None:
        f = self.iptv_fetch
        nested_html = (
            'var flashvars_1 = {"mediaDefinitions":[{"format":"hls","quality":"480",'
            '"videoUrl":"https://ee-h.phncdn.com/hls/480.m3u8"},{"format":"mp4","quality":[720,480],'
            '"videoUrl":"https://www.pornhub.com/video/get_media?s=abc"}],"next":1};'
        )
        extracted = f._extract_json_array_after(nested_html, '"mediaDefinitions"')
        parsed_defs = json.loads(extracted)
        self.assertEqual(len(parsed_defs), 2)
        self.assertEqual(f._pick_best_adult_stream(parsed_defs), "https://ee-h.phncdn.com/hls/480.m3u8")

        picked = f._pick_best_adult_stream(
            [
                {"format": "mp4", "quality": "1080", "videoUrl": "https://ev.phncdn.com/1080.mp4"},
                {"format": "mp4", "quality": "480", "videoUrl": "https://ev.phncdn.com/480.mp4"},
                {"format": "mp4", "quality": [], "videoUrl": "https://www.pornhub.com/video/get_media?s=xyz"},
                {"format": "mp4", "quality": "720", "videoUrl": "https://evil.example/720.mp4"},
            ]
        )
        self.assertEqual(picked, "https://ev.phncdn.com/480.mp4")

        mock_cats = json.dumps(
            {
                "categories": [
                    {"id": "1", "category": "amateur"},
                    {"id": "2", "category": "brazilian"},
                ]
            }
        )
        mock_videos = json.dumps(
            {
                "videos": [
                    {
                        "video_id": "ph1234567890",
                        "title": "Sample Video",
                        "duration": "12:34",
                        "views": 54000,
                        "rating": "92.5",
                        "default_thumb": "https://ci.phncdn.com/thumb.jpg",
                        "categories": [{"category": "brazilian"}],
                    }
                ]
            }
        )
        with tempfile.TemporaryDirectory() as tmp:
            cat_out = Path(tmp) / "cats.tsv"
            items_out = Path(tmp) / "items.m3u8"
            with mock.patch.object(f, "_adult_http_get", return_value=mock_cats):
                self.assertTrue(f.cmd_categories("adult18", cat_out, refresh=True))
            cat_lines = cat_out.read_text(encoding="utf-8").splitlines()
            self.assertTrue(any(line.startswith("ord:mostviewed:weekly\t") for line in cat_lines))
            self.assertTrue(any(line.startswith("cat:brazilian\t") for line in cat_lines))

            with mock.patch.object(f, "_adult_http_get", return_value=mock_videos):
                self.assertTrue(f.cmd_list("adult18", "cat:brazilian", items_out, refresh=True))
            m3u_text = items_out.read_text(encoding="utf-8")
            self.assertIn("Sample Video", m3u_text)
            self.assertIn("kplayer-adult://pornhub/ph1234567890", m3u_text)

    def test_xvideos_catalog_parser_and_resolver(self) -> None:
        f = self.iptv_fetch
        mock_tags_html = (
            '<li><a href="/tags/blonde"><b>blonde</b> <span class="navbadge">120,000</span></a></li>'
            '<li><a href="/tags/anal"><b>anal</b> <span class="navbadge">250,000</span></a></li>'
        )
        mock_list_html = (
            '<div id="video-thumb-omeakuv3672" class="thumb-block video">'
            '<img data-src="https://thumb-cdn77.xvideos-cdn.com/t1.jpg" alt="Alt Title" />'
            '<div class="title" title="XVideos Sample &amp; Demo">XVideos Sample</div>'
            '<span class="duration">14 min</span>'
            '<span class="views-count">1.2M</span>'
            '<span class="video-hd-mark">1080p</span>'
            '</div>'
        )
        mock_video_html = (
            "<script>"
            "html5player.setVideoTitle('XVideos Sample');"
            "html5player.setVideoUrlLow('https://mp4-cdn77.xvideos-cdn.com/low.mp4');"
            "html5player.setVideoUrlHigh('https://mp4-cdn77.xvideos-cdn.com/high.mp4');"
            "html5player.setVideoHLS('https://hls-cdn77.xvideos-cdn.com/hls.m3u8');"
            "</script>"
        )
        with tempfile.TemporaryDirectory() as tmp:
            cat_out = Path(tmp) / "xv_cats.tsv"
            items_out = Path(tmp) / "xv_items.m3u8"
            res_out = Path(tmp) / "xv_stream.txt"
            with mock.patch.object(f, "_adult_http_get", return_value=mock_tags_html):
                self.assertTrue(f.cmd_categories("xvideos", cat_out, refresh=True))
            cat_lines = cat_out.read_text(encoding="utf-8").splitlines()
            self.assertTrue(any(line.startswith("xv:home\t") for line in cat_lines))
            self.assertTrue(any(line.startswith("xv:tag:blonde\t") for line in cat_lines))

            with mock.patch.object(f, "_adult_http_get", return_value=mock_list_html):
                self.assertTrue(f.cmd_list("xvideos", "xv:best", items_out, refresh=True))
            m3u_text = items_out.read_text(encoding="utf-8")
            self.assertIn("XVideos Sample & Demo", m3u_text)
            self.assertIn("kplayer-adult://xvideos/omeakuv3672", m3u_text)

            with mock.patch.object(f, "_adult_http_get", return_value=mock_video_html):
                self.assertTrue(f.cmd_resolve_adult("xvideos/omeakuv3672", res_out))
            self.assertEqual(
                res_out.read_text(encoding="utf-8").strip(),
                "https://hls-cdn77.xvideos-cdn.com/hls.m3u8",
            )


if __name__ == "__main__":
    unittest.main()
