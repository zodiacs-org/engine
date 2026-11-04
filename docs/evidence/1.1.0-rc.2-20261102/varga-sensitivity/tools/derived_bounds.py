#!/usr/bin/env python3
"""The table of the Ascendant's derived rate bounds (PREREGISTRATION.md,
section 7). Standard library only; it never runs the engine.

The eastern intersection of the ecliptic and the horizon moves as
d(lambda)/d(theta) = cos(phi) sin(A) / sin(eta), with phi the latitude, A the
Ascendant's azimuth, eta the angle between the ecliptic and the horizon and
theta the local sidereal time. With epsilon the true obliquity, for
|phi| + epsilon below 90 degrees,

    sqrt(cos^2 phi - sin^2 epsilon) <= d(lambda)/d(theta) <= cos phi / cos(|phi| + epsilon).

With epsilon under 23.5 degrees from 1800 to 2200, theta advancing at
360.9856 degrees a UT1 day, the obliquity's own motion at most 5e-5 degrees a
day and a the ayanamsa's rate bound, the bounds in degrees a day are

    R_hi = 1.01 * 360.9856 * cos(phi) / cos(|phi| + 23.5) + a
    R_lo = 0.99 * 360.9856 * sqrt(cos^2 phi - sin^2 23.5) - 5e-5 / cos(|phi| + 23.5) - a

The table gives both at |phi| of 0, 30, 45, 60 and 66 degrees for a of 0.0003
degree a day and for the largest linear rate a caller may give (0.0003 plus
3,600 arcseconds a Julian year), and the largest |phi| at which R_lo stays
above zero for each. A third column, for a star definition (0.0003 + 0.021,
src/vedic/varga-time.ts), is an addition of the implementation. Each R_hi
also gives the longest bracket the search takes, 330 degrees over R_hi, in
milliseconds.

  python3 -I -B derived_bounds.py [--out FILE] [--latitude DEG ...]

--latitude evaluates the bounds at further latitudes; beyond 90 - 23.5 = 66.5
degrees the lower bound has no real value, and the script says so (the
control: --latitude 66.6).
"""
import argparse
import json
import math
import sys

SIDEREAL = 360.9856
OBLIQUITY = 23.5
OBLIQUITY_RATE = 5e-5
LINEAR = 3600 / 3600 / 365.25
RATES = {"epoch": 0.0003, "largest linear": 0.0003 + LINEAR, "star (addition)": 0.0003 + 0.021}
LATITUDES = [0, 30, 45, 60, 66]
DAY_MS = 86_400_000


def bounds(phi_deg, a):
    """(R_lo, R_hi) in degrees a day; R_lo is None where it has no real value."""
    phi = math.radians(abs(phi_deg))
    eps = math.radians(OBLIQUITY)
    tilted = math.cos(phi + eps)
    if tilted <= 0:
        return None, None
    high = 1.01 * SIDEREAL * math.cos(phi) / tilted + a
    under = math.cos(phi) ** 2 - math.sin(eps) ** 2
    if under < 0:
        return None, high
    return 0.99 * SIDEREAL * math.sqrt(under) - OBLIQUITY_RATE / tilted - a, high


def largest_latitude(a):
    """The largest |phi| (degrees, to 1e-9) at which R_lo is above zero."""
    low, high = 0.0, 90 - OBLIQUITY
    for _ in range(200):
        middle = (low + high) / 2
        lower, _ = bounds(middle, a)
        if lower is not None and lower > 0:
            low = middle
        else:
            high = middle
    return round(low, 9)


def row(phi, a):
    lower, upper = bounds(phi, a)
    return {
        "latitude": phi,
        "R_lo": None if lower is None else round(lower, 6),
        "R_hi": None if upper is None else round(upper, 6),
        "longestBracketMs": None if upper is None else math.floor(330 / (upper / DAY_MS)),
        "note": None if lower is not None else "no real value: |phi| is beyond 90 - 23.5 = 66.5 degrees",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out")
    parser.add_argument("--latitude", type=float, action="append", default=[])
    args = parser.parse_args()
    table = {
        "tool": "docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/derived_bounds.py",
        "python": sys.version.split()[0],
        "units": "degrees a day; latitudes in degrees; brackets in milliseconds",
        "formulae": {
            "R_hi": "1.01 * 360.9856 * cos(phi) / cos(|phi| + 23.5) + a",
            "R_lo": "0.99 * 360.9856 * sqrt(cos^2 phi - sin^2 23.5) - 5e-5 / cos(|phi| + 23.5) - a",
        },
        "rates": {
            name: {
                "a": round(a, 9),
                "rows": [row(phi, a) for phi in LATITUDES + args.latitude],
                "largestLatitudeWithPositiveLowerBound": largest_latitude(a),
            }
            for name, a in RATES.items()
        },
    }
    text = json.dumps(table, indent=1) + "\n"
    if args.out:
        with open(args.out, "w") as handle:
            handle.write(text)
    print(text, end="")
    for name, entry in table["rates"].items():
        for line in entry["rows"]:
            if line["note"]:
                print(f"{name}, {line['latitude']} degrees: the lower bound has {line['note']}", file=sys.stderr)


if __name__ == "__main__":
    main()
