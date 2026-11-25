#!/usr/bin/env python3
"""KPlayer v2.1.2 File Manager & Official 7-Zip (ip7z/7zip) Worker for R36S.

Supports both CLI conventions:
  - Native C (source/file_manager.h):
      file_ops.py [--progress FILE] [--password-stdin] copy <dest_dir> <src...>
      file_ops.py [--progress FILE] [--password-stdin] move <dest_dir> <src...>
      file_ops.py [--progress FILE] delete <src...>
      file_ops.py [--progress FILE] [--password-stdin] extract <archive> <dest_dir>
      file_ops.py [--progress FILE] compress <output.zip> <src...>
      file_ops.py [--password-stdin] list-archive-tsv <archive> <out_tsv>
  - Express Web Simulator & Tests:
      file_ops.py list-archive <archive> [--password-stdin]
      file_ops.py copy --dest <dest_dir> [--progress FILE] <src...>
      file_ops.py move --dest <dest_dir> [--progress FILE] <src...>
      file_ops.py delete [--progress FILE] <src...>
      file_ops.py extract <archive> --dest <dest_dir> [--progress FILE] [--password-stdin]
      file_ops.py compress --output <output.zip> [--progress FILE] <src...>

Exit codes:
  0 = success
  1 = general error
  2 = invalid usage
  3 = password required or wrong password
  4 = cancelled (SIGTERM / SIGINT)
"""
from __future__ import annotations

from pathlib import Path
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import zipfile

PROTECTED_ROOTS = {
    "/",
    "/bin",
    "/boot",
    "/dev",
    "/etc",
    "/lib",
    "/lib64",
    "/proc",
    "/root",
    "/run",
    "/sbin",
    "/sys",
    "/usr",
    "/var",
    "/roms",
    "/roms2",
}

CHUNK_SIZE = 256 * 1024
_CANCELLED = False


def _on_signal(_signum: int, _frame: object) -> None:
    global _CANCELLED
    _CANCELLED = True


signal.signal(signal.SIGTERM, _on_signal)
signal.signal(signal.SIGINT, _on_signal)


class CancelledError(Exception):
    pass


class BadPasswordError(Exception):
    pass


def _check_cancel() -> None:
    if _CANCELLED:
        raise CancelledError("Operação cancelada")


def _clean_field(s: str) -> str:
    return s.replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


class ProgressReporter:
    """Atomic TSV progress emitter with smoothed transfer speed (EMA) and ETA."""

    def __init__(self, path: str | None, op: str) -> None:
        self.path = path
        self.op = op
        self.start_ts = time.monotonic()
        self.last_ts = self.start_ts
        self.last_bytes = 0
        self.last_emit = 0.0
        self.ema_speed = 0.0
        self.bytes_done = 0
        self.bytes_total = 0
        self.items_done = 0
        self.items_total = 0
        self.current_file = ""

    def _compute_speed_eta(self, now: float, done: int, total: int) -> tuple[float, int]:
        dt = now - self.last_ts
        if dt >= 0.08:
            inst = max(0.0, (done - self.last_bytes) / dt)
            self.ema_speed = inst if self.ema_speed <= 0.0 else (0.35 * inst + 0.65 * self.ema_speed)
            self.last_ts = now
            self.last_bytes = done
        elapsed = max(0.001, now - self.start_ts)
        speed = self.ema_speed if self.ema_speed > 0.0 else (done / elapsed)
        if total > 0 and done >= total:
            return speed, 0
        if total > 0 and speed > 1.0:
            eta = int(max(0.0, (total - done) / speed))
            return speed, eta
        return speed, -1

    def emit(
        self,
        status: str,
        message: str,
        *,
        pct: float | None = None,
        force: bool = False,
    ) -> None:
        if not self.path:
            return
        now = time.monotonic()
        if not force and (now - self.last_emit) < 0.09:
            return
        self.last_emit = now

        if pct is None:
            if self.bytes_total > 0:
                pct_val = min(100.0, max(0.0, (self.bytes_done * 100.0) / self.bytes_total))
            elif self.items_total > 0:
                pct_val = min(100.0, max(0.0, (self.items_done * 100.0) / self.items_total))
            else:
                pct_val = 100.0 if status == "done" else 0.0
        else:
            pct_val = min(100.0, max(0.0, float(pct)))

        speed, eta = self._compute_speed_eta(now, self.bytes_done, self.bytes_total)
        if status == "done":
            pct_val = 100.0
            eta = 0

        line = "\t".join(
            [
                _clean_field(status),
                f"{int(round(pct_val))}",
                str(int(self.bytes_done)),
                str(int(self.bytes_total)),
                f"{speed:.1f}",
                str(int(eta)),
                str(int(self.items_done)),
                str(int(self.items_total)),
                _clean_field(self.op),
                _clean_field(self.current_file),
                _clean_field(message),
            ]
        )
        try:
            target = Path(self.path)
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp = target.with_suffix(target.suffix + f".{os.getpid()}.tmp")
            tmp.write_text(line + "\n", encoding="utf-8")
            os.replace(tmp, target)
        except OSError:
            pass


