#!/usr/bin/env python3
"""Convert Golazo's documented JSON CLI into bounded display rows."""
import json
import os
import subprocess
import tempfile


def text(value):
    return " ".join(str(value or "").split())[:100]


def convert(payload):
    if not isinstance(payload, dict) or payload.get("status") != "ok" or not isinstance(payload.get("data"), list):
        raise ValueError("Resposta inválida")
    rows = []
    for match in payload["data"][:150]:
        if not isinstance(match, dict): continue
        home = match.get("home_team") or {}
        away = match.get("away_team") or {}
        league = match.get("league") or {}
        if not all(isinstance(x, dict) for x in (home, away, league)): continue
        a, b = match.get("home_score"), match.get("away_score")
        score = f"{a} - {b}" if type(a) is int and type(b) is int else "- : -"
        rows.append("\t".join(map(text, [league.get("name"), home.get("name"), score, away.get("name"), match.get("live_time") or match.get("status")])) + "\n")
    return "".join(rows)


def main():
    result = subprocess.run(["./golazo", "live", "--timeout", "15s"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=22, check=True)
    if len(result.stdout) > 2 * 1024 * 1024: raise ValueError("Resposta muito grande")
    rows = convert(json.loads(result.stdout))
    fd, temp = tempfile.mkstemp(prefix=".football-", dir=".")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as file: file.write(rows)
        os.replace(temp, ".football-cache.tsv")
    finally:
        if os.path.exists(temp): os.unlink(temp)


if __name__ == "__main__": main()
