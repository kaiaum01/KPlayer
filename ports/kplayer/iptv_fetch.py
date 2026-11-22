#!/usr/bin/env python3
"""Unlimited, category-by-category IPTV/VOD fetcher for KPlayer R36S.

Supports:
  - Canais (https://canais-saimo.pages.dev/)
  - Filmes (https://filmes-saimo.pages.dev/) — all ~31k+ movies by shelf, category, genre, and A-Z
  - Séries (https://filmes-saimo.pages.dev/) — all ~12k+ series by shelf, category, genre, and A-Z,
    plus on-demand full season/episode loading (zero caps)
  - Usuário (ports/kplayer/iptv_usuario/ files + playlists.txt URLs) — zero channel cap

CLI subcommands:
  iptv_fetch.py categories <canais|filmes|series|usuario> <out_tsv> [--refresh]
  iptv_fetch.py list <canais|filmes|series|usuario> <cat_id> <out_m3u8> [--refresh]
  iptv_fetch.py episodes <letter> <shard> <title> <out_m3u8> [--refresh]
  iptv_fetch.py user-add-url <url> [name]
  iptv_fetch.py user-list <out_tsv>
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import hashlib
import ipaddress
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

CANAIS_BASE = "https://canais-saimo.pages.dev/"
RAMYS_CANAIS_URL = "https://raw.githubusercontent.com/Ramys/Iptv-Brasil-2026/master/Canais.m3u8"
FILMES_BASE = "https://filmes-saimo.pages.dev/"
UA = "KPlayer-R36S/2.0.4"

CACHE_DIR = Path("iptv/.cache")
USER_DIR = Path("iptv_usuario")
USER_PLAYLISTS_FILE = USER_DIR / "playlists.txt"

CAT_LABELS = {
    "anime": "Animes",
    "dorama": "Doramas",
    "kids": "Kids",
    "novela": "Novelas",
}

ATTR_RE = re.compile(r'([a-zA-Z0-9_-]+)="([^"]*)"')


def is_safe_url(raw: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(raw.strip())
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower()
    if not host or host in ("localhost", "127.0.0.1", "0.0.0.0", "::1"):
        return False
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            return False
    except ValueError:
        pass
    return True


def fetch_text_cached(
    url: str,
    cache_key: str,
    ttl_seconds: int = 3600,
    refresh: bool = False,
    timeout: int = 18,
    max_bytes: int = 48 * 1024 * 1024,
) -> str:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    safe_key = re.sub(r"[^a-zA-Z0-9._-]", "_", cache_key)
    cache_path = CACHE_DIR / safe_key
    if not refresh and cache_path.is_file():
        try:
            age = time.time() - cache_path.stat().st_mtime
            if age < ttl_seconds and cache_path.stat().st_size > 0:
                return cache_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            pass
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read(max_bytes)
        text = data.decode("utf-8", errors="replace")
        tmp = cache_path.with_suffix(".tmp")
        tmp.write_text(text, encoding="utf-8")
        os.replace(tmp, cache_path)
        return text
    except Exception:
        if cache_path.is_file():
            return cache_path.read_text(encoding="utf-8", errors="replace")
        raise


def write_atomic(out_path: Path, text: str) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_name(out_path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, out_path)


def letter_for_title(title: str) -> str:
    s = title.strip()
    if not s:
        return "#"
    ch = unicodedata.normalize("NFD", s[0])[0].upper()
    if "A" <= ch <= "Z":
        return ch
    return "#"


def letter_slug(letter: str) -> str:
    ch = letter.strip().upper()
    if len(ch) == 1 and "A" <= ch <= "Z":
        return ch
    return "%23"


def sanitize_attr(val: str) -> str:
    return val.replace('"', "'").replace("\r", " ").replace("\n", " ").replace("\t", " ").strip()


def sanitize_title(val: str) -> str:
    return val.replace("\r", " ").replace("\n", " ").replace("\t", " ").strip()


def norm_title(val: str) -> str:
    return re.sub(r"\s*\(\d{4}\)\s*$", "", val.strip().lower())


def resolve_token(token: str, bases: dict[str, str]) -> str:
    t = token.strip()
    if not t:
        return ""
    if t.startswith("http://") or t.startswith("https://"):
        if "desativado.invalid" in t:
            return ""
        return t
    if ":" in t:
        bid, rest = t.split(":", 1)
        base = bases.get(bid.strip(), "")
        if not base or "desativado.invalid" in base:
            return ""
        rest = rest.strip()
        if not rest:
            return ""
        low = rest.lower()
        if not any(ext in low for ext in (".mp4", ".m3u8", ".mkv", ".ts", "?")):
            rest = rest + ".mp4"
        return base + rest
    return ""


def pick_best_url(tokens: list[str], bases: dict[str, str]) -> str:
    resolved: list[str] = []
    for tok in tokens:
        u = resolve_token(tok, bases)
        if u and u not in resolved:
            resolved.append(u)
    if not resolved:
        return ""
    for u in resolved:
        if u.startswith("https://") and ("nixplay" in u or u.lower().endswith(".mp4") or ".m3u8" in u.lower()):
            return u
    for u in resolved:
        if u.startswith("https://"):
            return u
    return resolved[0]


def parse_movie_line_urls(rest_cols: list[str], bases: dict[str, str]) -> tuple[str, str]:
    dub_tokens: list[str] = []
    leg_tokens: list[str] = []
    for col in rest_cols:
        col = col.strip()
        if col.startswith("dub="):
            dub_tokens.extend(col[4:].split(","))
        elif col.startswith("leg="):
            leg_tokens.extend(col[4:].split(","))
    u = pick_best_url(dub_tokens, bases)
    if u:
        return u, "DUB"
    u = pick_best_url(leg_tokens, bases)
    if u:
        return u, "LEG"
    return "", ""


def parse_m3u_entries(text: str, default_group: str = "Geral") -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    name = ""
    logo = ""
    group = ""
    tvg_id = ""
    for raw in text.splitlines():
        line = raw.lstrip("\ufeff").strip()
        if not line:
            continue
        if line.upper().startswith("#EXTINF:"):
            comma = line.find(",")
            name = line[comma + 1 :].strip() if comma >= 0 else ""
            attrs = {k.lower(): v for k, v in ATTR_RE.findall(line)}
            logo = attrs.get("tvg-logo", "")
            group = attrs.get("group-title", "")
            tvg_id = attrs.get("tvg-id", "")
        elif not line.startswith("#"):
            if (line.startswith("http://") or line.startswith("https://")) and " " not in line and "\t" not in line:
                entries.append(
                    {
                        "name": name or f"Canal {len(entries) + 1}",
                        "url": line,
                        "logo": logo,
                        "group": group or default_group,
                        "id": tvg_id,
                    }
                )
            name = logo = group = tvg_id = ""
    return entries


def format_m3u_entries(entries: list[dict[str, str]]) -> str:
    lines = ["#EXTM3U"]
    for item in entries:
        lines.append(
            f'#EXTINF:-1 tvg-id="{sanitize_attr(item.get("id", ""))}" '
            f'tvg-logo="{sanitize_attr(item.get("logo", ""))}" '
            f'group-title="{sanitize_attr(item.get("group", ""))}",'
            f'{sanitize_title(item.get("name", "Item"))}'
        )
        lines.append(item["url"])
    return "\n".join(lines) + "\n"


def _norm_canais_key(raw: str) -> str:
    s = unicodedata.normalize("NFD", raw)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn").lower()
    s = re.sub(r"\s*\([^)]*\)\s*", " ", s)
    s = re.sub(r"\bchannel\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def _norm_reserve_group(raw: str) -> str:
    low = raw.strip().lower()
    if not low:
        return "Canais"
    if low in ("esportes", "espn"):
        return "Esportes"
    if low in ("filmes e séries", "filmes e series"):
        return "Filmes e Séries"
    return raw.strip()


def parse_saimo_catalogo(text: str) -> list[dict[str, str]]:
    channels: list[dict[str, object]] = []
    cur: dict[str, object] | None = None
    cur_src: dict[str, str] | None = None

    for raw in text.splitlines():
        line = raw.lstrip("\ufeff").strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, val = line.split(":", 1)
        key = key.strip().lower()
        val = val.strip()

        if key == "canal":
            if cur is not None and cur["sources"]:
                channels.append(cur)
            cur = {"name": val or "Canal", "group": "Canais", "logo": "", "sources": []}
            cur_src = None
        elif cur is not None:
            if key == "categoria" and val:
                cur["group"] = val
            elif key == "logo" and val:
                cur["logo"] = val
            elif key == "fonte" and (val.startswith("http://") or val.startswith("https://")):
                cur_src = {"url": val, "referer": "", "agent": "", "key": "", "quality": ""}
                cur["sources"].append(cur_src)  # type: ignore[union-attr]
            elif cur_src is not None:
                if key == "referer" and val:
                    cur_src["referer"] = val
                elif key == "agente" and val:
                    cur_src["agent"] = val
                elif key == "chave" and val:
                    cur_src["key"] = val
                elif key == "qualidade" and val:
                    cur_src["quality"] = val

    if cur is not None and cur["sources"]:
        channels.append(cur)

    def _score_src(s: dict[str, str]) -> int:
        u = s["url"].lower()
        has_key = bool(s["key"])
        is_mpd = ".mpd" in u
        is_m3u8 = ".m3u8" in u
        is_err = u.endswith("/error.txt")
        score = 0
        if has_key or is_mpd:
            score -= 50
        elif is_m3u8 and not s["referer"]:
            score += 30
        elif is_m3u8 and s["referer"]:
            score += 24
        elif is_err:
            score += 12
        else:
            score += 16
        if s["url"].startswith("https://"):
            score += 2
        return score

    entries: list[dict[str, str]] = []
    for ch in channels:
        srcs: list[dict[str, str]] = ch["sources"]  # type: ignore[assignment]
        ranked = sorted(srcs, key=_score_src, reverse=True)
        best = ranked[0]
        quality = best.get("quality", "")
        if not quality:
            for s in ranked:
                if s.get("quality"):
                    quality = s["quality"]
                    break
        entries.append(
            {
                "name": str(ch["name"]),
                "url": best["url"],
                "logo": str(ch["logo"]),
                "group": str(ch["group"] or "Canais"),
                "id": quality or f"{len(ranked)} fontes",
            }
        )
    return entries


def _clean_ramys_group(raw: str) -> str:
    s = re.sub(r"^CANAIS\s*:\s*", "", raw.strip(), flags=re.I)
    s = re.sub(r"[^\w\sÀ-ÿ+&-]", "", s).strip()
    if not s:
        return "IPTV Brasil 2026"
    low = s.lower()
    mapping = {
        "filmes e series": "Filmes e Séries",
        "filmes e séries": "Filmes e Séries",
        "documentarios": "Documentários",
        "documentários": "Documentários",
        "esportes": "Esportes",
        "noticias": "Notícias",
        "notícias": "Notícias",
        "infantis": "Infantil",
        "variedades": "Variedades",
        "abertos": "TV Aberta",
        "musica": "Música",
        "música": "Música",
        "religiosos": "Religiosos",
    }
    return mapping.get(low, s.title())


def _clean_ramys_name(raw: str) -> str:
    s = re.sub(r"[¹²³⁴⁵⁶⁷⁸⁹⁰]+", "", raw)
    s = re.sub(r"\b(FHD|UHD|4K|HD|SD|H\.?265|HEVC)\b", "", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip() or raw.strip()


def load_canais_entries(refresh: bool = False) -> list[dict[str, str]]:
    catalogo_txt = ""
    reserve_txt = ""
    ramys_txt = ""
    try:
        catalogo_txt = fetch_text_cached(
            CANAIS_BASE + "catalogo.txt",
            "saimo_catalogo.txt",
            ttl_seconds=900,
            refresh=refresh,
        )
    except Exception:
        pass
    try:
        reserve_txt = fetch_text_cached(
            CANAIS_BASE + "canais.txt",
            "saimo_canais.txt",
            ttl_seconds=900,
            refresh=refresh,
        )
    except Exception:
        pass
    try:
        ramys_txt = fetch_text_cached(
            RAMYS_CANAIS_URL,
            "ramys_iptv_br_2026.m3u8",
            ttl_seconds=900,
            refresh=refresh,
        )
    except Exception:
        pass

    entries = parse_saimo_catalogo(catalogo_txt) if catalogo_txt else []
    seen_norm = {_norm_canais_key(e["name"]): e for e in entries}

    if reserve_txt:
        for r in parse_m3u_entries(reserve_txt, default_group="Canais"):
            nk = _norm_canais_key(r["name"])
            if nk in seen_norm:
                if not seen_norm[nk].get("logo") and r.get("logo"):
                    seen_norm[nk]["logo"] = r["logo"]
            else:
                r["group"] = _norm_reserve_group(r.get("group", ""))
                entries.append(r)
                seen_norm[nk] = r

    if ramys_txt:
        ramys_entries = parse_m3u_entries(ramys_txt, default_group="IPTV Brasil 2026")
        # Prefer standard H.264 streams over H.265 for widest device compatibility
        ramys_entries.sort(key=lambda x: (1 if "265" in x["name"].lower() else 0))
        for r in ramys_entries:
            clean_name = _clean_ramys_name(r["name"])
            nk = _norm_canais_key(clean_name)
            if not nk:
                continue
            if nk in seen_norm:
                if not seen_norm[nk].get("logo") and r.get("logo"):
                    seen_norm[nk]["logo"] = r["logo"]
            else:
                r["name"] = clean_name
                r["group"] = _clean_ramys_group(r.get("group", ""))
                r["id"] = r.get("id") or "IPTV Brasil 2026"
                entries.append(r)
                seen_norm[nk] = r

    return entries


def load_user_playlists_meta() -> list[tuple[str, str]]:
    """Return list of (label, url) from iptv_usuario/playlists.txt."""
    USER_DIR.mkdir(parents=True, exist_ok=True)
    if not USER_PLAYLISTS_FILE.is_file():
        return []
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for raw in USER_PLAYLISTS_FILE.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "\t" in line:
            label, url = line.split("\t", 1)
            label, url = label.strip(), url.strip()
        else:
            url = line
            parsed = urllib.parse.urlparse(url)
            label = parsed.hostname or "Lista URL"
        if is_safe_url(url) and url not in seen:
            seen.add(url)
            out.append((label or "Lista URL", url))
    return out


def load_user_entries(refresh: bool = False) -> list[dict[str, str]]:
    USER_DIR.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, str]] = []
    seen_urls: set[str] = set()

    # 1) Local playlist files in iptv_usuario/ (and non-hidden user playlists in iptv/)
    scan_dirs = [USER_DIR, Path("iptv")]
    for directory in scan_dirs:
        if not directory.is_dir():
            continue
        for path in sorted(directory.iterdir()):
            if not path.is_file():
                continue
            if path.name.startswith("."):
                continue
            low = path.name.lower()
            if low in ("readme.txt", "playlists.txt"):
                continue
            if not low.endswith((".m3u", ".m3u8", ".txt")):
                continue
            try:
                content = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            default_grp = path.stem.replace("_", " ").strip() or "Minha Lista"
            for item in parse_m3u_entries(content, default_group=default_grp):
                if item["url"] not in seen_urls:
                    seen_urls.add(item["url"])
                    entries.append(item)

    # 2) Remote playlist URLs saved via keyboard in iptv_usuario/playlists.txt
    urls = load_user_playlists_meta()
    if urls:
        def _load_one(label: str, url: str) -> list[dict[str, str]]:
            key = "user_" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:16] + ".m3u"
            try:
                content = fetch_text_cached(url, key, ttl_seconds=900, refresh=refresh, timeout=18)
                return parse_m3u_entries(content, default_group=label)
            except Exception:
                return []

        with ThreadPoolExecutor(max_workers=4) as ex:
            futs = [ex.submit(_load_one, label, url) for label, url in urls]
            for fut in as_completed(futs):
                for item in fut.result():
                    if item["url"] not in seen_urls:
                        seen_urls.add(item["url"])
                        entries.append(item)

    return entries


def load_saimo_indice(refresh: bool = False) -> tuple[dict[str, str], list[tuple[str, int, int]]]:
    txt = fetch_text_cached(FILMES_BASE + "indice.txt", "saimo_indice.txt", ttl_seconds=3600, refresh=refresh)
    bases: dict[str, str] = {}
    letters: list[tuple[str, int, int]] = []
    for raw in txt.splitlines():
        line = raw.strip()
        if line.startswith("base:"):
            parts = line[5:].strip().split(None, 1)
            if len(parts) == 2:
                bases[parts[0].strip()] = parts[1].strip()
            continue
        cols = line.split("\t")
        if len(cols) >= 3 and len(cols[0].strip()) == 1 and cols[1].strip().isdigit() and cols[2].strip().isdigit():
            letters.append((cols[0].strip().upper(), int(cols[1].strip()), int(cols[2].strip())))
    return bases, letters


def load_saimo_destaques(refresh: bool = False) -> list[dict[str, str]]:
    txt = fetch_text_cached(FILMES_BASE + "destaques.txt", "saimo_destaques.txt", ttl_seconds=3600, refresh=refresh)
    capa_base = "https://image.tmdb.org/t/p/w342"
    shelf = "Em alta"
    items: list[dict[str, str]] = []
    for raw in txt.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("capa:"):
            capa_base = line[5:].strip()
            continue
        cols = raw.rstrip("\r\n").split("\t")
        if cols[0] == "fila" and len(cols) >= 2:
            shelf = cols[1].strip() or "Destaques"
            continue
        if cols[0] in ("f", "s") and len(cols) >= 3:
            poster = cols[4].strip() if len(cols) >= 5 else ""
            logo = (capa_base + poster) if poster.startswith("/") else poster
            items.append(
                {
                    "kind": cols[0],
                    "title": cols[1].strip(),
                    "letter": cols[2].strip().upper() or "#",
                    "year": cols[3].strip() if len(cols) >= 4 else "",
                    "logo": logo,
                    "shelf": shelf,
                }
            )
    return items


def load_saimo_categorias(refresh: bool = False) -> list[tuple[str, str, list[str]]]:
    txt = fetch_text_cached(FILMES_BASE + "categorias.txt", "saimo_categorias.txt", ttl_seconds=3600, refresh=refresh)
    rows: list[tuple[str, str, list[str]]] = []
    for raw in txt.splitlines():
        if not raw or raw.startswith("#"):
            continue
        cols = raw.rstrip("\r\n").split("\t")
        if len(cols) >= 3 and cols[0] in ("f", "s"):
            cats = [c.strip().lower() for c in cols[2].split(",") if c.strip()]
            if cats:
                rows.append((cols[0], cols[1].strip(), cats))
    return rows


def load_saimo_generos(refresh: bool = False) -> list[tuple[str, str, list[str]]]:
    txt = fetch_text_cached(FILMES_BASE + "generos.txt", "saimo_generos.txt", ttl_seconds=3600, refresh=refresh)
    rows: list[tuple[str, str, list[str]]] = []
    for raw in txt.splitlines():
        if not raw or raw.startswith("#"):
            continue
        cols = raw.rstrip("\r\n").split("\t")
        if len(cols) >= 3 and cols[0] in ("f", "s"):
            gens = [g.strip() for g in cols[2].split(",") if g.strip()]
            if gens:
                rows.append((cols[0], cols[1].strip(), gens))
    return rows


def load_movie_letter_file(letter: str, bases: dict[str, str], refresh: bool = False) -> list[tuple[str, str, str]]:
    slug = letter_slug(letter)
    txt = fetch_text_cached(
        f"{FILMES_BASE}filmes-{slug}.txt",
        f"saimo_filmes_{slug}.txt",
        ttl_seconds=3600,
        refresh=refresh,
    )
    out: list[tuple[str, str, str]] = []
    for raw in txt.splitlines():
        cols = raw.rstrip("\r\n").split("\t")
        if len(cols) < 2:
            continue
        title = cols[0].strip()
        url, lang = parse_movie_line_urls(cols[1:], bases)
        if title and url:
            out.append((title, url, lang))
    return out


def load_series_letter_file(letter: str, refresh: bool = False) -> list[tuple[str, str, str, int]]:
    slug = letter_slug(letter)
    txt = fetch_text_cached(
        f"{FILMES_BASE}series-{slug}.txt",
        f"saimo_series_{slug}.txt",
        ttl_seconds=3600,
        refresh=refresh,
    )
    out: list[tuple[str, str, str, int]] = []
    for raw in txt.splitlines():
        cols = raw.rstrip("\r\n").split("\t")
        if len(cols) >= 3:
            title = cols[0].strip()
            year = cols[1].strip()
            shard = cols[2].strip()
            ep_count = int(cols[3].strip()) if len(cols) >= 4 and cols[3].strip().isdigit() else 0
            if title and shard:
                out.append((title, year, shard, ep_count))
    return out


def cmd_categories(source: str, out_path: Path, refresh: bool = False) -> bool:
    rows: list[tuple[str, str, int]] = []
    if source in ("canais", "usuario"):
        entries = load_canais_entries(refresh) if source == "canais" else load_user_entries(refresh)
        counts: dict[str, int] = {}
        for item in entries:
            g = item["group"] or ("Canais" if source == "canais" else "Minha Lista")
            counts[g] = counts.get(g, 0) + 1
        rows.append(("all", "Todos os canais", len(entries)))
        for grp in sorted(counts.keys(), key=lambda s: s.lower()):
            rows.append((f"grp:{grp}", grp, counts[grp]))
    elif source in ("filmes", "series"):
        kind = "f" if source == "filmes" else "s"
        _, letters = load_saimo_indice(refresh)
        destaques = load_saimo_destaques(refresh)
        cats = load_saimo_categorias(refresh)
        gens = load_saimo_generos(refresh)

        # 1) Destaques shelves
        shelf_counts: dict[str, int] = {}
        shelf_order: list[str] = []
        for d in destaques:
            if d["kind"] != kind:
                continue
            sh = d["shelf"]
            if sh not in shelf_counts:
                shelf_order.append(sh)
                shelf_counts[sh] = 0
            shelf_counts[sh] += 1
        for sh in shelf_order:
            rows.append((f"shelf:{sh}", f"Destaque • {sh}", shelf_counts[sh]))

        # 2) Special categories (Animes, Doramas, Kids, Novelas)
        cat_counts: dict[str, int] = {}
        for k, _, clist in cats:
            if k != kind:
                continue
            for c in clist:
                cat_counts[c] = cat_counts.get(c, 0) + 1
        for slug_c in ("anime", "dorama", "kids", "novela"):
            if cat_counts.get(slug_c, 0) > 0:
                rows.append((f"cat:{slug_c}", CAT_LABELS[slug_c], cat_counts[slug_c]))

        # 3) TMDB Genres (sorted by count desc)
        gen_counts: dict[str, int] = {}
        for k, _, glist in gens:
            if k != kind:
                continue
            for g in glist:
                gen_counts[g] = gen_counts.get(g, 0) + 1
        for gname, cnt in sorted(gen_counts.items(), key=lambda kv: (-kv[1], kv[0].lower())):
            rows.append((f"gen:{gname}", gname, cnt))

        # 4) Full A-Z catalog (exact full counts)
        prefix = "Filmes" if kind == "f" else "Séries"
        for ltr, m_cnt, s_cnt in letters:
            cnt = m_cnt if kind == "f" else s_cnt
            if cnt > 0:
                rows.append((f"az:{ltr}", f"{prefix} • {ltr}", cnt))
    else:
        return False

    lines = [f"{sanitize_title(cid)}\t{sanitize_title(cname)}\t{cnt}" for cid, cname, cnt in rows]
    write_atomic(out_path, "\n".join(lines) + ("\n" if lines else ""))
    return True


def cmd_list(source: str, cat_id: str, out_path: Path, refresh: bool = False) -> bool:
    entries: list[dict[str, str]] = []

    if source in ("canais", "usuario"):
        all_items = load_canais_entries(refresh) if source == "canais" else load_user_entries(refresh)
        if cat_id == "all":
            entries = all_items
        elif cat_id.startswith("grp:"):
            target = cat_id[4:]
            entries = [e for e in all_items if (e["group"] or "") == target]
        else:
            entries = all_items
    elif source == "filmes":
        bases, _ = load_saimo_indice(refresh)
        destaques = load_saimo_destaques(refresh)
        poster_map = {d["title"].lower(): d["logo"] for d in destaques if d["kind"] == "f" and d["logo"]}
        year_map = {d["title"].lower(): d["year"] for d in destaques if d["kind"] == "f" and d["year"]}

        if cat_id.startswith("az:"):
            ltr = cat_id[3:].strip().upper() or "#"
            grp_label = f"Filmes • {ltr}"
            for title, url, lang in load_movie_letter_file(ltr, bases, refresh):
                tl = title.lower()
                yr = year_map.get(tl, "")
                entries.append(
                    {
                        "name": title,
                        "url": url,
                        "logo": poster_map.get(tl, ""),
                        "group": grp_label,
                        "id": f"Filme • {yr} • {lang}" if yr else f"Filme • {lang}",
                    }
                )
        elif cat_id.startswith("shelf:"):
            shelf_name = cat_id[6:]
            wanted = [d for d in destaques if d["kind"] == "f" and d["shelf"] == shelf_name]
            letters_needed = sorted({d["letter"] for d in wanted})
            url_map: dict[tuple[str, str], tuple[str, str]] = {}
            norm_map: dict[tuple[str, str], tuple[str, str]] = {}
            with ThreadPoolExecutor(max_workers=6) as ex:
                futs = {ex.submit(load_movie_letter_file, ltr, bases, refresh): ltr for ltr in letters_needed}
                for fut in as_completed(futs):
                    ltr = futs[fut]
                    try:
                        for title, url, lang in fut.result():
                            url_map[(ltr, title.lower())] = (url, lang)
                            norm_map.setdefault((ltr, norm_title(title)), (url, lang))
                    except Exception:
                        pass
            for d in wanted:
                hit = url_map.get((d["letter"], d["title"].lower())) or norm_map.get(
                    (d["letter"], norm_title(d["title"]))
                )
                if not hit:
                    continue
                url, lang = hit
                entries.append(
                    {
                        "name": d["title"],
                        "url": url,
                        "logo": d["logo"],
                        "group": shelf_name,
                        "id": f"Filme • {d['year']} • {lang}" if d["year"] else f"Filme • {lang}",
                    }
                )
        elif cat_id.startswith("cat:") or cat_id.startswith("gen:"):
            if cat_id.startswith("cat:"):
                target = cat_id[4:].lower()
                grp_label = CAT_LABELS.get(target, target.title())
                wanted_titles = [t for k, t, cs in load_saimo_categorias(refresh) if k == "f" and target in cs]
            else:
                target = cat_id[4:]
                grp_label = target
                wanted_titles = [t for k, t, gs in load_saimo_generos(refresh) if k == "f" and target in gs]

            by_letter: dict[str, set[str]] = {}
            by_letter_norm: dict[str, set[str]] = {}
            for t in wanted_titles:
                ltr = letter_for_title(t)
                by_letter.setdefault(ltr, set()).add(t.lower())
                by_letter_norm.setdefault(ltr, set()).add(norm_title(t))

            with ThreadPoolExecutor(max_workers=8) as ex:
                futs = {ex.submit(load_movie_letter_file, ltr, bases, refresh): ltr for ltr in sorted(by_letter.keys())}
                collected: list[dict[str, str]] = []
                for fut in as_completed(futs):
                    ltr = futs[fut]
                    exact_set = by_letter[ltr]
                    norm_set = by_letter_norm[ltr]
                    try:
                        for title, url, lang in fut.result():
                            tl = title.lower()
                            if tl in exact_set or norm_title(title) in norm_set:
                                yr = year_map.get(tl, "")
                                collected.append(
                                    {
                                        "name": title,
                                        "url": url,
                                        "logo": poster_map.get(tl, ""),
                                        "group": grp_label,
                                        "id": f"Filme • {yr} • {lang}" if yr else f"Filme • {lang}",
                                    }
                                )
                    except Exception:
                        pass
            collected.sort(key=lambda x: x["name"].lower())
            entries = collected
    elif source == "series":
        destaques = load_saimo_destaques(refresh)
        poster_map = {d["title"].lower(): d["logo"] for d in destaques if d["kind"] == "s" and d["logo"]}

        def make_series_entry(title: str, ltr: str, year: str, shard: str, ep_count: int, grp_label: str, logo: str = "") -> dict[str, str]:
            info = f"Série • {year} • {ep_count} eps" if year and ep_count else (f"Série • {ep_count} eps" if ep_count else "Série")
            return {
                "name": title,
                "url": f"kplayer-series://{letter_slug(ltr)}/{shard}",
                "logo": logo or poster_map.get(title.lower(), ""),
                "group": grp_label,
                "id": f"series:{ltr}:{shard}:{info}",
            }

        if cat_id.startswith("az:"):
            ltr = cat_id[3:].strip().upper() or "#"
            grp_label = f"Séries • {ltr}"
            for title, year, shard, ep_count in load_series_letter_file(ltr, refresh):
                entries.append(make_series_entry(title, ltr, year, shard, ep_count, grp_label))
        elif cat_id.startswith("shelf:"):
            shelf_name = cat_id[6:]
            wanted = [d for d in destaques if d["kind"] == "s" and d["shelf"] == shelf_name]
            letters_needed = sorted({d["letter"] for d in wanted})
            shard_map: dict[tuple[str, str], tuple[str, str, int]] = {}
            with ThreadPoolExecutor(max_workers=6) as ex:
                futs = {ex.submit(load_series_letter_file, ltr, refresh): ltr for ltr in letters_needed}
                for fut in as_completed(futs):
                    ltr = futs[fut]
                    try:
                        for title, year, shard, ep_count in fut.result():
                            shard_map[(ltr, title.lower())] = (year, shard, ep_count)
                            shard_map.setdefault((ltr, norm_title(title)), (year, shard, ep_count))
                    except Exception:
                        pass
            for d in wanted:
                hit = shard_map.get((d["letter"], d["title"].lower())) or shard_map.get(
                    (d["letter"], norm_title(d["title"]))
                )
                if not hit:
                    continue
                year, shard, ep_count = hit
                entries.append(
                    make_series_entry(d["title"], d["letter"], d["year"] or year, shard, ep_count, shelf_name, d["logo"])
                )
        elif cat_id.startswith("cat:") or cat_id.startswith("gen:"):
            if cat_id.startswith("cat:"):
                target = cat_id[4:].lower()
                grp_label = CAT_LABELS.get(target, target.title())
                wanted_titles = [t for k, t, cs in load_saimo_categorias(refresh) if k == "s" and target in cs]
            else:
                target = cat_id[4:]
                grp_label = target
                wanted_titles = [t for k, t, gs in load_saimo_generos(refresh) if k == "s" and target in gs]

            by_letter: dict[str, set[str]] = {}
            by_letter_norm: dict[str, set[str]] = {}
            for t in wanted_titles:
                ltr = letter_for_title(t)
                by_letter.setdefault(ltr, set()).add(t.lower())
                by_letter_norm.setdefault(ltr, set()).add(norm_title(t))

            with ThreadPoolExecutor(max_workers=8) as ex:
                futs = {ex.submit(load_series_letter_file, ltr, refresh): ltr for ltr in sorted(by_letter.keys())}
                collected: list[dict[str, str]] = []
                for fut in as_completed(futs):
                    ltr = futs[fut]
                    exact_set = by_letter[ltr]
                    norm_set = by_letter_norm[ltr]
                    try:
                        for title, year, shard, ep_count in fut.result():
                            if title.lower() in exact_set or norm_title(title) in norm_set:
                                collected.append(make_series_entry(title, ltr, year, shard, ep_count, grp_label))
                    except Exception:
                        pass
            collected.sort(key=lambda x: x["name"].lower())
            entries = collected
    else:
        return False

    write_atomic(out_path, format_m3u_entries(entries))
    return True


def cmd_episodes(letter: str, shard: str, title: str, out_path: Path, refresh: bool = False) -> bool:
    bases, _ = load_saimo_indice(refresh)
    slug = letter_slug(letter)
    safe_shard = re.sub(r"[^0-9]", "", shard)
    if not safe_shard:
        return False
    txt = fetch_text_cached(
        f"{FILMES_BASE}series-{slug}-{safe_shard}.txt",
        f"saimo_shard_{slug}_{safe_shard}.txt",
        ttl_seconds=3600,
        refresh=refresh,
    )
    target_exact = title.strip().lower()
    target_norm = norm_title(title)

    blocks: dict[str, list[tuple[int, int, str, str]]] = {}
    cur_title = ""
    for raw in txt.splitlines():
        if raw.startswith("@"):
            cur_title = raw[1:].split("\t", 1)[0].strip().lower()
            blocks.setdefault(cur_title, [])
            continue
        if not cur_title:
            continue
        cols = raw.rstrip("\r\n").split("\t")
        if len(cols) < 4:
            continue
        sea_s, ep_s, lang, urls_raw = cols[0].strip(), cols[1].strip(), cols[2].strip().upper(), cols[3].strip()
        if sea_s == "0" and ep_s == "0":
            continue
        u = pick_best_url(urls_raw.split(","), bases)
        if not u:
            continue
        sea_n = int(sea_s) if sea_s.isdigit() else 0
        ep_n = int(ep_s) if ep_s.isdigit() else 0
        blocks[cur_title].append((sea_n, ep_n, lang, u))

    eps = blocks.get(target_exact)
    if not eps:
        for k, v in blocks.items():
            if norm_title(k) == target_norm:
                eps = v
                break
    eps = eps or []

    # Deduplicate (season, episode) preferring DUB over LEG
    best_by_ep: dict[tuple[int, int], tuple[str, str]] = {}
    for sea_n, ep_n, lang, u in eps:
        key = (sea_n, ep_n)
        if key not in best_by_ep or (best_by_ep[key][0] != "DUB" and lang == "DUB"):
            best_by_ep[key] = (lang, u)

    entries: list[dict[str, str]] = []
    for (sea_n, ep_n) in sorted(best_by_ep.keys()):
        lang, u = best_by_ep[(sea_n, ep_n)]
        ep_tag = f"T{sea_n:02d}E{ep_n:02d}"
        entries.append(
            {
                "name": f"{title} — {ep_tag}",
                "url": u,
                "logo": "",
                "group": f"Temporada {sea_n}",
                "id": f"Série • {ep_tag} • {lang}",
            }
        )
    write_atomic(out_path, format_m3u_entries(entries))
    return len(entries) > 0


def cmd_user_add_url(url: str, name: str = "") -> bool:
    url = url.strip()
    if not is_safe_url(url):
        sys.stderr.write("Invalid or unsafe URL\n")
        return False
    USER_DIR.mkdir(parents=True, exist_ok=True)
    existing = load_user_playlists_meta()
    for _, existing_url in existing:
        if existing_url == url:
            return True
    parsed = urllib.parse.urlparse(url)
    label = sanitize_title(name) if name else (parsed.hostname or "Lista IPTV")
    existing.append((label, url))
    lines = [f"{lbl}\t{u}" for lbl, u in existing]
    write_atomic(USER_PLAYLISTS_FILE, "\n".join(lines) + "\n")
    return True


def main() -> int:
    args = [a for a in sys.argv[1:] if a != "--refresh"]
    refresh = "--refresh" in sys.argv[1:]
    if not args:
        sys.stderr.write(
            "Usage:\n"
            "  iptv_fetch.py categories <canais|filmes|series|usuario> <out_tsv> [--refresh]\n"
            "  iptv_fetch.py list <canais|filmes|series|usuario> <cat_id> <out_m3u8> [--refresh]\n"
            "  iptv_fetch.py episodes <letter> <shard> <title> <out_m3u8> [--refresh]\n"
            "  iptv_fetch.py user-add-url <url> [name]\n"
        )
        return 2

    cmd = args[0]
    try:
        if cmd == "categories" and len(args) == 3:
            return 0 if cmd_categories(args[1], Path(args[2]), refresh=refresh) else 1
        if cmd == "list" and len(args) == 4:
            return 0 if cmd_list(args[1], args[2], Path(args[3]), refresh=refresh) else 1
        if cmd == "episodes" and len(args) == 5:
            return 0 if cmd_episodes(args[1], args[2], args[3], Path(args[4]), refresh=refresh) else 1
        if cmd == "user-add-url" and len(args) in (2, 3):
            return 0 if cmd_user_add_url(args[1], args[2] if len(args) == 3 else "") else 1
        # Legacy backwards-compat: iptv_fetch.py canais <out>
        if cmd in ("canais", "usuario") and len(args) == 2:
            return 0 if cmd_list(cmd, "all", Path(args[1]), refresh=refresh) else 1
        return 2
    except Exception as exc:
        sys.stderr.write(f"iptv_fetch error ({cmd}): {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