def _find_7zip() -> str | None:
    """Locate bundled static ARM64 7zzs or system 7zz/7z/7za binary."""
    here = Path(__file__).resolve().parent
    candidates = [
        here / "7zzs",
        here / "7zz",
        Path("/usr/local/bin/7zzs"),
        Path("/usr/bin/7zz"),
        Path("/usr/bin/7z"),
        Path("/usr/bin/7za"),
    ]
    for cand in candidates:
        if cand.is_file() and os.access(cand, os.X_OK):
            # Verify it can actually execute on this CPU arch (e.g., ARM64 binary on x86_64 host)
            try:
                probe = subprocess.run(
                    [str(cand), "i"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=3,
                    check=False,
                )
                if probe.returncode == 0:
                    return str(cand)
            except OSError:
                continue
            except subprocess.TimeoutExpired:
                continue
    for name in ("7zzs", "7zz", "7z", "7za"):
        found = shutil.which(name)
        if found:
            return found
    return None


def _is_protected(p: Path) -> bool:
    try:
        resolved = str(p.resolve())
    except OSError:
        resolved = os.path.normpath(str(p))
    norm = os.path.normpath(str(p))
    return resolved in PROTECTED_ROOTS or norm in PROTECTED_ROOTS


def _safe_member_dest(dest_root: Path, member_name: str) -> Path:
    """Strictly prevent Zip Slip / absolute path / traversal escapes."""
    clean = member_name.replace("\\", "/")
    if clean.startswith("/") or clean.startswith("../") or clean == ".." or "\x00" in clean:
        raise ValueError(f"Caminho inseguro no arquivo compactado: {member_name}")
    parts = [part for part in clean.split("/") if part and part != "."]
    if any(part == ".." for part in parts):
        raise ValueError(f"Caminho inseguro no arquivo compactado: {member_name}")
    root_resolved = dest_root.resolve()
    target = (root_resolved / Path(*parts)).resolve() if parts else root_resolved
    if target != root_resolved and root_resolved not in target.parents:
        raise ValueError(f"Tentativa de escape de diretório bloqueada: {member_name}")
    return target


def _measure_paths(sources: list[Path]) -> tuple[int, int]:
    total_bytes = 0
    total_items = 0
    for src in sources:
        if not src.exists() and not src.is_symlink():
            continue
        if src.is_symlink() or src.is_file():
            total_items += 1
            try:
                total_bytes += src.lstat().st_size
            except OSError:
                pass
        elif src.is_dir():
            total_items += 1
            for dirpath, dirnames, filenames in os.walk(src, followlinks=False):
                total_items += len(dirnames) + len(filenames)
                for fn in filenames:
                    try:
                        total_bytes += os.lstat(os.path.join(dirpath, fn)).st_size
                    except OSError:
                        pass
    return total_bytes, max(1, total_items)


def _unique_dest_path(dest_dir: Path, name: str, same_parent: bool) -> Path:
    candidate = dest_dir / name
    if not same_parent and not candidate.exists():
        return candidate
    if not candidate.exists():
        return candidate
    stem = candidate.stem if candidate.is_file() else candidate.name
    suffix = candidate.suffix if candidate.is_file() else ""
    for i in range(1, 1000):
        alt = dest_dir / f"{stem} ({i}){suffix}"
        if not alt.exists():
            return alt
    return dest_dir / f"{stem}_{int(time.time())}{suffix}"


def _copy_file_chunked(src: Path, dst: Path, prog: ProgressReporter) -> None:
    _check_cancel()
    prog.current_file = src.name
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_symlink():
        if dst.exists() or dst.is_symlink():
            dst.unlink()
        os.symlink(os.readlink(src), dst)
        prog.items_done += 1
        prog.emit("running", f"Copiando {src.name}")
        return

    with src.open("rb") as f_in, dst.open("wb") as f_out:
        while True:
            _check_cancel()
            buf = f_in.read(CHUNK_SIZE)
            if not buf:
                break
            f_out.write(buf)
            prog.bytes_done += len(buf)
            prog.emit("running", f"Copiando {src.name}")
    try:
        shutil.copystat(src, dst)
    except OSError:
        pass
    prog.items_done += 1
    prog.emit("running", f"Copiado {src.name}")


def _copy_tree(src: Path, dst: Path, prog: ProgressReporter) -> None:
    _check_cancel()
    if src.is_symlink() or src.is_file():
        _copy_file_chunked(src, dst, prog)
        return
    dst.mkdir(parents=True, exist_ok=True)
    prog.items_done += 1
    for root, dirs, files in os.walk(src, followlinks=False):
        _check_cancel()
        rel = Path(root).relative_to(src)
        cur_dst = dst / rel
        cur_dst.mkdir(parents=True, exist_ok=True)
        for d in dirs:
            (cur_dst / d).mkdir(parents=True, exist_ok=True)
            prog.items_done += 1
        for fn in files:
            _copy_file_chunked(Path(root) / fn, cur_dst / fn, prog)


def op_copy_or_move(sources: list[str], dest: str, move: bool, prog: ProgressReporter) -> int:
    dest_dir = Path(dest)
    if not dest_dir.is_dir():
        prog.emit("error", "Pasta de destino não encontrada", force=True)
        return 1
    src_paths = [Path(s) for s in sources]
    if move:
        for sp in src_paths:
            if _is_protected(sp):
                prog.emit("error", f"Pasta protegida não pode ser movida: {sp}", force=True)
                return 1

    prog.bytes_total, prog.items_total = _measure_paths(src_paths)
    verb = "Movendo" if move else "Copiando"
    prog.emit("running", f"{verb} {len(src_paths)} item(ns)...", force=True)

    for sp in src_paths:
        _check_cancel()
        if not sp.exists() and not sp.is_symlink():
            continue
        same_parent = False
        try:
            same_parent = sp.parent.resolve() == dest_dir.resolve()
        except OSError:
            pass
        if move and same_parent:
            prog.items_done += 1
            continue
        # Prevent copying/moving a directory into itself
        if sp.is_dir():
            try:
                sp_res = sp.resolve()
                d_res = dest_dir.resolve()
                if d_res == sp_res or sp_res in d_res.parents:
                    prog.emit("error", "Não é possível copiar/mover uma pasta para dentro dela mesma", force=True)
                    return 1
            except OSError:
                pass

        target = _unique_dest_path(dest_dir, sp.name, same_parent)
        prog.current_file = sp.name

        if move:
            try:
                os.replace(sp, target)
                # Fast same-filesystem move: account for bytes immediately
                b, it = _measure_paths([target])
                prog.bytes_done += b
                prog.items_done += it
                prog.emit("running", f"Movido {sp.name}", force=True)
                continue
            except OSError:
                pass
            _copy_tree(sp, target, prog)
            if sp.is_dir() and not sp.is_symlink():
                shutil.rmtree(sp)
            else:
                sp.unlink(missing_ok=True)
        else:
            _copy_tree(sp, target, prog)

    prog.bytes_done = max(prog.bytes_done, prog.bytes_total)
    prog.items_done = max(prog.items_done, prog.items_total)
    prog.emit("done", "Movimentação concluída" if move else "Cópia concluída", pct=100.0, force=True)
    return 0


def op_delete(sources: list[str], prog: ProgressReporter) -> int:
    src_paths = [Path(s) for s in sources]
    for sp in src_paths:
        if _is_protected(sp):
            prog.emit("error", f"Pasta protegida do sistema bloqueada: {sp}", force=True)
            return 1

    prog.bytes_total, prog.items_total = _measure_paths(src_paths)
    prog.emit("running", f"Apagando {len(src_paths)} item(ns)...", force=True)

    for sp in src_paths:
        _check_cancel()
        if not sp.exists() and not sp.is_symlink():
            continue
        if sp.is_symlink() or sp.is_file():
            prog.current_file = sp.name
            try:
                sz = sp.lstat().st_size
            except OSError:
                sz = 0
            sp.unlink(missing_ok=True)
            prog.bytes_done += sz
            prog.items_done += 1
            prog.emit("running", f"Apagando {sp.name}")
        elif sp.is_dir():
            for root, dirs, files in os.walk(sp, topdown=False, followlinks=False):
                _check_cancel()
                for fn in files:
                    _check_cancel()
                    fp = Path(root) / fn
                    prog.current_file = fn
                    try:
                        sz = fp.lstat().st_size
                    except OSError:
                        sz = 0
                    fp.unlink(missing_ok=True)
                    prog.bytes_done += sz
                    prog.items_done += 1
                    prog.emit("running", f"Apagando {fn}")
                for d in dirs:
                    dp = Path(root) / d
                    dp.rmdir()
                    prog.items_done += 1
            sp.rmdir()
            prog.items_done += 1

    prog.bytes_done = max(prog.bytes_done, prog.bytes_total)
    prog.items_done = max(prog.items_done, prog.items_total)
    prog.emit("done", "Itens apagados com sucesso", pct=100.0, force=True)
    return 0


def op_compress(sources: list[str], output_zip: str, prog: ProgressReporter) -> int:
    src_paths = [Path(s) for s in sources if Path(s).exists()]
    if not src_paths:
        prog.emit("error", "Nenhum item válido para compactar", force=True)
        return 1
    out_path = Path(output_zip)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    prog.bytes_total, prog.items_total = _measure_paths(src_paths)
    prog.emit("running", f"Criando {out_path.name}...", force=True)

    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for sp in src_paths:
            _check_cancel()
            if sp.is_file():
                prog.current_file = sp.name
                with sp.open("rb") as f_in, zf.open(sp.name, "w") as f_out:
                    while True:
                        _check_cancel()
                        buf = f_in.read(CHUNK_SIZE)
                        if not buf:
                            break
                        f_out.write(buf)
                        prog.bytes_done += len(buf)
                        prog.emit("running", f"Compactando {sp.name}")
                prog.items_done += 1
            elif sp.is_dir():
                base_parent = sp.parent
                for root, _dirs, files in os.walk(sp, followlinks=False):
                    _check_cancel()
                    for fn in files:
                        _check_cancel()
                        fp = Path(root) / fn
                        arcname = fp.relative_to(base_parent).as_posix()
                        prog.current_file = fn
                        with fp.open("rb") as f_in, zf.open(arcname, "w") as f_out:
                            while True:
                                _check_cancel()
                                buf = f_in.read(CHUNK_SIZE)
                                if not buf:
                                    break
                                f_out.write(buf)
                                prog.bytes_done += len(buf)
                                prog.emit("running", f"Compactando {fn}")
                        prog.items_done += 1

    prog.bytes_done = max(prog.bytes_done, prog.bytes_total)
    prog.emit("done", f"Compactado em {out_path.name}", pct=100.0, force=True)
    return 0


def _list_archive_7z(sevenz: str, archive: Path, password: str) -> dict[str, object]:
    cmd = [sevenz, "l", "-slt", "-ba", "-sccUTF-8", f"-p{password}", "--", str(archive)]
    res = subprocess.run(cmd, capture_output=True, text=True, check=False)
    combined = (res.stdout + "\n" + res.stderr).lower()
    if res.returncode != 0:
        if "wrong password" in combined or "cannot open encrypted archive" in combined or "password" in combined:
            return {
                "ok": False,
                "engine": "7-Zip",
                "encrypted": True,
                "bad_password": True,
                "count": 0,
                "total_size": 0,
                "items": [],
                "error": "Senha incorreta ou arquivo criptografado",
            }
        return {
            "ok": False,
            "engine": "7-Zip",
            "encrypted": False,
            "bad_password": False,
            "count": 0,
            "total_size": 0,
            "items": [],
            "error": "Não foi possível abrir o arquivo com 7-Zip",
        }

    items: list[dict[str, object]] = []
    cur: dict[str, str] = {}
    encrypted_any = False
    total_size = 0

    def flush() -> None:
        nonlocal encrypted_any, total_size
        p = cur.get("Path", "").strip()
        if not p:
            return
        is_dir = cur.get("Folder", "") == "+" or cur.get("Attributes", "").startswith("D")
        try:
            sz = int(cur.get("Size", "0") or "0")
        except ValueError:
            sz = 0
        enc = cur.get("Encrypted", "") == "+"
        if enc:
            encrypted_any = True
        total_size += sz
        items.append({"path": p, "size": sz, "is_dir": is_dir, "encrypted": enc})

    for line in res.stdout.splitlines():
        if not line.strip():
            flush()
            cur = {}
            continue
        if " = " in line:
            k, v = line.split(" = ", 1)
            cur[k.strip()] = v.strip()
    flush()

    return {
        "ok": True,
        "engine": "7-Zip",
        "encrypted": encrypted_any,
        "bad_password": False,
        "count": len(items),
        "total_size": total_size,
        "items": items[:2000],
    }


def _list_archive_python(archive: Path) -> dict[str, object]:
    low = archive.name.lower()
    if low.endswith((".zip", ".cbz")) or zipfile.is_zipfile(archive):
        try:
            with zipfile.ZipFile(archive, "r") as zf:
                items = []
                enc_any = False
                total_size = 0
                for info in zf.infolist():
                    enc = bool(info.flag_bits & 0x1)
                    if enc:
                        enc_any = True
                    total_size += info.file_size
                    items.append(
                        {
                            "path": info.filename,
                            "size": info.file_size,
                            "is_dir": info.is_dir(),
                            "encrypted": enc,
                        }
                    )
                return {
                    "ok": True,
                    "engine": "ZIP (Python)",
                    "encrypted": enc_any,
                    "bad_password": False,
                    "count": len(items),
                    "total_size": total_size,
                    "items": items[:2000],
                }
        except (zipfile.BadZipFile, OSError) as exc:
            return {
                "ok": False,
                "engine": "ZIP (Python)",
                "encrypted": False,
                "bad_password": False,
                "count": 0,
                "total_size": 0,
                "items": [],
                "error": f"Arquivo ZIP inválido: {exc}",
            }

    if tarfile.is_tarfile(archive):
        try:
            with tarfile.open(archive, "r:*") as tf:
                items = []
                total_size = 0
                for m in tf.getmembers():
                    total_size += m.size
                    items.append(
                        {
                            "path": m.name,
                            "size": m.size,
                            "is_dir": m.isdir(),
                            "encrypted": False,
                        }
                    )
                return {
                    "ok": True,
                    "engine": "TAR (Python)",
                    "encrypted": False,
                    "bad_password": False,
                    "count": len(items),
                    "total_size": total_size,
                    "items": items[:2000],
                }
        except (tarfile.TarError, OSError) as exc:
            return {
                "ok": False,
                "engine": "TAR (Python)",
                "encrypted": False,
                "bad_password": False,
                "count": 0,
                "total_size": 0,
                "items": [],
                "error": f"Arquivo TAR inválido: {exc}",
            }

    return {
        "ok": False,
        "engine": "7-Zip",
        "encrypted": False,
        "bad_password": False,
        "count": 0,
        "total_size": 0,
        "items": [],
        "error": "Formato requer o binário 7zzs (ip7z/7zip)",
    }


def op_list_archive(archive_str: str, password: str) -> tuple[int, dict[str, object]]:
    archive = Path(archive_str)
    if not archive.is_file():
        return 1, {"ok": False, "error": "Arquivo compactado não encontrado", "items": []}
    sevenz = _find_7zip()
    if sevenz:
        data = _list_archive_7z(sevenz, archive, password)
        if data.get("bad_password"):
            return 3, data
        return (0 if data.get("ok") else 1), data
    data = _list_archive_python(archive)
    return (0 if data.get("ok") else 1), data


def op_list_archive_tsv(archive_str: str, out_tsv: str, password: str) -> int:
    rc, data = op_list_archive(archive_str, password)
    lines = [
        "\t".join(
            [
                "META",
                "1" if data.get("ok") else "0",
                "1" if data.get("encrypted") else "0",
                "1" if data.get("bad_password") else "0",
                "1" if data.get("bad_password") else "0",
                _clean_field(str(data.get("engine", "7-Zip"))),
                _clean_field(str(data.get("error", ""))),
            ]
        )
    ]
    for it in data.get("items", []) or []:
        if not isinstance(it, dict):
            continue
        lines.append(
            "\t".join(
                [
                    "ENTRY",
                    "1" if it.get("is_dir") else "0",
                    str(int(it.get("size", 0) or 0)),
                    "1" if it.get("encrypted") else "0",
                    _clean_field(str(it.get("path", ""))),
                ]
            )
        )
    Path(out_tsv).write_text("\n".join(lines) + "\n", encoding="utf-8")
    return rc


def _extract_with_7z(sevenz: str, archive: Path, dest_dir: Path, password: str, prog: ProgressReporter) -> int:
    # Inspect first to get total uncompressed size and block Zip Slip paths before touching dest_dir
    meta = _list_archive_7z(sevenz, archive, password)
    if meta.get("bad_password"):
        prog.emit("bad_password", "Senha incorreta ou arquivo criptografado", force=True)
        return 3
    if not meta.get("ok"):
        prog.emit("error", str(meta.get("error", "Falha ao abrir arquivo")), force=True)
        return 1

    items = meta.get("items", []) or []
    for it in items:
        if isinstance(it, dict) and it.get("path"):
            _safe_member_dest(dest_dir, str(it["path"]))

    prog.bytes_total = int(meta.get("total_size", 0) or 0)
    prog.items_total = max(1, len(items))
    prog.emit("running", f"Extraindo {archive.name} (7-Zip)...", force=True)

    # Extract into isolated staging directory inside dest_dir parent, then validate & move
    dest_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".kp7z_", dir=str(dest_dir)) as stage:
        stage_path = Path(stage)
        cmd = [
            sevenz,
            "x",
            "-y",
            "-bb1",
            "-bsp1",
            f"-p{password}",
            f"-o{stage_path}",
            "--",
            str(archive),
        ]
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            errors="replace",
        )
        pct_re = re.compile(r"(\d{1,3})%")
        err_text = []
        assert proc.stdout is not None
        while True:
            if _CANCELLED:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill()
                raise CancelledError("Extração cancelada")
            line = proc.stdout.readline()
            if not line and proc.poll() is not None:
                break
            if not line:
                continue
            s = line.strip()
            if len(err_text) < 40:
                err_text.append(s)
            m = pct_re.search(s)
            if m:
                pct_val = min(99.0, float(m.group(1)))
                if prog.bytes_total > 0:
                    prog.bytes_done = int(prog.bytes_total * (pct_val / 100.0))
                prog.emit("running", f"Descompactando {archive.name}", pct=pct_val)
            elif s.startswith("- "):
                prog.current_file = Path(s[2:].strip()).name
                prog.items_done += 1
                prog.emit("running", f"Extraindo {prog.current_file}")

        rc = proc.wait()
        joined = "\n".join(err_text).lower()
        if rc != 0:
            if "wrong password" in joined or "data error in encrypted file" in joined or "password" in joined:
                prog.emit("bad_password", "Senha incorreta para este arquivo", force=True)
                return 3
            prog.emit("error", "Falha ao descompactar com 7-Zip", force=True)
            return 1

        # Move validated extracted entries from staging dir into dest_dir
        for root, dirs, files in os.walk(stage_path, followlinks=False):
            _check_cancel()
            rel = Path(root).relative_to(stage_path)
            for d in dirs:
                dp = _safe_member_dest(dest_dir, (rel / d).as_posix())
                dp.mkdir(parents=True, exist_ok=True)
            for fn in files:
                src_f = Path(root) / fn
                if src_f.is_symlink():
                    continue
                dst_f = _safe_member_dest(dest_dir, (rel / fn).as_posix())
                dst_f.parent.mkdir(parents=True, exist_ok=True)
                os.replace(src_f, dst_f)

    prog.bytes_done = max(prog.bytes_done, prog.bytes_total)
    prog.items_done = max(prog.items_done, prog.items_total)
    prog.emit("done", f"Descompactado com sucesso: {archive.name}", pct=100.0, force=True)
    return 0


