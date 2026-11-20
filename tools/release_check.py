#!/usr/bin/env python3
"""Experimental release inspection; does not download or install updates."""
import json
import re
import sys
import urllib.error
import urllib.request

API = "https://api.github.com/repos/kaiaum01/KPLAYER-v1.0.0/releases/latest"
CURRENT = (1, 0, 0)
PATTERN = re.compile(r"^KPlayer-v(\d+)\.(\d+)\.(\d+)-R36S\.zip$")


def inspect_release(release):
    if release.get("draft") or release.get("prerelease"):
        raise ValueError("A release não é uma versão final publicada.")
    tag = release.get("tag_name", "")
    match = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)", tag)
    if not match:
        raise ValueError("A tag da release não usa o formato v1.2.3.")
    version = tuple(map(int, match.groups()))
    assets = release.get("assets", [])
    if not isinstance(assets, list):
        raise ValueError("Lista de arquivos da release inválida.")
    matches = [a for a in assets if isinstance(a, dict) and
               a.get("name") == f"KPlayer-{tag}-R36S.zip" and
               PATTERN.fullmatch(a["name"])]
    if len(matches) != 1:
        raise ValueError("A release precisa conter exatamente um ZIP R36S com o nome esperado.")
    asset = matches[0]
    url = asset.get("browser_download_url", "")
    prefix = "https://github.com/kaiaum01/KPLAYER-v1.0.0/releases/download/"
    if not isinstance(url, str) or not url.startswith(prefix):
        raise ValueError("Endereço de download fora do repositório esperado.")
    return {"tag": tag, "newer": version > CURRENT, "asset": asset["name"], "url": url}


def main():
    request = urllib.request.Request(API, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "KPlayer/1.0.0",
    })
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = response.read(1024 * 1024 + 1)
        if len(payload) > 1024 * 1024:
            raise ValueError("Resposta do GitHub muito grande.")
        result = inspect_release(json.loads(payload))
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        print("Não foi possível verificar a atualização:", exc, file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
