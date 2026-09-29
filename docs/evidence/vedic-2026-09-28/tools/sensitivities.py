#!/usr/bin/env python3
"""How much two input choices move the ayanamsas; writes results/sensitivities.json.

  python3 sensitivities.py      (needs numpy and pyerfa; does not run the engine)

1. Newcomb's precession in another formulation. The engine uses Kinoshita
   (1975, table 3). The Explanatory Supplement (1961) form, as in Meeus,
   Astronomical Algorithms (1998) eq. 21.2 and 22.2 (FK4 system, T from
   B1900.0), puts the Fagan-Bradley and Krishnamurti zodiacs at J2000.0
   elsewhere by the amounts printed.
2. The catalogue. The star ayanamsas use the Hipparcos new reduction
   (van Leeuwen 2007, VizieR I/311). Gaia EDR3 (VizieR I/350) has zeta Psc A
   and delta Cnc (Spica is too bright for it); SIMBAD's Gaia values,
   propagated by SIMBAD to J2000.0 (queried 2026-09-28), move True Revati and
   True Pushya by the amounts printed over 1800-2200.
"""
import json
import math
from pathlib import Path

import numpy as np

from reference_values import (AS2R, EPOCHS, J2000, STARS, equinox_longitude, r1, r2, r3, star_ayanamsa)

HERE = Path(__file__).resolve().parent
B1900 = 2_415_020.31352
TROPICAL_CENTURY = 36_524.2199


def es1961_matrix(jd_from, jd_to):
    """Newcomb's precession in the ES 1961 form: mean equator and equinox of jd_from to those of jd_to."""
    big_t = (jd_from - B1900) / TROPICAL_CENTURY
    t = (jd_to - jd_from) / TROPICAL_CENTURY
    zeta = (2304.250 + 1.396 * big_t) * t + 0.302 * t ** 2 + 0.018 * t ** 3
    z = zeta + 0.791 * t ** 2 + 0.001 * t ** 3
    theta = (2004.682 - 0.853 * big_t) * t - 0.426 * t ** 2 - 0.042 * t ** 3
    return r3(-z * AS2R) @ r2(theta * AS2R) @ r3(-zeta * AS2R)


def es1961_longitude(t0, backwards=False):
    """Longitude (arcsec) of the J2000.0 equinox on the mean ecliptic of t0, Newcomb in the ES 1961 form:
    precessing from J2000.0 to t0, or (backwards) from t0 to J2000.0 and inverting."""
    matrix = es1961_matrix(t0, J2000).T if backwards else es1961_matrix(J2000, t0)
    e = (t0 - 2_415_020.0) / 36_525
    obliquity = (84_428.26 - 46.845 * e - 0.0059 * e ** 2 + 0.00181 * e ** 3) * AS2R
    v = r1(obliquity) @ matrix @ np.array([1.0, 0.0, 0.0])
    return math.atan2(v[1], v[0]) / AS2R


GAIA = {
    # SIMBAD, from Gaia EDR3 (2020yCat.1350....0G), position at J2000.0; radial velocities as the engine's.
    "true-revati": (18.43285834319, 7.575359937449999, 142.693, -53.051, 24.4595, 15.0, J2000, 359 + 50 / 60),
    "true-pushya": (131.17124658768913, 18.154308069054167, -18.435, -227.813, 23.8271, 17.14, J2000, 106.0),
}
YEARS = {1800: 2_378_496.5, 1900: 2_415_020.5, 2000: 2_451_544.5, 2100: 2_488_069.5, 2200: 2_524_593.5}


def main():
    newcomb = {}
    for name in ("fagan-bradley", "krishnamurti"):
        t0 = EPOCHS[name][0]
        kinoshita = equinox_longitude("newcomb", t0, J2000)
        newcomb[name] = {"fromJ2000": round((kinoshita - es1961_longitude(t0)) * 1000, 2),
                         "fromEpochInverted": round((kinoshita - es1961_longitude(t0, backwards=True)) * 1000, 2)}
    catalogue = {}
    for name, gaia in GAIA.items():
        catalogue[name] = {str(year): round((star_ayanamsa(STARS[name], jd)[0] - star_ayanamsa(gaia, jd)[0]) * 3600, 3)
                           for year, jd in YEARS.items()}
    report = {
        "tool": "docs/evidence/vedic-2026-09-28/tools/sensitivities.py",
        "newcombKinoshitaMinusEs1961AtJ2000Mas": newcomb,
        "hipparcosMinusGaiaArcsec": catalogue,
    }
    (HERE.parent / "results/sensitivities.json").write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
