#!/usr/bin/env python3
"""S3 (PREREGISTRATION.md): download USNO's published values.

Usage: python3 usno_fetch.py OUT_DIR

Writes OUT_DIR/usno-rstt.json (Sun and Moon rise, set and upper transit for
the S3 sites and dates, tz=0). The download is not committed; the
comparison's statistics are. On feature-sky this script also downloaded
USNO's equinoxes and solstices for the Chinese entry's C3 gate; that entry is
held back from 0.1.1-rc.16, and its part is left out here.
"""
import json
import os
import sys
import time
import urllib.request

OUT = sys.argv[1]
SITES = [(0.0, 0.0), (38.89, -77.03), (51.48, 0.0), (35.68, 139.69), (-33.87, 151.21), (64.84, -147.72),
         (22.30, 114.17), (55.75, 37.62), (-34.60, -58.38), (19.43, -99.13)]
DATES = ["1900-06-21", "1950-03-20", "1975-12-21", "2000-09-22", "2020-01-15", "2024-06-21", "2050-05-15", "2100-12-21"]


def get(url):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "zodiacs-engine-evidence"}), timeout=60) as response:
                return json.loads(response.read().decode())
        except Exception as error:  # noqa: BLE001 - retried, then reported
            last = error
            time.sleep(2 + 3 * attempt)
    raise SystemExit(f"{url}: {last}")


rstt = []
for lat, lon in SITES:
    for date in DATES:
        url = f"https://aa.usno.navy.mil/api/rstt/oneday?date={date}&coords={lat:.2f},{lon:.2f}&tz=0"
        data = get(url)["properties"]["data"]
        rstt.append({"url": url, "lat": lat, "lon": lon, "date": date, "sundata": data.get("sundata", []),
                     "moondata": data.get("moondata", []), "apiversion": None})
        time.sleep(1)
json.dump(rstt, open(os.path.join(OUT, "usno-rstt.json"), "w"), indent=1)
print(len(rstt), "rstt days")