def _extract_with_python(archive: Path, dest_dir: Path, password: str, prog: ProgressReporter) -> int:
    low = archive.name.lower()
    dest_dir.mkdir(parents=True, exist_ok=True)

    if low.endswith((".zip", ".cbz")) or zipfile.is_zipfile(archive):
        pwd_bytes = password.encode("utf-8") if password else None
        try:
            with zipfile.ZipFile(archive, "r") as zf:
                infos = zf.infolist()
                for info in infos:
                    _safe_member_dest(dest_dir, info.filename)
                prog.bytes_total = sum(i.file_size for i in infos)
                prog.items_total = max(1, len(infos))
                prog.emit("running", f"Extraindo {archive.name}...", force=True)

                for info in infos:
                    _check_cancel()
                    target = _safe_member_dest(dest_dir, info.filename)
                    prog.current_file = Path(info.filename).name or info.filename
                    if info.is_dir():
                        target.mkdir(parents=True, exist_ok=True)
                        prog.items_done += 1
                        continue
                    target.parent.mkdir(parents=True, exist_ok=True)
                    try:
                        with zf.open(info, "r", pwd=pwd_bytes) as src_f, target.open("wb") as dst_f:
                            while True:
                                _check_cancel()
                                buf = src_f.read(CHUNK_SIZE)
                                if not buf:
                                    break
                                dst_f.write(buf)
                                prog.bytes_done += len(buf)
                                prog.emit("running", f"Extraindo {prog.current_file}")
                    except RuntimeError as exc:
                        msg = str(exc).lower()
                        target.unlink(missing_ok=True)
                        if "password" in msg or "encrypted" in msg or "bad crc" in msg:
                            prog.emit("bad_password", "Senha incorreta ou arquivo criptografado", force=True)
                            return 3
                        raise
                    except zipfile.BadZipFile:
                        target.unlink(missing_ok=True)
                        if info.flag_bits & 0x1:
                            prog.emit("bad_password", "Senha incorreta para este arquivo", force=True)
                            return 3
                        raise
                    prog.items_done += 1
        except ValueError as exc:
            prog.emit("error", str(exc), force=True)
            return 1
        except (zipfile.BadZipFile, OSError) as exc:
            prog.emit("error", f"Erro ao descompactar ZIP: {exc}", force=True)
            return 1

        prog.bytes_done = max(prog.bytes_done, prog.bytes_total)
        prog.emit("done", f"Descompactado: {archive.name}", pct=100.0, force=True)
        return 0

    if tarfile.is_tarfile(archive):
        try:
            with tarfile.open(archive, "r:*") as tf:
                members = tf.getmembers()
                for m in members:
                    if m.issym() or m.islnk():
                        raise ValueError(f"Link simbólico bloqueado no arquivo TAR: {m.name}")
                    _safe_member_dest(dest_dir, m.name)
                prog.bytes_total = sum(m.size for m in members)
                prog.items_total = max(1, len(members))
                prog.emit("running", f"Extraindo {archive.name}...", force=True)
                for m in members:
                    _check_cancel()
                    target = _safe_member_dest(dest_dir, m.name)
                    prog.current_file = Path(m.name).name or m.name
                    if m.isdir():
                        target.mkdir(parents=True, exist_ok=True)
                        prog.items_done += 1
                        continue
                    if not m.isfile():
                        continue
                    target.parent.mkdir(parents=True, exist_ok=True)
                    src_f = tf.extractfile(m)
                    if src_f is not None:
                        with src_f, target.open("wb") as dst_f:
                            while True:
                                _check_cancel()
                                buf = src_f.read(CHUNK_SIZE)
                                if not buf:
                                    break
                                dst_f.write(buf)
                                prog.bytes_done += len(buf)
                                prog.emit("running", f"Extraindo {prog.current_file}")
                    prog.items_done += 1
        except (ValueError, tarfile.TarError, OSError) as exc:
            prog.emit("error", f"Erro ao descompactar TAR: {exc}", force=True)
            return 1
        prog.bytes_done = max(prog.bytes_done, prog.bytes_total)
        prog.emit("done", f"Descompactado: {archive.name}", pct=100.0, force=True)
        return 0

    prog.emit("error", "Formato não suportado sem o binário 7zzs (ip7z/7zip)", force=True)
    return 1


