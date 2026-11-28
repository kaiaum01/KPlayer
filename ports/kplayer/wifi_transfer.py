#!/usr/bin/env python3
"""Local LAN Wi-Fi File Transfer server for KPlayer R36S (v2.1.7+).

Serves a clean mobile-friendly web page on the console's local network so the
user can upload music, videos, PDFs, playlists (.m3u), or IPTV lists straight
from a phone browser without removing the SD card.

Security safeguards:
  - Per-session random 6-digit PIN verified on every POST upload
  - Strict destination category allowlist + Path.resolve() confinement
  - Filename sanitization + media/config extension allowlist
  - Streaming writes in 64 KiB chunks with a hard 512 MiB upload cap
  - All rendered filenames escaped (no raw HTML injection)
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import secrets
import signal
import socket
import sys
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

DEFAULT_PORT = 8088
MAX_UPLOAD_BYTES = 512 * 1024 * 1024  # 512 MiB
CHUNK_SIZE = 65536

ALLOWED_EXTENSIONS = {
    ".mp3", ".flac", ".ogg", ".wav", ".m4a", ".aac", ".opus", ".wma",
    ".mp4", ".mkv", ".avi", ".mov", ".webm", ".ts", ".m4v", ".3gp",
    ".pdf", ".m3u", ".m3u8", ".pls", ".lrc", ".srt", ".vtt", ".jpg", ".jpeg", ".png",
}

CATEGORY_LABELS = {
    "music": "Músicas",
    "videos": "Vídeos",
    "pdfs": "Documentos PDF",
    "playlists": "Playlists (.m3u)",
    "iptv": "Listas IPTV (.m3u)",
    "radios": "Rádios (.m3u)",
}


def detect_lan_ip() -> str:
    """Return the active LAN IPv4 address (never sends packets)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            ip = s.getsockname()[0]
            if ip and not ip.startswith("127."):
                return ip
    except OSError:
        pass
    try:
        host_ip = socket.gethostbyname(socket.gethostname())
        if host_ip and not host_ip.startswith("127."):
            return host_ip
    except OSError:
        pass
    return "127.0.0.1"


def resolve_category_dirs(gamedir: Path) -> dict[str, Path]:
    """Map safe upload categories to writable R36S or gamedir directories."""
    roms_base: Path | None = None
    for cand in (Path("/roms2"), Path("/roms")):
        if cand.is_dir() and os.access(cand, os.W_OK):
            roms_base = cand
            break

    media_root = gamedir / "midias"
    mapping = {
        "music": (roms_base / "music") if roms_base else (media_root / "musicas"),
        "videos": (roms_base / "movies") if roms_base else (media_root / "videos"),
        "pdfs": (roms_base / "documents") if roms_base else (media_root / "pdfs"),
        "playlists": gamedir / "playlists",
        "iptv": gamedir / "iptv_usuario",
        "radios": gamedir / "radios_usuario",
    }
    return {k: v.resolve() for k, v in mapping.items()}


def sanitize_filename(raw_name: str) -> str:
    """Strip directory components, control chars, and unsafe characters."""
    base = raw_name.replace("\\", "/").split("/")[-1]
    base = "".join(ch for ch in base if ord(ch) >= 32 and ord(ch) != 127)
    base = base.strip().lstrip(".")
    base = re.sub(r'[<>:"/\\|?*]+', "_", base)
    if not base or base in {".", ".."}:
        raise ValueError("Nome de arquivo inválido.")
    if len(base) > 180:
        stem, ext = os.path.splitext(base)
        base = stem[: 180 - len(ext)] + ext
    ext = Path(base).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Extensão não permitida: {ext or '(sem extensão)'}")
    return base


def safe_target_path(base_dir: Path, raw_filename: str) -> Path:
    """Resolve destination path and strictly verify confinement inside base_dir."""
    clean_name = sanitize_filename(raw_filename)
    base_resolved = base_dir.resolve()
    base_resolved.mkdir(parents=True, exist_ok=True)
    target = (base_resolved / clean_name).resolve()
    base_prefix = str(base_resolved) + os.sep
    if not str(target).startswith(base_prefix):
        raise ValueError("Caminho de destino fora da pasta permitida.")
    return target


