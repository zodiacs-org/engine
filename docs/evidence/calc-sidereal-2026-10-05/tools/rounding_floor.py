#!/usr/bin/env python3
"""Where a linear ayanamsa's rate comes nearest the floor of its rounding.

  python3 rounding_floor.py

A linear ayanamsa's mean is its value at J2000.0 less whole turns, R, plus
the rate per day times TT days since J2000.0, P (src/vedic/ayanamsa.ts). The
engine rounds P, and then R + P; in the span, with rates up to 3,600" a year,
P stays below 256 degrees and R + P below 512, so the two roundings put at
most 2**-46 and 2**-45 degree into each mean, and one and a half units of
2**-44 degree into the difference of two means. The rate the comparison takes
(differences.ts and src/calc-sidereal.test.ts) is that difference over 0.002
day, between the same two instants as the exact definition's, so it differs
from the exact rate by at most 1.5 * 2**-44 / 0.002 degree a day, 1.535e-7"
a day. calc's speeds add rounding of their own: of their instants' TT, of
the nutation and of the subtraction from the longitude (docs/calc.md).

Where both means lie between 256 and 512 degrees from zero, as at the case
this finds, their difference is a whole number of units of 2**-44 degree,
and the exact difference, N, is not: if N is k + f units, the engine's
difference can be k - 1 units, f + 1 from N, when the roundings fall the same
way at both instants. So the largest differences come with f just below one
half. N depends on the rate and on the two instants' spacing. A Julian date in
the span is held to 2**-31 day; 0.001 day is 2,147,483.648 of those units,
and each instant 0.001 day from one in the span rounds to 2,147,484 of them,
so the spacing is 4,294,968 units, 0.0020000003278 day. This takes rates of
3,600" a year less a whole number of millionths, finds for each of three
fractions f the first rate with an N that close to it, and scans 40,001
instants across the span with the value -359.9 degrees from an epoch at the
span's start. It replicates the engine's arithmetic in IEEE doubles, which
Python's floats round the same way; differences.ts --every-year runs the
engine itself at the instant found (dense_rates.py's FLOOR_CALLERS).
"""
import math
from fractions import Fraction

J2000 = 2_451_545.0
STEP = 0.001
SPAN_FROM = 2_378_496.5
SPAN_LAST = 2_524_592.5
UNIT = Fraction(2) ** -44


def js_round(x):
    """JavaScript's Math.round."""
    return math.floor(x + 0.5)


def wrap(value):
    """src/vedic/ayanamsa.ts's wrap, into (-180, 180]."""
    r = math.fmod(value, 360.0)
    return r - 360 if r > 180 else r + 360 if r <= -180 else r


def engine_mean(value, rate, epoch, jd):
    """src/vedic/ayanamsa.ts's linear case, at the TT instant jd."""
    per_day = rate / 365.25 / 3600
    at_j2000 = value - per_day * (epoch - J2000)
    return wrap(at_j2000 - 360 * js_round(at_j2000 / 360) + per_day * (jd - J2000))


def engine_rate(value, rate, epoch, jd):
    """As differences.ts takes it: to the nearest whole turn, over 0.002 day."""
    d = engine_mean(value, rate, epoch, jd + STEP) - engine_mean(value, rate, epoch, jd - STEP)
    return (d - 360 * js_round(d / 360)) / (2 * STEP)


def exact_rate(rate, jd):
    """dense_rates.py's: the exact central difference over the same two instants, as it is written."""
    days = Fraction(jd + STEP) - Fraction(jd - STEP)
    return round(float(Fraction(rate) * days / Fraction(1461, 4) / 3600 / Fraction(2 * STEP)), 15)


def largest(value, rate, epoch, count):
    best = (0.0, None)
    for k in range(count):
        jd = SPAN_FROM + 0.5 + k * (SPAN_LAST - SPAN_FROM - 1.0) / (count - 1)
        d = abs(engine_rate(value, rate, epoch, jd) - exact_rate(rate, jd)) * 3600
        if d > best[0]:
            best = (d, jd)
    return best


def main():
    spacings = sorted({Fraction(jd + STEP) - Fraction(jd - STEP) for jd in [SPAN_FROM + 0.5 + k * 0.37 for k in range(200)]})
    floor = float(Fraction(3, 2) * UNIT / Fraction(2 * STEP)) * 3600
    print(f"floor: 1.5 * 2**-44 degree over 0.002 day = {floor:.6e} arcsec a day")
    print("spacing of two instants 0.001 day either side of one in the span:", ", ".join(repr(float(s)) for s in spacings))
    found = {}
    for k in range(20_000):
        rate = 3600.0 - k * 1e-6
        for spacing in spacings:
            f = float((Fraction(rate) * spacing / Fraction(1461, 4) / 3600 / UNIT) % 1)
            for target in (0.45, 0.47, 0.49):
                if target not in found and abs(f - target) < 0.002:
                    found[target] = (rate, f)
    results = []
    for target, (rate, f) in sorted(found.items()):
        d, jd = largest(-359.9, rate, SPAN_FROM, 40_001)
        results.append((d, rate, jd, f))
        print(f"f = {f:.4f}: rate {rate!r}, largest {d:.6e} arcsec a day ({d / floor * 1.5:.4f} units) at {jd!r}")
    d, rate, jd, f = max(results)
    print(f"nearest the floor: value -359.9, epoch {SPAN_FROM}, rate {rate!r}, at {jd!r}: {d:.6e} arcsec a day")


if __name__ == "__main__":
    main()
