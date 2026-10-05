#!/usr/bin/env python3
"""ERFA's mean ayanamsas and their rates where ayanamsa_rates.py's rows are
sparse; writes src/fixtures/ayanamsa-rates-dense.json.

  python3 dense_rates.py [--check]      (numpy, pyerfa 2.0.1.5)

ayanamsa_rates.py's rows come near the Sun only on the days and three-hour
steps around each star's conjunctions, and take callers' ayanamsas only with
values near today's. This adds two sets of rows.

Near the Sun. Within a few degrees of the Sun the deflection of a star's light
grows as the star's angle from the Sun falls, and its rate faster still, so
those steps miss where the engine and ERFA differ most. For each star, in the
year of each of its conjunctions with the Sun in 1801, 1900, 2000, 2100 and
2199, this samples:

- every 5 days through the year, and every 0.05 day for 3 days either side of
  the star's closest approach to the Sun;
- where the star passes within 2 degrees of the Sun, every 0.02 day for 3 days
  either side of the closest approach, and every 0.001 day for 0.3 day either
  side of it;
- where it passes so close that ERFA caps the deflection's denominator
  (eraLdsun's dlim: 1e-6 over the square of the Sun's distance in au, or 1e-6
  inside 1 au), every 0.00001 day for 0.002 day either side of each instant at
  which the cap starts or stops applying.

Callers' ayanamsas at the ends of what calc accepts: values from -359.9 to
359.9 degrees, epochs at either end of the span and at J2000.0, each precession
model, and rates of up to 3,600 arcseconds a year, at nine instants across the
span. An epoch definition is reference_values.py's epoch_ayanamsa; a linear
one is its own arithmetic, so there the comparison measures rounding alone.

The mean ayanamsa of a star is reference_values.py's star_ayanamsa. A rate is
the central difference over plus and minus 0.001 day of TT, the step of calc's
speeds. `--check` rebuilds the file in memory and compares. Nothing here
imports or runs the engine, and no Swiss Ephemeris code or values are used.
"""
import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path

import erfa
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
OUTPUT = ROOT / "src/fixtures/ayanamsa-rates-dense.json"
REFERENCE = HERE.parents[1] / "vedic-2026-09-28/tools/reference_values.py"

_spec = importlib.util.spec_from_file_location("reference_values", REFERENCE)
ref = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ref)

STEP = 0.001          # days of TT: the step of calc's speeds
YEARS = [1801, 1900, 2000, 2100, 2199]
NEAR = 2.0            # degrees: within this, the dense steps
GOLDEN = (math.sqrt(5) - 1) / 2
SPAN_FROM = 2_378_496.5   # 1800-01-01 0h TT
SPAN_LAST = 2_524_592.5   # 2199-12-31 0h TT, the span's last day
JULIAN_YEAR = 365.25


def central(f, jd):
    return (f(jd + STEP) - f(jd - STEP)) / (2 * STEP)


# ---------------------------------------------------------------- near the Sun

def elongation_at(star, jd):
    return ref.star_ayanamsa(star, jd)[1]


def closest_approach(star, year):
    """The TT Julian date, to 1e-8 day, of the star's least angle from the Sun in `year`."""
    first = sum(erfa.cal2jd(year, 1, 1))
    days = [first + k for k in range(366)]
    best = min(days, key=lambda jd: elongation_at(star, jd))
    lo, hi = best - 1.0, best + 1.0
    while hi - lo > 1e-8:
        a = hi - GOLDEN * (hi - lo)
        b = lo + GOLDEN * (hi - lo)
        if elongation_at(star, a) < elongation_at(star, b):
            hi = b
        else:
            lo = a
    return (lo + hi) / 2


def cap_margin(star, jd):
    """1 + p·e less eraLdsun's dlim, as eraAtciq builds them; below zero, ERFA caps the denominator."""
    ra, dec, pma, pmd, plx, rv, epoch, _anchor = star
    ra, dec = math.radians(ra), math.radians(dec)
    pmr = pma * ref.MAS / math.cos(dec)
    pmdr = pmd * ref.MAS
    px = plx / 1000
    if epoch != ref.J2000:
        ra, dec, pmr, pmdr, px, rv = erfa.pmsafe(ra, dec, pmr, pmdr, px, rv, epoch, 0.0, ref.J2000, 0.0)
    astrom = erfa.apcg13(ref.DJM0, jd - ref.DJM0)
    p = erfa.pmpx(ra, dec, pmr, pmdr, px, rv, astrom["pmt"], astrom["eb"])
    em = float(astrom["em"])
    return 1.0 + float(np.dot(p, astrom["eh"])) - 1e-6 / max(em * em, 1.0)