# ==================== MINIMAL PURE-PYTHON QR CODE ENCODER (ISO 18004) ====================
# Supports Byte mode, Error Correction Level L, Versions 1..4 (up to 78 UTF-8 bytes)
# Sufficient for any LAN URL such as "http://192.168.100.245:8088/?p=123456"

_QR_VER_INFO = {
    1: (21, 19, 7, []),
    2: (25, 34, 10, [6, 18]),
    3: (29, 55, 15, [6, 22]),
    4: (33, 80, 20, [6, 26]),
}


def _gf_mul(a: int, b: int) -> int:
    res = 0
    while b:
        if b & 1:
            res ^= a
        a <<= 1
        if a & 0x100:
            a ^= 0x11D
        b >>= 1
    return res


def _rs_encode(data: list[int], ec_count: int) -> list[int]:
    gen = [1]
    for i in range(ec_count):
        nxt = [0] * (len(gen) + 1)
        root = 1
        for _ in range(i):
            root = _gf_mul(root, 2)
        for j, c in enumerate(gen):
            nxt[j] ^= c
            nxt[j + 1] ^= _gf_mul(c, root)
        gen = nxt
    rem = [0] * ec_count
    for byte in data:
        factor = byte ^ rem[0]
        rem = rem[1:] + [0]
        for j in range(ec_count):
            rem[j] ^= _gf_mul(gen[j + 1], factor)
    return rem


def encode_qr_matrix(text: str) -> list[str]:
    """Encode short ASCII/UTF-8 URL into a square QR matrix ('#' = dark, '.' = light)."""
    payload = text.encode("utf-8")
    ver = 0
    for v in (1, 2, 3, 4):
        _, cap_cw, _, _ = _QR_VER_INFO[v]
        # 4-bit mode + 8-bit len + payload bytes + 4-bit terminator
        if len(payload) + 2 <= cap_cw:
            ver = v
            break
    if ver == 0:
        return []

    size, data_cw, ec_cw, align_pos = _QR_VER_INFO[ver]
    bits: list[int] = []

    def push(val: int, width: int) -> None:
        for i in range(width - 1, -1, -1):
            bits.append((val >> i) & 1)

    push(0b0100, 4)  # Byte mode
    push(len(payload), 8)
    for b in payload:
        push(b, 8)
    rem_bits = data_cw * 8 - len(bits)
    push(0, min(4, max(0, rem_bits)))
    while len(bits) % 8 != 0:
        bits.append(0)
    codewords = [
        sum(bits[i + k] << (7 - k) for k in range(8))
        for i in range(0, len(bits), 8)
    ]
    pad_bytes = (0xEC, 0x11)
    pi = 0
    while len(codewords) < data_cw:
        codewords.append(pad_bytes[pi & 1])
        pi += 1
    all_cw = codewords + _rs_encode(codewords, ec_cw)
    all_bits = [(cw >> (7 - k)) & 1 for cw in all_cw for k in range(8)]

    grid = [[-1] * size for _ in range(size)]
    fixed = [[False] * size for _ in range(size)]

    def set_mod(r: int, c: int, val: int) -> None:
        if 0 <= r < size and 0 <= c < size:
            grid[r][c] = val
            fixed[r][c] = True

    # Finder patterns + separators
    for fr, fc in ((0, 0), (0, size - 7), (size - 7, 0)):
        for dr in range(-1, 8):
            for dc in range(-1, 8):
                r, c = fr + dr, fc + dc
                if not (0 <= r < size and 0 <= c < size):
                    continue
                if 0 <= dr <= 6 and 0 <= dc <= 6:
                    dark = (
                        dr in (0, 6)
                        or dc in (0, 6)
                        or (2 <= dr <= 4 and 2 <= dc <= 4)
                    )
                    set_mod(r, c, 1 if dark else 0)
                else:
                    set_mod(r, c, 0)

    # Alignment patterns
    for ar in align_pos:
        for ac in align_pos:
            if fixed[ar][ac]:
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    dark = max(abs(dr), abs(dc)) != 1
                    set_mod(ar + dr, ac + dc, 1 if dark else 0)

    # Timing patterns
    for i in range(8, size - 8):
        if not fixed[6][i]:
            set_mod(6, i, 1 if (i % 2 == 0) else 0)
        if not fixed[i][6]:
            set_mod(i, 6, 1 if (i % 2 == 0) else 0)

    # Dark module + reserve format info areas
    set_mod(4 * ver + 9, 8, 1)
    for i in range(9):
        if i != 6:
            fixed[8][i] = True
            fixed[i][8] = True
    for i in range(size - 8, size):
        fixed[8][i] = True
        fixed[i][8] = True

    # Place data bits with mask 0 ((r + c) % 2 == 0)
    bit_idx = 0
    col = size - 1
    upward = True
    while col > 0:
        if col == 6:
            col -= 1
        rows = range(size - 1, -1, -1) if upward else range(size)
        for r in rows:
            for dc in (0, -1):
                c = col + dc
                if not fixed[r][c]:
                    b = all_bits[bit_idx] if bit_idx < len(all_bits) else 0
                    bit_idx += 1
                    if (r + c) % 2 == 0:
                        b ^= 1
                    grid[r][c] = b
        col -= 2
        upward = not upward

    # Format bits for EC Level L (01) + Mask 0 (000) -> 0b111011111000100 (0x77C4)
    fmt = 0x77C4
    fmt_bits = [(fmt >> i) & 1 for i in range(15)]
    for i in range(6):
        grid[8][i] = fmt_bits[14 - i]
    grid[8][7] = fmt_bits[8]
    grid[8][8] = fmt_bits[7]
    grid[7][8] = fmt_bits[6]
    for i in range(6):
        grid[5 - i][8] = fmt_bits[5 - i]
    for i in range(8):
        grid[8][size - 1 - i] = fmt_bits[i]
    for i in range(7):
        grid[size - 7 + i][8] = fmt_bits[14 - i]

    return ["".join("#" if cell == 1 else "." for cell in row) for row in grid]


