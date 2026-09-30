#!/usr/bin/env python3
"""The engine's Lahiri and Krishnamurti ayanamsas against the tables their definitions publish.

  python3 primary_tables.py [--entry dist/index.js]     (after npm run build; needs pyerfa)

Writes results/primary-tables.json. The engine runs through engine-bridge.mjs
with ΔT pinned to 0, so each instant below is read as TT. No Swiss Ephemeris
code or values are used; one set of tables is quoted from its documentation,
as stated.

Tables:

- Indian Astronomical Ephemeris (IAE), mean Lahiri ayanamsas from editions not
  available here, as transcribed in the Swiss Ephemeris documentation,
  appendix E: IAE 1989 p. 512 for 1989.0 and 1990.0 (read as January 1, 0h TT,
  as the appendix does), and IAE 2019 p. 429 for 2000, 2019 and 2020 (January 1,
  12h TT). Until 2020 the IAE carried its 1956 value with IAU 1976 precession;
  from 2021 it holds 23°51′25.53″ at J2000.0 and carries it with IAU 2006
  (IAE 2027, p. 382). The IAE 2027 values (p. 423) are checked by
  src/vedic/ayanamsa.test.ts.
- K. S. Krishnamurti, KP Reader 1, p. 58: the ayanamsa for each year
  1840-2000 to the minute, as transcribed by D. Senthilathiban, "Study of KP
  Ayanamsa with Modern Precession Theories" (2019), table 29, column 6. The
  table gives no date within the year; January 1 (0h TT) and April 15 (0h TT,
  the sidereal Aries ingress Senthilathiban assumes) are both compared, for
  the engine's reading of "1900" (1900-01-01 0h TT) and for J1900.0.

It also measures the engine's nutation in longitude, which its true
ayanamsas add, against IAU 2000B (ERFA nut00b) every 0.73 days over 1800-2200.
"""
import argparse
import json
import math
import subprocess
from pathlib import Path

import erfa

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
UNIX_JD = 2_440_587.5
MS_PER_DAY = 86_400_000


def dms(d, m, s=0.0):
    return d * 3600 + m * 60 + s


IAE_MEAN = [
    # label, JD TT, arcsec
    ("IAE 1989 p. 512, 1989.0", 2_447_527.5, dms(23, 42, 12.34)),
    ("IAE 1989 p. 512, 1990.0", 2_447_892.5, dms(23, 43, 2.62)),
    ("IAE 2019 p. 429, 2000 Jan 1 12h", 2_451_545.0, dms(23, 51, 25.53)),
    ("IAE 2019 p. 429, 2019 Jan 1 12h", 2_458_485.0, dms(24, 7, 21.20)),
    ("IAE 2019 p. 429, 2020 Jan 1 12h", 2_458_850.0, dms(24, 8, 11.46)),
]

# KP Reader 1, p. 58, 1840 to 2000: degrees and minutes, one entry a year.
KSK_TABLE = """
21:31 21:32 21:33 21:34 21:35 21:36 21:37 21:37 21:38 21:39 21:40 21:41 21:42 21:42 21:43 21:44 21:45 21:46 21:47 21:47
21:48 21:49 21:50 21:51 21:52 21:52 21:53 21:54 21:55 21:56 21:57 21:57 21:58 21:59 22:00 22:01 22:02 22:02 22:03 22:04
22:05 22:06 22:07 22:08 22:08 22:09 22:10 22:11 22:12 22:13 22:13 22:14 22:15 22:16 22:17 22:18 22:18 22:19 22:20 22:21
22:22 22:23 22:23 22:24 22:25 22:26 22:27 22:28 22:29 22:30 22:31 22:32 22:33 22:33 22:34 22:35 22:36 22:37 22:38 22:38
22:39 22:39 22:40 22:41 22:42 22:43 22:44 22:44 22:45 22:46 22:47 22:48 22:49 22:49 22:50 22:51 22:52 22:53 22:54 22:54
22:55 22:56 22:57 22:58 22:59 22:59 23:00 23:01 23:02 23:03 23:04 23:04 23:05 23:06 23:07 23:08 23:09 23:10 23:10 23:11
23:12 23:13 23:14 23:15 23:15 23:16 23:17 23:18 23:19 23:20 23:20 23:21 23:22 23:23 23:24 23:25 23:25 23:26 23:27 23:28
23:29 23:30 23:30 23:31 23:32 23:33 23:34 23:35 23:35 23:36 23:37 23:38 23:39 23:40 23:41 23:41 23:42 23:43 23:44 23:45
23:46
"""


