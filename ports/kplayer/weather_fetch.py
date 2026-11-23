#!/usr/bin/env python3
"""Open-Meteo weather & location helper for KPlayer R36S (v2.0.8).

Uses only Python standard library (zero external dependencies) so it works
directly on dArkOS / Debian 13 ARM64.

CLI subcommands:
  weather_fetch.py ip <out_tsv>
  weather_fetch.py search <query> <out_tsv>
  weather_fetch.py forecast <lat> <lon> <name> <region> <country> <out_tsv> [--refresh]
"""
from datetime import datetime
from pathlib import Path
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

UA = "KPlayer-R36S-Weather/2.0.9"
CACHE_DIR = Path("iptv/.cache")
CACHE_TTL = 600  # 10 minutes

WMO_PT = {
    0: "Céu limpo",
    1: "Predom. limpo",
    2: "Parc. nublado",
    3: "Nublado",
    45: "Nevoeiro",
    48: "Nevoeiro gelado",
    51: "Garoa leve",
    53: "Garoa moderada",
    55: "Garoa forte",
    56: "Garoa gelada",
    57: "Garoa gelada",
    61: "Chuva leve",
    63: "Chuva moderada",
    65: "Chuva forte",
    66: "Chuva gelada",
    67: "Chuva gelada",
    71: "Neve leve",
    73: "Neve moderada",
    75: "Neve forte",
    77: "Granizo fino",
    80: "Pancadas leves",
    81: "Pancadas moder.",
    82: "Pancadas fortes",
    85: "Neve isolada",
    86: "Neve forte",
    95: "Tempestade",
    96: "Temp. c/ granizo",
    99: "Temp. forte",
}

WEEKDAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]


def clean_tsv(val: object) -> str:
    return str(val or "").replace("\t", " ").replace("\r", " ").replace("\n", " ").strip()


def write_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def http_get_json(url: str, timeout: int = 10, max_bytes: int = 512 * 1024) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "application/json",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read(max_bytes)
    data = json.loads(raw.decode("utf-8", errors="replace"))
    if not isinstance(data, dict):
        raise ValueError("Invalid JSON object")
    return data


def describe_wmo(code: int) -> str:
    return WMO_PT.get(code, "Tempo variável")


def day_label(iso_date: str, index: int) -> str:
    if index == 0:
        return "Hoje"
    if index == 1:
        return "Amanhã"
    try:
        dt = datetime.strptime(iso_date[:10], "%Y-%m-%d")
        return f"{WEEKDAYS_PT[dt.weekday()]} {dt.strftime('%d/%m')}"
    except Exception:
        return iso_date[:10]


def detect_ip_location() -> tuple[str, str, str, float, float]:
    # Primary: ipwho.is (HTTPS, no key)
    try:
        d = http_get_json("https://ipwho.is/", timeout=8)
        if d.get("success") is not False and isinstance(d.get("latitude"), (int, float)) and isinstance(d.get("longitude"), (int, float)):
            city = clean_tsv(d.get("city") or "")
            region = clean_tsv(d.get("region_code") or d.get("region") or "")
            country = clean_tsv(d.get("country") or d.get("country_code") or "")
            if city:
                return (city, region, country, float(d["latitude"]), float(d["longitude"]))
    except Exception:
        pass

    # Fallback: ip-api.com
    d = http_get_json("http://ip-api.com/json/?fields=status,city,region,country,lat,lon", timeout=8)
    if d.get("status") == "success" and isinstance(d.get("lat"), (int, float)) and isinstance(d.get("lon"), (int, float)):
        city = clean_tsv(d.get("city") or "Local")
        region = clean_tsv(d.get("region") or "")
        country = clean_tsv(d.get("country") or "")
        return (city, region, country, float(d["lat"]), float(d["lon"]))

    raise RuntimeError("Nao foi possivel detectar a localizacao por IP")


