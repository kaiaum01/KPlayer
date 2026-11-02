"""KPlayer PC experimental: local media and direct HTTP(S) IPTV via libVLC."""
import os
import json
import queue
import sys
import threading
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

FREE_TV = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8"
MAX_BYTES = 4 * 1024 * 1024
DATA = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "KPlayerPC"
CACHE = DATA / "free-tv.m3u8"
REI_CACHE = DATA / "rei-canais.json"
REI_URL = "https://api.reidoscanais.my/channels"
DLL_HANDLES = []


def parse_m3u(data):
    """Read direct HTTP(S) entries only; never execute playlist directives."""
    if len(data) > MAX_BYTES:
        raise ValueError("Lista maior que 4 MB")
    result, name = [], ""
    for raw in data.decode("utf-8-sig", errors="replace").splitlines():
        line = raw.strip()
        if line.upper().startswith("#EXTINF:"):
            name = line.partition(",")[2].strip()
        elif line and not line.startswith("#"):
            try: parts = urlsplit(line)
            except ValueError:
                name = ""
                continue
            if parts.scheme.lower() in ("http", "https") and parts.netloc and not any(c.isspace() for c in line):
                result.append((name or f"Canal {len(result) + 1}", line))
            name = ""
    return result[:5000]


def parse_rei(data):
    if len(data) > MAX_BYTES:
        raise ValueError("Resposta muito grande")
    payload = json.loads(data)
    if not isinstance(payload, dict) or payload.get("success") is not True or not isinstance(payload.get("data"), list):
        raise ValueError("Resposta da API inválida")
    items = []
    for channel in payload["data"][:2048]:
        if not isinstance(channel, dict) or not isinstance(channel.get("name"), str): continue
        name = channel["name"].strip()[:120]
        if not name: continue
        url = ""
        embeds = channel.get("embeds")
        for embed in embeds if isinstance(embeds, list) else []:
            candidate = embed.get("embed_url") if isinstance(embed, dict) else None
            if not isinstance(candidate, str) or len(candidate) > 1024 or any(c.isspace() for c in candidate): continue
            try: parts = urlsplit(candidate)
            except ValueError: continue
            if parts.scheme in ("http", "https") and parts.netloc and parts.path.lower().endswith((".m3u8", ".mpd", ".ts")):
                url = candidate; break
        items.append((name, url))
    return items


def download_rei():
    request = urllib.request.Request(REI_URL, headers={"User-Agent": "KPlayer-PC/1.0.4"})
    with urllib.request.urlopen(request, timeout=20) as response:
        if urlsplit(response.geturl()).scheme != "https": raise ValueError("Redirecionamento inseguro")
        data = response.read(MAX_BYTES + 1)
    channels = parse_rei(data)
    if not channels: raise ValueError("Catálogo vazio")
    DATA.mkdir(parents=True, exist_ok=True)
    tmp = REI_CACHE.with_suffix(".tmp")
    tmp.write_bytes(data); os.replace(tmp, REI_CACHE)
    return channels


