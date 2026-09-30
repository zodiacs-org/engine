#!/usr/bin/env python3
"""Independent reference values for the ayanamsas; writes src/vedic/fixtures/ayanamsa-reference.json.

  python3 reference_values.py [--check]      (needs numpy and pyerfa)

Nothing here imports or runs the engine, and no Swiss Ephemeris code or
values are used. `src/vedic/ayanamsa.test.ts` checks the engine against the
file this writes; `--check` rebuilds it in memory and fails if the committed
file differs.

What is computed, with which sources:

- The older precession models: IAU 1976 with the IAU 1980 obliquity (ERFA
  prec76, obl80), and Newcomb's as H. Kinoshita gives it (SAO Special Report
  364, 1975, table 3; tropical centuries from B1850.0) with Newcomb's
  obliquity, written here as rotation matrices.
- The engine's precession, IAU 2006, from ERFA (bp06, obl06).
- Epoch ayanamsas (Lahiri, Fagan-Bradley, Krishnamurti, and user-defined
  ones): the value A0 at t0 in the definition's own model is carried to
  J2000.0 in that model, and from J2000.0 by IAU 2006 measured on the mean
  ecliptic of t0:  A(t) = A0 - L_M(t0; J2000) + L_06(t0; J2000) - L_06(t0; t),
  where L_M(t0; t) is the longitude of the mean equinox of t on the mean
  ecliptic of t0, from the mean equinox of t0, in model M.
- Star ayanamsas: ERFA pmsafe (catalogue epoch to J2000.0), apcg13 and
  atciq (space motion, parallax, light deflection, aberration; GCRS) and
  ecm06 (to the mean ecliptic and equinox of date, IAU 2006), with the same
  catalogue values as the engine. Instants with the star within 5 degrees of
  the Sun are left out.
- The Indian Astronomical Ephemeris for 2027 (Positional Astronomy Centre,
  Kolkata, 2026; downloaded from packolkata.imd.gov.in): its mean ayanamsas
  for 2027.0 and 2028.0 and its table of true ayanamsas at 0h TT every three
  days (p. 423), transcribed below, with the IAU 2000A nutation (ERFA nut06a)
  that reproduces the table, so that the test can compare mean values.
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
OUTPUT = ROOT / "src/vedic/fixtures/ayanamsa-reference.json"

AS2R = math.pi / 648_000
DJM0 = 2_400_000.5
J2000 = 2_451_545.0
B1850 = 2_396_758.20358095
TROPICAL_CENTURY = 36_524.2198781
X = np.array([1.0, 0.0, 0.0])


def r1(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, s], [0, -s, c]])


def r2(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]])


def r3(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]])


def newcomb_matrix(jd_from, jd_to):
    """Kinoshita (1975) table 3: mean equator and equinox of jd_from to those of jd_to."""
    t = (jd_from - B1850) / TROPICAL_CENTURY
    th = (jd_to - jd_from) / TROPICAL_CENTURY
    mu_plus_rho = (0.79236 + 0.000656 * t) * th ** 2 + 0.000328 * th ** 3        # less 180 deg
    mu_minus_rho = ((4607.1096 + 2.79440 * t + 0.000118 * t * t) * th
                    + (1.39720 + 0.000118 * t) * th ** 2 + 0.036320 * th ** 3)
    j = ((2005.1125 - 0.85294 * t - 0.000365 * t * t) * th
         + (-0.42647 - 0.000365 * t) * th ** 2 - 0.041802 * th ** 3)
    zeta = (mu_minus_rho - mu_plus_rho) / 2 * AS2R
    z = (mu_minus_rho + mu_plus_rho) / 2 * AS2R
    return r3(-z) @ r2(j * AS2R) @ r3(-zeta)


def newcomb_obliquity(jd):
    t = (jd - B1850) / TROPICAL_CENTURY
    return (84_451.68 - 46.837 * t - 0.008752 * t * t + 0.00183 * t ** 3) * AS2R


def iau1976_matrix(jd_from, jd_to):
    zeta, z, theta = erfa.prec76(DJM0, jd_from - DJM0, DJM0, jd_to - DJM0)
    return r3(-z) @ r2(theta) @ r3(-zeta)


def iau2006_matrix(jd_from, jd_to):
    """Mean equator and equinox of jd_from to those of jd_to, through J2000.0 (ERFA bp06)."""
    return erfa.bp06(DJM0, jd_to - DJM0)[1] @ erfa.bp06(DJM0, jd_from - DJM0)[1].T


MODELS = {
    "newcomb": (newcomb_matrix, newcomb_obliquity),
    "iau1976": (iau1976_matrix, lambda jd: erfa.obl80(DJM0, jd - DJM0)),
    "engine": (iau2006_matrix, lambda jd: erfa.obl06(DJM0, jd - DJM0)),
}


def equinox_longitude(model, t0, t):
    """Longitude (arcsec) of the mean equinox of t on the mean ecliptic of t0, from the mean equinox of t0."""
    matrix, obliquity = MODELS[model]
    v = r1(obliquity(t0)) @ matrix(t, t0) @ X
    return math.atan2(v[1], v[0]) / AS2R


def epoch_ayanamsa(value_deg, t0, model, t):
    """The engine's construction for an epoch definition, in degrees."""
    hold = equinox_longitude("engine", t0, J2000) - equinox_longitude(model, t0, J2000)
    return value_deg + (hold - equinox_longitude("engine", t0, t)) / 3600


