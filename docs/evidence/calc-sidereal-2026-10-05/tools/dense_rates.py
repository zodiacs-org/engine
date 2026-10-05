#!/usr/bin/env python3
"""ERFA's mean ayanamsas and their rates where ayanamsa_rates.py's rows are
sparse; writes src/fixtures/ayanamsa-rates-dense.json, and with --every-year
the rows the bounds rest on, outside the repository.

  python3 dense_rates.py [--check]                     (numpy, pyerfa 2.0.1.5)
  python3 dense_rates.py --every-year FILE [--jobs N]

ayanamsa_rates.py's rows come near the Sun only on the days and three-hour
steps around each star's conjunctions, and take callers' ayanamsas only with
values near today's. This adds two sets of rows.

Near the Sun. Within a few degrees of the Sun the deflection of a star's light
grows as the star's angle from the Sun falls, and its rate faster still, so
those steps miss where the engine and ERFA differ most. For a star and a year,
star_series samples:

- every 5 days through the year, and every 0.05 day for 3 days either side of
  the star's closest approach to the Sun that year;
- where the star passes within 2 degrees of the Sun, every 0.02 day for 3 days
  either side of the closest approach, and every 0.001 day for 0.3 day either
  side of it;
- where it passes so close that ERFA caps the deflection's denominator
  (eraLdsun's dlim: 1e-6 over the square of the Sun's distance in au, or 1e-6
  inside 1 au), every 0.00001 day for 0.005 day either side of each instant at
  which ERFA's cap starts or stops applying;
- where it comes within NEAR_CAP of the cap without reaching it, every
  0.00001 day for as long as ERFA's margin, 1 + p·e less dlim, is below
  NEAR_CAP, and 0.001 day either side.

The engine caps the same way, but its Earth differs a little from ERFA's, so
its margin differs from ERFA's, by up to 1.8e-8 at a closest approach, and it
caps in years that ERFA does not, and starts and stops a few minutes from
ERFA's crossings. differences.ts --every-year finds the engine's own crossings
and checks that these steps cover the 0.001 day either side of each, in which
a rate's central difference straddles it (results/every-year.json, `caps`).

How far the two programs part near the Sun changes from one conjunction to the
next, because their Earths differ by an amount that changes from year to year.
--every-year writes the series of every star definition for every year from
1800 to 2199, 1,600 series, as JSON lines; differences.ts --every-year reads
them, and the bounds are the largest differences there. The fixture holds the
series of 1801, 1900, 2000, 2100 and 2199 for every star, and for each star the
years in which that run found a band's largest difference (EXTRA_YEARS), so
that the test meets each bound's worst case.

Callers' ayanamsas at the ends of what calc accepts: values from -359.9 to
359.9 degrees; for an epoch definition (held by precession, which calc takes
only with an epoch inside the span), epochs at both ends of the span, at
J2000.0 and at eight steps between, and each precession model; for a linear
one, those epochs and also the first and last days a Date can hold and the
start of the Kali Yuga, with rates of up to 3,600 arcseconds a year. The
fixture has each at nine instants across the span; --every-year at 401, and
the fixture holds at 401 the definition in which that run found the largest
difference of the position (EXTRA_CALLERS). An epoch definition is
reference_values.py's epoch_ayanamsa: ERFA's precession from the epoch, to
which the value is added exactly, in rational arithmetic, and its rate the
exact central difference of that precession over the same two instants,
which the value does not change.
A linear one is computed exactly, in rational arithmetic on the same binary
inputs, its mean reduced to (-180, 180] and its rate the exact central
difference over the same two instants. Neither adds rounding of its own at
the value's size, so what is left in the comparison is the engine's rounding
(and, for an epoch definition, the two programs' precessions).

The engine's rate for those definitions differs from the exact one by its
rounding alone, and that is largest for a linear definition: the rate times
the time and their sum, each rounded, give at most one and a half units in the
last place of a value below 512 degrees, 2**-44 degree, over the 0.002 day of
the central difference. FLOOR_CALLERS holds a definition and instant at which
the engine comes within one per cent of that, which rounding_floor.py found.

The mean ayanamsa of a star is reference_values.py's star_ayanamsa. A rate is
the central difference over plus and minus 0.001 day of TT, the step of calc's
speeds. `--check` rebuilds the fixture in memory and compares. Nothing here
imports or runs the engine, and no Swiss Ephemeris code or values are used.
"""
import argparse
import importlib.util
import json
import math
import sys
from fractions import Fraction
from multiprocessing import Pool
from pathlib import Path