class TransferState:
    def __init__(self, gamedir: Path, status_path: Path, port: int, pin: str) -> None:
        self.gamedir = gamedir.resolve()
        self.status_path = status_path
        self.port = port
        self.pin = pin
        self.ip = detect_lan_ip()
        self.url = f"http://{self.ip}:{self.port}"
        self.qr = encode_qr_matrix(f"{self.url}/?p={self.pin}")
        self.dirs = resolve_category_dirs(self.gamedir)
        self.lock = threading.Lock()
        self.uploaded: list[dict[str, Any]] = []
        self.running = True
        self.write_status()

    def record_upload(self, category: str, filename: str, size_bytes: int) -> None:
        with self.lock:
            self.uploaded.insert(
                0,
                {
                    "category": category,
                    "name": filename,
                    "size": size_bytes,
                    "ts": int(time.time()),
                },
            )
            self.uploaded = self.uploaded[:30]
            self.write_status()

    def write_status(self) -> None:
        payload = {
            "running": self.running,
            "ip": self.ip,
            "port": self.port,
            "url": self.url,
            "pin": self.pin,
            "count": len(self.uploaded),
            "last_file": self.uploaded[0]["name"] if self.uploaded else "",
            "uploaded": self.uploaded[:8],
            "qr": self.qr,
        }
        tmp = self.status_path.with_suffix(".tmp")
        try:
            self.status_path.parent.mkdir(parents=True, exist_ok=True)
            tmp.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
            os.replace(tmp, self.status_path)
        except OSError:
            pass


