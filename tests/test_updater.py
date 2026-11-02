import hashlib
import importlib.util
import io
import json
import os
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("updater", Path(__file__).resolve().parents[1] / "ports/kplayer/updater.py")
u = importlib.util.module_from_spec(spec)
spec.loader.exec_module(u)


def package(extra=None):
    exe = bytearray(128)
    exe[:6] = b"\x7fELF\x02\x01"
    exe[18:20] = b"\xb7\x00"
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        for name in u.ALLOWED:
            z.writestr(name, exe if name == "kplayer/kplayer" else b"new")
        z.writestr("kplayer/update-manifest.json", json.dumps({
            "schema": 1, "version": "1.0.1", "update_files": list(u.ALLOWED)}))
        if extra:
            z.writestr(extra, b"bad")
    data = out.getvalue()
    return data, hashlib.sha256(data).hexdigest()


class Tests(unittest.TestCase):
    def test_release_selection(self):
        tag = "v1.0.1"
        name = "KPlayer-" + tag + "-R36S.zip"
        root = "https://github.com/" + u.REPO + "/releases/download/" + tag + "/"
        data = {"tag_name": tag, "draft": False, "prerelease": False,
                "assets": [{"name": name, "browser_download_url": root + name},
                           {"name": name + ".sha256", "browser_download_url": root + name + ".sha256"}]}
        self.assertEqual(u.release_info(data, "1.0.0")[0], tag)
        self.assertIsNone(u.release_info(data, "1.0.1"))
        data["assets"][0]["browser_download_url"] = "https://example.com/file"
        with self.assertRaises(ValueError): u.release_info(data, "1.0.0")

    def test_version(self):
        self.assertGreater(u.version("v1.0.10"), u.version("1.0.2"))
        with self.assertRaises(ValueError): u.version("v1.0.1-beta")

    def test_hash_and_traversal(self):
        blob, checksum = package()
        self.assertEqual(len(u.validate_archive(blob, checksum, "v1.0.1")), len(u.ALLOWED))
        with self.assertRaises(ValueError): u.validate_archive(blob, "0" * 64, "v1.0.1")
        blob, checksum = package("../evil")
        with self.assertRaises(ValueError): u.validate_archive(blob, checksum, "v1.0.1")

    def test_user_data_and_rollback(self):
        blob, checksum = package()
        files = u.validate_archive(blob, checksum, "v1.0.1")
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            for name in u.ALLOWED:
                path = base / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"old")
            personal = base / "kplayer/radios_usuario/Minha.pls"
            personal.parent.mkdir()
            personal.write_bytes(b"pessoal")
            original_replace = u.os.replace
            calls = [0]
            def fail_once(a, b):
                calls[0] += 1
                if calls[0] == 2: raise OSError("simulated")
                return original_replace(a, b)
            with patch.object(u.os, "replace", side_effect=fail_once):
                with self.assertRaises(OSError): u.install_files(files, "v1.0.1", base)
            for name in u.ALLOWED:
                self.assertEqual((base / name).read_bytes(), b"old")
            self.assertEqual(personal.read_bytes(), b"pessoal")
            u.install_files(files, "v1.0.1", base)
            self.assertEqual(personal.read_bytes(), b"pessoal")
            self.assertEqual((base / "kplayer/installed-version.txt").read_text().strip(), "v1.0.1")

    def test_cancel_after_replacement_restores_version(self):
        blob, checksum = package()
        files = u.validate_archive(blob, checksum, "v1.0.1")
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            for name in u.ALLOWED:
                path = base / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"old")
            ver = base / "kplayer/installed-version.txt"
            ver.write_text("1.0.0\n")
            original = u.os.replace
            fired = [False]
            def cancel_after_move(src, dst):
                original(src, dst)
                if str(dst).endswith("installed-version.txt") and not fired[0]:
                    fired[0] = True
                    raise u.UpdateCancelled("test")
            with patch.object(u.os, "replace", side_effect=cancel_after_move):
                with self.assertRaises(u.UpdateCancelled):
                    u.install_files(files, "v1.0.1", base)
            self.assertEqual(ver.read_text(), "1.0.0\n")
            for name in u.ALLOWED:
                self.assertEqual((base / name).read_bytes(), b"old")

    def test_crash_recovery_and_repeat(self):
        blob, checksum = package()
        files = u.validate_archive(blob, checksum, "v1.0.1")
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            for name in u.ALLOWED:
                path = base / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"old")
            ver = base / "kplayer/installed-version.txt"
            ver.write_text("1.0.0\n")
            pid = os.fork()
            if pid == 0:
                original = u.os.replace
                def crash_during_install(src, dst):
                    original(src, dst)
                    if str(dst).endswith("kplayer/kplayer"):
                        os._exit(77)
                u.os.replace = crash_during_install
                u.install_files(files, "v1.0.1", base)
                os._exit(0)
            _, status = os.waitpid(pid, 0)
            self.assertEqual(os.waitstatus_to_exitcode(status), 77)
            self.assertTrue((base / "kplayer" / u.JOURNAL).exists())
            self.assertTrue(u.recover_transaction(base))
            self.assertFalse(u.recover_transaction(base))
            self.assertEqual(ver.read_text(), "1.0.0\n")
            for name in u.ALLOWED:
                self.assertEqual((base / name).read_bytes(), b"old")

    def test_reject_unsafe_recovery_marker(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            (base / "kplayer").mkdir()
            (base / "kplayer" / u.JOURNAL).write_text(json.dumps({"backup":"../x", "version_exists":False}))
            with self.assertRaises(ValueError):
                u.recover_transaction(base)


if __name__ == "__main__":
    unittest.main()
