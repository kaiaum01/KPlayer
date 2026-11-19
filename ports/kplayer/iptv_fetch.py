#!/usr/bin/env python3
"""Fetch and normalize Saimo Canais and Filmes e séries lists into M3U8 for KPlayer R36S."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import os
import sys
import urllib.parse
import urllib.request

CANAIS_BASE = "https://canais-saimo.pages.dev/"
FILMES_BASE = "https://filmes-saimo.pages.dev/"
UA = "KPlayer-R36S/2.0.0"
MAX_ITEMS = 2048


def fetch_text(url: str, timeout: int = 12) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read(8 * 1024 * 1024)
    return data.decode("utf-8", errors="replace")


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
        if not any(ext in rest.lower() for ext in (".mp4", ".m3u8", ".mkv", ".ts", "?")):
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
    # Prefer HTTPS nixplay/direct MP4/HLS over HTTP mirrors
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


def letter_slug(letter: str) -> str:
    ch = letter.strip().upper()
    if len(ch) == 1 and "A" <= ch <= "Z":
        return ch
    return "%23"


def sanitize_attr(val: str) -> str:
    return val.replace('"', "'").replace("\r", " ").replace("\n", " ").strip()


def sanitize_title(val: str) -> str:
    return val.replace("\r", " ").replace("\n", " ").strip()


def fetch_canais(out_path: Path) -> bool:
    text = fetch_text(CANAIS_BASE + "canais.txt", timeout=15)
    if "#EXTINF" not in text:
        return False
    tmp = out_path.with_suffix(".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, out_path)
    return True


def fetch_filmes(out_path: Path) -> bool:
    indice_text = fetch_text(FILMES_BASE + "indice.txt", timeout=15)
    bases: dict[str, str] = {}
    for line in indice_text.splitlines():
        line = line.strip()
        if line.startswith("base:"):
            parts = line[5:].strip().split(None, 1)
            if len(parts) == 2:
                bases[parts[0].strip()] = parts[1].strip()

    destaques_text = fetch_text(FILMES_BASE + "destaques.txt", timeout=15)
    capa_base = "https://image.tmdb.org/t/p/w342"
    shelf = "Em alta"
    featured: list[dict[str, str]] = []
    movie_letters: set[str] = set()
    series_letters: set[str] = set()

    for raw in destaques_text.splitlines():
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
            kind = cols[0]
            title = cols[1].strip()
            letter = cols[2].strip().upper() or "#"
            year = cols[3].strip() if len(cols) >= 4 else ""
            poster = cols[4].strip() if len(cols) >= 5 else ""
            logo = (capa_base + poster) if poster.startswith("/") else poster
            featured.append(
                {
                    "kind": kind,
                    "title": title,
                    "letter": letter,
                    "year": year,
                    "logo": logo,
                    "group": shelf,
                }
            )
            if kind == "f":
                movie_letters.add(letter)
            else:
                series_letters.add(letter)

    # Fetch required movie & series index files concurrently
    movie_urls: dict[tuple[str, str], tuple[str, str]] = {}
    series_shards: dict[tuple[str, str], str] = {}
    extra_movies: list[tuple[str, str, str]] = []

    def load_movie_letter(ltr: str):
        slug = letter_slug(ltr)
        txt = fetch_text(f"{FILMES_BASE}filmes-{slug}.txt", timeout=15)
        found: dict[str, tuple[str, str]] = {}
        extras: list[tuple[str, str, str]] = []
        for raw in txt.splitlines():
            cols = raw.rstrip("\r\n").split("\t")
            if len(cols) < 2:
                continue
            t = cols[0].strip()
            u, lang = parse_movie_line_urls(cols[1:], bases)
            if u:
                found[t.lower()] = (u, lang)
                if len(extras) < 25:
                    extras.append((t, u, lang))
        return ("m", ltr, found, extras)

    def load_series_letter(ltr: str):
        slug = letter_slug(ltr)
        txt = fetch_text(f"{FILMES_BASE}series-{slug}.txt", timeout=15)
        found: dict[str, str] = {}
        for raw in txt.splitlines():
            cols = raw.rstrip("\r\n").split("\t")
            if len(cols) >= 3:
                found[cols[0].strip().lower()] = cols[2].strip()
        return ("s", ltr, found, None)

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(load_movie_letter, ltr) for ltr in sorted(movie_letters)]
        futs += [ex.submit(load_series_letter, ltr) for ltr in sorted(series_letters)]
        for fut in as_completed(futs):
            try:
                kind, ltr, data, extras = fut.result()
                if kind == "m":
                    for k, v in data.items():
                        movie_urls[(ltr, k)] = v
                    if extras:
                        extra_movies.extend(extras)
                else:
                    for k, v in data.items():
                        series_shards[(ltr, k)] = v
            except Exception:
                pass

    # Identify unique series shard files needed for featured series
    needed_shards: set[tuple[str, str]] = set()
    for item in featured:
        if item["kind"] == "s":
            shard = series_shards.get((item["letter"], item["title"].lower()))
            if shard is not None:
                needed_shards.add((item["letter"], shard))

    # Map (letter, lower_series_title) -> list of (season, ep, lang, url)
    series_episodes: dict[tuple[str, str], list[tuple[str, str, str, str]]] = {}

    def load_shard(ltr: str, shard: str):
        slug = letter_slug(ltr)
        txt = fetch_text(f"{FILMES_BASE}series-{slug}-{urllib.parse.quote(shard)}.txt", timeout=15)
        cur_title = ""
        parsed: dict[str, list[tuple[str, str, str, str]]] = {}
        for raw in txt.splitlines():
            if raw.startswith("@"):
                cur_title = raw[1:].strip().lower()
                if cur_title not in parsed:
                    parsed[cur_title] = []
                continue
            if not cur_title:
                continue
            cols = raw.rstrip("\r\n").split("\t")
            if len(cols) >= 4:
                sea, ep, lang, urls_raw = cols[0].strip(), cols[1].strip(), cols[2].strip().upper(), cols[3].strip()
                if sea == "0" and ep == "0":
                    continue
                u = pick_best_url(urls_raw.split(","), bases)
                if u:
                    eps = parsed[cur_title]
                    if len(eps) < 6:  # keep up to 6 episodes per featured series for R36S list clarity
                        eps.append((sea, ep, lang, u))
        return (ltr, parsed)

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(load_shard, ltr, sh) for ltr, sh in sorted(needed_shards)]
        for fut in as_completed(futs):
            try:
                ltr, parsed = fut.result()
                for k, eps in parsed.items():
                    series_episodes[(ltr, k)] = eps
            except Exception:
                pass

    lines = ["#EXTM3U"]
    seen_keys: set[str] = set()
    count = 0

    for item in featured:
        if count >= MAX_ITEMS:
            break
        key_l = item["title"].lower()
        if item["kind"] == "f":
            hit = movie_urls.get((item["letter"], key_l))
            if not hit:
                continue
            url, lang = hit
            dedup = f"f:{key_l}"
            if dedup in seen_keys:
                continue
            seen_keys.add(dedup)
            tvg_id = f"Filme • {item['year']} • {lang}" if item["year"] else f"Filme • {lang}"
            lines.append(
                f'#EXTINF:-1 tvg-id="{sanitize_attr(tvg_id)}" tvg-logo="{sanitize_attr(item["logo"])}" '
                f'group-title="{sanitize_attr(item["group"])}",{sanitize_title(item["title"])}'
            )
            lines.append(url)
            count += 1
        else:
            eps = series_episodes.get((item["letter"], key_l), [])
            if not eps:
                continue
            for sea, ep, lang, url in eps:
                if count >= MAX_ITEMS:
                    break
                ep_tag = f"T{sea}E{ep}"
                dedup = f"s:{key_l}:{ep_tag}"
                if dedup in seen_keys:
                    continue
                seen_keys.add(dedup)
                tvg_id = f"Série • {ep_tag} • {lang}"
                lines.append(
                    f'#EXTINF:-1 tvg-id="{sanitize_attr(tvg_id)}" tvg-logo="{sanitize_attr(item["logo"])}" '
                    f'group-title="{sanitize_attr(item["group"])}",{sanitize_title(item["title"])} ({ep_tag})'
                )
                lines.append(url)
                count += 1

    # Add additional catalog movies so the list is rich even if a shelf is sparse
    for title, url, lang in extra_movies:
        if count >= MAX_ITEMS:
            break
        dedup = f"f:{title.lower()}"
        if dedup in seen_keys:
            continue
        seen_keys.add(dedup)
        lines.append(
            f'#EXTINF:-1 tvg-id="{sanitize_attr("Filme • " + lang)}" tvg-logo="" '
            f'group-title="Catálogo de Filmes",{sanitize_title(title)}'
        )
        lines.append(url)
        count += 1

    if count == 0:
        return False

    tmp = out_path.with_suffix(".tmp")
    tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.replace(tmp, out_path)
    return True


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] not in ("canais", "filmes"):
        sys.stderr.write("Usage: iptv_fetch.py <canais|filmes> <output_m3u8>\n")
        return 2
    kind = sys.argv[1]
    out_path = Path(sys.argv[2])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        ok = fetch_canais(out_path) if kind == "canais" else fetch_filmes(out_path)
        return 0 if ok else 1
    except Exception as exc:
        sys.stderr.write(f"iptv_fetch error ({kind}): {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
