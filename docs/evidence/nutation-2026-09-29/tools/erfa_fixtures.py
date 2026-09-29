#!/usr/bin/env python3
"""ERFA reference values for the engine's nutation; writes src/fixtures/nutation-erfa.json.

  python3 erfa_fixtures.py [--check]      (needs numpy and pyerfa)

Nothing here imports or runs the engine, and no Swiss Ephemeris code or values
are used. `src/nutation.test.ts` checks the engine against the file this
writes, with the tolerances written here; `--check` rebuilds the file in
memory and fails if the committed one differs.

At 101 instants of TT from 1800-01-01 to 2200-01-01 it records, from pyerfa:

- nut00b: the IAU 2000B nutation in longitude and obliquity, the model the
  engine's 77-term series transcribes;
- obl06: the IAU 2006 mean obliquity;
- the equation of the equinoxes, 2000B: ee00 with obl06 and nut00b's nutation
  in longitude, which adds all 33 complementary terms (IERS Conventions 2010,
  table 5.2e);
- "GAST, 2000B": gmst06 (IAU 2006) plus that equation of the equinoxes, and,
  for comparison, gst06a (IAU 2006/2000A) and gst00b;
- the rotation from the J2000 mean equator and equinox to the true ecliptic
  and equinox of date, Rz(-dpsi) Rx(epsA) P, with P the IAU 2006 precession
  matrix of bp06 (its "rp", which has no frame bias: the engine's positions
  are on the J2000 mean equator, as astronomy-engine gives them), epsA from
  obl06 and dpsi from nut00b.

UT1 for the sidereal times is TT less a synthetic ΔT, -20 + 32 u² seconds with
u = (year - 1820) / 100 (the long-term parabola of Morrison and Stephenson,
used here only as plausible values): the engine takes the two scales
separately, as ERFA does.

The tolerances are fixed here, before the engine is run against the file, and
the reasons are recorded with them. The only measured quantities they use are
differences between ERFA's own functions, printed by this script:

- nutation: 1e-10 arcsecond. The engine evaluates the same 77 terms from the
  same linear fundamental arguments; rounding in arguments of up to 3.5e9
  arcseconds at two centuries from J2000.0 moves a term of amplitude 1.3
  arcseconds by about 1e-11 arcsecond.
- mean obliquity: 1e-9 arcsecond; the same polynomial.
- equation of the equinoxes and GAST, 2000B: 5e-5 arcsecond each. The engine
  keeps the sine parts of the two largest complementary terms, 2640.96 and
  63.52 microarcseconds; the rest of table 5.2e (their cosine parts, the other
  31 terms and the t term) adds up to at most 44.0 microarcseconds within two
  centuries of J2000.0.
- GAST against gst06a: the largest |GAST 2000B - gst06a| at these instants
  plus 5e-5 arcsecond.
- rotation: 5e-6 arcsecond between directions. ERFA's own IAU 2006 precession
  built from the four P03 angles of p06e, as astronomy-engine builds it,
  differs from bp06's matrix by at most the "precessionFormulations" figure
  written below (0.7 microarcsecond); the rest is the nutation tolerance.
"""
import argparse
import json
import math
import sys
from pathlib import Path

import erfa
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
OUTPUT = ROOT / "src/fixtures/nutation-erfa.json"

AS2R = math.pi / 648_000
J2000 = 2_451_545.0
FIRST = 2_378_496.5  # 1800-01-01T00:00 TT
SPACING = 1_460.95  # days; the 101st instant falls on 2199-12-30
GOLDEN = (math.sqrt(5) - 1) / 2


def r1(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, s], [0, -s, c]])


def r3(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])


def hours(angle):
    return float(np.mod(angle, 2 * math.pi) * 12 / math.pi)


def arcsec_between(a, b):
    """Angle between two directions, arcseconds."""
    return math.atan2(np.linalg.norm(np.cross(a, b)), float(a @ b)) / AS2R


def wrapped_arcsec(hours_a, hours_b):
    return ((hours_a - hours_b + 12) % 24 - 12) * 15 * 3600