LAHIRI_EPOCH = 2_435_553.5          # 1956-03-21 0h TT
DPSI80_LAHIRI = erfa.nut80(DJM0, LAHIRI_EPOCH - DJM0)[0] / AS2R
EPOCHS = {
    # name: (t0 TT, mean value at t0 in degrees, model)
    "lahiri": (LAHIRI_EPOCH, 23 + 15 / 60 + (0.658 - DPSI80_LAHIRI) / 3600, "iau1976"),
    "fagan-bradley": (2_433_282.42345905, 24 + 2 / 60 + 31.36 / 3600, "newcomb"),
    "krishnamurti": (2_415_020.5, 22.363889, "newcomb"),
}
USER = {
    # userAyanamsa inputs (epoch TT, value, model) the test builds with the same numbers
    "user-engine-b1950": (2_433_282.5, 23.15, "engine"),
    "user-newcomb-j1900": (2_415_020.0, 22.46, "newcomb"),
    "user-iau1976-1956": (LAHIRI_EPOCH, 23.25, "iau1976"),
}
# 0h TT unless stated: 1800-01-01, 1850-06-01, 1900-01-01, B1950.0, 1956-03-21,
# 1975-07-01, J2000.0 (12h), 2026-09-28, 2050-01-01, 2100-03-01, 2150-06-15, 2199-12-31.
DATES = [2_378_496.5, 2_396_899.5, 2_415_020.5, 2_433_282.42345905, 2_435_553.5, 2_442_594.5,
         J2000, 2_461_311.5, 2_469_807.5, 2_488_128.5, 2_506_476.5, 2_524_592.5]

MAS = AS2R / 1000
HIPPARCOS_EPOCH = 2_448_349.0625    # J1991.25
STARS = {
    # name: (ra, dec deg; pm ra*cos dec, pm dec mas/yr; parallax mas; rv km/s; epoch TT; anchor deg)
    "true-chitra": (201.29835228, -11.16124494, -42.35, -30.67, 13.06, -3.31, HIPPARCOS_EPOCH, 180.0),
    "true-revati": (18.43250842, 7.57548938, 145.00, -55.69, 18.76, 15.0, HIPPARCOS_EPOCH, 359 + 50 / 60),
    "true-pushya": (131.17129191, 18.15486373, -17.67, -229.26, 24.98, 17.14, HIPPARCOS_EPOCH, 106.0),
    "galactic-center": (266.416816625, -(29 + 28.1699 / 3600), -3.151, -5.547, 0.0, 0.0, J2000, 240.0),
}


def star_ayanamsa(spec, jd_tt):
    """Mean ayanamsa (degrees) and the star's elongation from the Sun (degrees) at one TT instant."""
    ra, dec, pma, pmd, plx, rv, epoch, anchor = spec
    ra, dec = math.radians(ra), math.radians(dec)
    pmr = pma * MAS / math.cos(dec)            # ERFA takes dRA/dt
    pmdr = pmd * MAS
    px = plx / 1000                            # arcsec
    if epoch != J2000:
        ra, dec, pmr, pmdr, px, rv = erfa.pmsafe(ra, dec, pmr, pmdr, px, rv, epoch, 0.0, J2000, 0.0)
    astrom = erfa.apcg13(DJM0, jd_tt - DJM0)
    ri, di = erfa.atciq(ra, dec, pmr, pmdr, px, rv, astrom)
    rm = erfa.ecm06(DJM0, jd_tt - DJM0)
    e = rm @ erfa.s2c(ri, di)
    longitude = math.degrees(math.atan2(e[1], e[0]))
    sun = -np.array(erfa.epv00(DJM0, jd_tt - DJM0)[0]["p"])  # heliocentric Earth, reversed
    elongation = math.degrees(math.acos(float(np.dot(sun, erfa.s2c(ri, di)) / np.linalg.norm(sun))))
    return ((longitude - anchor + 180) % 360) - 180, elongation


