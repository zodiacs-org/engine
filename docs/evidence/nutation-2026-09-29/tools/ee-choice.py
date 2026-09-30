#!/usr/bin/env python3
"""Whether the equation of the equinoxes should carry the IAU 2000
complementary terms: three choices set beside ERFA. Statistics only.

  python3 ee-choice.py > results/ee-choice.json

The engine's apparent sidereal time is the IAU 2006 GMST (gmst06, which it
matches) plus Δψ cos εA plus whatever complementary terms it adds. Its Δψ is
nut00b's (src/nutation.test.ts: within 5.3e-15″) and its εA obl06's, so the
three choices are written here with ERFA's own nut00b and obl06, and the
engine is not run:

- none: GMST + Δψ cos εA, as astronomy-engine has it;
- one: plus 2640.96 µas sin Ω;
- two: plus 63.52 µas sin 2Ω (the engine's choice);

with Ω the linear IAU 2000B argument. Each is set beside:

- gst06a: IAU 2006/2000A, ERFA's most precise;
- gst00b: ERFA's IAU 2000B sidereal time, which uses the IAU 2000 GMST
  (gmst00) and reads UT1 as TT;
- "2000B on IAU 2006": gmst06 + ee00(obl06, nut00b's Δψ), which carries all
  33 complementary terms of IERS Conventions (2010) table 5.2e.

200,000 UT1 instants drawn uniformly from 1800-01-01 to 2200-01-01 (seed
20260929), with TT = UT1 + 69.184 s.
"""
import json
import math

import erfa
import numpy as np

AS = math.pi / 648_000


def wrap(x):
    return (x + math.pi) % (2 * math.pi) - math.pi


def stats(radians):
    mas = np.sort(np.abs(radians)) / AS * 1000
    return {"max": float(f"{mas[-1]:.4g}"), "p95": float(f"{np.quantile(mas, 0.95):.4g}"), "p50": float(f"{np.quantile(mas, 0.5):.4g}")}


def main():
    rng = np.random.default_rng(20260929)
    ut = np.sort(rng.uniform(2_378_496.5, 2_524_593.5, 200_000))
    tt = ut + 69.184 / 86_400
    t = (tt - 2_451_545.0) / 36_525
    dpsi, _ = erfa.nut00b(tt, 0.0)
    eps_a = erfa.obl06(tt, 0.0)
    gmst = erfa.gmst06(ut, 0.0, tt, 0.0)
    om = np.mod(450_160.398036 - 6_962_890.5431 * t, 1_296_000) * AS
    choices = {
        "none": gmst + dpsi * np.cos(eps_a),
        "one": gmst + dpsi * np.cos(eps_a) + 2640.96e-6 * AS * np.sin(om),
        "two": gmst + dpsi * np.cos(eps_a) + (2640.96e-6 * np.sin(om) + 63.52e-6 * np.sin(2 * om)) * AS,
    }
    references = {
        "gst06a": erfa.gst06a(ut, 0.0, tt, 0.0),
        "gst00b": erfa.gst00b(ut, 0.0),
        "2000B on IAU 2006": gmst + erfa.ee00(tt, 0.0, eps_a, dpsi),
    }
    out = {
        "pyerfa": erfa.__version__,
        "erfa": erfa.version.erfa_version,
        "instants": int(len(ut)),
        "span": "UT1 1800-01-01 to 2200-01-01; TT = UT1 + 69.184 s",
        "unit": "milliarcseconds, |choice - reference|",
        "choices": {name: {ref: stats(wrap(value - reference)) for ref, reference in references.items()} for name, value in choices.items()},
        "context": {
            "gst00bMinusGmst06PartAlone": stats(wrap(erfa.gmst00(ut, 0.0, ut, 0.0) - gmst)),
            "nut06aMinusNut00bTimesCosEps": stats((erfa.nut06a(tt, 0.0)[0] - dpsi) * np.cos(eps_a)),
            "eect00MinusTwoTerms": stats(erfa.eect00(tt, 0.0) - (2640.96e-6 * np.sin(om) + 63.52e-6 * np.sin(2 * om)) * AS),
        },
    }
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