import warnings

import erfa
import numpy as np

# epv00, ERFA's Earth, is documented for 1900 to 2100 and warns outside it;
# the record says so (README, *The ayanamsa's bounds*), and the warning, once
# per call, would bury the output.
warnings.filterwarnings("ignore", category=erfa.ErfaWarning)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
OUTPUT = ROOT / "src/fixtures/ayanamsa-rates-dense.json"
REFERENCE = HERE.parents[1] / "vedic-2026-09-28/tools/reference_values.py"

_spec = importlib.util.spec_from_file_location("reference_values", REFERENCE)
ref = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ref)

STEP = 0.001          # days of TT: the step of calc's speeds
YEARS = [1801, 1900, 2000, 2100, 2199]
EVERY_YEAR = range(1800, 2200)
# The years, beyond YEARS, in which --every-year found a band's largest
# difference of the position or the rate (differences.ts --every-year,
# results/every-year.json): True Chitra's in the band 2 degrees or more from
# the Sun, True Revati's position and True Pushya's rate from 0.3 to 2
# degrees, and True Pushya's within 0.3 degree.
EXTRA_YEARS = {"true-chitra": [1825, 2197], "true-revati": [2196], "true-pushya": [1804, 1821]}
NEAR = 2.0            # degrees: within this, the dense steps
CAP_HALF_WIDTH = 0.005  # days either side of a cap crossing
# ERFA's cap margin below which a pass that ERFA does not cap is sampled as
# finely as a crossing: nearly three times the largest difference of the
# engine's margin from ERFA's at a closest approach (differences.ts).
NEAR_CAP = 5e-8
GOLDEN = (math.sqrt(5) - 1) / 2
SPAN_FROM = 2_378_496.5   # 1800-01-01 0h TT
SPAN_LAST = 2_524_592.5   # 2199-12-31 0h TT, the span's last day
UNIX_JD = 2_440_587.5     # 1970-01-01, the middle of a Date's range of 1e8 days either way
KALI_YUGA = 588_465.5     # -3101-02-18 (3102 BCE) 0h, proleptic Julian calendar
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


def crossing(star, inside, outside, level=0.0):
    """Where cap_margin passes `level` between `inside` (below it) and `outside`, to 1e-8 day.

    A Julian date near 2.4 million is held to about 5e-10 day, so a finer
    tolerance would never be met.
    """
    while abs(outside - inside) > 1e-8:
        middle = (inside + outside) / 2
        if cap_margin(star, middle) < level:
            inside = middle
        else:
            outside = middle
    return (inside + outside) / 2


def instants(centre, half_width, step):
    count = round(half_width / step)
    return [centre + k * step for k in range(-count, count + 1)]


