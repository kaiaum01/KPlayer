#!/usr/bin/env python3
"""Render crisp 640x480 v2.0.0 documentation screenshots using KPlayer's native TTF fonts + ImageMagick."""
from pathlib import Path
import math
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
BOLD = str(ROOT / "ports/kplayer/fonts/Bold.ttf")
REG = str(ROOT / "ports/kplayer/fonts/Interface.ttf")
DOCS_IMG = ROOT / "docs/images"
PREVIEWS = ROOT / "previews"

BG = "#0D0E10"
PANEL = "#15171B"
ELEV = "#1F2329"
BORDER = "#2B313B"
ACCENT = "#1DB954"
ACCENT_SOFT = "#143822"
TEXT = "#F4F6F8"
MUTED = "#9AA3AF"
DIM = "#646D7A"


def esc(text: str) -> str:
    return text.replace("\\", "\\\\").replace("'", "\\'").replace('"', '\\"')


class Canvas:
    def __init__(self, w=640, h=480, bg=BG):
        self.w = w
        self.h = h
        self.bg = bg
        self.cmds: list[str] = []

    def rect(self, x, y, w, h, fill, stroke=None, sw=1):
        parts = [f"fill '{fill}'"]
        if stroke:
            parts.append(f"stroke '{stroke}' stroke-width {sw}")
        else:
            parts.append("stroke none")
        parts.append(f"rectangle {x},{y} {x + w},{y + h}")
        self.cmds.append(" ".join(parts))

    def rrect(self, x, y, w, h, r, fill, stroke=None, sw=1):
        parts = [f"fill '{fill}'"]
        if stroke:
            parts.append(f"stroke '{stroke}' stroke-width {sw}")
        else:
            parts.append("stroke none")
        parts.append(f"roundrectangle {x},{y} {x + w},{y + h} {r},{r}")
        self.cmds.append(" ".join(parts))

    def circle(self, cx, cy, r, fill, stroke=None, sw=1):
        parts = [f"fill '{fill}'"]
        if stroke:
            parts.append(f"stroke '{stroke}' stroke-width {sw}")
        else:
            parts.append("stroke none")
        parts.append(f"circle {cx},{cy} {cx + r},{cy}")
        self.cmds.append(" ".join(parts))

    def ring(self, cx, cy, r, stroke, sw=2):
        self.cmds.append(
            f"fill none stroke '{stroke}' stroke-width {sw} circle {cx},{cy} {cx + r},{cy}"
        )

    def poly(self, pts, fill, stroke=None, sw=1):
        coord = " ".join(f"{x},{y}" for x, y in pts)
        parts = [f"fill '{fill}'"]
        if stroke:
            parts.append(f"stroke '{stroke}' stroke-width {sw}")
        else:
            parts.append("stroke none")
        parts.append(f"polygon {coord}")
        self.cmds.append(" ".join(parts))

    def line(self, x1, y1, x2, y2, stroke, sw=2):
        self.cmds.append(
            f"fill none stroke '{stroke}' stroke-width {sw} line {x1},{y1} {x2},{y2}"
        )

    def text(self, x, y, txt, size=13, color=TEXT, bold=False, align="NorthWest"):
        font = BOLD if bold else REG
        # Align via gravity in individual annotate ops later or simple MVG text
        # Using MVG text with font/size/fill gives exact coordinates (baseline = y + size*0.82)
        if align == "Center":
            self.cmds.append(
                f"font '{font}' font-size {size} fill '{color}' stroke none "
                f"text-align center text {x},{int(y + size * 0.85)} '{esc(txt)}'"
            )
        elif align == "Right":
            self.cmds.append(
                f"font '{font}' font-size {size} fill '{color}' stroke none "
                f"text-align right text {x},{int(y + size * 0.85)} '{esc(txt)}'"
            )
        else:
            self.cmds.append(
                f"font '{font}' font-size {size} fill '{color}' stroke none "
                f"text-align left text {x},{int(y + size * 0.85)} '{esc(txt)}'"
            )

    def vinyl(self, cx, cy, r):
        self.ring(cx, cy, r + 4, "#1DB95433", 4)
        self.circle(cx, cy, r, "#111512", "#26362B", 2)
        for frac in (0.82, 0.68, 0.54):
            self.ring(cx, cy, int(r * frac), "#232A25", 1)
        self.circle(cx, cy, int(r * 0.36), ACCENT)
        self.circle(cx, cy, max(4, int(r * 0.11)), BG)

    def equalizer(self, x, y, w, h, bars=26):
        bw = max(3, int(w / (bars * 1.55)))
        step = w / bars
        for i in range(bars):
            val = 0.25 + 0.75 * abs(math.sin(i * 0.58 + 0.9) * math.cos(i * 0.23))
            bh = max(4, int(h * val))
            bx = int(x + i * step)
            by = y + h - bh
            self.rrect(bx, by, bw, bh, 2, ACCENT if i % 3 != 0 else "#34E877")

    def header(self, section: str):
        self.rect(0, 0, 640, 32, "#13161A")
        self.rect(0, 32, 640, 1, BORDER)
        self.circle(18, 16, 6, "#1DB95444")
        self.circle(18, 16, 4, ACCENT)
        self.text(30, 8, "K PLAYER", 14, TEXT, bold=True)
        self.text(110, 10, "2.0.0", 11, DIM, bold=True)
        self.text(154, 10, "Umuarama, PR", 11, MUTED)
        self.rrect(256, 6, 152, 20, 10, ELEV)
        self.text(332, 11, section, 10, MUTED, bold=True, align="Center")
        self.text(526, 9, "14:25", 12, MUTED)
        self.text(586, 9, "94%", 12, ACCENT, bold=True)

    def footer(self, hints: list[tuple[str, str]]):
        self.rect(0, 436, 640, 44, "#13161A")
        self.rect(0, 436, 640, 1, BORDER)
        n = len(hints)
        cell = 616 // n
        for i, (k, act) in enumerate(hints):
            x = 12 + i * cell
            cy = 458
            if len(k) == 1:
                self.circle(x + 12, cy, 10, ELEV, BORDER, 1)
                self.text(x + 12, cy - 6, k, 10, TEXT, bold=True, align="Center")
                kw = 26
            else:
                kw = max(32, len(k) * 7 + 12)
                self.rrect(x, cy - 10, kw, 20, 10, ELEV, BORDER, 1)
                self.text(x + kw // 2, cy - 6, k, 9, TEXT, bold=True, align="Center")
            self.text(x + kw + 6, cy - 7, act, 11, MUTED)

    def render(self, out_paths: list[Path]):
        mvg = "\n".join(self.cmds)
        with tempfile.NamedTemporaryFile("w", suffix=".mvg", delete=False) as tf:
            tf.write(mvg)
            mvg_path = tf.name
        tmp_png = Path(mvg_path + ".png")
        try:
            subprocess.run(
                [
                    "convert",
                    "-size",
                    f"{self.w}x{self.h}",
                    f"xc:{self.bg}",
                    "-antialias",
                    "-draw",
                    f"@{mvg_path}",
                    "PNG24:" + str(tmp_png),
                ],
                check=True,
            )
            for p in out_paths:
                p.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(tmp_png, p)
        finally:
            Path(mvg_path).unlink(missing_ok=True)
            tmp_png.unlink(missing_ok=True)


def render_splash():
    c = Canvas()
    # Ambient emerald glow & sonar rings
    cx, cy = 320, 158
    c.ring(cx, cy, 108, "#1DB9541C", 2)
    c.ring(cx, cy, 82, "#1DB95435", 2)
    c.ring(cx, cy, 60, "#1DB95458", 2)
    c.vinyl(cx, cy, 46)
    # Orbiting glowing sparks
    for ang, r, dr in [(0.45, 66, 4), (2.55, 76, 3), (4.65, 86, 3)]:
        ox = int(cx + math.cos(ang) * r)
        oy = int(cy + math.sin(ang) * (r * 0.62))
        c.circle(ox, oy, dr + 3, "#1DB95444")
        c.circle(ox, oy, dr, "#7CF2A5")

    c.text(320, 224, "K PLAYER", 32, TEXT, bold=True, align="Center")
    c.rrect(260, 266, 120, 22, 11, ACCENT_SOFT, "#1DB95455", 1)
    c.text(320, 270, "v2.0.0  •  R36S", 11, ACCENT, bold=True, align="Center")
    c.text(320, 296, "Central de Mídia Portátil", 12, MUTED, align="Center")

    c.equalizer(176, 320, 288, 22, 28)

    # Progress bar with shimmer
    c.rrect(112, 360, 416, 10, 5, ELEV)
    c.rrect(112, 360, 316, 10, 5, ACCENT)
    c.rrect(368, 362, 34, 6, 3, "#A8F7C3")

    c.text(112, 378, "Carregando biblioteca de mídias...  (148 arquivos)", 11, MUTED)
    c.text(528, 378, "76%", 12, ACCENT, bold=True, align="Right")

    chips = [("Biblioteca", True), ("Rádio Online", True), ("IPTV", True), ("Placar da Bola", False)]
    cx_chip = 112
    for label, ready in chips:
        cw = len(label) * 7 + 28
        c.rrect(cx_chip, 412, cw, 22, 11, ACCENT_SOFT if ready else PANEL, "#1DB95444" if ready else BORDER, 1)
        c.circle(cx_chip + 10, 423, 3, ACCENT if ready else DIM)
        c.text(cx_chip + 18, 417, label, 10, TEXT if ready else MUTED, bold=ready)
        cx_chip += cw + 8

    c.render([DOCS_IMG / "readme-splash.png", PREVIEWS / "00-boot-splash.png"])


def render_welcome():
    c = Canvas()
    # Subtle top-right Terms pill
    c.rrect(462, 14, 162, 24, 12, PANEL, BORDER, 1)
    c.text(543, 20, "Y  Termos de uso", 11, MUTED, align="Center")

    # Boot-style animated centerpiece
    cx, cy = 320, 88
    c.ring(cx, cy, 86, "#1DB9541C", 2)
    c.ring(cx, cy, 64, "#1DB95438", 2)
    c.vinyl(cx, cy, 38)
    for ang, r, dr in [(0.5, 52, 3), (2.6, 60, 2), (4.7, 68, 2)]:
        ox = int(cx + math.cos(ang) * r)
        oy = int(cy + math.sin(ang) * (r * 0.62))
        c.circle(ox, oy, dr + 2, "#1DB95444")
        c.circle(ox, oy, dr, "#7CF2A5")

    c.text(320, 142, "K PLAYER", 27, TEXT, bold=True, align="Center")
    c.rrect(264, 178, 112, 20, 10, ACCENT_SOFT, "#1DB95455", 1)
    c.text(320, 182, "v2.0.0  •  R36S", 10, ACCENT, bold=True, align="Center")

    c.equalizer(210, 208, 220, 14, 24)

    # Row 0: Slim unified language capsule
    c.text(320, 236, "Idioma", 11, ACCENT, bold=True, align="Center")
    c.rrect(96, 254, 448, 38, 19, PANEL, ACCENT, 1.5)
    langs = ["Português (BR)", "English", "Español"]
    for i, nm in enumerate(langs):
        sx = 100 + i * 148
        if i == 0:
            c.rrect(sx, 258, 144, 30, 15, ACCENT)
            c.text(sx + 72, 266, nm, 12, BG, bold=True, align="Center")
        else:
            c.text(sx + 72, 266, nm, 12, MUTED, align="Center")

    # Row 1: Slim theme color dots ("bolinhas")
    c.text(320, 310, "Tema  •  Verde Spotify", 11, MUTED, bold=True, align="Center")
    c.rrect(146, 328, 348, 46, 23, PANEL, BORDER, 1)
    dots = [
        ("#1DB954", None),
        ("#60A5FA", "#0D1117"),
        ("#F8FAFC", "#10B981"),
        ("#FFFBF0", "#F59E0B"),
        ("#F43F5E", None),
        ("#A855F7", None),
        ("#F97316", None),
    ]
    for i, (outer, inner) in enumerate(dots):
        dcx = 179 + i * 47
        dcy = 351
        if i == 0:
            c.circle(dcx, dcy, 16, "#1DB95444")
            c.ring(dcx, dcy, 15, TEXT, 2)
        c.circle(dcx, dcy, 12 if i == 0 else 11, outer)
        if inner:
            c.circle(dcx, dcy, 4, inner)

    # Borderless subtle prompt (no B button box, no bottom bar)
    c.text(320, 416, "Pressione B para continuar", 12, MUTED, align="Center")

    c.render([
        DOCS_IMG / "readme-welcome.png",
        DOCS_IMG / "welcome.png",
        PREVIEWS / "09-boas-vindas.png",
    ])


def render_home():
    c = Canvas()
    c.header("DASHBOARD")
    c.text(18, 42, "Seu som.", 27, TEXT, bold=True)
    c.text(146, 42, "Sua tela.", 27, MUTED, bold=True)
    c.text(18, 79, "Músicas, vídeos, rádios, IPTV e Placar da Bola num player só.", 12, MUTED)

    cards = [
        ("Músicas", "Sua trilha sonora", "LRC Sync", True),
        ("Vídeos", "Cinema na palma", "Ocultar auto.", False),
        ("Arquivos", "/roms(2)/bgmusic", "Pastas locais", False),
        ("Rádio Online", "Estações do mundo", "Radio Browser", False),
        ("IPTV", "Canais ao vivo", "TV Online", False),
        ("Placar da Bola", "Jogos e estatísticas", "Ao vivo", False),
    ]
    for i, (name, desc, tag, focus) in enumerate(cards):
        x = 16 + (i % 3) * 208
        y = 104 + (i // 3) * 104
        c.rrect(x, y, 192, 94, 15, "#19261E" if focus else PANEL, ACCENT if focus else BORDER, 2 if focus else 1)
        c.rrect(x + 12, y + 12, 36, 36, 11, "#101813" if focus else ELEV, "#253A2C" if focus else BORDER, 1)
        # Clean crisp geometric category icon
        ix, iy = x + 30, y + 30
        if i == 0:  # Headphones / note
            c.ring(ix, iy, 8, ACCENT, 2)
            c.rect(ix - 9, iy, 4, 8, ACCENT)
            c.rect(ix + 5, iy, 4, 8, ACCENT)
        elif i == 1:  # Play box
            c.rrect(ix - 9, iy - 7, 18, 14, 3, "none", ACCENT, 2)
            c.poly([(ix - 3, iy - 4), (ix + 5, iy), (ix - 3, iy + 4)], ACCENT)
        elif i == 2:  # Folder
            c.rrect(ix - 9, iy - 5, 18, 12, 2, ACCENT)
            c.rect(ix - 9, iy - 8, 8, 4, ACCENT)
        elif i == 3:  # Radio waves
            c.circle(ix, iy, 3, ACCENT)
            c.ring(ix, iy, 7, ACCENT, 1.5)
            c.ring(ix, iy, 11, "#1DB95477", 1.5)
        elif i == 4:  # TV
            c.rrect(ix - 9, iy - 6, 18, 12, 2, "none", ACCENT, 2)
            c.line(ix - 4, iy + 9, ix + 4, iy + 9, ACCENT, 2)
        else:  # Soccer ball
            c.circle(ix, iy, 9, "none", ACCENT, 2)
            c.circle(ix, iy, 3, ACCENT)
        c.text(x + 56, y + 14, tag, 10, ACCENT, bold=True)
        c.text(x + 174, y + 12, "›", 15, ACCENT if focus else DIM, bold=True)
        c.text(x + 14, y + 54, name, 16, TEXT, bold=True)
        c.text(x + 14, y + 74, desc, 10, MUTED)

    # Now playing card
    c.rrect(16, 318, 608, 108, 16, PANEL, BORDER, 1)
    c.vinyl(72, 372, 38)
    c.text(128, 334, "TOCANDO AGORA", 10, ACCENT, bold=True)
    c.text(128, 350, "Neon Horizon", 18, TEXT, bold=True)
    c.text(128, 375, "KPlayer Sessions  •  FLAC 320 kbps", 11, MUTED)
    c.equalizer(128, 396, 196, 14, 30)

    # Centered transport buttons
    c.circle(500, 372, 14, ELEV)
    c.poly([(504, 366), (496, 372), (504, 378)], TEXT)
    c.rect(493, 366, 2, 12, TEXT)
    c.circle(546, 372, 22, ACCENT)
    c.rect(539, 363, 5, 18, BG)
    c.rect(548, 363, 5, 18, BG)
    c.circle(592, 372, 14, ELEV)
    c.poly([(588, 366), (596, 372), (588, 378)], TEXT)
    c.rect(597, 366, 2, 12, TEXT)

    c.footer([("DIR", "Navegar"), ("B", "Abrir"), ("X", "Player"), ("Y", "Opções"), ("START", "Pausa")])
    c.render([DOCS_IMG / "readme-home.png", DOCS_IMG / "dashboard.png", PREVIEWS / "01-inicio.png"])


def render_audio():
    c = Canvas()
    c.header("MÚSICAS")
    # Left album card
    c.rrect(16, 44, 232, 318, 15, PANEL, BORDER, 1)
    c.vinyl(132, 118, 56)
    c.text(132, 184, "Neon Horizon", 17, TEXT, bold=True, align="Center")
    c.text(132, 208, "KPlayer Demo", 12, ACCENT, bold=True, align="Center")
    c.text(132, 226, "R36S Hi-Fi Sessions", 11, MUTED, align="Center")
    c.equalizer(36, 248, 192, 20, 26)
    c.rect(28, 280, 208, 1, BORDER)
    c.text(28, 290, "FLAC  •  28.4 MB  •  03:45", 11, TEXT)
    c.text(28, 312, "44.1 kHz  •  2 canais", 11, MUTED)
    c.text(28, 332, "1024 kbps  •  /roms/bgmusic", 11, ACCENT, bold=True)

    # Right lyrics/queue/folder card
    c.rrect(260, 44, 364, 318, 15, PANEL, BORDER, 1)
    tabs = [("Letras", True), ("Fila", False), ("Pasta", False)]
    for i, (t, act) in enumerate(tabs):
        tx = 272 + i * 114
        c.rrect(tx, 56, 108, 28, 14, ACCENT if act else ELEV)
        c.text(tx + 54, 63, t, 13, BG if act else MUTED, bold=True, align="Center")

    c.text(276, 98, "LETRAS SINCRONIZADAS (.LRC)", 10, ACCENT, bold=True)
    c.text(442, 144, "Cada caminho tem seu som", 14, MUTED, align="Center")
    c.text(442, 196, "A música segue com você", 19, TEXT, bold=True, align="Center")
    c.text(442, 250, "E o dia ganha uma nova cor", 14, MUTED, align="Center")
    c.text(442, 296, "No ritmo do seu portátil", 13, DIM, align="Center")

    # Perfectly centered v2.0.0 Music Transport bar!
    c.rrect(16, 372, 608, 56, 14, PANEL, BORDER, 1)
    # Left next-track block
    c.rrect(26, 382, 36, 36, 9, ACCENT_SOFT)
    c.poly([(40, 392), (51, 400), (40, 408)], ACCENT)
    c.text(70, 384, "A SEGUIR", 9, ACCENT, bold=True)
    c.text(70, 399, "Green Lights.flac", 12, TEXT, bold=True)

    # Center transport controls (perfectly aligned on x=320!)
    c.rect(200, 382, 1, 36, BORDER)
    # Prev icon
    c.rect(275, 385, 2, 12, TEXT)
    c.poly([(287, 385), (278, 391), (287, 397)], TEXT)
    # Center white play/pause circle (cx=320, cy=391)
    c.circle(320, 391, 15, TEXT)
    c.rect(315, 385, 3.5, 12, BG)
    c.rect(321.5, 385, 3.5, 12, BG)
    # Next icon
    c.poly([(353, 385), (362, 391), (353, 397)], TEXT)
    c.rect(363, 385, 2, 12, TEXT)

    # Progress bar centered directly below controls
    c.text(212, 411, "01:18", 10, MUTED)
    c.rrect(246, 415, 148, 5, 2, ELEV)
    c.rrect(246, 415, 58, 5, 2, ACCENT)
    c.circle(304, 417, 4, TEXT)
    c.text(400, 411, "03:45", 10, MUTED)
    c.rect(440, 382, 1, 36, BORDER)

    # Right format badge + size
    c.rrect(510, 388, 52, 24, 12, ACCENT_SOFT)
    c.text(536, 394, "FLAC", 10, ACCENT, bold=True, align="Center")
    c.text(568, 394, "28.4 MB", 11, MUTED)

    c.footer([("A", "Voltar"), ("Y", "Letras"), ("X", "Fila / Pasta"), ("L1/R1", "Faixa"), ("SELECT", "Opções")])
    c.render([DOCS_IMG / "readme-audio.png", DOCS_IMG / "audio-lyrics.png", PREVIEWS / "02-musica.png"])


def render_football():
    c = Canvas()
    c.header("PLACAR DA BOLA")
    c.text(24, 42, "Placar da Bola", 21, TEXT, bold=True)
    filters = [("Todos", True), ("Ao vivo", False), ("Brasil", False), ("Europa", False)]
    for i, (f, act) in enumerate(filters):
        fx = 286 + i * 84
        c.rrect(fx, 45, 78, 22, 11, ACCENT if act else ELEV)
        c.text(fx + 39, 50, f, 11, BG if act else MUTED, bold=act, align="Center")

    matches = [
        ("Brasileirão Série A", "Maracanã", "68' AO VIVO", "Flamengo", "2 - 1", "Palmeiras", "Posse 54% x 46%  •  Fin. 12 x 9  •  Esc. 6 x 4", True, True),
        ("Brasileirão Série A", "Neo Química Arena", "41' AO VIVO", "Corinthians", "1 - 1", "São Paulo", "Posse 49% x 51%  •  Fin. 7 x 8  •  Cartões 2 x 1", True, False),
        ("UEFA Champions League", "Santiago Bernabéu", "ENCERRADO", "Real Madrid", "3 - 1", "Bayern", "Posse 52% x 48%  •  Fin. 15 x 11  •  xG 2.4 x 1.3", False, False),
        ("Premier League", "Anfield", "75' AO VIVO", "Liverpool", "2 - 0", "Arsenal", "Posse 58% x 42%  •  Fin. 14 x 6  •  Esc. 7 x 2", True, False),
        ("Copa Libertadores", "Morumbis", "21:30", "Botafogo", "vs", "River Plate", "B para abrir estatísticas, eventos e escalações", False, False),
    ]
    for row, (lg, venue, st, h, sc, aw, prev, live, focus) in enumerate(matches):
        y = 78 + row * 66
        c.rrect(20, y, 600, 60, 12, "#19261E" if focus else PANEL, ACCENT if focus else BORDER, 2 if focus else 1)
        c.text(32, y + 6, lg, 10, ACCENT, bold=True)
        c.text(285, y + 6, venue, 9, DIM)
        c.rrect(504, y + 5, 104, 17, 8, ACCENT if live else ELEV)
        c.text(556, y + 8, st, 9, BG if live else MUTED, bold=True, align="Center")

        c.text(32, y + 23, h, 14, TEXT, bold=True)
        c.rrect(248, y + 20, 96, 22, 8, ACCENT_SOFT if live else ELEV)
        c.text(296, y + 24, sc, 14, ACCENT if live else TEXT, bold=True, align="Center")
        c.text(358, y + 23, aw, 14, TEXT, bold=True)
        c.text(32, y + 45, prev, 9, MUTED)

    c.footer([("DIR", "Navegar"), ("B", "Detalhes"), ("X", "Filtro"), ("Y", "Atualizar"), ("A", "Voltar")])
    c.render([DOCS_IMG / "readme-football.png", PREVIEWS / "08-futebol.png"])


def render_football_detail():
    c = Canvas()
    c.header("PLACAR DA BOLA")
    c.rrect(20, 44, 600, 98, 14, PANEL, BORDER, 1)
    c.text(34, 52, "Brasileirão Série A", 11, ACCENT, bold=True)
    c.rrect(496, 50, 110, 20, 10, ACCENT)
    c.text(551, 54, "68' AO VIVO", 10, BG, bold=True, align="Center")

    c.text(34, 78, "Flamengo", 18, TEXT, bold=True)
    c.rrect(264, 74, 112, 32, 10, ACCENT)
    c.text(320, 80, "2  -  1", 19, BG, bold=True, align="Center")
    c.text(392, 78, "Palmeiras", 18, TEXT, bold=True)
    c.text(34, 117, "Maracanã  •  4-2-3-1 vs 4-3-3  •  Público: 64.210", 11, MUTED)

    tabs = [("Estatísticas", True), ("Eventos", False), ("Escalações", False)]
    for i, (t, act) in enumerate(tabs):
        tx = 20 + i * 204
        c.rrect(tx, 152, 192, 26, 13, ACCENT if act else ELEV)
        c.text(tx + 96, 158, t, 12, BG if act else MUTED, bold=True, align="Center")

    c.rrect(20, 186, 600, 240, 14, PANEL, BORDER, 1)
    stats = [
        ("Posse de bola", "54%", "46%", 0.54),
        ("Finalizações", "12", "9", 12 / 21),
        ("Chutes no gol", "6", "4", 0.60),
        ("Escanteios", "6", "4", 0.60),
        ("Precisão de passe", "87%", "82%", 0.515),
        ("Faltas cometidas", "11", "14", 11 / 25),
    ]
    for row, (lbl, hv, av, ratio) in enumerate(stats):
        y = 198 + row * 37
        c.text(38, y, hv, 13, ACCENT, bold=True)
        c.text(320, y, lbl, 12, TEXT, align="Center")
        c.text(602, y, av, 13, MUTED, bold=True, align="Right")
        c.rrect(38, y + 20, 564, 6, 3, ELEV)
        c.rrect(38, y + 20, int(564 * ratio), 6, 3, ACCENT)

    c.footer([("DIR", "Abas / Rolar"), ("Y", "Atualizar"), ("A", "Voltar")])
    c.render([DOCS_IMG / "readme-football-detail.png"])


def render_radio():
    c = Canvas()
    c.header("RÁDIO ONLINE")
    # Left player card
    c.rrect(16, 44, 240, 382, 15, PANEL, BORDER, 1)
    c.rrect(68, 60, 136, 136, 16, ACCENT_SOFT, "#1DB95455", 1)
    c.circle(136, 128, 12, ACCENT)
    c.ring(136, 128, 28, ACCENT, 2)
    c.ring(136, 128, 44, "#1DB95466", 2)
    c.text(136, 208, "KPlayer FM Hits", 16, TEXT, bold=True, align="Center")
    c.text(136, 232, "AO VIVO • Tocando agora", 11, ACCENT, bold=True, align="Center")
    c.text(136, 252, "pop, brasil, eletrônica", 11, MUTED, align="Center")
    c.equalizer(36, 276, 200, 22, 24)
    c.rrect(36, 314, 200, 28, 14, ELEV)
    c.text(136, 321, "MP3  •  192 kbps  •  BR", 11, TEXT, bold=True, align="Center")
    c.text(136, 360, "X Favoritar  •  B Pausar", 11, MUTED, align="Center")

    # Right station list
    c.rrect(268, 44, 356, 382, 15, PANEL, BORDER, 1)
    cats = [("Brasil", True), ("Pop", False), ("Rock", False), ("Favoritas", False)]
    for i, (cat, act) in enumerate(cats):
        cx = 280 + i * 84
        c.rrect(cx, 56, 78, 24, 12, ACCENT if act else ELEV)
        c.text(cx + 39, 62, cat, 10, BG if act else MUTED, bold=act, align="Center")

    stations = [
        ("KPlayer FM Hits", "MP3 • 192 kbps • Brasil", True),
        ("Rádio Nacional BR", "AAC • 128 kbps • Brasil", False),
        ("Jovem Pan News", "MP3 • 128 kbps • Notícias", False),
        ("Rock Brasil 89", "AAC • 192 kbps • Rock", False),
        ("MPB Clássicos", "MP3 • 128 kbps • MPB", False),
        ("Lo-Fi Chill 24h", "OPUS • 96 kbps • Lo-Fi", False),
    ]
    for idx, (nm, meta, sel) in enumerate(stations):
        y = 92 + idx * 52
        c.rrect(280, y, 332, 46, 10, "#19261E" if sel else ELEV, ACCENT if sel else BORDER, 1.5 if sel else 1)
        c.circle(298, y + 23, 5, ACCENT if sel else DIM)
        c.text(312, y + 8, nm, 13, ACCENT if sel else TEXT, bold=True)
        c.text(312, y + 26, meta, 10, MUTED)

    c.footer([("DIR", "Navegar"), ("B", "Tocar"), ("X", "Favoritar"), ("Y", "Atualizar"), ("A", "Voltar")])
    c.render([DOCS_IMG / "readme-radio.png", DOCS_IMG / "radio-playing.png", PREVIEWS / "03-radio.png"])


def render_iptv():
    c = Canvas()
    c.header("IPTV")
    c.text(24, 40, "Canais", 19, TEXT, bold=True)
    c.text(24, 62, "https://canais-saimo.pages.dev/", 10, MUTED)
    tabs = [("Canais", True), ("Filmes e séries", False)]
    for i, (t, act) in enumerate(tabs):
        tx = 356 + i * 134
        c.rrect(tx, 44, 126, 26, 13, ACCENT if act else ELEV)
        c.text(tx + 63, 51, t, 11, BG if act else MUTED, bold=act, align="Center")

    channels = [
        ("CAZE TV (ST)", "ESPORTES • HLS ao vivo", True),
        ("N SPORTS (OT)", "ESPORTES • HLS ao vivo", False),
        ("ESPN 2 (S46)", "ESPN • Canal ao vivo", False),
        ("COMBATE (S46)", "ESPORTES • Canal ao vivo", False),
        ("WARNER CHANNEL (S79)", "FILMES E SÉRIES • Canal ao vivo", False),
        ("AXN (S79)", "FILMES E SÉRIES • Canal ao vivo", False),
    ]
    for i, (nm, desc, sel) in enumerate(channels):
        y = 82 + i * 56
        c.rrect(20, y, 600, 50, 11, "#19261E" if sel else PANEL, ACCENT if sel else BORDER, 2 if sel else 1)
        c.rrect(32, y + 10, 38, 30, 7, ACCENT_SOFT if sel else ELEV)
        c.text(51, y + 18, "TV", 11, ACCENT if sel else MUTED, bold=True, align="Center")
        c.text(82, y + 9, nm, 14, TEXT, bold=True)
        c.text(82, y + 29, desc, 10, MUTED)
        c.rrect(536, y + 15, 70, 20, 10, ACCENT if sel else ELEV)
        c.text(571, y + 19, "AO VIVO", 9, BG if sel else MUTED, bold=True, align="Center")

    c.footer([("DIR", "Navegar"), ("B", "Assistir"), ("X", "Alternar"), ("Y", "Atualizar"), ("A", "Voltar")])
    c.render([DOCS_IMG / "readme-iptv.png", PREVIEWS / "06-iptv.png"])


def render_library():
    c = Canvas()
    c.header("BIBLIOTECA")
    c.rrect(16, 44, 608, 66, 13, PANEL, BORDER, 1)
    c.rrect(30, 56, 22, 16, 3, ACCENT)
    c.text(62, 56, "Pastas dedicadas: /roms(2)/bgmusic e /roms(2)/videos", 14, TEXT, bold=True)
    tabs = [("Todos", True), ("Músicas", False), ("Vídeos", False)]
    for i, (t, act) in enumerate(tabs):
        tx = 30 + i * 100
        c.rrect(tx, 84, 92, 20, 10, ACCENT if act else ELEV)
        c.text(tx + 46, 88, t, 11, BG if act else MUTED, bold=act, align="Center")

    locs = [
        ("Músicas (SD1)", "/roms/bgmusic", "Somente áudios • 92 faixas", True, True),
        ("Músicas (SD2)", "/roms2/bgmusic", "Somente áudios • 44 faixas", True, False),
        ("Vídeos (SD1)", "/roms/videos", "Somente vídeos • 8 filmes", True, False),
        ("Vídeos (SD2)", "/roms2/videos", "Somente vídeos • 4 clipes", True, False),
    ]
    for i, (nm, path, sub, avail, focus) in enumerate(locs):
        y = 124 + i * 68
        c.rrect(16, y, 608, 60, 12, "#19261E" if focus else PANEL, ACCENT if focus else BORDER, 2 if focus else 1)
        c.rrect(30, y + 18, 26, 20, 4, ACCENT if focus else MUTED)
        c.text(70, y + 10, nm, 16, TEXT, bold=True)
        c.text(70, y + 34, f"{path}   •   {sub}", 11, MUTED)
        c.rrect(534, y + 19, 76, 22, 11, ACCENT_SOFT if focus else ELEV)
        c.text(572, y + 24, "Abrir" if avail else "Ausente", 11, ACCENT if avail else DIM, bold=True, align="Center")

    c.text(20, 408, "Varredura otimizada: não percorre ROMs nem BIOS para abrir rápido no R36S.", 11, MUTED)
    c.footer([("B", "Abrir"), ("A", "Início"), ("DIR", "Filtro"), ("X", "Player"), ("Y", "Atualizar")])
    c.render([
        DOCS_IMG / "readme-library.png",
        DOCS_IMG / "readme-locations.png",
        DOCS_IMG / "library.png",
        DOCS_IMG / "storage.png",
        PREVIEWS / "04-biblioteca.png",
    ])


def render_video():
    c = Canvas(bg="#06080B")
    # Stylized cinematic backdrop
    c.rect(0, 60, 640, 360, "#0E1A16")
    c.circle(470, 190, 130, "#1DB9541A")
    c.circle(180, 240, 110, "#3B82F61A")
    c.text(320, 196, "KPlayer — Cinema 640×480 (libVLC)", 18, "#E2ECE6", bold=True, align="Center")

    c.header("VÍDEOS")
    c.rrect(16, 46, 92, 26, 13, "#15171BDD", BORDER, 1)
    c.text(62, 52, "A  Voltar", 12, TEXT, align="Center")
    c.rrect(448, 46, 176, 26, 13, "#15171BDD", BORDER, 1)
    c.text(536, 53, "Controles ocultam em 3s", 11, MUTED, align="Center")

    # Video OSD panel
    c.rrect(16, 326, 608, 100, 16, "#15171BE8", BORDER, 1)
    c.text(32, 338, "Trailer_R36S_HD.mp4", 16, TEXT, bold=True)
    c.text(606, 342, "01:42 / 04:10", 12, MUTED, align="Right")
    c.rrect(32, 370, 576, 5, 2, ELEV)
    c.rrect(32, 370, 236, 5, 2, ACCENT)
    c.circle(268, 372, 5, TEXT)
    c.circle(46, 400, 14, ACCENT)
    c.rect(41, 394, 3.5, 12, BG)
    c.rect(47.5, 394, 3.5, 12, BG)
    c.text(74, 394, "-10s      +10s      1.0x      Ajustar tela", 12, TEXT)
    c.text(606, 394, "SELECT Opções", 12, MUTED, align="Right")

    c.footer([("B", "Pausa"), ("DIR", "10s"), ("X", "Ocultar"), ("A", "Voltar"), ("SELECT", "Opções")])
    c.render([DOCS_IMG / "readme-video.png", DOCS_IMG / "video.png", PREVIEWS / "05-video.png"])


def render_options():
    c = Canvas()
    c.header("OPÇÕES")
    c.text(20, 42, "Configurações & Temas", 20, TEXT, bold=True)
    tabs = [("Reprodução", False), ("Biblioteca", False), ("Sistema & Temas", True)]
    for i, (t, act) in enumerate(tabs):
        tx = 20 + i * 204
        c.rrect(tx, 74, 192, 26, 13, ACCENT if act else ELEV)
        c.text(tx + 96, 80, t, 12, BG if act else MUTED, bold=True, align="Center")

    rows = [
        ("Tema de cores", "Verde Spotify  (7 temas)", True),
        ("Idioma da interface", "Português (BR)", False),
        ("Pastas de mídia", "/roms(2)/bgmusic e /roms(2)/videos", False),
        ("Localização por IP", "Desativada (privacidade)", False),
        ("Termos de uso e licenças", "Abrir", False),
        ("Sair do KPlayer", "Encerrar aplicativo", False),
    ]
    for i, (k, v, focus) in enumerate(rows):
        y = 112 + i * 50
        c.rrect(20, y, 600, 44, 10, "#19261E" if focus else PANEL, ACCENT if focus else BORDER, 2 if focus else 1)
        c.text(36, y + 14, k, 14, TEXT, bold=focus)
        c.text(604, y + 14, v, 13, ACCENT if focus else MUTED, bold=focus, align="Right")

    c.footer([("DIR", "Alterar"), ("X", "Categoria"), ("B", "Confirmar"), ("A", "Voltar")])
    c.render([DOCS_IMG / "readme-options.png", DOCS_IMG / "settings.png", PREVIEWS / "07-opcoes.png"])


def main():
    render_splash()
    render_welcome()
    render_home()
    render_audio()
    render_football()
    render_football_detail()
    render_radio()
    render_iptv()
    render_library()
    render_video()
    render_options()
    # Also copy the generated dArkOS port cover into docs/images/port-cover.png
    cover_src = ROOT / "ports/images/KPlayer-image.png"
    if cover_src.exists():
        shutil.copy2(cover_src, DOCS_IMG / "port-cover.png")
    print("All v2.0.0 screenshots rendered successfully!")


if __name__ == "__main__":
    main()