def build():
    epochs = []
    worst = {"precessionFormulations": 0.0, "gast2000BMinusGst06a": 0.0, "complementaryBeyondTwoTerms": 0.0}
    for k in range(101):
        tt = FIRST - J2000 + k * SPACING + (k * GOLDEN) % 1
        year = 2000 + tt / 365.25
        delta_t = -20 + 32 * ((year - 1820) / 100) ** 2
        ut1 = tt - delta_t / 86_400
        dpsi, deps = erfa.nut00b(J2000, tt)
        eps_a = erfa.obl06(J2000, tt)
        gmst = erfa.gmst06(J2000, ut1, J2000, tt)
        ee_b = erfa.ee00(J2000, tt, eps_a, dpsi)
        gast_b = hours(gmst + ee_b)
        gst06a = hours(erfa.gst06a(J2000, ut1, J2000, tt))
        gst00b = hours(erfa.gst00b(J2000, ut1))
        _, rp, _ = erfa.bp06(J2000, tt)
        rotation = erfa.rz(-dpsi, erfa.rx(eps_a, rp))
        # ERFA-internal checks behind the tolerances (not the engine).
        eps0, psia, oma, *_rest = erfa.p06e(J2000, tt)
        chia = _rest[5]
        p03 = r3(chia) @ r1(-oma) @ r3(-psia) @ r1(eps0)
        for axis in np.eye(3):
            worst["precessionFormulations"] = max(worst["precessionFormulations"], arcsec_between(p03 @ axis, rp @ axis))
        worst["gast2000BMinusGst06a"] = max(worst["gast2000BMinusGst06a"], abs(wrapped_arcsec(gast_b, gst06a)))
        t = tt / 36_525
        om = math.fmod(450_160.398036 - 6_962_890.5431 * t, 1_296_000) * AS2R
        two_terms = (2640.96e-6 * math.sin(om) + 63.52e-6 * math.sin(2 * om)) * AS2R
        worst["complementaryBeyondTwoTerms"] = max(
            worst["complementaryBeyondTwoTerms"], abs(erfa.eect00(J2000, tt) - two_terms) / AS2R
        )
        epochs.append({
            "tt": tt,
            "ut1": ut1,
            "dpsi": dpsi / AS2R,
            "deps": deps / AS2R,
            "epsA": eps_a / AS2R,
            "ee2000B": ee_b / AS2R,
            "gast2000B": gast_b,
            "gst06a": gst06a,
            "gst00b": gst00b,
            "eclipticOfDate": [float(x) for x in rotation.ravel()],
        })
    tolerance = {
        "nutationArcsec": 1e-10,
        "meanObliquityArcsec": 1e-9,
        "equationOfEquinoxesArcsec": 5e-5,
        "gast2000BArcsec": 5e-5,
        "gastGst06aArcsec": float(f"{worst['gast2000BMinusGst06a'] + 5e-5:.3g}"),
        "rotationArcsec": 5e-6,
    }
    out = {
        "description": (
            "ERFA references for src/nutation.ts and src/frame.ts at 101 TT instants 1800-2200. "
            "tt and ut1: days from J2000.0 on TT and UT1; dpsi, deps (nut00b) and epsA (obl06) in arcseconds; "
            "ee2000B = ee00(obl06, nut00b dpsi) in arcseconds; gast2000B = gmst06 + ee2000B, gst06a and gst00b in "
            "hours; eclipticOfDate: the "
            "J2000 mean equator to the true ecliptic and equinox of date, Rz(-dpsi) Rx(epsA) P(bp06 rp), row-major."
        ),
        "generator": "docs/evidence/nutation-2026-09-29/tools/erfa_fixtures.py",
        "pyerfa": erfa.__version__,
        "erfa": erfa.version.erfa_version,
        "tolerance": tolerance,
        "erfaInternalArcsec": {key: float(f"{value:.3g}") for key, value in worst.items()},
        "epochs": epochs,
    }
    return json.dumps(out, separators=(",", ":")) + "\n", worst


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text, worst = build()
    print(json.dumps({key: f"{value:.3g}" for key, value in worst.items()}), file=sys.stderr)
    if args.check:
        if OUTPUT.read_text() != text:
            sys.exit(f"{OUTPUT} differs from a rebuild")
        print("unchanged", file=sys.stderr)
        return
    OUTPUT.write_text(text)


if __name__ == "__main__":
    main()