def star_series(name, year):
    star = ref.STARS[name]
    closest = closest_approach(star, year)
    least = elongation_at(star, closest)
    first = sum(erfa.cal2jd(year, 1, 1))
    times = [first + 5 * k for k in range(74)]
    times += instants(closest, 3.0, 0.05)
    caps = []
    near_cap = []
    if least < NEAR:
        times += instants(closest, 3.0, 0.02)
        times += instants(closest, 0.3, 0.001)
    margin = cap_margin(star, closest)
    if margin < 0:
        caps = [crossing(star, closest, closest - 0.3), crossing(star, closest, closest + 0.3)]
        for edge in caps:
            times += instants(edge, CAP_HALF_WIDTH, 0.00001)
    elif margin < NEAR_CAP:
        near_cap = [crossing(star, closest, closest - 0.3, NEAR_CAP), crossing(star, closest, closest + 0.3, NEAR_CAP)]
        times += instants((near_cap[0] + near_cap[1]) / 2, (near_cap[1] - near_cap[0]) / 2 + STEP, 0.00001)
    jds = sorted({round(t, 8) for t in times})
    mean = lambda jd: ref.star_ayanamsa(star, jd)[0]
    return {
        "name": name,
        "year": year,
        "closest": round(closest, 8),
        "leastElongation": round(least, 6),
        "capMargin": float(f"{margin:.6e}"),
        "capFromTo": [round(t, 8) for t in caps],
        "nearCapFromTo": [round(t, 8) for t in near_cap],
        "jd": jds,
        "mean": [round(mean(jd), 13) for jd in jds],
        "rate": [round(central(mean, jd), 14) for jd in jds],
    }


# ---------------------------------------------------------------- callers' ayanamsas

VALUES = [-359.9, -180.0, 0.0001, 23.85, 180.0, 359.9]
LINEAR_VALUES = [-359.9, 23.85, 359.9]
RATES = [-3600.0, -50.29, 50.29, 3600.0]
MODELS = ["engine", "newcomb", "iau1976"]
# Both ends of the span, J2000.0 and eight steps between.
EPOCHS = sorted({SPAN_FROM + k * (SPAN_LAST - SPAN_FROM) / 8 for k in range(9)} | {ref.J2000})
# A linear definition's epoch may be any instant a Date holds.
LINEAR_EPOCHS = sorted(set(EPOCHS) | {UNIX_JD - 1e8 + 1, KALI_YUGA, UNIX_JD + 1e8 - 1})
AT = [SPAN_FROM + 0.5 + k * (SPAN_LAST - SPAN_FROM - 1.0) / 8 for k in range(9)]
AT_EVERY = [SPAN_FROM + 0.5 + k * (SPAN_LAST - SPAN_FROM - 1.0) / 400 for k in range(401)]
# The definitions that the fixture holds at 401 instants, not nine: those in
# which --every-year found the largest difference of the position and of the
# rate (differences.ts --every-year, results/every-year.json), but for the
# rate's, which is FLOOR_CALLERS' and held at its own instant.
EXTRA_CALLERS = [
    {"epoch": SPAN_FROM, "value": -180.0, "model": "engine"},
]
# A linear definition, and the instant, at which the engine's rate comes
# nearest the floor of its rounding (rounding_floor.py): the fixture and
# --every-year take it at that instant.
FLOOR_CALLERS = [({"epoch": SPAN_FROM, "value": -359.9, "rate": 3599.999734}, [2_379_402.789])]


def definitions():
    out = []
    for epoch in EPOCHS:
        for model in MODELS:
            for value in VALUES:
                out.append({"epoch": epoch, "value": value, "model": model})
    for epoch in LINEAR_EPOCHS:
        for value in LINEAR_VALUES:
            for rate in RATES:
                out.append({"epoch": epoch, "value": value, "rate": rate})
    return out


def exact_linear(definition, jd):
    """The linear definition's mean ayanamsa at a TT Julian date, exactly, in degrees, as a Fraction."""
    days = Fraction(jd) - Fraction(definition["epoch"])
    return Fraction(definition["value"]) + Fraction(definition["rate"]) * days / Fraction(1461, 4) / 3600


def half_turn(x):
    """A Fraction of degrees reduced to (-180, 180]."""
    r = x % 360
    return r - 360 if r > 180 else r