STAR_DATES = [2_378_496.5 + k * 3_653.3 for k in range(41)]   # about every ten years, 1800-2200

# The Indian Astronomical Ephemeris for 2027, p. 423: "True ayanamsa for 5h 29m" IST, which is
# 0h TT to within 10 s, every three days from 2027 January 1 to 2028 April 25. Each entry is the
# arcseconds past 24°14′00″, as printed (0.1″).
IAE_2027_TRUE = """
13.9 14.5 15.3 16.0 16.3 16.5 17.2 18.2 18.7 18.9 19.3 20.0 20.6 20.8 20.9 21.4 22.2 22.7 22.7 23.0
23.6 24.1 24.2 24.2 24.5 25.3 25.7 25.7 25.9 26.4 26.9 27.1 27.1 27.4 28.2 28.7 28.8 29.0 29.5 30.2
30.5 30.6 30.9 31.8 32.5 32.7 32.9 33.6 34.3 34.8 35.0 35.4 36.3 37.2 37.5 37.8 38.5 39.3 39.8 40.1
40.5 41.3 42.2 42.6 42.9 43.5 44.3 44.8 45.0 45.2 45.9 46.8 47.2 47.3 47.8 48.5 48.9 49.0 49.1 49.7
50.4 50.7 50.8 51.1 51.7 52.1 52.2 52.2 52.6 53.3 53.6 53.6 53.9 54.5 54.9 55.1 55.1 55.5 56.2 56.7
56.7 57.1 57.8 58.3 58.6 58.7 59.2 60.1 60.7 60.9 61.3 62.1 62.8 63.2 63.5 64.0 65.0 65.7 66.0 66.5
67.3 68.1 68.5 68.8 69.2 70.1 70.9 71.2 71.6 72.3 73.0 73.4 73.5 73.8 74.5 75.3 75.5 75.7 76.2 76.8
77.1 77.2 77.3 77.8 78.5 78.7 78.7 79.2 79.7 80.0 80.0 80.1 80.6 81.2 81.5 81.5 82.0 82.6 83.0 83.0
83.2
"""
IAE_2027_FIRST = 2_461_406.5        # 2027-01-01 0h TT
# p. 423: "Mean Ayanamsa = 24°14′03″.22 + precession from 2027.0 to date", and 24°14′53″.48 from
# 2028.0. The epochs are January 0.0 TT (the polynomial the edition states on p. 382 gives both
# values to 0.01″ there, and no other reading of "2027.0" does).
IAE_2027_MEAN = [(2_461_405.5, 24 * 3600 + 14 * 60 + 3.22), (2_461_770.5, 24 * 3600 + 14 * 60 + 53.48)]


def build():
    out = {
        "generator": "docs/evidence/vedic-2026-09-28/tools/reference_values.py",
        "erfa": f"pyerfa {erfa.__version__}",
        "units": "Julian dates in TT; ayanamsas in degrees unless named Arcsec",
        "lahiriDpsi1980Arcsec": round(DPSI80_LAHIRI, 9),
        "j2000": {},
        "epoch": [],
        "user": [],
        "stars": [],
        "iae2027": {"source": "Indian Astronomical Ephemeris 2027, pp. 382 and 423",
                    "meanArcsec": [[jd, value] for jd, value in IAE_2027_MEAN], "true": []},
    }
    for name, (t0, a0, model) in EPOCHS.items():
        out["j2000"][name] = round(a0 - equinox_longitude(model, t0, J2000) / 3600, 12)
        for t in DATES:
            out["epoch"].append([name, t, round(epoch_ayanamsa(a0, t0, model, t), 12)])
    for name, (t0, a0, model) in USER.items():
        for t in [t0, *DATES]:
            out["user"].append([name, t0, a0, model, t, round(epoch_ayanamsa(a0, t0, model, t), 12)])
    for name, spec in STARS.items():
        for t in STAR_DATES:
            value, elongation = star_ayanamsa(spec, t)
            if elongation > 5:
                out["stars"].append([name, round(t, 6), round(value, 12)])
    values = [float(v) for v in IAE_2027_TRUE.split()]
    for k, seconds in enumerate(values):
        jd = IAE_2027_FIRST + 3 * k
        dpsi = erfa.nut06a(DJM0, jd - DJM0)[0] / AS2R
        out["iae2027"]["true"].append([jd, 24 * 3600 + 14 * 60 + seconds, round(dpsi, 6)])
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
