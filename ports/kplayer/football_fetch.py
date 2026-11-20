#!/usr/bin/env python3
"""Placar da Bola data fetcher (SofaScore-style stats, events & lineups).

Supports:
  python3 ./football_fetch.py                      -> updates .football-cache.tsv
  python3 ./football_fetch.py detail <league> <id> -> updates .football-detail.tsv
"""
from concurrent.futures import ThreadPoolExecutor
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

LEAGUES = [
    ("bra.1", "Brasileirão Série A", "BR"),
    ("bra.2", "Brasileirão Série B", "BR"),
    ("bra.copa_do_brasil", "Copa do Brasil", "BR"),
    ("conmebol.libertadores", "Libertadores", "BR"),
    ("conmebol.sudamericana", "Sul-Americana", "BR"),
    ("eng.1", "Premier League", "EU"),
    ("esp.1", "La Liga", "EU"),
    ("ita.1", "Serie A", "EU"),
    ("ger.1", "Bundesliga", "EU"),
    ("uefa.champions", "Champions League", "EU"),
]

STAT_MAP = [
    ("possessionPct", "Posse de bola", True),
    ("totalShots", "Finalizações", False),
    ("shotsOnTarget", "Chutes no gol", False),
    ("wonCorners", "Escanteios", False),
    ("foulsCommitted", "Faltas", False),
    ("yellowCards", "Cartões amarelos", False),
    ("redCards", "Cartões vermelhos", False),
    ("saves", "Defesas", False),
    ("offsides", "Impedimentos", False),
    ("accuratePasses", "Passes certos", False),
]

UA = {"User-Agent": "KPlayer-R36S/1.0.4"}


def text(value, limit=100):
    return " ".join(str(value or "").replace("\t", " ").replace("\r", " ").replace("\n", " ").split())[:limit]


def fetch_json(url, timeout=8):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read(2 * 1024 * 1024)
    return json.loads(data.decode("utf-8", "replace"))


def atomic_write(path, content):
    fd, temp = tempfile.mkstemp(prefix=".football-", dir=".")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def convert(payload):
    """Legacy Golazo JSON converter preserved for compatibility and tests."""
    if not isinstance(payload, dict) or payload.get("status") != "ok" or not isinstance(payload.get("data"), list):
        raise ValueError("Resposta inválida")
    rows = []
    for match in payload["data"][:150]:
        if not isinstance(match, dict):
            continue
        home = match.get("home_team") or {}
        away = match.get("away_team") or {}
        league = match.get("league") or {}
        if not all(isinstance(x, dict) for x in (home, away, league)):
            continue
        a, b = match.get("home_score"), match.get("away_score")
        score = f"{a} - {b}" if type(a) is int and type(b) is int else "- : -"
        rows.append(
            "\t".join(
                map(
                    text,
                    [
                        league.get("name"),
                        home.get("name"),
                        score,
                        away.get("name"),
                        match.get("live_time") or match.get("status"),
                    ],
                )
            )
            + "\n"
        )
    return "".join(rows)


def stat_val(stats_list, key):
    for item in stats_list or []:
        if item.get("name") == key:
            return str(item.get("displayValue") or "")
    return ""


def fetch_league(item):
    code, label, region = item
    url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{code}/scoreboard"
    try:
        payload = fetch_json(url, timeout=7)
    except Exception:
        return []
    league_name = text((payload.get("leagues") or [{}])[0].get("name") or label, 80)
    rows = []
    for ev in (payload.get("events") or [])[:18]:
        comp = (ev.get("competitions") or [None])[0]
        if not isinstance(comp, dict):
            continue
        comps = comp.get("competitors") or []
        home = next((c for c in comps if c.get("homeAway") == "home"), None)
        away = next((c for c in comps if c.get("homeAway") == "away"), None)
        if not home or not away:
            continue
        st = (ev.get("status") or {}).get("type") or {}
        state = st.get("state") or "pre"
        if state == "pre":
            score = "- : -"
        else:
            score = f"{home.get('score', '0')} - {away.get('score', '0')}"
        status = st.get("shortDetail") or st.get("description") or ("AO VIVO" if state == "in" else "Agendado")
        if status == "FT":
            status = "FIM"
        elif status == "HT":
            status = "INT"
        elif status == "Scheduled":
            status = "Agendado"
        venue = (comp.get("venue") or {}).get("fullName") or ""

        h_stats = home.get("statistics") or []
        a_stats = away.get("statistics") or []
        poss_h = stat_val(h_stats, "possessionPct")
        poss_a = stat_val(a_stats, "possessionPct")
        sot_h = stat_val(h_stats, "shotsOnTarget")
        sot_a = stat_val(a_stats, "shotsOnTarget")
        cor_h = stat_val(h_stats, "wonCorners")
        cor_a = stat_val(a_stats, "wonCorners")
        preview_parts = []
        if poss_h and poss_a:
            preview_parts.append(f"Posse {poss_h}% x {poss_a}%")
        if sot_h and sot_a:
            preview_parts.append(f"No gol {sot_h} x {sot_a}")
        if cor_h and cor_a:
            preview_parts.append(f"Escanteios {cor_h} x {cor_a}")

        goals = []
        for det in (comp.get("details") or [])[:8]:
            if det.get("scoringPlay"):
                clk = (det.get("clock") or {}).get("displayValue") or ""
                athletes = det.get("athletesInvolved") or []
                scorer = athletes[0].get("shortName") if athletes else ""
                if scorer:
                    goals.append(f"{clk} {scorer}".strip())
        if goals and not preview_parts:
            preview_parts.append("Gols: " + ", ".join(goals[:3]))
        elif goals:
            preview_parts.insert(0, "Gols: " + ", ".join(goals[:2]))

        preview = " • ".join(preview_parts) if preview_parts else "B para estatísticas, eventos e escalações"
        rows.append(
            (
                0 if state == "in" else 1 if state == "post" else 2,
                "\t".join(
                    [
                        text(league_name, 70),
                        text((home.get("team") or {}).get("shortDisplayName") or (home.get("team") or {}).get("displayName") or "Casa", 60),
                        text(score, 24),
                        text((away.get("team") or {}).get("shortDisplayName") or (away.get("team") or {}).get("displayName") or "Fora", 60),
                        text(status, 40),
                        text(venue, 60),
                        text(ev.get("id") or "", 24),
                        text(code, 32),
                        text(f"{state}|{region}", 16),
                        text(preview, 150),
                    ]
                )
                + "\n",
            )
        )
    return rows


