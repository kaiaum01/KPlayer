#!/usr/bin/env python3
"""Fetch and normalize Saimo Canais and Filmes e séries lists into M3U8 for KPlayer R36S."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import os
import re
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


def norm_title(val: str) -> str:
    """Título normalizado (sem ano final) para casar destaque com catálogo."""
    return re.sub(r"\s*\(\d{4}\)\s*$", "", val.strip().lower())


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
    letters: list[str] = []
    for line in indice_text.splitlines():
        line = line.strip()
        if line.startswith("base:"):
            parts = line[5:].strip().split(None, 1)
            if len(parts) == 2:
                bases[parts[0].strip()] = parts[1].strip()
            continue
        cols = line.split("\t")
        if len(cols) == 4 and len(cols[0].strip()) == 1 and cols[1].strip().isdigit():
            letters.append(cols[0].strip())

    destaques_text = fetch_text(FILMES_BASE + "destaques.txt", timeout=15)
    capa_base = "https://image.tmdb.org/t/p/w342"
    shelf = "Em alta"
    featured: list[dict[str, str]] = []

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

    # Fallback if the letter index could not be parsed.
    if not letters:
        letters = sorted({item["letter"] for item in featured})

    # Full movie catalog (every letter), keeping the whole ordered list.
    movie_urls: dict[tuple[str, str], tuple[str, str]] = {}
    movie_urls_norm: dict[tuple[str, str], tuple[str, str]] = {}
    movie_catalog: list[tuple[str, str, str]] = []  # (title, url, lang)

    def load_movie_letter(ltr: str):
        slug = letter_slug(ltr)
        txt = fetch_text(f"{FILMES_BASE}filmes-{slug}.txt", timeout=15)
        found: dict[str, tuple[str, str]] = {}
        order: list[str] = []
        for raw in txt.splitlines():
            cols = raw.rstrip("\r\n").split("\t")
            if len(cols) < 2:
                continue
            t = cols[0].strip()
            u, lang = parse_movie_line_urls(cols[1:], bases)
            if u and t.lower() not in found:
                found[t.lower()] = (u, lang)
                order.append(t)
        return ("m", ltr, found, order)

    # Full series catalog (every letter): title -> shard id.
    series_shards: dict[tuple[str, str], str] = {}
    series_order: list[tuple[str, str]] = []  # (letter, title)

    def load_series_letter(ltr: str):
        slug = letter_slug(ltr)
        txt = fetch_text(f"{FILMES_BASE}series-{slug}.txt", timeout=15)
        found: dict[str, str] = {}
        order: list[str] = []
        for raw in txt.splitlines():
            cols = raw.rstrip("\r\n").split("\t")
            if len(cols) >= 3:
                t = cols[0].strip()
                if t.lower() not in found:
                    found[t.lower()] = cols[2].strip()
                    order.append(t)
        return ("s", ltr, found, order)

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(load_movie_letter, ltr) for ltr in letters]
        futs += [ex.submit(load_series_letter, ltr) for ltr in letters]
        for fut in as_completed(futs):
            try:
                kind, ltr, data, order = fut.result()
                if kind == "m":
                    for k, v in data.items():
                        movie_urls[(ltr, k)] = v
                    for t in order:
                        movie_catalog.append((t, *data[t.lower()]))
                        movie_urls_norm.setdefault((ltr, norm_title(t)), data[t.lower()])
                else:
                    for k, v in data.items():
                        series_shards[(ltr, k)] = v
                    for t in order:
                        series_order.append((ltr, t))
            except Exception:
                pass

    movie_catalog.sort(key=lambda x: x[0].lower())
    series_order.sort(key=lambda x: x[1].lower())

    # Fetch every series shard needed by the full catalog.
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
                    if len(eps) < 6:  # up to 6 episodes per series for a manageable list
                        eps.append((sea, ep, lang, u))
        return (ltr, parsed)

    needed_shards = sorted(
        {(ltr, series_shards[(ltr, t.lower())]) for (ltr, t) in series_order
         if (ltr, t.lower()) in series_shards}
    )
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(load_shard, ltr, sh) for ltr, sh in needed_shards]
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

    # 1) Featured items keep their shelf categories and posters.
    for item in featured:
        if count >= MAX_ITEMS:
            break
        key_l = item["title"].lower()
        if item["kind"] == "f":
            hit = movie_urls.get((item["letter"], key_l))
            if not hit:
                hit = movie_urls_norm.get((item["letter"], norm_title(item["title"])))
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
            for sea, ep, lang, url in eps:
                if count >= MAX_ITEMS:
                    break
                ep_tag = f"T{sea}E{ep}"
                dedup = f"s:{key_l}:{ep_tag}"
                if dedup in seen_keys:
                    continue
                seen_keys.add(dedup)
                seen_keys.add(f"s:{key_l}")
                tvg_id = f"Série • {ep_tag} • {lang}"
                lines.append(
                    f'#EXTINF:-1 tvg-id="{sanitize_attr(tvg_id)}" tvg-logo="{sanitize_attr(item["logo"])}" '
                    f'group-title="{sanitize_attr(item["group"])}",{sanitize_title(item["title"])} ({ep_tag})'
                )
                lines.append(url)
                count += 1

    # 2) Full movie catalog under the "Filmes" category.
    movie_cap = 1000
    for title, url, lang in movie_catalog:
        if count >= MAX_ITEMS or movie_cap <= 0:
            break
        dedup = f"f:{title.lower()}"
        if dedup in seen_keys:
            continue
        seen_keys.add(dedup)
        lines.append(
            f'#EXTINF:-1 tvg-id="{sanitize_attr("Filme • " + lang)}" tvg-logo="" '
            f'group-title="Filmes",{sanitize_title(title)}'
        )
        lines.append(url)
        count += 1
        movie_cap -= 1

    # 3) Full series catalog under the "Séries" category (first episode each).
    series_cap = 1000
    for ltr, title in series_order:
        if count >= MAX_ITEMS or series_cap <= 0:
            break
        key_l = title.lower()
        if f"s:{key_l}" in seen_keys:
            continue
        eps = series_episodes.get((ltr, key_l), [])
        if not eps:
            continue
        sea, ep, lang, url = eps[0]
        seen_keys.add(f"s:{key_l}")
        ep_tag = f"T{sea}E{ep}"
        lines.append(
            f'#EXTINF:-1 tvg-id="{sanitize_attr("Série • " + ep_tag + " • " + lang)}" tvg-logo="" '
            f'group-title="Séries",{sanitize_title(title)} ({ep_tag})'
        )
        lines.append(url)
        count += 1
        series_cap -= 1

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