def op_extract(archive_str: str, dest_str: str, password: str, prog: ProgressReporter) -> int:
    archive = Path(archive_str)
    dest_dir = Path(dest_str)
    if not archive.is_file():
        prog.emit("error", "Arquivo compactado não encontrado", force=True)
        return 1
    sevenz = _find_7zip()
    if sevenz:
        return _extract_with_7z(sevenz, archive, dest_dir, password, prog)
    return _extract_with_python(archive, dest_dir, password, prog)


def parse_args(argv: list[str]) -> dict[str, object]:
    """Flexible flag parser supporting flags before OR after the subcommand."""
    progress_file: str | None = None
    dest: str | None = None
    output: str | None = None
    password_stdin = False
    positionals: list[str] = []

    i = 0
    while i < len(argv):
        tok = argv[i]
        if tok == "--progress" and i + 1 < len(argv):
            progress_file = argv[i + 1]
            i += 2
        elif tok == "--dest" and i + 1 < len(argv):
            dest = argv[i + 1]
            i += 2
        elif tok == "--output" and i + 1 < len(argv):
            output = argv[i + 1]
            i += 2
        elif tok == "--password-stdin":
            password_stdin = True
            i += 1
        else:
            positionals.append(tok)
            i += 1

    cmd = positionals[0] if positionals else ""
    rest = positionals[1:]
    return {
        "cmd": cmd,
        "rest": rest,
        "progress": progress_file,
        "dest": dest,
        "output": output,
        "password_stdin": password_stdin,
    }


