#!/usr/bin/env python3
"""Independent ayanamsas and their rates for the calc entry's sidereal bounds;
writes src/fixtures/ayanamsa-rates.json.

  python3 ayanamsa_rates.py [--check]      (needs numpy and pyerfa)

Nothing here imports or runs the engine, and no Swiss Ephemeris code or
values are used. The constructions are those of the Vedic evidence's
reference tool (docs/evidence/vedic-2026-09-28/tools/reference_values.py),
imported from it: epoch definitions carried by the older models and by IAU
2006 (ERFA bp06, obl06, prec76, obl80, and Kinoshita's Newcomb), and star
definitions through ERFA pmsafe, apcg13, atciq and ecm06.

What this adds to that tool:

- the rate of every mean ayanamsa, as a central difference over plus and
  minus 0.001 day of TT, the step the calc entry's speeds take;
- the star definitions at every instant of that tool's ten-year grid,
  including those it left out because the star was within 5 degrees of the
  Sun, at every day from 10 days before to 10 days after the star's
  conjunction with the Sun in five years from 1801 to 2199, and every three
  hours in the day either side of it, so that the light deflection near the
  Sun is compared too;
- the linear definitions (Raman, Sri Yukteswar), from their stated formulas.

`src/calc-sidereal.test.ts` checks the engine's mean ayanamsas and their
rates against the file this writes, within the bounds the calc entry adds for
the ayanamsa (AYANAMSA_BOUNDS in src/calc.ts); `--check` rebuilds the file in
memory and fails if the committed one differs.
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
OUTPUT = ROOT / "src/fixtures/ayanamsa-rates.json"
REFERENCE_TOOL = ROOT / "docs/evidence/vedic-2026-09-28/tools/reference_values.py"

spec = importlib.util.spec_from_file_location("reference_values", REFERENCE_TOOL)
ref = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ref)

STEP = 0.001          # days of TT, the calc entry's speed step
DJM0 = ref.DJM0
J2000 = ref.J2000
JULIAN_YEAR = 365.25

# The linear definitions as src/vedic/ayanamsa.ts states them: value (degrees)
# at the epoch (TT Julian date) and rate (arcseconds per Julian year).
LINEAR = {
    "raman": (J2000 + (397 - 2000) * JULIAN_YEAR, 0.0, 50 + 1 / 3),
    "yukteswar": (2_412_908.1244, 20 + 54 / 60 + 36 / 3600, 54.0),
}


def linear_ayanamsa(definition, t):
    t0, value, rate = definition
    return value + rate * (t - t0) / JULIAN_YEAR / 3600


def rate_of(mean_at, t):
    """Degrees per day: the central difference over plus and minus STEP."""
    return (mean_at(t + STEP) - mean_at(t - STEP)) / (2 * STEP)


def sun_longitude(t):
    """The Sun's geometric geocentric longitude on the mean ecliptic of date, degrees (ERFA);
    enough to find a conjunction to the day."""
    earth = np.array(erfa.epv00(DJM0, t - DJM0)[0]["p"])  # heliocentric Earth
    e = erfa.ecm06(DJM0, t - DJM0) @ -earth
    return math.degrees(math.atan2(e[1], e[0])) % 360


def conjunction(spec_, year):
    """The TT Julian date, to a day, when the Sun's longitude passes the star's in `year`."""
    first = sum(erfa.cal2jd(year, 1, 1))  # 1 January of `year`, 0h

    def gap(t):
        value, _ = ref.star_ayanamsa(spec_, t)
        star = (value + spec_[7]) % 360  # the star's longitude: ayanamsa plus its anchor
        return (sun_longitude(t) - star + 180) % 360 - 180

    previous = gap(first)
    for k in range(1, 367):
        current = gap(first + k)
        if previous < 0 <= current:
            return first + k
        previous = current
    raise RuntimeError(f"no conjunction found in {year}")


CONJUNCTION_YEARS = [1801, 1900, 2000, 2100, 2199]


def build():
    out = {
        "generator": "docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py",
        "erfa": f"pyerfa {erfa.__version__}",
        "units": "Julian dates in TT; mean ayanamsas in degrees; rates in degrees per day, "
                 f"central differences over plus and minus {STEP} day",
        "rows": [],
    }
    rows = out["rows"]

    def add(kind, name, t, mean_at, extra=None):
        row = {"kind": kind, "name": name, "jd": round(t, 6), "mean": round(mean_at(t), 12),
               "rate": round(rate_of(mean_at, t), 15)}
        if extra:
            row.update(extra)
        rows.append(row)

    for name, (t0, a0, model) in ref.EPOCHS.items():
        for t in ref.DATES:
            add("epoch", name, t, lambda x, t0=t0, a0=a0, model=model: ref.epoch_ayanamsa(a0, t0, model, x))
    for name, (t0, a0, model) in ref.USER.items():
        for t in ref.DATES:
            add("user", name, t, lambda x, t0=t0, a0=a0, model=model: ref.epoch_ayanamsa(a0, t0, model, x),
                {"epoch": t0, "value": a0, "model": model})
    for name, definition in LINEAR.items():
        for t in ref.DATES:
            add("linear", name, t, lambda x, d=definition: linear_ayanamsa(d, x))
    for name, spec_ in ref.STARS.items():
        def mean_at(x, s=spec_):
            return ref.star_ayanamsa(s, x)[0]
        instants = list(ref.STAR_DATES)
        for year in CONJUNCTION_YEARS:
            centre = conjunction(spec_, year)
            instants += [centre + d for d in range(-10, 11)]
            instants += [centre + k / 8 for k in range(-8, 9) if k % 8]
        for t in sorted(instants):
            _, elongation = ref.star_ayanamsa(spec_, t)
            add("star", name, t, mean_at, {"elongation": round(elongation, 4)})
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