def caller_series(definition, jds):
    jds = [round(t, 8) for t in jds]
    if "rate" in definition:
        mean = [float(half_turn(exact_linear(definition, jd))) for jd in jds]
        rate = [float((exact_linear(definition, jd + STEP) - exact_linear(definition, jd - STEP)) / Fraction(2 * STEP)) for jd in jds]
    else:
        precession = lambda jd: Fraction(ref.epoch_ayanamsa(0.0, definition["epoch"], definition["model"], jd))
        mean = [float(Fraction(definition["value"]) + precession(jd)) for jd in jds]
        rate = [float((precession(jd + STEP) - precession(jd - STEP)) / Fraction(2 * STEP)) for jd in jds]
    return {
        "definition": definition,
        "jd": jds,
        "mean": [round(m, 12) for m in mean],
        "rate": [round(r, 15) for r in rate],
    }


# ---------------------------------------------------------------- output

def star_task(task):
    name, year = task
    return json.dumps({"kind": "star", **star_series(name, year)}, separators=(",", ":"))


def caller_task(definition):
    return json.dumps({"kind": "caller", **caller_series(definition, AT_EVERY)}, separators=(",", ":"))


def identity(definition):
    return (float(definition["epoch"]), float(definition["value"]), definition.get("model"), float(definition.get("rate", "nan")))


def build():
    stars = [star_series(name, year) for name in ref.STARS for year in sorted(set(YEARS) | set(EXTRA_YEARS.get(name, [])))]
    extra = {repr(identity(d)) for d in EXTRA_CALLERS}
    callers = [caller_series(d, AT_EVERY if repr(identity(d)) in extra else AT) for d in definitions()]
    if sum(len(c["jd"]) == len(AT_EVERY) for c in callers) != len(EXTRA_CALLERS):
        raise SystemExit("an EXTRA_CALLERS entry names no definition")
    callers += [caller_series(d, at) for d, at in FLOOR_CALLERS]
    out = {
        "generator": "docs/evidence/calc-sidereal-2026-10-05/tools/dense_rates.py",
        "erfa": f"pyerfa {erfa.__version__}",
        "units": "jd: Julian dates in TT; mean: the mean ayanamsa, degrees, not wrapped; rate: its central difference"
                 " over plus and minus 0.001 day of TT, degrees a day; leastElongation: ERFA's least angle of the star"
                 " from the Sun that year, degrees; capFromTo: when eraLdsun's cap starts and stops applying; a"
                 " definition's rate: arcseconds a Julian year",
        "step": STEP,
        "stars": stars,
        "callers": callers,
    }
    return json.dumps(out, separators=(",", ":")) + "\n"


def every_year(path, jobs):
    """The series of every star for every year from 1800 to 2199, every caller at 401 instants and FLOOR_CALLERS, as JSON lines."""
    tasks = [(name, year) for name in ref.STARS for year in EVERY_YEAR]
    with open(path, "w") as out, Pool(jobs) as pool:
        out.write(json.dumps({"generator": "docs/evidence/calc-sidereal-2026-10-05/tools/dense_rates.py --every-year",
                              "erfa": f"pyerfa {erfa.__version__}", "step": STEP}) + "\n")
        for k, line in enumerate(pool.imap(star_task, tasks)):
            out.write(line + "\n")
            if k % 100 == 99:
                print(f"{k + 1} of {len(tasks)} star series", file=sys.stderr, flush=True)
        for line in pool.imap(caller_task, definitions(), chunksize=8):
            out.write(line + "\n")
        for definition, at in FLOOR_CALLERS:
            out.write(json.dumps({"kind": "caller", **caller_series(definition, at)}, separators=(",", ":")) + "\n")
    print(f"wrote {path}: {len(tasks)} star series, {len(definitions())} callers and {len(FLOOR_CALLERS)} at the floor", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--every-year", metavar="FILE")
    parser.add_argument("--jobs", type=int, default=1)
    args = parser.parse_args()
    if args.every_year:
        every_year(args.every_year, args.jobs)
        return
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