def fetch_scoreboard():
    all_rows = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        for chunk in pool.map(fetch_league, LEAGUES):
            all_rows.extend(chunk)
    all_rows.sort(key=lambda x: x[0])
    if not all_rows and os.path.isfile("./golazo"):
        result = subprocess.run(
            ["./golazo", "live", "--timeout", "15s"],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=22,
            check=True,
        )
        if len(result.stdout) <= 2 * 1024 * 1024:
            atomic_write(".football-cache.tsv", convert(json.loads(result.stdout)))
            return
    atomic_write(".football-cache.tsv", "".join(r[1] for r in all_rows[:150]))


def fetch_detail(league_code, event_id):
    if not re.fullmatch(r"[a-z0-9._-]{2,40}", league_code) or not re.fullmatch(r"[0-9]{4,16}", event_id):
        raise ValueError("Parâmetros inválidos")
    url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{league_code}/summary?event={event_id}"
    data = fetch_json(url, timeout=9)

    gi = data.get("gameInfo") or {}
    venue = (gi.get("venue") or {}).get("fullName") or ""
    attendance = str(gi.get("attendance") or "")
    officials = gi.get("officials") or []
    referee = officials[0].get("displayName") if officials else ""

    header_comp = ((data.get("header") or {}).get("competitions") or [{}])[0]
    h_comp = next((c for c in header_comp.get("competitors") or [] if c.get("homeAway") == "home"), {})
    a_comp = next((c for c in header_comp.get("competitors") or [] if c.get("homeAway") == "away"), {})
    h_id = str((h_comp.get("team") or {}).get("id") or "")
    a_id = str((a_comp.get("team") or {}).get("id") or "")
    h_form = h_comp.get("form") or ""
    a_form = a_comp.get("form") or ""

    rosters = data.get("rosters") or []
    h_roster = next((r for r in rosters if r.get("homeAway") == "home"), rosters[0] if len(rosters) > 0 else {})
    a_roster = next((r for r in rosters if r.get("homeAway") == "away"), rosters[1] if len(rosters) > 1 else {})
    h_form_tact = h_roster.get("formation") or ""
    a_form_tact = a_roster.get("formation") or ""

    lines = [
        "\t".join(
            [
                "INFO",
                text(venue, 70),
                text(attendance, 20),
                text(referee, 60),
                text(h_form, 20),
                text(a_form, 20),
                text(h_form_tact, 20),
                text(a_form_tact, 20),
            ]
        )
    ]

    # Statistics
    bs_teams = (data.get("boxscore") or {}).get("teams") or []
    h_bs = next((t for t in bs_teams if str((t.get("team") or {}).get("id") or "") == h_id), bs_teams[0] if len(bs_teams) > 0 else {})
    a_bs = next((t for t in bs_teams if str((t.get("team") or {}).get("id") or "") == a_id), bs_teams[1] if len(bs_teams) > 1 else {})
    h_stats = h_bs.get("statistics") or []
    a_stats = a_bs.get("statistics") or []
    for key, label, is_pct in STAT_MAP:
        hv = stat_val(h_stats, key)
        av = stat_val(a_stats, key)
        if hv or av:
            if is_pct:
                hv = f"{hv}%" if hv and not hv.endswith("%") else hv
                av = f"{av}%" if av and not av.endswith("%") else av
            lines.append("\t".join(["STAT", label, text(hv or "0", 20), text(av or "0", 20)]))

    # Key events (goals, cards, subs)
    for ev in (data.get("keyEvents") or [])[:40]:
        ev_type = (ev.get("type") or {}).get("text") or ""
        low = ev_type.lower()
        if not any(k in low for k in ("goal", "card", "substit", "penalt", "own")):
            continue
        kind = "GOL" if "goal" in low or "penalt" in low else "CA" if "yellow" in low else "CV" if "red" in low else "SUB"
        clk = (ev.get("clock") or {}).get("displayValue") or "--"
        team_name = (ev.get("team") or {}).get("displayName") or ""
        desc = ev.get("shortText") or ev.get("text") or ev_type
        lines.append("\t".join(["EVENT", text(clk, 12), kind, text(team_name, 40), text(desc, 120)]))

    # Starting XI lineups
    for side, roster_obj in (("H", h_roster), ("A", a_roster)):
        starters = [p for p in (roster_obj.get("roster") or []) if p.get("starter")]
        if not starters:
            starters = (roster_obj.get("roster") or [])[:11]
        for p in starters[:11]:
            ath = p.get("athlete") or {}
            num = p.get("jersey") or ""
            name = ath.get("shortName") or ath.get("displayName") or ""
            pos = (p.get("position") or {}).get("abbreviation") or ""
            if name:
                lines.append("\t".join(["LINEUP", side, text(num, 8), text(name, 48), text(pos, 12)]))

    atomic_write(".football-detail.tsv", "\n".join(lines) + "\n")


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "detail":
        fetch_detail(sys.argv[2], sys.argv[3])
    else:
        fetch_scoreboard()


if __name__ == "__main__":
    main()
