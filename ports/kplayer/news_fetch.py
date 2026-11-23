#!/usr/bin/env python3
"""Notícias Brasil fetcher for KPlayer R36S (NewsData.io + public RSS fallback).

Usage:
  python3 ./news_fetch.py [all|breaking|world|crime|entertainment|sports]

Reads NEWSDATA_API_KEY from the environment or from local ./news.cfg (`apikey=...`).
Writes bounded TSV rows atomically to ./.news-cache.tsv.
"""
import email.utils
import html
import json
import os
import re
import sys
import tempfile
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

UA = {"User-Agent": "KPlayer-R36S/2.1.0"}
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


def format_date_br(raw_date):
    s = str(raw_date or "").strip()
    if not s:
        return ""
    # NewsData.io format: "2026-11-23 14:25:00"
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})", s)
    if m:
        return f"{m.group(3)}/{m.group(2)} {m.group(4)}:{m.group(5)}"
    # RFC-2822 RSS format
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
        rows.append((cat, label, title, source, pub, summary, body))
    return rows


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
        rows.append((cat, label, title, source, pub, desc or title, body))
    return rows


def fetch_url(url, timeout=9):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read(2 * 1024 * 1024).decode("utf-8", "replace")


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
    atomic_write(".news-cache.tsv", rows_to_tsv(rows))


if __name__ == "__main__":
    main()