def _render_upload_page(state: TransferState, prefill_pin: str = "") -> bytes:
    safe_url = html.escape(state.url)
    safe_pin = html.escape(prefill_pin if re.fullmatch(r"\d{6}", prefill_pin) else "")
    opts = "\n".join(
        f'<option value="{html.escape(k)}">{html.escape(label)}</option>'
        for k, label in CATEGORY_LABELS.items()
    )
    with state.lock:
        recent_items = "".join(
            f'<li><span>{html.escape(u["name"])}</span>'
            f'<small>{html.escape(CATEGORY_LABELS.get(u["category"], u["category"]))} · '
            f'{u["size"] // 1024} KB</small></li>'
            for u in state.uploaded[:10]
        )
    if not recent_items:
        recent_items = '<li class="empty">Nenhum arquivo enviado nesta sessão ainda.</li>'

    doc = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KPlayer R36S — Enviar arquivos via Wi-Fi</title>
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0b0f17; color: #f3f6fb; padding: 18px; }}
  .wrap {{ max-width: 520px; margin: 0 auto; }}
  h1 {{ font-size: 20px; margin: 0 0 4px; }}
  .sub {{ color: #9aa7bc; font-size: 13px; margin-bottom: 18px; }}
  .card {{ background: #141b29; border: 1px solid #243047; border-radius: 14px; padding: 16px; margin-bottom: 14px; }}
  label {{ display: block; font-size: 13px; color: #b8c4d9; margin-bottom: 6px; font-weight: 600; }}
  input, select, button {{ width: 100%; font-size: 15px; border-radius: 10px; padding: 11px 12px; }}
  input, select {{ background: #0e1420; color: #f3f6fb; border: 1px solid #2c3a54; margin-bottom: 12px; }}
  button {{ background: #1db954; color: #08120c; border: 0; font-weight: 700; cursor: pointer; }}
  button:disabled {{ opacity: 0.55; }}
  .bar {{ height: 7px; border-radius: 99px; background: #1f2a3e; overflow: hidden; margin-top: 12px; display: none; }}
  .bar > div {{ height: 100%; width: 0%; background: #1db954; transition: width 0.12s; }}
  .msg {{ font-size: 13px; margin-top: 10px; min-height: 18px; color: #9ae6b4; }}
  .msg.err {{ color: #fca5a5; }}
  ul {{ list-style: none; padding: 0; margin: 0; }}
  li {{ display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid #1e283b; font-size: 13px; }}
  li:last-child {{ border-bottom: 0; }}
  li.empty {{ color: #8c99af; }}
  small {{ color: #8c99af; white-space: nowrap; }}
</style>
</head>
<body>
<div class="wrap">
  <h1>KPlayer R36S · Transferência Wi-Fi</h1>
  <div class="sub">Console em {safe_url} · Envie músicas, vídeos, PDFs ou listas .m3u direto do celular.</div>
  <div class="card">
    <label for="pin">Código PIN (exibido na tela do R36S)</label>
    <input id="pin" type="text" inputmode="numeric" maxlength="6" placeholder="Ex: 123456" value="{safe_pin}" autocomplete="off">
    <label for="cat">Pasta de destino</label>
    <select id="cat">{opts}</select>
    <label for="files">Selecionar arquivos</label>
    <input id="files" type="file" multiple>
    <button id="sendBtn" type="button">Enviar para o R36S</button>
    <div class="bar" id="bar"><div id="fill"></div></div>
    <div class="msg" id="msg"></div>
  </div>
  <div class="card">
    <label>Enviados nesta sessão</label>
    <ul id="recent">{recent_items}</ul>
  </div>
</div>
<script>
const btn = document.getElementById('sendBtn');
const msg = document.getElementById('msg');
const bar = document.getElementById('bar');
const fill = document.getElementById('fill');
btn.addEventListener('click', async () => {{
  const pin = document.getElementById('pin').value.trim();
  const cat = document.getElementById('cat').value;
  const files = document.getElementById('files').files;
  msg.className = 'msg';
  if (!/^\\d{{6}}$/.test(pin)) {{ msg.className = 'msg err'; msg.textContent = 'Digite o código PIN de 6 dígitos mostrado no R36S.'; return; }}
  if (!files || !files.length) {{ msg.className = 'msg err'; msg.textContent = 'Selecione pelo menos um arquivo.'; return; }}
  btn.disabled = true;
  bar.style.display = 'block';
  let okCount = 0;
  for (let i = 0; i < files.length; i++) {{
    const f = files[i];
    fill.style.width = Math.round(((i + 0.2) / files.length) * 100) + '%';
    msg.textContent = 'Enviando (' + (i + 1) + '/' + files.length + '): ' + f.name;
    try {{
      const res = await fetch('/upload?category=' + encodeURIComponent(cat) + '&filename=' + encodeURIComponent(f.name), {{
        method: 'POST',
        headers: {{ 'X-KPlayer-Pin': pin, 'Content-Type': 'application/octet-stream' }},
        body: f
      }});
      const data = await res.json().catch(() => ({{}}));
      if (!res.ok || !data.ok) {{
        msg.className = 'msg err';
        msg.textContent = data.error || ('Falha ao enviar ' + f.name);
        btn.disabled = false;
        return;
      }}
      okCount++;
      fill.style.width = Math.round(((i + 1) / files.length) * 100) + '%';
    }} catch (e) {{
      msg.className = 'msg err';
      msg.textContent = 'Erro de conexão com o console.';
      btn.disabled = false;
      return;
    }}
  }}
  msg.textContent = okCount + ' arquivo(s) enviado(s) com sucesso!';
  btn.disabled = false;
  setTimeout(() => location.reload(), 900);
}});
</script>
</body>
</html>
"""
    return doc.encode("utf-8")


def _make_handler(state: TransferState):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args: Any) -> None:
            return

        def _send_json(self, code: int, data: dict[str, Any]) -> None:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/status":
                with state.lock:
                    self._send_json(
                        HTTPStatus.OK,
                        {"ok": True, "count": len(state.uploaded)},
                    )
                return
            if parsed.path != "/":
                self.send_error(HTTPStatus.NOT_FOUND)
                return
            qs = parse_qs(parsed.query)
            pin_prefill = (qs.get("p") or [""])[0]
            page = _render_upload_page(state, prefill_pin=pin_prefill)
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(page)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(page)

        def do_POST(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path != "/upload":
                self._send_json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "Rota inválida."})
                return

            pin_hdr = (self.headers.get("X-KPlayer-Pin") or "").strip()
            if not secrets.compare_digest(pin_hdr, state.pin):
                self._send_json(HTTPStatus.FORBIDDEN, {"ok": False, "error": "PIN incorreto."})
                return

            qs = parse_qs(parsed.query)
            category = (qs.get("category") or ["music"])[0].strip().lower()
            raw_name = (qs.get("filename") or [""])[0].strip()
            if category not in state.dirs:
                self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Categoria inválida."})
                return

            try:
                content_len = int(self.headers.get("Content-Length") or "0")
            except ValueError:
                self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "Tamanho inválido."})
                return
            if content_len <= 0 or content_len > MAX_UPLOAD_BYTES:
                self._send_json(
                    HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                    {"ok": False, "error": "Arquivo vazio ou acima de 512 MB."},
                )
                return

            try:
                dest = safe_target_path(state.dirs[category], raw_name)
            except ValueError as exc:
                self._send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": str(exc)})
                return

            part_path = dest.with_name(f".{dest.name}.{secrets.token_hex(4)}.part")
            remaining = content_len
            written = 0
            try:
                with part_path.open("wb") as out:
                    while remaining > 0:
                        chunk = self.rfile.read(min(CHUNK_SIZE, remaining))
                        if not chunk:
                            break
                        out.write(chunk)
                        written += len(chunk)
                        remaining -= len(chunk)
                if written != content_len:
                    part_path.unlink(missing_ok=True)
                    self._send_json(
                        HTTPStatus.BAD_REQUEST,
                        {"ok": False, "error": "Upload interrompido antes do fim."},
                    )
                    return
                os.replace(part_path, dest)
            except OSError:
                part_path.unlink(missing_ok=True)
                self._send_json(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    {"ok": False, "error": "Falha ao gravar arquivo no cartão SD."},
                )
                return

            state.record_upload(category, dest.name, written)
            self._send_json(
                HTTPStatus.OK,
                {"ok": True, "filename": dest.name, "category": category, "size": written},
            )

    return Handler


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="KPlayer R36S Wi-Fi Transfer Server")
    parser.add_argument("--gamedir", default=str(Path(__file__).resolve().parent))
    parser.add_argument("--status", default="/tmp/kplayer-wifi-transfer.json")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args(argv)

    port = args.port if 1024 <= args.port <= 65535 else DEFAULT_PORT
    pin = f"{secrets.randbelow(1_000_000):06d}"
    state = TransferState(Path(args.gamedir), Path(args.status), port, pin)
    server = ThreadingHTTPServer(("0.0.0.0", port), _make_handler(state))
    server.daemon_threads = True

    def _stop(_sig: int, _frame: Any) -> None:
        state.running = False
        state.write_status()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    try:
        server.serve_forever(poll_interval=0.25)
    finally:
        state.running = False
        state.write_status()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
