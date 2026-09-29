#!/usr/bin/env python3
"""The engines' longitudes and angles against ERFA, before and after the full
IAU 2000B nutation. Statistics only.

  python3 erfa-compare.py "$WORK/erfa-dump.jsonl" > results/erfa-frame.json

For each instant erfa-dump.mjs wrote, ERFA (pyerfa) turns the same
astronomy-engine vectors both engines turn to the true ecliptic and equinox of
date, Rz(-dpsi) Rx(epsA) P, with P the IAU 2006 precession of bp06, epsA from
obl06, and dpsi from one of two nutation models:

- "2000A": nut06a, the IAU 2006/2000A chain, ERFA's most precise;
- "2000B": nut00b, the model the engine now transcribes.

A body's reference longitude is that of its own vector, so the comparison
isolates the rotation to the ecliptic of date (precession and nutation) from
the series that give the vectors. The true node's is that of the Moon's orbital
angular momentum. For the angles, ERFA gives the sidereal time (gst06a for
2000A; gmst06 plus ee00 on obl06 and nut00b for 2000B) and the true obliquity
(obl06 plus the model's deps), at the chart's UT1 and TT, and the ascendant and
midheaven follow from the textbook formulas, the ascendant taken on the
eastern horizon as the engine takes it.

rc15 is 0.1.1-rc.15 as carried, with astronomy-engine's five-term nutation;
build is this tree.
"""
import json
import math
import sys

import erfa
import numpy as np

J2000 = 2_451_545.0
ARCSEC = 180 * 3600 / math.pi
BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node"]


def wrap_arcsec(degrees):
    return ((degrees + 180) % 360 - 180) * 3600


def ascendant(ramc, eps, phi):
    lam = math.atan2(math.cos(ramc), -(math.sin(ramc) * math.cos(eps) + math.tan(phi) * math.sin(eps)))
    alpha = math.atan2(math.sin(lam) * math.cos(eps), math.cos(lam))
    if math.sin(ramc - alpha) > 0:
        lam += math.pi
    return math.degrees(lam) % 360


def midheaven(ramc, eps):
    return math.degrees(math.atan2(math.sin(ramc), math.cos(ramc) * math.cos(eps))) % 360


def stats(values):
    a = np.sort(np.abs(np.array(values)))
    q = lambda p: float(a[min(len(a) - 1, int(p * len(a)))])
    sig = lambda x: float(f"{x:.4g}")
    return {"n": int(len(a)), "p50": sig(q(0.5)), "p95": sig(q(0.95)), "p99": sig(q(0.99)), "max": sig(float(a[-1]))}


def main():
    diffs = {}
    add = lambda key, value: diffs.setdefault(key, []).append(value)
    first = last = None
    for line in open(sys.argv[1]):
        row = json.loads(line)
        tt, ut1 = row["tt"], row["ut1"]
        first = tt if first is None else first
        last = tt
        _, rp, _ = erfa.bp06(J2000, tt)
        eps_a = erfa.obl06(J2000, tt)
        models = {"2000A": erfa.nut06a(J2000, tt), "2000B": erfa.nut00b(J2000, tt)}
        gast = {
            "2000A": erfa.gst06a(J2000, ut1, J2000, tt),
            "2000B": erfa.gmst06(J2000, ut1, J2000, tt) + erfa.ee00(J2000, tt, eps_a, models["2000B"][0]),
        }
        for model, (dpsi, deps) in models.items():
            rotation = erfa.rz(-dpsi, erfa.rx(eps_a, rp))
            reference = {}
            for body, v in row["vectors"].items():
                e = rotation @ np.array(v)
                reference[body] = math.degrees(math.atan2(e[1], e[0]))
            h = rotation @ np.array(row["node"])
            reference["North Node"] = math.degrees(math.atan2(h[0], -h[1]))
            eps = eps_a + deps
            ramc = gast[model] + math.radians(row["longitude"])
            asc = ascendant(ramc, eps, math.radians(row["latitude"]))
            mc = midheaven(ramc, eps)
            for engine in ("rc15", "build"):
                result = row[engine]
                for body in BODIES:
                    add((engine, model, body), wrap_arcsec(result["bodies"][body][0] - reference[body]))
                add((engine, model, "ascendant"), wrap_arcsec(result["asc"] - asc))
                add((engine, model, "midheaven"), wrap_arcsec(result["mc"] - mc))
        # Latitudes do not depend on the nutation; the two engines should agree.
        for body in BODIES[:-1]:
            add(("build", "rc15", "latitude"), (row["build"]["bodies"][body][1] - row["rc15"]["bodies"][body][1]) * 3600)
            add(("build", "rc15", "longitude"), wrap_arcsec(row["build"]["bodies"][body][0] - row["rc15"]["bodies"][body][0]))
    out = {
        "pyerfa": erfa.__version__,
        "erfa": erfa.version.erfa_version,
        "numpy": np.__version__,
        "instants": len(diffs[("rc15", "2000A", "Sun")]),
        "ttDaysFromJ2000": [first, last],
        "unit": "arcseconds, |engine - ERFA| (absolute values)",
        "engines": {"rc15": "0.1.1-rc.15 as carried (astronomy-engine's five nutation terms)", "build": "this tree (IAU 2000B, 77 terms)"},
        "againstErfa": {},
        "buildMinusRc15": {"longitude": stats(diffs[("build", "rc15", "longitude")]), "latitude": stats(diffs[("build", "rc15", "latitude")])},
    }
    for (engine, model, key), values in diffs.items():
        if engine == "build" and model == "rc15":
            continue
        out["againstErfa"].setdefault(model, {}).setdefault(key, {})[engine] = stats(values)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