def main(argv: list[str]) -> int:
    opts = parse_args(argv)
    cmd = str(opts["cmd"])
    rest = list(opts["rest"])  # type: ignore[arg-type]
    progress_file = opts["progress"] if isinstance(opts["progress"], str) else None
    dest = opts["dest"] if isinstance(opts["dest"], str) else None
    output = opts["output"] if isinstance(opts["output"], str) else None
    password = ""
    if opts["password_stdin"]:
        try:
            password = sys.stdin.readline().rstrip("\r\n")
        except OSError:
            password = ""

    prog = ProgressReporter(progress_file, cmd or "op")

    try:
        if cmd == "list-archive":
            if not rest:
                return 2
            rc, data = op_list_archive(rest[0], password)
            print(json.dumps(data, ensure_ascii=False))
            return rc

        if cmd == "list-archive-tsv":
            if len(rest) < 2:
                return 2
            return op_list_archive_tsv(rest[0], rest[1], password)

        if cmd in ("copy", "move"):
            if dest is None:
                if len(rest) < 2:
                    return 2
                dest = rest[0]
                sources = rest[1:]
            else:
                sources = rest
            if not sources:
                return 2
            return op_copy_or_move(sources, dest, move=(cmd == "move"), prog=prog)

        if cmd == "delete":
            if not rest:
                return 2
            return op_delete(rest, prog)

        if cmd == "extract":
            if not rest:
                return 2
            arc = rest[0]
            target_dest = dest if dest is not None else (rest[1] if len(rest) >= 2 else "")
            if not target_dest:
                return 2
            return op_extract(arc, target_dest, password, prog)

        if cmd == "compress":
            if output is None:
                if len(rest) < 2:
                    return 2
                output = rest[0]
                sources = rest[1:]
            else:
                sources = rest
            if not sources:
                return 2
            return op_compress(sources, output, prog)

        return 2
    except CancelledError:
        prog.emit("cancelled", "Operação cancelada pelo usuário", force=True)
        return 4
    except Exception as exc:  # noqa: BLE001
        prog.emit("error", f"Erro: {exc}", force=True)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