def fetch_forecast_tsv(
    lat: float,
    lon: float,
    name: str,
    region: str,
    country: str,
    refresh: bool = False,
) -> str:
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        raise ValueError("Coordenadas invalidas")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_key = f"weather_{lat:.2f}_{lon:.2f}.tsv".replace("-", "m")
    cache_path = CACHE_DIR / cache_key
    if not refresh and cache_path.is_file():
        try:
            if time.time() - cache_path.stat().st_mtime < CACHE_TTL and cache_path.stat().st_size > 0:
                return cache_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            pass

    params = urllib.parse.urlencode(
        {
            "latitude": f"{lat:.4f}",
            "longitude": f"{lon:.4f}",
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,surface_pressure",
            "hourly": "temperature_2m,weather_code,precipitation_probability,is_day",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max",
            "timezone": "auto",
            "forecast_days": "7",
        }
    )
    url = f"https://api.open-meteo.com/v1/forecast?{params}"
    data = http_get_json(url, timeout=12)

    cur = data.get("current") or {}
    hourly = data.get("hourly") or {}
    daily = data.get("daily") or {}

    temp = float(cur.get("temperature_2m") or 0.0)
    feels = float(cur.get("apparent_temperature") or temp)
    hum = int(round(float(cur.get("relative_humidity_2m") or 0)))
    wind = float(cur.get("wind_speed_10m") or 0.0)
    pres = int(round(float(cur.get("surface_pressure") or 1013)))
    wcode = int(cur.get("weather_code") or 0)
    is_day = 1 if int(cur.get("is_day") or 1) == 1 else 0
    desc = describe_wmo(wcode)

    d_times = daily.get("time") or []
    d_max = daily.get("temperature_2m_max") or []
    d_min = daily.get("temperature_2m_min") or []
    d_code = daily.get("weather_code") or []
    d_prob = daily.get("precipitation_probability_max") or []
    d_uv = daily.get("uv_index_max") or []
    d_sr = daily.get("sunrise") or []
    d_ss = daily.get("sunset") or []

    tmax_today = float(d_max[0]) if d_max else temp
    tmin_today = float(d_min[0]) if d_min else temp
    uv_today = float(d_uv[0]) if d_uv else 0.0
    sunrise = str(d_sr[0])[11:16] if d_sr and len(str(d_sr[0])) >= 16 else "--:--"
    sunset = str(d_ss[0])[11:16] if d_ss and len(str(d_ss[0])) >= 16 else "--:--"

    lines = [
        "\t".join(
            [
                "LOC",
                clean_tsv(name or "Local"),
                clean_tsv(region),
                clean_tsv(country),
                f"{lat:.4f}",
                f"{lon:.4f}",
            ]
        ),
        "\t".join(
            [
                "CUR",
                f"{temp:.1f}",
                f"{feels:.1f}",
                str(hum),
                f"{wind:.1f}",
                str(pres),
                f"{uv_today:.1f}",
                str(wcode),
                str(is_day),
                clean_tsv(desc),
                f"{tmin_today:.1f}",
                f"{tmax_today:.1f}",
                sunrise,
                sunset,
            ]
        ),
    ]

    # Pick next 6 hourly slots starting from current hour
    h_times = hourly.get("time") or []
    h_temps = hourly.get("temperature_2m") or []
    h_codes = hourly.get("weather_code") or []
    h_probs = hourly.get("precipitation_probability") or []
    cur_time = str(cur.get("time") or "")[:13]
    start_idx = 0
    if cur_time:
        for idx, t_str in enumerate(h_times):
            if str(t_str)[:13] >= cur_time:
                start_idx = idx
                break
    for i in range(start_idx, min(len(h_times), start_idx + 6)):
        hh = str(h_times[i])[11:16] if len(str(h_times[i])) >= 16 else "--:--"
        ht = float(h_temps[i]) if i < len(h_temps) and h_temps[i] is not None else temp
        hc = int(h_codes[i]) if i < len(h_codes) and h_codes[i] is not None else wcode
        hp = int(round(float(h_probs[i]))) if i < len(h_probs) and h_probs[i] is not None else 0
        lines.append("\t".join(["HR", hh, f"{ht:.0f}", str(hc), str(hp)]))

    for i in range(min(len(d_times), 5)):
        dl = day_label(str(d_times[i]), i)
        dc = int(d_code[i]) if i < len(d_code) and d_code[i] is not None else 0
        dmn = float(d_min[i]) if i < len(d_min) and d_min[i] is not None else tmin_today
        dmx = float(d_max[i]) if i < len(d_max) and d_max[i] is not None else tmax_today
        dp = int(round(float(d_prob[i]))) if i < len(d_prob) and d_prob[i] is not None else 0
        lines.append(
            "\t".join(["DAY", clean_tsv(dl), clean_tsv(describe_wmo(dc)), f"{dmn:.0f}", f"{dmx:.0f}", str(dp)])
        )

    tsv = "\n".join(lines) + "\n"
    try:
        write_atomic(cache_path, tsv)
    except OSError:
        pass
    return tsv


def cmd_ip(out_path: Path, refresh: bool = False) -> bool:
    city, region, country, lat, lon = detect_ip_location()
    tsv = fetch_forecast_tsv(lat, lon, city, region, country, refresh=refresh)
    write_atomic(out_path, tsv)
    return True


def cmd_search(query: str, out_path: Path) -> bool:
    q = re.sub(r"\s+", " ", query or "").strip()[:80]
    if len(q) < 2:
        write_atomic(out_path, "")
        return False
    params = urllib.parse.urlencode(
        {"name": q, "count": "8", "language": "pt", "format": "json"}
    )
    url = f"https://geocoding-api.open-meteo.com/v1/search?{params}"
    data = http_get_json(url, timeout=10)
    results = data.get("results") or []
    lines: list[str] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        name = clean_tsv(item.get("name"))
        region = clean_tsv(item.get("admin1") or "")
        country = clean_tsv(item.get("country") or item.get("country_code") or "")
        lat = item.get("latitude")
        lon = item.get("longitude")
        if name and isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            lines.append("\t".join([name, region, country, f"{float(lat):.4f}", f"{float(lon):.4f}"]))
    write_atomic(out_path, ("\n".join(lines) + "\n") if lines else "")
    return len(lines) > 0


def cmd_forecast(
    lat_s: str, lon_s: str, name: str, region: str, country: str, out_path: Path, refresh: bool
) -> bool:
    lat = float(lat_s)
    lon = float(lon_s)
    tsv = fetch_forecast_tsv(lat, lon, name, region, country, refresh=refresh)
    write_atomic(out_path, tsv)
    return True


def main() -> int:
    if len(sys.argv) < 3:
        print("Uso: weather_fetch.py [ip|search|forecast] ...", file=sys.stderr)
        return 2
    cmd = sys.argv[1]
    refresh = "--refresh" in sys.argv
    args = [a for a in sys.argv[2:] if a != "--refresh"]
    try:
        if cmd == "ip" and len(args) >= 1:
            return 0 if cmd_ip(Path(args[0]), refresh=refresh) else 1
        if cmd == "search" and len(args) >= 2:
            return 0 if cmd_search(args[0], Path(args[1])) else 1
        if cmd == "forecast" and len(args) >= 6:
            return 0 if cmd_forecast(args[0], args[1], args[2], args[3], args[4], Path(args[5]), refresh) else 1
        print("Argumentos invalidos", file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"Erro clima: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
