#!/usr/bin/env python3
"""Notícias Brasil fetcher for KPlayer R36S (NewsData.io + public RSS fallback).

Usage:
  python3 ./news_fetch.py [all|breaking|world|crime|entertainment|sports]

Reads NEWSDATA_API_KEY from the environment or from local ./news.cfg (`apikey=...`).
Downloads validated article thumbnails in parallel to ./.news-thumbs/ (JPEG/PNG/GIF/BMP)
for fast SDL2/stb_image rendering, preserves direct http(s) video URLs when available,
and writes bounded 9-column TSV rows atomically to ./.news-cache.tsv.
"""
import concurrent.futures
import email.utils
import hashlib
import html
import ipaddress
import json
import os
import re
import sys
import tempfile
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

UA = {"User-Agent": "KPlayer-R36S/2.1.5"}
ALLOWED_CATEGORIES = ("all", "breaking", "world", "crime", "entertainment", "sports")
DEFAULT_NEWSDATA_CATS = "world,breaking,crime,entertainment,sports"
CAT_LABELS = {
    "breaking": "Urgente",
    "world": "Mundo",
    "crime": "Polícia",
    "entertainment": "Entretenimento",
    "sports": "Esportes",
}
RSS_FEEDS = [
    ("breaking", "https://g1.globo.com/rss/g1/"),
    ("world", "https://g1.globo.com/rss/g1/mundo/"),
    ("crime", "https://g1.globo.com/rss/g1/brasil/"),
    ("entertainment", "https://g1.globo.com/rss/g1/pop-arte/"),
    ("sports", "https://ge.globo.com/rss/ge/"),
]
TAG_RE = re.compile(r"<[^>]+>")
IMG_TAG_RE = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', re.IGNORECASE)
VIDEO_TAG_RE = re.compile(r'<(?:video|source)[^>]+src=["\']([^"\']+)["\']', re.IGNORECASE)
VIDEO_EXT_RE = re.compile(r"\.(?:mp4|m3u8|webm|mov|ts)(?:[?#].*)?$", re.IGNORECASE)
THUMBS_DIR = ".news-thumbs"
MAX_THUMB_BYTES = 1536 * 1024  # 1.5 MB cap per image
MAX_THUMB_DOWNLOADS = 30
MAX_CACHED_THUMBS = 80


def clean_text(value, limit=300):
    raw = html.unescape(str(value or ""))
    raw = TAG_RE.sub(" ", raw)
    out = " ".join(raw.replace("\t", " ").replace("\r", " ").replace("\n", " ").split())
    return out[:limit]


def clean_content(content_val, summary_val):
    c = clean_text(content_val, 1300)
    if not c or "ONLY AVAILABLE IN PAID PLANS" in c.upper():
        return clean_text(summary_val, 1300)
    return c


def is_safe_http_url(url):
    s = str(url or "").strip()
    if not s or len(s) > 510 or any(ch in s for ch in ("\t", "\r", "\n", " ")):
        return False
    try:
        parsed = urllib.parse.urlparse(s)
    except Exception:
        return False
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    if parsed.username or parsed.password:
        return False
    host = parsed.hostname.lower().rstrip(".")
    if host in ("localhost", "localhost.localdomain") or host.endswith(".local") or host.endswith(".internal"):
        return False
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            return False
    except ValueError:
        pass
    return True


def detect_image_ext(data):
    if not data or len(data) < 12:
        return ""
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if data[:2] == b"BM":
        return ".bmp"
    return ""


def format_date_br(raw_date):
    s = str(raw_date or "").strip()
    if not s:
        return ""
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})", s)
    if m:
        return f"{m.group(3)}/{m.group(2)} {m.group(4)}:{m.group(5)}"
    try:
        dt = email.utils.parsedate_to_datetime(s)
        return dt.strftime("%d/%m %H:%M")
    except Exception:
        return clean_text(s, 20)


def read_api_key():
    env_key = (os.environ.get("NEWSDATA_API_KEY") or "").strip()
    if env_key:
        return env_key
    cfg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "news.cfg")
    for candidate in ("news.cfg", cfg_path):
        if os.path.isfile(candidate):
            try:
                with open(candidate, "r", encoding="utf-8") as fh:
                    for raw in fh:
                        line = raw.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" in line:
                            k, v = line.split("=", 1)
                            if k.strip().lower() in ("apikey", "api_key", "newsdata_api_key"):
                                val = v.strip().strip('"').strip("'")
                                if val:
                                    return val
            except OSError:
                pass
    return ""


