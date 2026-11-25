#!/usr/bin/env python3
"""Unit tests for KPlayer v2.1.2 standalone File Manager backend (ports/kplayer/file_ops.py)."""
from pathlib import Path
import json
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile
import zlib

BASE = Path(__file__).resolve().parents[1]
FILE_OPS = BASE / "ports/kplayer/file_ops.py"


def _write_zipcrypto_zip(out_path: Path, files: list[tuple[str, bytes]], password: str) -> None:
    """Create a standard PKWARE ZipCrypto password-protected ZIP for deterministic testing."""
    pwd = password.encode("utf-8")

    def crc_byte(c: int, b: int) -> int:
        return zlib.crc32(bytes([b]), c ^ 0xFFFFFFFF) ^ 0xFFFFFFFF

    def encrypt(data: bytes, crc32_val: int) -> bytes:
        k0, k1, k2 = 0x12345678, 0x23456789, 0x34567890

        def upd(b: int) -> None:
            nonlocal k0, k1, k2
            k0 = crc_byte(k0, b)
            k1 = ((k1 + (k0 & 0xFF)) * 134775813 + 1) & 0xFFFFFFFF
            k2 = crc_byte(k2, (k1 >> 24) & 0xFF)

        def stream_byte() -> int:
            t = (k2 | 2) & 0xFFFF
            return ((t * (t ^ 1)) >> 8) & 0xFF

        for ch in pwd:
            upd(ch)
        hdr = bytes(
            [0x4B, 0x50, 0x32, 0x31, 0x32, 0x52, 0x33, 0x36, 0x53, 0x00, 0x7A, (crc32_val >> 24) & 0xFF]
        )
        out = bytearray()
        for b in hdr + data:
            c = b ^ stream_byte()
            upd(b)
            out.append(c)
        return bytes(out)

    central = bytearray()
    offset = 0
    with out_path.open("wb") as f:
        for name, raw in files:
            nb = name.encode("utf-8")
            crc = zlib.crc32(raw) & 0xFFFFFFFF
            enc = encrypt(raw, crc)
            lh = struct.pack(
                "<IHHHHHIIIHH",
                0x04034B50,
                20,
                0x0001,
                0,
                0,
                0x5821,
                crc,
                len(enc),
                len(raw),
                len(nb),
                0,
            )
            f.write(lh)
            f.write(nb)
            f.write(enc)
            ch = struct.pack(
                "<IHHHHHHIIIHHHHHII",
                0x02014B50,
                20,
                20,
                0x0001,
                0,
                0,
                0x5821,
                crc,
                len(enc),
                len(raw),
                len(nb),
                0,
                0,
                0,
                0,
                0,
                offset,
            )
            central.extend(ch)
            central.extend(nb)
            offset += len(lh) + len(nb) + len(enc)
        cd_off = offset
        f.write(central)
        eocd = struct.pack(
            "<IHHHHIIH",
            0x06054B50,
            0,
            0,
            len(files),
            len(files),
            len(central),
            cd_off,
            0,
        )
        f.write(eocd)