def download_playlist(url=FREE_TV):
    request = urllib.request.Request(url, headers={"User-Agent": "KPlayer-PC/1.0.4"})
    with urllib.request.urlopen(request, timeout=20) as response:
        if urlsplit(response.geturl()).scheme != "https":
            raise ValueError("Redirecionamento inseguro")
        data = response.read(MAX_BYTES + 1)
    channels = parse_m3u(data)
    if not channels:
        raise ValueError("Lista vazia ou inválida")
    DATA.mkdir(parents=True, exist_ok=True)
    tmp = CACHE.with_suffix(".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, CACHE)
    return channels


def load_vlc():
    if sys.platform != "win32":
        raise RuntimeError("Esta edição foi preparada para Windows.")
    base = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
    candidates = [base / "vlc"]
    for folder in candidates:
        if (folder / "libvlc.dll").is_file() and (folder / "libvlccore.dll").is_file() and (folder / "plugins").is_dir():
            os.environ["PYTHON_VLC_LIB_PATH"] = str(folder / "libvlc.dll")
            os.environ["PYTHON_VLC_MODULE_PATH"] = str(folder / "plugins")
            os.environ["VLC_PLUGIN_PATH"] = str(folder / "plugins")
            DLL_HANDLES.append(os.add_dll_directory(str(folder)))
            break
    else:
        raise RuntimeError("Os arquivos do VLC incluídos com o KPlayer não foram encontrados. Extraia todo o ZIP e mantenha a pasta vlc junto ao executável.")
    import vlc
    return vlc


class App:
    def __init__(self, root, vlc):
        self.root, self.vlc = root, vlc
        self.instance = vlc.Instance("--no-video-title-show")
        if not self.instance:
            raise RuntimeError("Não foi possível iniciar o VLC incluído. Verifique se todos os arquivos foram extraídos.")
        self.player = self.instance.media_player_new()
        self.media = None
        self.channels, self.visible = [], []
        self.events = queue.Queue()
        self.fetching = False
        self.user = []
        self.rei = []
        self.source = tk.StringVar(value="Free-TV + listas próprias")
        root.title("KPlayer PC • 1.0.4 experimental")
        root.geometry("1100x700")
        root.minsize(760, 500)
        root.configure(bg="#111318")
        self.style = ttk.Style(root)
        self.style.theme_use("clam")
        self.style.configure("TFrame", background="#111318")
        self.style.configure("TLabel", background="#111318", foreground="#f1f2f5", font=("Segoe UI", 11))
        self.style.configure("TButton", padding=7, font=("Segoe UI", 10))
        head = ttk.Frame(root, padding=12); head.pack(fill="x")
        ttk.Label(head, text="KPLAYER", font=("Segoe UI", 20, "bold"), foreground="#41d7a0").pack(side="left")
        ttk.Button(head, text="Abrir arquivo", command=self.open_file).pack(side="right", padx=4)
        ttk.Button(head, text="Importar lista IPTV", command=self.import_list).pack(side="right", padx=4)
        main = ttk.Frame(root, padding=(12, 0)); main.pack(fill="both", expand=True)
        side = ttk.Frame(main, width=300); side.pack(side="left", fill="y", padx=(0, 12)); side.pack_propagate(False)
        ttk.Label(side, text="CANAIS IPTV", font=("Segoe UI", 13, "bold")).pack(anchor="w")
        source = ttk.Combobox(side, textvariable=self.source, state="readonly", values=("Free-TV + listas próprias", "Rei dos Canais (experimental)"))
        source.pack(fill="x", pady=(6, 0)); source.bind("<<ComboboxSelected>>", self.source_changed)
        self.search = tk.StringVar(); self.search.trace_add("write", lambda *_: self.refresh_list())
        ttk.Entry(side, textvariable=self.search).pack(fill="x", pady=7)
        self.listbox = tk.Listbox(side, bg="#20242d", fg="white", selectbackground="#287b61", borderwidth=0, font=("Segoe UI", 10), activestyle="none")
        self.listbox.pack(fill="both", expand=True)
        self.listbox.bind("<Double-Button-1>", self.play_channel)
        self.listbox.bind("<Return>", self.play_channel)
        ttk.Button(side, text="Atualizar fonte", command=self.fetch).pack(fill="x", pady=7)
        panel = ttk.Frame(main); panel.pack(side="left", fill="both", expand=True)
        self.canvas = tk.Frame(panel, bg="black"); self.canvas.pack(fill="both", expand=True)
        self.title = ttk.Label(panel, text="Selecione um arquivo ou canal", font=("Segoe UI", 13, "bold")); self.title.pack(anchor="w", pady=(10, 2))
        self.status = ttk.Label(panel, text="Pronto"); self.status.pack(anchor="w")
        controls = ttk.Frame(panel); controls.pack(fill="x", pady=10)
        ttk.Button(controls, text="Reproduzir / Pausar", command=self.player.pause).pack(side="left", padx=(0, 6))
        ttk.Button(controls, text="Parar", command=self.player.stop).pack(side="left")
        self.time = ttk.Label(controls, text="--:-- / --:--"); self.time.pack(side="right")
        root.protocol("WM_DELETE_WINDOW", self.close)
        root.update_idletasks()
        self.player.set_hwnd(self.canvas.winfo_id())
        if CACHE.is_file():
            try: self.channels = parse_m3u(CACHE.read_bytes())
            except (OSError, ValueError): pass
        if REI_CACHE.is_file():
            try: self.rei = parse_rei(REI_CACHE.read_bytes())
            except (OSError, ValueError): pass
        self.refresh_list(); self.fetch(); self.tick()

    def refresh_list(self):
        query = self.search.get().casefold()
        data = self.rei if self.source.get().startswith("Rei") else self.user + self.channels
        self.visible = [(n, u) for n, u in data if query in n.casefold()]
        self.listbox.delete(0, "end")
        for name, url in self.visible: self.listbox.insert("end", name + ("  [WEB]" if not url else ""))

    def source_changed(self, _event=None):
        self.refresh_list()
        if self.source.get().startswith("Rei") and not self.rei: self.fetch()

    def fetch(self):
        if self.fetching: return
        is_rei = self.source.get().startswith("Rei")
        self.fetching = True; self.status.config(text="Atualizando canais em segundo plano...")
        def worker():
            try: self.events.put((is_rei, True, download_rei() if is_rei else download_playlist()))
            except Exception as exc: self.events.put((is_rei, False, str(exc)))
        threading.Thread(target=worker, daemon=True).start()

    def import_list(self):
        filename = filedialog.askopenfilename(filetypes=[("Listas IPTV", "*.m3u *.m3u8"), ("Todos", "*.*")])
        if not filename: return
        try:
            with open(filename, "rb") as f: entries = parse_m3u(f.read(MAX_BYTES + 1))
            if not entries: raise ValueError("Nenhum link HTTP/HTTPS encontrado")
            self.user = entries; self.refresh_list()
            self.status.config(text=f"Lista importada: {len(entries)} canais")
        except (OSError, ValueError) as exc: messagebox.showerror("Erro ao importar", str(exc))

    def open_file(self):
        filename = filedialog.askopenfilename(filetypes=[("Mídia", "*.mp3 *.mp4 *.mkv *.avi *.flac *.wav *.ogg *.m4a *.webm"), ("Todos", "*.*")])
        if filename: self.play(filename, Path(filename).name, local=True)

    def play_channel(self, _event=None):
        selection = self.listbox.curselection()
        if selection:
            name, url = self.visible[selection[0]]
            if not url:
                self.status.config(text="Canal sem fluxo direto compatível (link WEB).")
                return
            self.play(url, name)

    def play(self, location, name, local=False):
        self.player.stop()
        self.media = self.instance.media_new_path(location) if local else self.instance.media_new_location(location)
        self.player.set_media(self.media)
        self.player.set_hwnd(self.canvas.winfo_id())
        result = self.player.play()
        self.title.config(text=name)
        self.status.config(text="Reproduzindo / conectando..." if result != -1 else "Não foi possível iniciar a mídia")

    def tick(self):
        try:
            while True:
                is_rei, ok, payload = self.events.get_nowait(); self.fetching = False
                if ok:
                    if is_rei: self.rei = payload
                    else: self.channels = payload
                    self.refresh_list()
                    self.status.config(text=f"Catálogo atualizado: {len(payload)} canais")
                else: self.status.config(text="Fonte indisponível; usando lista salva, se houver")
        except queue.Empty: pass
        def fmt(ms):
            if ms < 0: return "--:--"
            s = ms // 1000
            return f"{s // 60:02d}:{s % 60:02d}"
        self.time.config(text=f"{fmt(self.player.get_time())} / {fmt(self.player.get_length())}")
        self.root.after(500, self.tick)

    def close(self):
        self.player.stop(); self.player.release(); self.instance.release(); self.root.destroy()


def main():
    if "--smoke-test" in sys.argv:
        vlc = load_vlc()
        instance = vlc.Instance("--no-video-title-show")
        if not instance:
            raise RuntimeError("Não foi possível iniciar libVLC")
        player = instance.media_player_new()
        if not player:
            raise RuntimeError("Não foi possível criar o player")
        player.release(); instance.release()
        return
    root = tk.Tk()
    try:
        vlc = load_vlc(); App(root, vlc)
    except Exception as exc:
        messagebox.showerror("KPlayer PC", str(exc)); root.destroy(); return
    root.mainloop()


if __name__ == "__main__":
    if "--smoke-test" in sys.argv:
        try: main()
        except Exception: sys.exit(1)
    else:
        main()