def atomic_write(path, content):
    fd, temp = tempfile.mkstemp(prefix=".news-", dir=".")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def normalize_category(cats, fallback="breaking"):
    if isinstance(cats, str):
        cats = [cats]
    if isinstance(cats, list):
        for item in cats:
            low = str(item or "").strip().lower()
            if low in CAT_LABELS:
                return low
    return fallback if fallback in CAT_LABELS else "breaking"


def parse_newsdata_payload(payload, requested_cat="all"):
    if not isinstance(payload, dict) or payload.get("status") != "success":
        return []
    results = payload.get("results")
    if not isinstance(results, list):
        return []
    rows = []
    seen = set()
    for item in results[:60]:
        if not isinstance(item, dict):
            continue
        title = clean_text(item.get("title"), 210)
        if not title or title.lower() in seen:
            continue
        seen.add(title.lower())
        fallback_cat = requested_cat if requested_cat in CAT_LABELS else "breaking"
        cat = normalize_category(item.get("category"), fallback_cat)
        label = CAT_LABELS.get(cat, "Brasil")
        source = clean_text(item.get("source_name") or item.get("source_id") or "Brasil", 60)
        pub = format_date_br(item.get("pubDate"))
        summary = clean_text(item.get("description") or item.get("title"), 420)
        body = clean_content(item.get("content"), summary)
        raw_img = str(item.get("image_url") or "").strip()
        raw_vid = str(item.get("video_url") or "").strip()
        img_url = raw_img if is_safe_http_url(raw_img) else ""
        vid_url = raw_vid if is_safe_http_url(raw_vid) else ""
        rows.append((cat, label, title, source, pub, summary, body, img_url, vid_url))
    return rows


def extract_rss_media(item):
    img_url = ""
    vid_url = ""
    for elem in item.iter():
        tag = elem.tag.split("}", 1)[-1].lower()
        if tag in ("content", "thumbnail", "enclosure"):
            url = html.unescape(str(elem.attrib.get("url") or "").strip())
            if not is_safe_http_url(url):
                continue
            medium = str(elem.attrib.get("medium") or "").lower()
            mtype = str(elem.attrib.get("type") or "").lower()
            is_vid = medium == "video" or mtype.startswith("video/") or bool(VIDEO_EXT_RE.search(url))
            is_img = (
                tag == "thumbnail"
                or medium == "image"
                or mtype.startswith("image/")
                or (not is_vid and tag == "content")
            )
            if is_vid and not vid_url:
                vid_url = url
            elif is_img and not img_url:
                img_url = url
    raw_desc = str(item.findtext("description") or "")
    for elem in item:
        if elem.tag.split("}", 1)[-1].lower() == "encoded" and elem.text:
            raw_desc += " " + elem.text
    if not img_url:
        m_img = IMG_TAG_RE.search(raw_desc)
        if m_img:
            cand = html.unescape(m_img.group(1).strip())
            if is_safe_http_url(cand):
                img_url = cand
    if not vid_url:
        m_vid = VIDEO_TAG_RE.search(raw_desc)
        if m_vid:
            cand = html.unescape(m_vid.group(1).strip())
            if is_safe_http_url(cand):
                vid_url = cand
    return img_url, vid_url


def parse_rss_xml(xml_text, cat="breaking"):
    rows = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return rows
    label = CAT_LABELS.get(cat, "Brasil")
    for item in root.findall(".//item")[:14]:
        title = clean_text(item.findtext("title"), 210)
        if not title:
            continue
        desc = clean_text(item.findtext("description"), 420)
        pub = format_date_br(item.findtext("pubDate"))
        source = "GE Esportes" if cat == "sports" else "G1 Brasil"
        body = desc or title
        img_url, vid_url = extract_rss_media(item)
        rows.append((cat, label, title, source, pub, desc or title, body, img_url, vid_url))
    return rows


def fetch_url(url, timeout=9):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read(2 * 1024 * 1024).decode("utf-8", "replace")


