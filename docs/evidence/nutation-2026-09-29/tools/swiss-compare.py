#!/usr/bin/env python3
"""Both engines beside Swiss Ephemeris, before and after the full IAU 2000B
nutation. Swiss is an instrument here: only statistics are printed, and no
Swiss value, per-case difference or fixture is written anywhere.

  SE_EPHE_PATH=/path/to/ephe python3 swiss-compare.py "$WORK/swiss-dump.json" > results/swiss.json

Needs pyswisseph 2.10.03 (no numpy) and sepl_18.se1 and semo_18.se1.
Percentiles are the value at index floor(p n) of the sorted absolute
differences, as in erfa-compare.py. Every Swiss call
uses FLG_SWIEPH, and its returned flags are checked; a call Swiss answers
from another ephemeris would be counted and left out (none was).

- positions, 1850-2049, at the engine's TT: swe.calc(jd_tt, body) for the Sun,
  the Moon, the planets and SE_TRUE_NODE (apparent ecliptic of date, which
  includes gravitational deflection the engine does not apply);
  SE_MEAN_NODE and SE_MEAN_APOG for the mean node and Black Moon Lilith; and
  swe.calc(jd_tt, ECL_NUT) for Swiss's own nutation in longitude and
  obliquity.
- mean points, 1800-2199, at the engine's TT: SE_MEAN_NODE and SE_MEAN_APOG;
- angles, 1800-2199, reading the instant as UT1 on both sides:
  swe.houses_ex2(jd_ut, lat, lon, 'O') for the ascendant and midheaven, split
  at 1850-01-01 and 2050-01-01, outside which Swiss uses its long-term
  sidereal time.
"""
import json
import os
import sys
from datetime import datetime

import swisseph as swe

swe.set_ephe_path(os.environ.get("SE_EPHE_PATH", ""))
FLAGS = swe.FLG_SWIEPH
BODIES = {"Sun": swe.SUN, "Moon": swe.MOON, "Mercury": swe.MERCURY, "Venus": swe.VENUS, "Mars": swe.MARS,
          "Jupiter": swe.JUPITER, "Saturn": swe.SATURN, "Uranus": swe.URANUS, "Neptune": swe.NEPTUNE,
          "Pluto": swe.PLUTO, "North Node": swe.TRUE_NODE}
ENGINES = ("rc15", "build")


def arcsec(a, b):
    return ((a - b + 180) % 360 - 180) * 3600


def stats(values):
    a = sorted(abs(v) for v in values)
    q = lambda p: a[min(len(a) - 1, int(p * len(a)))]
    sig = lambda x: float(f"{x:.4g}")
    return {"n": len(a), "p50": sig(q(0.5)), "p95": sig(q(0.95)), "max": sig(a[-1])}


def calc(jd, body):
    values, returned = swe.calc(jd, body, FLAGS)
    if body >= 0 and not returned & swe.FLG_SWIEPH:
        raise RuntimeError("Swiss answered from another ephemeris")
    return values


def main():
    data = json.load(open(sys.argv[1]))
    diffs = {}
    add = lambda key, value: diffs.setdefault(key, []).append(value)
    for index in range(len(data["positions"]["utc"])):
        jd = data["positions"]["rc15"][index]["jdTT"]
        swiss = {name: calc(jd, body)[0] for name, body in BODIES.items()}
        mean_node = calc(jd, swe.MEAN_NODE)[0]
        apogee = calc(jd, swe.MEAN_APOG)
        nut = swe.calc(jd, swe.ECL_NUT, 0)[0]
        for engine in ENGINES:
            row = data["positions"][engine][index]
            if abs(row["jdTT"] - jd) > 1e-9:
                raise RuntimeError("engines disagree on TT")
            for name in BODIES:
                add((engine, "positions", name), arcsec(row["bodies"][name], swiss[name]))
            add((engine, "positions", "Mean Node"), arcsec(row["meanNode"], mean_node))
            add((engine, "positions", "Black Moon Lilith"), arcsec(row["lilith"][0], apogee[0]))
            add((engine, "positions", "Black Moon Lilith latitude"), (row["lilith"][1] - apogee[1]) * 3600)
            add((engine, "nutation", "longitude"), row["dpsi"] - nut[2] * 3600)
            add((engine, "nutation", "obliquity"), row["deps"] - nut[3] * 3600)
    for index in range(len(data["meanPoints"]["utc"])):
        jd = data["meanPoints"]["rc15"][index][0]
        node = calc(jd, swe.MEAN_NODE)[0]
        apogee = calc(jd, swe.MEAN_APOG)
        for engine in ENGINES:
            jd_engine, mean_node, lon, lat = data["meanPoints"][engine][index]
            if abs(jd_engine - jd) > 1e-9:
                raise RuntimeError("engines disagree on TT")
            add((engine, "mean points 1800-2199", "Mean Node"), arcsec(mean_node, node))
            add((engine, "mean points 1800-2199", "Black Moon Lilith"), arcsec(lon, apogee[0]))
            add((engine, "mean points 1800-2199", "Black Moon Lilith latitude"), (lat - apogee[1]) * 3600)
    for index, case in enumerate(data["angles"]["cases"]):
        t = datetime.fromisoformat(case["utc"].replace("Z", "+00:00"))
        jd = swe.julday(t.year, t.month, t.day, t.hour + t.minute / 60 + (t.second + t.microsecond / 1e6) / 3600)
        _, ascmc, _, _ = swe.houses_ex2(jd, case["latitude"], case["longitude"], b"O", FLAGS)
        window = "1850-2049" if 1850 <= t.year < 2050 else "outside"
        for engine in ENGINES:
            asc, mc = data["angles"][engine][index]
            add((engine, "angles " + window, "ascendant"), arcsec(asc, ascmc[0]))
            add((engine, "angles " + window, "midheaven"), arcsec(mc, ascmc[1]))
    out = {
        "swisseph": swe.version,
        "unit": "arcseconds, |engine - Swiss|",
        "engines": {"rc15": "0.1.1-rc.15 as carried (astronomy-engine's five nutation terms)", "build": "this tree (IAU 2000B, 77 terms)"},
        "positionInstants": len(data["positions"]["utc"]),
        "angleCases": len(data["angles"]["cases"]),
        "meanPointInstants": len(data["meanPoints"]["utc"]),
        "results": {},
    }
    for (engine, group, key), values in diffs.items():
        out["results"].setdefault(group, {}).setdefault(key, {})[engine] = stats(values)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