def jd_of(year, month, day):
    """Gregorian calendar date, 0h, as a Julian date (Fliegel and Van Flandern)."""
    a = (14 - month) // 12
    y, m = year + 4800 - a, month + 12 * a - 3
    return day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045 - 0.5


def engine(definitions, jds, entry):
    request = {"kind": "ayanamsa", "definitions": definitions, "deltaT": 0,
               "instants": [round((jd - UNIX_JD) * MS_PER_DAY) for jd in jds]}
    done = subprocess.run(["node", str(HERE / "engine-bridge.mjs"), entry], input=json.dumps(request),
                          capture_output=True, text=True, check=True)
    return json.loads(done.stdout)["result"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--entry", default=str(ROOT / "dist/index.js"))
    parser.add_argument("--output", default=str(HERE.parent / "results/primary-tables.json"))
    args = parser.parse_args()

    rows = engine({"lahiri": "lahiri"}, [jd for _, jd, _ in IAE_MEAN], args.entry)["lahiri"]
    iae = [{"table": label, "jdTT": jd, "tableArcsec": value, "engineMinusTableArcsec": round(row[0] * 3600 - value, 3)}
           for (label, jd, value), row in zip(IAE_MEAN, rows)]

    table = [int(v[:2]) * 3600 + int(v[3:]) * 60 for v in KSK_TABLE.split()]
    years = list(range(1840, 1840 + len(table)))
    readings = {
        "krishnamurti": "krishnamurti",   # 22°21′50″ at 1900-01-01 0h TT, Newcomb, held at J2000.0
        "j1900": {"name": "kp-j1900", "epoch": {"julianDateTT": 2_415_020.0}, "value": 22.363889, "model": "newcomb"},
    }
    kp = {}
    for day_label, month, day in [("January 1", 1, 1), ("April 15", 4, 15)]:
        jds = [jd_of(y, month, day) for y in years]
        result = engine(readings, jds, args.entry)
        for reading, rows in result.items():
            if reading == "sun":
                continue
            seconds = [row[0] * 3600 for row in rows]
            differences = [s - t for s, t in zip(seconds, table)]
            rounded = [round(s / 60) * 60 for s in seconds]
            kp[f"{reading}, {day_label}"] = {
                "yearsMatchingToTheMinute": sum(r == t for r, t in zip(rounded, table)),
                "years": len(table),
                "maxAbsDifferenceArcsec": round(max(abs(d) for d in differences), 1),
                "meanDifferenceArcsec": round(sum(differences) / len(differences), 1),
            }
    grid = [2_378_496.5 + 0.73 * k for k in range(200_139)]
    rows = engine({"lahiri": "lahiri"}, grid, args.entry)["lahiri"]
    nutation = [row[2] * 3600 - erfa.nut00b(2_400_000.5, jd - 2_400_000.5)[0] / (math.pi / 648_000)
                for row, jd in zip(rows, grid)]
    report = {
        "tool": "docs/evidence/vedic-2026-09-28/tools/primary_tables.py",
        "lahiriAgainstIae": iae,
        "krishnamurtiAgainstReader1": kp,
        "engineNutationMinusIau2000B": {"n": len(grid), "maxAbsArcsec": round(max(abs(d) for d in nutation), 4)},
        "notes": ("IAE values before 2021 are quoted from the Swiss Ephemeris documentation, appendix E. "
                  "KP Reader 1's table is quoted from Senthilathiban (2019), table 29; it rounds to the minute."),
    }
    Path(args.output).write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