class FileOpsTest(unittest.TestCase):
    def _run(self, *args: str, stdin_text: str | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(FILE_OPS), *args],
            input=stdin_text,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_copy_move_delete_and_progress_tsv(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src_dir = root / "origem"
            dst_dir = root / "destino"
            src_dir.mkdir()
            dst_dir.mkdir()
            sample = src_dir / "teste.bin"
            payload = b"KPlayer-R36S-v2.1.2-" * 4096
            sample.write_bytes(payload)

            prog_copy = root / "copy.tsv"
            r_copy = self._run("copy", "--dest", str(dst_dir), "--progress", str(prog_copy), str(sample))
            self.assertEqual(r_copy.returncode, 0, r_copy.stderr)
            self.assertEqual((dst_dir / "teste.bin").read_bytes(), payload)

            # Verify progress TSV has status, percent=100, speed_bps, eta_sec
            parts = prog_copy.read_text(encoding="utf-8").strip().split("\t")
            self.assertGreaterEqual(len(parts), 10)
            self.assertEqual(parts[0], "done")
            self.assertEqual(int(parts[1]), 100)
            self.assertGreaterEqual(float(parts[4]), 0.0)
            self.assertEqual(int(parts[5]), 0)

            # Move folder
            move_dst = root / "movido"
            move_dst.mkdir()
            prog_move = root / "move.tsv"
            r_move = self._run("move", "--dest", str(move_dst), "--progress", str(prog_move), str(src_dir))
            self.assertEqual(r_move.returncode, 0, r_move.stderr)
            self.assertFalse(src_dir.exists())
            self.assertTrue((move_dst / "origem" / "teste.bin").is_file())

            # Delete moved folder
            prog_del = root / "del.tsv"
            r_del = self._run("delete", "--progress", str(prog_del), str(move_dst / "origem"))
            self.assertEqual(r_del.returncode, 0, r_del.stderr)
            self.assertFalse((move_dst / "origem").exists())

    def test_protected_root_delete_is_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            prog = Path(tmp) / "del_root.tsv"
            res = self._run("delete", "--progress", str(prog), "/")
            self.assertNotEqual(res.returncode, 0)

    def test_compress_and_extract_plain_zip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            folder = root / "dados"
            folder.mkdir()
            (folder / "nota.txt").write_text("Ola KPlayer v2.1.2\n", encoding="utf-8")
            zip_out = root / "pacote.zip"
            prog = root / "zip.tsv"

            r_zip = self._run("compress", "--output", str(zip_out), "--progress", str(prog), str(folder))
            self.assertEqual(r_zip.returncode, 0, r_zip.stderr)
            self.assertTrue(zip_out.is_file())

            r_list = self._run("list-archive", str(zip_out))
            self.assertEqual(r_list.returncode, 0, r_list.stderr)
            info = json.loads(r_list.stdout)
            self.assertTrue(info["ok"])
            self.assertFalse(info["encrypted"])
            self.assertTrue(any("nota.txt" in it["path"] for it in info["items"]))

            out_dir = root / "extraido"
            out_dir.mkdir()
            prog_ext = root / "ext.tsv"
            r_ext = self._run("extract", str(zip_out), "--dest", str(out_dir), "--progress", str(prog_ext))
            self.assertEqual(r_ext.returncode, 0, r_ext.stderr)
            self.assertEqual((out_dir / "dados" / "nota.txt").read_text(encoding="utf-8"), "Ola KPlayer v2.1.2\n")

    def test_password_protected_zip_wrong_and_right_password(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            enc_zip = root / "segredo.zip"
            _write_zipcrypto_zip(
                enc_zip,
                [("secreto/dados.txt", b"Conteudo protegido do R36S!\n")],
                "r36s-212",
            )

            # Listing detects encryption
            r_list = self._run("list-archive", str(enc_zip))
            self.assertEqual(r_list.returncode, 0, r_list.stderr)
            info = json.loads(r_list.stdout)
            self.assertTrue(info["ok"])
            self.assertTrue(info["encrypted"])

            # Wrong password returns exit code 3 (bad_password)
            out_bad = root / "out_bad"
            out_bad.mkdir()
            prog_bad = root / "bad.tsv"
            r_bad = self._run(
                "extract",
                str(enc_zip),
                "--dest",
                str(out_bad),
                "--progress",
                str(prog_bad),
                "--password-stdin",
                stdin_text="senha-errada\n",
            )
            self.assertEqual(r_bad.returncode, 3)

            # Correct password extracts cleanly
            out_ok = root / "out_ok"
            out_ok.mkdir()
            prog_ok = root / "ok.tsv"
            r_ok = self._run(
                "extract",
                str(enc_zip),
                "--dest",
                str(out_ok),
                "--progress",
                str(prog_ok),
                "--password-stdin",
                stdin_text="r36s-212\n",
            )
            self.assertEqual(r_ok.returncode, 0, r_ok.stderr)
            self.assertEqual(
                (out_ok / "secreto" / "dados.txt").read_bytes(),
                b"Conteudo protegido do R36S!\n",
            )

    def test_zip_slip_archive_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            mal_zip = root / "slip.zip"
            with zipfile.ZipFile(mal_zip, "w") as zf:
                zf.writestr("../../escapou.txt", "nao pode sair")
            out_dir = root / "destino"
            out_dir.mkdir()
            prog = root / "slip.tsv"
            res = self._run("extract", str(mal_zip), "--dest", str(out_dir), "--progress", str(prog))
            self.assertNotEqual(res.returncode, 0)
            self.assertFalse((root / "escapou.txt").exists())


if __name__ == "__main__":
    unittest.main()