def download_single_thumb(url, thumbs_dir=THUMBS_DIR):
    if not is_safe_http_url(url):
        return ""
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    for ext in (".jpg", ".png", ".gif", ".bmp"):
        existing = os.path.join(thumbs_dir, f"{digest}{ext}")
        if os.path.isfile(existing) and os.path.getsize(existing) > 32:
            return f"{THUMBS_DIR}/{digest}{ext}"
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": UA["User-Agent"],
                "Accept": "image/jpeg,image/png,image/gif,image/bmp,*/*;q=0.5",
            },
        )
        with urllib.request.urlopen(req, timeout=4.5) as resp:
            data = resp.read(MAX_THUMB_BYTES + 1)
        if not data or len(data) > MAX_THUMB_BYTES:
            return ""
        ext = detect_image_ext(data)
        if not ext:
            return ""
        os.makedirs(thumbs_dir, exist_ok=True)
        dest = os.path.join(thumbs_dir, f"{digest}{ext}")
        fd, tmp = tempfile.mkstemp(prefix=".img-", dir=thumbs_dir)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
            os.replace(tmp, dest)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
        return f"{THUMBS_DIR}/{digest}{ext}"
    except Exception:
        return ""


def prune_thumb_cache(thumbs_dir=THUMBS_DIR):
    try:
        if not os.path.isdir(thumbs_dir):
            return
        entries = []
        for name in os.listdir(thumbs_dir):
            full = os.path.join(thumbs_dir, name)
            if os.path.isfile(full):
                entries.append((os.path.getmtime(full), full))
        if len(entries) <= MAX_CACHED_THUMBS:
            return
        entries.sort()
        for _, full in entries[: len(entries) - MAX_CACHED_THUMBS]:
            try:
                os.unlink(full)
            except OSError:
                pass
    except OSError:
        pass


def attach_cached_thumbnails(rows, thumbs_dir=THUMBS_DIR):
    if not rows:
        return []
    os.makedirs(thumbs_dir, exist_ok=True)
    url_map = {}
    unique_urls = []
    for row in rows:
        u = row[7]
        if u and u not in url_map and len(unique_urls) < MAX_THUMB_DOWNLOADS:
            url_map[u] = ""
            unique_urls.append(u)
    if unique_urls:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(download_single_thumb, u, thumbs_dir): u for u in unique_urls}
            for fut in concurrent.futures.as_completed(futures):
                u = futures[fut]
                try:
                    url_map[u] = fut.result() or ""
                except Exception:
                    url_map[u] = ""
    prune_thumb_cache(thumbs_dir)
    out = []
    for row in rows:
        local_img = url_map.get(row[7], "")
        out.append((row[0], row[1], row[2], row[3], row[4], row[5], row[6], local_img, row[8]))
    return out


def fetch_newsdata(api_key, cat):
    cats_param = DEFAULT_NEWSDATA_CATS if cat == "all" else cat
    qs = urllib.parse.urlencode(
        {
            "apikey": api_key,
            "country": "br",
            "language": "pt",
            "category": cats_param,
        }
    )
    url = f"https://newsdata.io/api/1/latest?{qs}"
    payload = json.loads(fetch_url(url, timeout=10))
    return parse_newsdata_payload(payload, cat)


def fetch_rss_fallback(cat):
    feeds = RSS_FEEDS if cat == "all" else [f for f in RSS_FEEDS if f[0] == cat]
    rows = []
    seen = set()
    for feed_cat, url in feeds:
        try:
            xml_text = fetch_url(url, timeout=8)
            for row in parse_rss_xml(xml_text, feed_cat):
                key = row[2].lower()
                if key not in seen:
                    seen.add(key)
                    rows.append(row)
        except Exception:
            continue
    return rows[:60]


def rows_to_tsv(rows):
    return "".join("\t".join(r) + "\n" for r in rows[:60])


def main():
    cat = (sys.argv[1].strip().lower() if len(sys.argv) > 1 else "all")
    if cat not in ALLOWED_CATEGORIES:
        cat = "all"

    rows = []
    api_key = read_api_key()
    if api_key:
        try:
            rows = fetch_newsdata(api_key, cat)
        except Exception:
            rows = []
    if not rows:
        rows = fetch_rss_fallback(cat)
    if not rows:
        sys.exit(1)
    rows = attach_cached_thumbnails(rows)
    atomic_write(".news-cache.tsv", rows_to_tsv(rows))


if __name__ == "__main__":
    main()
