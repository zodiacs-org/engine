#!/usr/bin/env python3
"""The Sun against the out-of-bounds limit at the 800 solstices of 1800-2199.

The solstice is the TT instant at which the Sun's apparent ecliptic longitude of
date, in the ERFA reference of apparent.py, is 90 or 270 degrees (bisection to
well under a second). At that instant the reference's excess |dec| - true
obliquity is +latitude in June and -latitude in December. DE440s gives the same
quantity for the 600 solstices of 1850-2149, its span. The engine is evaluated
at the same TT through engine-at-tt.mjs.

Only statistics and two examples are written.

usage: python sun-solstices.py <dist/index.js> <de440s.bsp> <out.json>
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import warnings

import erfa
import numpy as np

# erfa.epv00 warns outside 1900-2100; over 1850-2149 it stays within 0.008" of DE440s here.
warnings.filterwarnings("ignore", category=erfa.ErfaWarning)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from apparent import ARCSEC, DE440s, erfa_sun  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))


def solstices():
    years = np.repeat(np.arange(1800, 2200), 2)
    targets = np.tile(np.array([np.pi / 2, 3 * np.pi / 2]), 400)
    months = np.tile(np.array([6, 12]), 400)
    start = np.array([sum(erfa.cal2jd(int(y), int(m), 21)) for y, m in zip(years, months)])
    low, high = start - 5.0, start + 5.0

    def offset(jd):
        return np.mod(erfa_sun(jd)["lon"] - targets + np.pi, 2 * np.pi) - np.pi

    assert np.all(offset(low) < 0) and np.all(offset(high) > 0)
    for _ in range(40):  # 10 days / 2^40 is under a microsecond
        middle = (low + high) / 2
        below = offset(middle) < 0
        low, high = np.where(below, middle, low), np.where(below, high, middle)
    return years, months, (low + high) / 2


def engine_at(dist, jd_tt):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
        json.dump({"jd_tt": [float(value) for value in jd_tt]}, handle)
    try:
        output = subprocess.run(["node", os.path.join(HERE, "engine-at-tt.mjs"), dist, handle.name],
                                check=True, capture_output=True, text=True).stdout
    finally:
        os.unlink(handle.name)
    return json.loads(output)


def iso(jd):
    year, month, day, fraction = erfa.jd2cal(float(jd), 0.0)
    seconds = round(float(fraction) * 86400)
    return f"{year:04d}-{month:02d}-{day:02d}T{seconds // 3600:02d}:{seconds // 60 % 60:02d}:{seconds % 60:02d} TT"


def main():
    dist, kernel, out = sys.argv[1:4]
    years, months, jd = solstices()
    june = months == 6
    reference = erfa_sun(jd)
    erfa_excess = (np.abs(reference["dec"]) - reference["eps"]) * ARCSEC
    erfa_lat = reference["lat"] * ARCSEC
    assert np.max(np.abs(erfa_excess - np.where(june, erfa_lat, -erfa_lat))) < 1e-3

    inside = (years >= 1850) & (years <= 2149)
    de = DE440s(kernel).body("Sun", jd[inside])
    de_excess = (np.abs(de["dec"]) - de["eps"]) * ARCSEC

    engine = engine_at(dist, jd)
    sun = [next(row for row in instant["rows"] if row["body"] == "Sun") for instant in engine["instants"]]
    margin = np.array([row["margin"] for row in sun])
    engine_lat = np.array([row["lat"] for row in sun]) * 3600
    flags = sum(row["flag"] for row in sun)

    century = (years - 1800) // 100
    by_century = [{"years": f"{1800 + 100 * c}-{1899 + 100 * c}",
                   "engineLatitudeMeanArcsec": round(float(np.mean(engine_lat[century == c])), 3),
                   "erfaLatitudeMeanArcsec": round(float(np.mean(erfa_lat[century == c])), 3)} for c in range(4)]

    def example(year, month):
        index = int(np.flatnonzero((years == year) & (months == month))[0])
        entry = {"solstice": iso(jd[index]), "erfaExcessArcsec": round(float(erfa_excess[index]), 4),
                 "engineMarginArcsec": round(float(margin[index]), 4), "engineFlag": sun[index]["flag"]}
        if inside[index]:
            entry["de440sExcessArcsec"] = round(float(de_excess[np.flatnonzero(inside).tolist().index(index)]), 4)
        return entry

    with open(kernel, "rb") as handle:
        kernel_digest = hashlib.sha256(handle.read()).hexdigest()
    report = {
        "question": "Is the Sun beyond the out-of-bounds limit (|dec| > true obliquity) at the solstices, and does the engine agree?",
        "instrument": {"erfa": erfa.__version__, "numpy": np.__version__, "de440s": {"file": os.path.basename(kernel), "sha256": kernel_digest},
                       "engine": engine["version"], "scripts": ["apparent.py", "sun-solstices.py", "engine-at-tt.mjs"]},
        "erfa": {"solstices": int(jd.size), "years": "1800-2199", "beyond": int(np.sum(erfa_excess > 0)),
                 "maxExcessArcsec": round(float(np.max(erfa_excess)), 4), "minExcessArcsec": round(float(np.min(erfa_excess)), 4)},
        "de440s": {"solstices": int(np.sum(inside)), "years": "1850-2149", "beyond": int(np.sum(de_excess > 0)),
                   "maxExcessArcsec": round(float(np.max(de_excess)), 4),
                   "maxAbsDifferenceFromErfaArcsec": round(float(np.max(np.abs(de_excess - erfa_excess[inside]))), 4)},
        "engine": {"solstices": int(jd.size), "beyond": int(np.sum(margin > 0)), "flagged": int(flags),
                   "maxMarginArcsec": round(float(np.max(margin)), 4),
                   "sunLatitudeArcsec": [round(float(np.min(engine_lat)), 3), round(float(np.max(engine_lat)), 3)],
                   "maxAbsSunLatitudeDegrees": float(np.max(np.abs(engine_lat))) / 3600,
                   "signDisagreementsWithErfa": int(np.sum((margin > 0) != (erfa_excess > 0))),
                   "maxAbsMarginMinusErfaExcessArcsec": round(float(np.max(np.abs(margin - erfa_excess))), 4),
                   "byCentury": by_century},
        "examples": [example(2024, 6), example(1970, 12)],
    }
    with open(out, "w") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
