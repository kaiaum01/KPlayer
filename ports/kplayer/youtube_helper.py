#!/usr/bin/env python3
"""Bounded, credential-free yt-dlp adapter for the KPlayer interface."""
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import re
import subprocess
import sys
import urllib.request
from urllib.parse import urlsplit

ID = re.compile(r"^[A-Za-z0-9_-]{11}$")

def fetch_thumbnail(video_id):
    if not ID.fullmatch(video_id):
        return
    try:
        folder = Path('.youtube-thumbnails')
        folder.mkdir(exist_ok=True)
        target = folder / (video_id + '.jpg')
        if target.is_file():
            return
        req = urllib.request.Request('https://i.ytimg.com/vi/' + video_id + '/mqdefault.jpg', headers={'User-Agent': 'KPlayer/1.0'})
        with urllib.request.urlopen(req, timeout=4) as response:
            data = response.read(512 * 1024 + 1)
        if data.startswith(b'\xff\xd8\xff') and len(data) <= 512 * 1024:
            target.write_bytes(data)
    except (OSError, ValueError):
        pass

def clean(value, limit=180):
    return " ".join(str(value or "").replace("\t", " ").split())[:limit]

def main(args):
    if len(args) != 2 or args[0] not in ("search", "play", "video", "audio"):
        return 1
    action, query = args
    base = ["./yt-dlp", "--ignore-config", "--no-cache-dir", "--no-warnings", "--socket-timeout", "12"]
    if action == "search":
        if not query.strip() or len(query) > 80:
            return 1
        cmd = base + ["--flat-playlist", "--dump-single-json", "ytsearch20:" + query]
    elif action == "play":
        if not ID.fullmatch(query):
            return 1
        cmd = base + ["--no-playlist", "-f", "best[height<=480][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]", "--get-url", "https://www.youtube.com/watch?v=" + query]
    else:
        if not ID.fullmatch(query):
            return 1
        try:
            Path("midias/Downloads").mkdir(parents=True, exist_ok=True)
        except OSError:
            return 1
        fmt = "bestaudio" if action == "audio" else "best[height<=480][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]"
        cmd = base + ["--no-playlist", "--no-overwrites", "--no-progress", "--quiet", "--restrict-filenames", "--max-filesize", "1G", "-f", fmt, "-o", "midias/Downloads/%(title).120B [%(id)s].%(ext)s", "https://www.youtube.com/watch?v=" + query]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3600 if action in ("audio", "video") else 60, check=True)
        if len(result.stdout) > 2_000_000:
            return 1
        output = result.stdout.decode("utf-8", "replace")
        if action == "play":
            url = output.strip()
            parts = urlsplit(url)
            if parts.scheme != "https" or not parts.hostname or "\n" in url or len(url) > 6000:
                return 1
            print("URL\t" + url)
        elif action == "search":
            data = json.loads(output)
            entries = (data.get("entries") or [])[:20]
            ids = [str(e.get('id', '')) for e in entries if isinstance(e, dict) and ID.fullmatch(str(e.get('id', '')))]
            with ThreadPoolExecutor(max_workers=5) as pool:
                list(pool.map(fetch_thumbnail, ids))
            for entry in entries:
                if not isinstance(entry, dict) or not ID.fullmatch(str(entry.get("id", ""))):
                    continue
                print("ITEM\t%s\t%s\t%s" % (entry["id"], clean(entry.get("title")), clean(entry.get("channel") or entry.get("uploader"))))
        else:
            print("SAVED")
        return 0
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or b'').decode('utf-8', 'replace')[-2000:]
        detail = re.sub(r'https?://[^\s]+', '[endereço removido]', detail)
        print('YouTube: falha em %s: %s' % (action, detail), file=sys.stderr)
        return 1
    except (OSError, subprocess.SubprocessError, ValueError, TypeError) as exc:
        print('YouTube: falha em %s (%s)' % (action, type(exc).__name__), file=sys.stderr)
        return 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