def crossing(star, inside, outside):
    """Where cap_margin changes sign between `inside` (below zero) and `outside`, to 1e-8 day.

    A Julian date near 2.4 million is held to about 5e-10 day, so a finer
    tolerance would never be met.
    """
    while abs(outside - inside) > 1e-8:
        middle = (inside + outside) / 2
        if cap_margin(star, middle) < 0:
            inside = middle
        else:
            outside = middle
    return (inside + outside) / 2


def instants(centre, half_width, step):
    count = round(half_width / step)
    return [centre + k * step for k in range(-count, count + 1)]


def star_series(name, star, year):
    closest = closest_approach(star, year)
    least = elongation_at(star, closest)
    first = sum(erfa.cal2jd(year, 1, 1))
    times = [first + 5 * k for k in range(74)]
    times += instants(closest, 3.0, 0.05)
    caps = []
    if least < NEAR:
        times += instants(closest, 3.0, 0.02)
        times += instants(closest, 0.3, 0.001)
    if cap_margin(star, closest) < 0:
        caps = [crossing(star, closest, closest - 0.3), crossing(star, closest, closest + 0.3)]
        for edge in caps:
            times += instants(edge, 0.002, 0.00001)
    jds = sorted({round(t, 8) for t in times})
    mean = lambda jd: ref.star_ayanamsa(star, jd)[0]
    return {
        "name": name,
        "year": year,
        "closest": round(closest, 8),
        "leastElongation": round(least, 6),
        "capFromTo": [round(t, 8) for t in caps],
        "jd": jds,
        "mean": [round(mean(jd), 13) for jd in jds],
        "rate": [round(central(mean, jd), 14) for jd in jds],
    }


# ---------------------------------------------------------------- callers' ayanamsas

VALUES = [-359.9, -180.0, 0.0001, 23.85, 180.0, 359.9]
LINEAR_VALUES = [-359.9, 23.85, 359.9]
RATES = [-3600.0, -50.29, 50.29, 3600.0]
EPOCHS = [SPAN_FROM, ref.J2000, SPAN_LAST]
AT = [SPAN_FROM + 0.5 + k * (SPAN_LAST - SPAN_FROM - 1.0) / 8 for k in range(9)]


def caller_series(definition, mean):
    jds = [round(t, 8) for t in AT]
    return {
        "definition": definition,
        "jd": jds,
        "mean": [round(mean(jd), 12) for jd in jds],
        "rate": [round(central(mean, jd), 15) for jd in jds],
    }


def callers():
    out = []
    for epoch in EPOCHS:
        for model in ["engine", "newcomb", "iau1976"]:
            for value in VALUES:
                mean = lambda jd, v=value, e=epoch, m=model: ref.epoch_ayanamsa(v, e, m, jd)
                out.append(caller_series({"epoch": epoch, "value": value, "model": model}, mean))
        for value in LINEAR_VALUES:
            for rate in RATES:
                mean = lambda jd, v=value, e=epoch, r=rate: v + r * (jd - e) / JULIAN_YEAR / 3600
                out.append(caller_series({"epoch": epoch, "value": value, "rate": rate}, mean))
    return out


def build():
    out = {
        "generator": "docs/evidence/calc-sidereal-2026-10-05/tools/dense_rates.py",
        "erfa": f"pyerfa {erfa.__version__}",
        "units": "jd: Julian dates in TT; mean: the mean ayanamsa, degrees, not wrapped; rate: its central difference"
                 " over plus and minus 0.001 day of TT, degrees a day; leastElongation: ERFA's least angle of the star"
                 " from the Sun that year, degrees; capFromTo: when eraLdsun's cap starts and stops applying; a"
                 " definition's rate: arcseconds a Julian year",
        "step": STEP,
        "stars": [star_series(name, star, year) for name, star in ref.STARS.items() for year in YEARS],
        "callers": callers(),
    }
    return json.dumps(out, separators=(",", ":")) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = build()
    if args.check:
        if OUTPUT.read_text() != text:
            sys.exit(f"{OUTPUT} differs from a rebuild")
        print(f"{OUTPUT.name} matches a rebuild")
        return
    OUTPUT.write_text(text)
    print(f"wrote {OUTPUT} ({len(text)} bytes)")


if __name__ == "__main__":
    main()
