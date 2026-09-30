#!/usr/bin/env python3
"""The ladder's cusps against Swiss's swe_houses_ex from the same UT1 instant,
for rc.15 and this build, as the Zodiacs site's rc.9 record compared them
(docs/platform/evidence/houses-2026-09-26/tools/compare-end-to-end.py and
worst-koch.py in zodiacs-org/site, commit 5df5567d): the largest of the
twelve cusps per case, for 1800-2199 and for 1850-2049 alone, where Swiss's
sidereal time is the IAU one, plus the years outside that window on their
own. Statistics only; no Swiss value is written.

  SE_EPHE_PATH=/path/to/ephe python3 ladder-compare.py "$WORK/ladder.json" > "$WORK/ladder-stats.json"

It also writes to stderr, for worst-koch.mjs, the ladder's worst Koch case
from 1850 to 2049 for each engine with Swiss's RAMC and true obliquity there,
as the site's worst-koch.py did; those inputs stay in the scratch directory.
Percentiles are the value at index floor(p n) of the sorted differences, as
the site's tool took them.
"""
import json
import os
import sys
from datetime import datetime

import swisseph as swe

swe.set_ephe_path(os.environ.get("SE_EPHE_PATH", ""))
CODES = {"whole": "W", "placidus": "P", "porphyry": "O", "equal": "E", "equal-mc": "D", "vehlow": "V", "koch": "K",
         "regiomontanus": "R", "campanus": "C", "topocentric": "T", "alcabitius": "B", "morinus": "M", "meridian": "X"}


def gap(a, b):
    return abs((a - b + 180) % 360 - 180) * 3600


def main():
    data = json.load(open(sys.argv[1]))
    stats = {}
    worst = {}
    for index, case in enumerate(data["cases"]):
        t = datetime.fromisoformat(case["utc"].replace("Z", "+00:00"))
        jd = swe.julday(t.year, t.month, t.day, t.hour + t.minute / 60 + (t.second + t.microsecond / 1e6) / 3600)
        inside = 1850 <= t.year < 2050
        windows = ["1800-2199", "1850-2049" if inside else "outside 1850-2049"]
        swiss_cache = {}
        for engine in ("rc15", "build"):
            for name, cusps in data[engine][index].items():
                if cusps is None:
                    continue
                if name not in swiss_cache:
                    swiss_cache[name] = swe.houses_ex(jd, case["lat"], case["lon"], CODES[name].encode())
                swiss, ascmc = swiss_cache[name]
                difference = max(gap(cusps[i], swiss[i]) for i in range(12))
                for window in windows:
                    stats.setdefault((engine, window, case["set"], name), []).append(difference)
                if name == "koch" and case["set"] == "ladder" and inside:
                    if engine not in worst or difference > worst[engine]["endToEndArcsec"]:
                        worst[engine] = {"utc": case["utc"], "latitude": case["lat"], "longitude": case["lon"],
                                         "endToEndArcsec": round(difference, 3), "swissRamc": ascmc[2],
                                         "swissTrueObliquity": swe.calc_ut(jd, swe.ECL_NUT)[0][0], "swissCusps": list(swiss)}
    out = {"swisseph": swe.version, "unit": "arcseconds, largest of the twelve cusps per case",
           "engines": {"rc15": "0.1.1-rc.15 as carried (astronomy-engine's five nutation terms)", "build": "this tree (IAU 2000B, 77 terms)"},
           "windows": {}}
    for (engine, window, name_set, name), e in sorted(stats.items()):
        e.sort()
        out["windows"].setdefault(window, {}).setdefault(name_set, {}).setdefault(name, {})[engine] = {
            "compared": len(e), "max": round(e[-1], 3), "p95": round(e[int(len(e) * 0.95)], 3),
            "p50": round(e[len(e) // 2], 3), "over3": sum(1 for x in e if x > 3)}
    print(json.dumps(out, indent=1))
    print(json.dumps(worst), file=sys.stderr)


if __name__ == "__main__":
    main()
