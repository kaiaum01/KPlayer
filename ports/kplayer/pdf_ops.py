#!/usr/bin/env python3
"""PDF inspector, renderer, and text extractor for KPlayer R36S (v2.1.5).

Full protocol compatibility with PdfReader-R36s / PdfCraft R36S
(https://github.com/kaiaum01/PdfReader-R36s):
- Auto-detects `pdfcraft-core.aarch64` (from `pdfcraft-r36s/bin/`) and speaks its
  exact atomic JSON IPC protocol (`serve <session_dir>` -> ready.json,
  request.json, response.json, page.png) supporting viewport tile zoom,
  password-protected PDFs, and UTF-8 text extraction.
- Also detects external `PdfCraft.sh` so the user can launch the full
  PdfReader-R36s app directly from KPlayer's File Manager if installed.
- Falls back seamlessly to `pdftoppm`, `mutool`, `gs`, or a zero-dependency
  pure-Python PDF inspector & text extractor when `pdfcraft-core.aarch64` is
  not installed on the console.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zlib
from pathlib import Path
from typing import Any


MAX_PDF_BYTES = 128 * 1024 * 1024
BASE_DIR = Path(__file__).resolve().parent


def _clean_tsv(value: Any, max_len: int = 220) -> str:
    s = str(value or "").replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()
    return s[:max_len]


def find_pdfcraft_core(extra_dirs: list[Path] | None = None) -> Path | None:
    """Locate `pdfcraft-core.aarch64` from kaiaum01/PdfReader-R36s."""
    env_bin = os.environ.get("KPLAYER_PDFCRAFT_CORE", "").strip()
    candidates: list[Path] = []
    if env_bin:
        candidates.append(Path(env_bin))
    if extra_dirs:
        for d in extra_dirs:
            candidates.append(d / "pdfcraft-core.aarch64")
            candidates.append(d / "bin" / "pdfcraft-core.aarch64")
            candidates.append(d / "pdfcraft-r36s" / "bin" / "pdfcraft-core.aarch64")
    candidates.extend([
        BASE_DIR / "pdfcraft-core.aarch64",
        BASE_DIR / "bin" / "pdfcraft-core.aarch64",
        BASE_DIR.parent / "pdfcraft-r36s" / "bin" / "pdfcraft-core.aarch64",
        Path("/roms/ports/pdfcraft-r36s/bin/pdfcraft-core.aarch64"),
        Path("/roms2/ports/pdfcraft-r36s/bin/pdfcraft-core.aarch64"),
        Path("/roms/ports/PdfReader-R36s/pdfcraft-r36s/bin/pdfcraft-core.aarch64"),
        Path("/roms2/ports/PdfReader-R36s/pdfcraft-r36s/bin/pdfcraft-core.aarch64"),
    ])
    for cand in candidates:
        try:
            if cand.is_file() and os.access(cand, os.X_OK):
                return cand
        except OSError:
            continue
    return None


def find_pdfcraft_launcher(extra_dirs: list[Path] | None = None) -> Path | None:
    """Locate `PdfCraft.sh` launcher from kaiaum01/PdfReader-R36s."""
    env_sh = os.environ.get("KPLAYER_PDFCRAFT_SH", "").strip()
    candidates: list[Path] = []
    if env_sh:
        candidates.append(Path(env_sh))
    if extra_dirs:
        for d in extra_dirs:
            candidates.append(d / "PdfCraft.sh")
    candidates.extend([
        BASE_DIR.parent / "PdfCraft.sh",
        Path("/roms/ports/PdfCraft.sh"),
        Path("/roms2/ports/PdfCraft.sh"),
        Path("/roms/ports/PdfReader-R36s/PdfCraft.sh"),
        Path("/roms2/ports/PdfReader-R36s/PdfCraft.sh"),
    ])
    for cand in candidates:
        try:
            if cand.is_file():
                return cand
        except OSError:
            continue
    return None


def _atomic_write_json(path: Path, obj: dict[str, Any]) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def _pdfcraft_session_call(
    core_bin: Path,
    commands: list[dict[str, Any]],
    out_png: Path | None = None,
    timeout_sec: float = 15.0,
) -> list[dict[str, Any]]:
    """Speak the exact atomic-rename JSON protocol of `pdfcraft-core.aarch64 serve`."""
    session_dir = Path(tempfile.mkdtemp(prefix="kp-pdfcraft-"))
    proc: subprocess.Popen | None = None
    responses: list[dict[str, Any]] = []
    try:
        env = os.environ.copy()
        env.setdefault("RAYON_NUM_THREADS", "2")
        env.setdefault("LP_NUM_THREADS", "2")
        proc = subprocess.Popen(
            [str(core_bin), "serve", str(session_dir)],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env=env,
            close_fds=True,
        )
        ready_path = session_dir / "ready.json"
        deadline = time.monotonic() + min(5.0, timeout_sec)
        while not ready_path.is_file():
            if proc.poll() is not None:
                raise RuntimeError("Motor PdfCraft encerrou inesperadamente.")
            if time.monotonic() > deadline:
                raise TimeoutError("Tempo esgotado aguardando PdfCraft.")
            time.sleep(0.03)

        req_path = session_dir / "request.json"
        resp_path = session_dir / "response.json"
        req_id = 1
        for cmd in commands:
            payload = dict(cmd)
            payload["id"] = req_id
            req_id += 1
            if resp_path.exists():
                resp_path.unlink(missing_ok=True)
            _atomic_write_json(req_path, payload)
            cmd_deadline = time.monotonic() + timeout_sec
            while not resp_path.is_file():
                if proc.poll() is not None:
                    raise RuntimeError("Motor PdfCraft encerrou durante o processamento.")
                if time.monotonic() > cmd_deadline:
                    raise TimeoutError("Tempo esgotado ao processar PDF no PdfCraft.")
                time.sleep(0.03)
            resp = json.loads(resp_path.read_text(encoding="utf-8"))
            resp_path.unlink(missing_ok=True)
            responses.append(resp)
            if not resp.get("ok"):
                break
            if payload.get("op") == "render" and out_png is not None:
                page_png = session_dir / "page.png"
                if page_png.is_file():
                    out_png.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(page_png, out_png)

        try:
            _atomic_write_json(req_path, {"id": req_id, "op": "quit"})
        except OSError:
            pass
        return responses
    finally:
        if proc is not None:
            try:
                proc.wait(timeout=1.0)
            except subprocess.TimeoutExpired:
                proc.terminate()
                try:
                    proc.wait(timeout=1.0)
                except subprocess.TimeoutExpired:
                    proc.kill()
        shutil.rmtree(session_dir, ignore_errors=True)


def _decode_pdf_literal(raw: bytes) -> str:
    out = bytearray()
    i = 0
    n = len(raw)
    while i < n:
        b = raw[i]
        if b == 92 and i + 1 < n:  # backslash
            nxt = raw[i + 1]
            esc = {
                ord("n"): 10,
                ord("r"): 13,
                ord("t"): 9,
                ord("b"): 8,
                ord("f"): 12,
                ord("("): 40,
                ord(")"): 41,
                ord("\\"): 92,
            }
            if nxt in esc:
                out.append(esc[nxt])
                i += 2
                continue
            if 48 <= nxt <= 55:
                oct_digits = bytes([nxt])
                j = i + 2
                while j < n and len(oct_digits) < 3 and 48 <= raw[j] <= 55:
                    oct_digits += bytes([raw[j]])
                    j += 1
                out.append(int(oct_digits, 8) & 0xFF)
                i = j
                continue
        out.append(b)
        i += 1
    try:
        return out.decode("utf-8")
    except UnicodeDecodeError:
        return out.decode("latin-1", errors="replace")


def _extract_stream_text(stream_bytes: bytes) -> str:
    """Extract readable text operators (`Tj`, `TJ`, `'`) from a PDF content stream."""
    parts: list[str] = []
    # Find text blocks BT ... ET, or fall back to full stream
    blocks = re.findall(rb"BT\b(.*?)\bET\b", stream_bytes, flags=re.S)
    if not blocks:
        blocks = [stream_bytes]
    for blk in blocks:
        # Match either [(...)] TJ or (...) Tj or (...) '
        for m in re.finditer(
            rb"\[(.*?)\]\s*TJ|\((?:\\.|[^\\)])*\)\s*(?:Tj|')",
            blk,
            flags=re.S,
        ):
            token = m.group(0)
            if m.group(1) is not None:
                lits = re.findall(rb"\((?:\\.|[^\\)])*\)", m.group(1), flags=re.S)
                line = "".join(_decode_pdf_literal(x[1:-1]) for x in lits)
            else:
                lit_m = re.match(rb"\(((?:\\.|[^\\)])*)\)", token, flags=re.S)
                line = _decode_pdf_literal(lit_m.group(1)) if lit_m else ""
            if line.strip():
                parts.append(line.strip())
    return "\n".join(parts)


def pure_python_pdf_inspect(pdf_path: Path) -> dict[str, Any]:
    """Zero-dependency PDF metadata and page-text fallback inspector."""
    if not pdf_path.is_file():
        return {"ok": False, "error": "Arquivo PDF não encontrado."}
    size = pdf_path.stat().st_size
    if size <= 0 or size > MAX_PDF_BYTES:
        return {"ok": False, "error": "Tamanho de PDF inválido ou acima de 128 MB."}
    data = pdf_path.read_bytes()
    if not data.startswith(b"%PDF-"):
        return {"ok": False, "error": "Cabeçalho %PDF- inválido."}

    encrypted = bool(re.search(rb"/Encrypt\b", data))
    title = ""
    title_m = re.search(rb"/Title\s*\(((?:\\.|[^\\)]){1,240})\)", data)
    if title_m:
        title = _decode_pdf_literal(title_m.group(1)).strip()

    # Count /Type /Page objects (excluding /Type /Pages)
    page_matches = re.findall(rb"/Type\s*/Page(?![A-Za-z])", data)
    page_count = len(page_matches)
    if page_count == 0:
        cnt_m = re.search(rb"/Type\s*/Pages\b[^>]{0,240}/Count\s+(\d+)", data, flags=re.S)
        if cnt_m:
            page_count = max(1, int(cnt_m.group(1)))
    if page_count == 0:
        page_count = 1

    # Extract per-stream readable text blocks (prefer streams with BT...ET)
    page_texts: list[str] = []
    if not encrypted:
        for m in re.finditer(rb"(<<.*?>>)\s*stream\r?\n(.*?)\r?\nendstream", data, flags=re.S):
            hdr, raw_stream = m.group(1), m.group(2)
            decoded = raw_stream
            if b"/FlateDecode" in hdr:
                try:
                    decoded = zlib.decompress(raw_stream)
                except zlib.error:
                    continue
            if b"BT" in decoded and (b"Tj" in decoded or b"TJ" in decoded):
                txt = _extract_stream_text(decoded)
                if txt.strip():
                    page_texts.append(txt.strip())

    return {
        "ok": True,
        "engine": "KPlayer PDF (integrado)",
        "pages": page_count,
        "encrypted": encrypted,
        "title": title or pdf_path.stem,
        "size": size,
        "page_texts": page_texts,
    }


def pdf_info(pdf_path: Path, password: str = "") -> dict[str, Any]:
    """Return PDF metadata using PdfCraft core when available, else pure-Python."""
    pdfcraft_sh = find_pdfcraft_launcher()
    core_bin = find_pdfcraft_core()
    if core_bin is not None:
        try:
            open_cmd: dict[str, Any] = {"op": "open", "path": str(pdf_path)}
            if password:
                open_cmd["password"] = password
            resps = _pdfcraft_session_call(core_bin, [open_cmd], timeout_sec=12.0)
            if resps:
                r0 = resps[0]
                if r0.get("ok"):
                    return {
                        "ok": True,
                        "engine": "PdfCraft R36S",
                        "pages": int(r0.get("count") or len(r0.get("pages") or []) or 1),
                        "encrypted": bool(password),
                        "title": str(r0.get("title") or pdf_path.stem),
                        "pdfcraft_sh": str(pdfcraft_sh) if pdfcraft_sh else "",
                        "error": "",
                    }
                if r0.get("code") == "password":
                    return {
                        "ok": False,
                        "code": "password",
                        "engine": "PdfCraft R36S",
                        "pages": 0,
                        "encrypted": True,
                        "title": pdf_path.stem,
                        "pdfcraft_sh": str(pdfcraft_sh) if pdfcraft_sh else "",
                        "error": str(r0.get("error") or "Este PDF precisa de senha."),
                    }
        except Exception:
            pass

    fallback = pure_python_pdf_inspect(pdf_path)
    fallback["pdfcraft_sh"] = str(pdfcraft_sh) if pdfcraft_sh else ""
    fallback["error"] = fallback.get("error", "")
    return fallback


def pdf_render_page(
    pdf_path: Path,
    page_1based: int,
    scale: float,
    x: int,
    y: int,
    w: int,
    h: int,
    out_png: Path,
    password: str = "",
) -> dict[str, Any]:
    """Render a PDF page to PNG via PdfCraft -> pdftoppm -> mutool -> gs."""
    page_idx = max(0, int(page_1based) - 1)
    scale = max(0.4, min(3.0, float(scale)))
    w = max(120, min(1920, int(w)))
    h = max(120, min(1440, int(h)))
    x = max(0, int(x))
    y = max(0, int(y))

    core_bin = find_pdfcraft_core()
    if core_bin is not None:
        try:
            open_cmd: dict[str, Any] = {"op": "open", "path": str(pdf_path)}
            if password:
                open_cmd["password"] = password
            render_cmd = {
                "op": "render",
                "page": page_idx,
                "scale": round(scale, 3),
                "x": x,
                "y": y,
                "width": w,
                "height": h,
            }
            resps = _pdfcraft_session_call(core_bin, [open_cmd, render_cmd], out_png=out_png)
            if len(resps) >= 1 and not resps[0].get("ok"):
                return {
                    "ok": False,
                    "code": str(resps[0].get("code") or ""),
                    "engine": "PdfCraft R36S",
                    "error": str(resps[0].get("error") or "Falha ao abrir PDF."),
                }
            if len(resps) >= 2 and resps[1].get("ok") and out_png.is_file():
                r1 = resps[1]
                return {
                    "ok": True,
                    "engine": "PdfCraft R36S",
                    "width": int(r1.get("width") or w),
                    "height": int(r1.get("height") or h),
                    "page_width": int(r1.get("page_width") or w),
                    "page_height": int(r1.get("page_height") or h),
                    "error": "",
                }
        except Exception:
            pass

    dpi = int(max(72, min(220, round(96 * scale))))
    out_png.parent.mkdir(parents=True, exist_ok=True)

    pdftoppm = shutil.which("pdftoppm")
    if pdftoppm and not password:
        prefix = str(out_png.with_suffix(""))
        cmd = [
            pdftoppm,
            "-png",
            "-singlefile",
            "-r",
            str(dpi),
            "-f",
            str(page_idx + 1),
            "-l",
            str(page_idx + 1),
            str(pdf_path),
            prefix,
        ]
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        if res.returncode == 0 and out_png.is_file():
            return {
                "ok": True,
                "engine": "pdftoppm",
                "width": w,
                "height": h,
                "page_width": w,
                "page_height": h,
                "error": "",
            }

    mutool = shutil.which("mutool")
    if mutool and not password:
        cmd = [
            mutool,
            "draw",
            "-q",
            "-F",
            "png",
            "-r",
            str(dpi),
            "-o",
            str(out_png),
            str(pdf_path),
            str(page_idx + 1),
        ]
        res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
        if res.returncode == 0 and out_png.is_file():
            return {
                "ok": True,
                "engine": "mutool",
                "width": w,
                "height": h,
                "page_width": w,
                "page_height": h,
                "error": "",
            }

    return {
        "ok": False,
        "engine": "text-fallback",
        "error": "Renderizador de imagem ausente; exibindo texto da página.",
    }


def pdf_extract_text(pdf_path: Path, page_1based: int, password: str = "") -> dict[str, Any]:
    """Extract UTF-8 page text via PdfCraft core, pdftotext, or pure-Python fallback."""
    page_idx = max(0, int(page_1based) - 1)
    core_bin = find_pdfcraft_core()
    if core_bin is not None:
        try:
            open_cmd: dict[str, Any] = {"op": "open", "path": str(pdf_path)}
            if password:
                open_cmd["password"] = password
            resps = _pdfcraft_session_call(
                core_bin,
                [open_cmd, {"op": "text", "page": page_idx, "scale": 1.0}],
            )
            if len(resps) >= 2 and resps[1].get("ok"):
                return {
                    "ok": True,
                    "engine": "PdfCraft R36S",
                    "text": str(resps[1].get("text") or ""),
                    "error": "",
                }
        except Exception:
            pass

    pdftotext = shutil.which("pdftotext")
    if pdftotext and not password:
        res = subprocess.run(
            [pdftotext, "-f", str(page_idx + 1), "-l", str(page_idx + 1), str(pdf_path), "-"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if res.returncode == 0 and res.stdout.strip():
            return {
                "ok": True,
                "engine": "pdftotext",
                "text": res.stdout.strip(),
                "error": "",
            }

    info = pure_python_pdf_inspect(pdf_path)
    if not info.get("ok"):
        return {"ok": False, "engine": "integrado", "text": "", "error": info.get("error", "")}
    if info.get("encrypted"):
        return {
            "ok": False,
            "engine": "integrado",
            "text": "",
            "error": "PDF protegido por senha. Instale o motor PdfCraft R36S para abrir PDFs criptografados.",
        }
    texts: list[str] = info.get("page_texts") or []
    if page_idx < len(texts):
        return {"ok": True, "engine": "integrado", "text": texts[page_idx], "error": ""}
    if texts:
        return {"ok": True, "engine": "integrado", "text": texts[-1], "error": ""}
    return {
        "ok": True,
        "engine": "integrado",
        "text": "(Página sem texto extraível — instale PdfCraft R36S em /roms/ports/pdfcraft-r36s para visualização completa de imagens)",
        "error": "",
    }


def _read_optional_password(args: list[str]) -> str:
    if "--password-stdin" in args:
        return sys.stdin.readline().rstrip("\r\n")
    return ""


def main(argv: list[str]) -> int:
    if len(argv) < 3:
        sys.stderr.write("Uso: pdf_ops.py info|render|text <pdf> ...\n")
        return 2
    cmd = argv[1]
    pdf_path = Path(argv[2])
    password = _read_optional_password(argv)

    if cmd == "info":
        res = pdf_info(pdf_path, password=password)
        code_or_eng = res.get("code") or res.get("engine") or "integrado"
        print(
            "PDFMETA\t{ok}\t{eng}\t{pages}\t{enc}\t{title}\t{sh}\t{err}".format(
                ok=1 if res.get("ok") else 0,
                eng=_clean_tsv(code_or_eng, 48),
                pages=int(res.get("pages") or 0),
                enc=1 if res.get("encrypted") else 0,
                title=_clean_tsv(res.get("title") or pdf_path.stem, 120),
                sh=_clean_tsv(res.get("pdfcraft_sh") or "", 240),
                err=_clean_tsv(res.get("error") or "", 180),
            )
        )
        return 0 if res.get("ok") else 1

    if cmd == "render" and len(argv) >= 10:
        page = int(argv[3])
        scale = float(argv[4])
        x = int(argv[5])
        y = int(argv[6])
        w = int(argv[7])
        h = int(argv[8])
        out_png = Path(argv[9])
        res = pdf_render_page(pdf_path, page, scale, x, y, w, h, out_png, password=password)
        print(
            "PDFRENDER\t{ok}\t{eng}\t{w}\t{h}\t{pw}\t{ph}\t{err}".format(
                ok=1 if res.get("ok") else 0,
                eng=_clean_tsv(res.get("code") or res.get("engine") or "", 48),
                w=int(res.get("width") or 0),
                h=int(res.get("height") or 0),
                pw=int(res.get("page_width") or 0),
                ph=int(res.get("page_height") or 0),
                err=_clean_tsv(res.get("error") or "", 180),
            )
        )
        return 0 if res.get("ok") else 1

    if cmd == "text" and len(argv) >= 4:
        page = int(argv[3])
        res = pdf_extract_text(pdf_path, page, password=password)
        print(
            "PDFTEXT\t{ok}\t{eng}\t{err}".format(
                ok=1 if res.get("ok") else 0,
                eng=_clean_tsv(res.get("engine") or "", 48),
                err=_clean_tsv(res.get("error") or "", 180),
            )
        )
        if res.get("text"):
            print(res["text"])
        return 0 if res.get("ok") else 1

    sys.stderr.write("Subcomando inválido.\n")
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
