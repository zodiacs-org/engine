#!/usr/bin/env python3
"""Print compact USNO source records; no engine imports or calculations.

Inspect remote changes before replacing the frozen usno-sky.json reference.
Raw network responses remain in memory, with their SHA-256 recorded.
"""

import hashlib
import json
import urllib.request


def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        raw = response.read()
    parsed = json.loads(raw)
    if parsed.get("error"):
        raise ValueError("USNO returned an error")
    return parsed, hashlib.sha256(raw).hexdigest()


altitudes = []
for date, time, latitude, longitude in [
    ("2024-06-21", "17:10:00", 38.89, -77.03),
    ("2000-09-22", "12:00:00", 51.48, 0.0),
    ("2020-01-15", "02:00:00", -33.87, 151.21),
    ("2024-06-21", "12:00:00", 78.2232, 15.6469),
]:
    url = (f"https://aa.usno.navy.mil/api/celnav?date={date}"
           f"&time={time}&coords={latitude},{longitude}")
    parsed, digest = fetch(url)
    row = next(item for item in parsed["properties"]["data"]
               if item["object"] == "Sun")
    if not row["altitude_corrections"]["isCorrected"]:
        raise ValueError("Expected a solar parallax correction")
    altitudes.append({
        "url": url,
        "responseSha256": digest,
        "apiVersion": parsed["apiversion"],
        "date": date,
        "timeUt1": time,
        "latitude": latitude,
        "longitude": longitude,
        "selectedFields": {
            "properties.data[object=Sun].almanac_data.hc": row["almanac_data"]["hc"],
            "properties.data[object=Sun].altitude_corrections.pa": row["altitude_corrections"]["pa"],
        },
    })

url = "https://aa.usno.navy.mil/api/moon/phases/date?date=2024-01-01&nump=4"
parsed, digest = fetch(url)
phases = {
    "url": url,
    "responseSha256": digest,
    "apiVersion": parsed["apiversion"],
    "phasedata": parsed["phasedata"],
}

polar = []
for date in ["2024-06-21", "2024-12-21"]:
    url = (f"https://aa.usno.navy.mil/api/rstt/oneday?date={date}"
           "&coords=78.2232,15.6469&tz=0")
    parsed, digest = fetch(url)
    polar.append({
        "url": url,
        "responseSha256": digest,
        "apiVersion": parsed["apiversion"],
        "date": date,
        "latitude": 78.2232,
        "longitude": 15.6469,
        "selectedFields": {
            "properties.data.sundata": parsed["properties"]["data"]["sundata"]
        },
    })

print(json.dumps({
    "source": "US Naval Observatory Astronomical Applications API",
    "retrieved": "2026-10-15",
    "rights": "US Government numerical predictions; see PREREGISTRATION.md",
    "altitudes": altitudes,
    "phases": phases,
    "polar": polar,
}, indent=2))
