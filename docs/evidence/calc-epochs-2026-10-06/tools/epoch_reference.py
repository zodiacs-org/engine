#!/usr/bin/env python3
"""ERFA's side of the comparison for a caller's ayanamsa carried by precession.

  python3 epoch_reference.py ENGINE_ROWS > ../results/epochs.json
  python3 epoch_reference.py ENGINE_ROWS --fixture ../../../../src/fixtures/ayanamsa-epochs.json
  python3 epoch_reference.py FAR_ROWS --far > ../results/far-epochs.json

Reads the engine's mean ayanamsas that engine_epochs.mjs wrote and compares
each with ERFA's construction of the same definition at the same binary
instant: the Vedic evidence's `equinox_longitude`
(../../vedic-2026-09-28/tools/reference_values.py: ERFA bp06 for IAU 2006,
prec76 and obl80 for IAU 1976, Kinoshita's table for Newcomb), combined as its
`epoch_ayanamsa` combines it, with the value added and the result reduced to
(-180, 180] in rational arithmetic, so that the combination adds no rounding
of its own to ERFA's. The rate is the central difference over the two
instants the engine used, on both sides. Nothing here imports or runs the
engine, and no Swiss Ephemeris code or value is used.

It reports, for each precession model and for epochs inside and outside
CALC_SPAN (1800-01-01 to 2200-01-01, read on TT), the comparisons and the
largest difference of the mean and of its rate, with the row that holds it.
With --fixture it writes, instead, the rows src/calc-sidereal.test.ts
repeats: each model's largest rows outside the span and the corners of
EPHEMERIS_SPAN, with ERFA's mean at the instant calc used and its rate over
the two either side. With --far it reads far_epochs.mjs's rows, from epochs
beyond EPHEMERIS_SPAN, and gives the largest difference for each epoch.
"""
import argparse
import json
import sys
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "vedic-2026-09-28" / "tools"))
import erfa  # noqa: E402
import reference_values as R  # noqa: E402

J2000 = 2_451_545.0
SPAN_FROM = 2_378_496.5   # 1800-01-01T00:00, read on TT as the engine reads it
SPAN_TO = 2_524_593.5     # 2200-01-01T00:00
FAR = 730_000             # EPHEMERIS_SPAN, days of TT from J2000.0
STEP = 0.001
F360 = Fraction(360)
F180 = Fraction(180)

_hold = {}


def reduce(x):
    """x reduced to (-180, 180], exactly."""
    r = x - F360 * round(x / F360)
    if r > F180:
        r -= F360
    elif r <= -F180:
        r += F360
    return r


def reference(value, t0, model, t):
    """ERFA's mean ayanamsa in degrees, a Fraction: value + (hold - L(t0; t)) / 3600, reduced."""
    key = (model, t0)
    if key not in _hold:
        _hold[key] = Fraction(R.equinox_longitude("engine", t0, J2000)) - Fraction(R.equinox_longitude(model, t0, J2000))
    longitude = Fraction(R.equinox_longitude("engine", t0, t))
    return reduce(Fraction(value) + (_hold[key] - longitude) / 3600)


def band(t0):
    return "inside" if SPAN_FROM <= t0 < SPAN_TO else "outside"


rowbook = {}


def compare(rows):
    worst = {}
    counts = {}
    for model, value, t0, _, t, mean, tp, mp, tm, mm in rows:
        key = (model, band(t0))
        counts[key] = counts.get(key, 0) + 1
        position = abs(reduce(Fraction(mean) - reference(value, t0, model, t))) * 3600
        dt = Fraction(tp) - Fraction(tm)
        rate_engine = reduce(Fraction(mp) - Fraction(mm)) / dt
        rate_ref = reduce(reference(value, t0, model, tp) - reference(value, t0, model, tm)) / dt
        rate = abs(rate_engine - rate_ref) * 3600
        for quantity, difference in (("position", position), ("rate", rate)):
            entry = worst.setdefault(key, {})
            if quantity not in entry or difference > entry[quantity][0]:
                entry[quantity] = (difference, [model, value, t0, t])
            rowbook[(model, value, t0, t)] = (model, value, t0, _, t, tp, tm)
    return counts, worst


def fixture_rows(rows, worst):
    """
    The test's rows, epochs outside CALC_SPAN only: each model's largest
    differences, and the corners of the epochs and instants. Each keeps the
    Julian date asked for and the three TT instants calc used, which the test
    checks it uses again, and ERFA's mean at the first and rate over the other
    two, so that the test repeats this comparison exactly.
    """
    chosen = set()
    for (model, where), entry in worst.items():
        if where == "outside":
            for _, row in entry.values():
                chosen.add(tuple(row))
    asked = sorted({row[3] for row in rows})
    for row in rows:
        model, value, t0, jd, t = row[:5]
        if value == 23.85 and t0 in (J2000 - FAR, J2000 + FAR) and jd in (asked[0], asked[-1]):
            chosen.add((model, value, t0, t))
    out = []
    for key in sorted(chosen):
        model, value, t0, jd, t, tp, tm = rowbook[key]
        mean = reference(value, t0, model, t)
        rate = reduce(reference(value, t0, model, tp) - reference(value, t0, model, tm)) / (Fraction(tp) - Fraction(tm))
        out.append({"model": model, "value": value, "epoch": t0, "jd": jd, "jdTt": [t, tp, tm], "mean": float(mean), "rate": float(rate)})
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("engine_rows")
    parser.add_argument("--fixture")
    parser.add_argument("--far", action="store_true")
    args = parser.parse_args()
    engine = json.loads(Path(args.engine_rows).read_text())
    rows = engine["rows"]
    if args.far:
        largest = {}
        for model, t0, t, mean in rows:
            difference = abs(reduce(Fraction(mean) - reference(0, t0, model, t))) * 3600
            key = f"{model} {t0!r}"
            largest[key] = max(largest.get(key, 0), difference)
        print(json.dumps({
            "generator": "docs/evidence/calc-epochs-2026-10-06/tools/epoch_reference.py --far",
            "erfa": f"pyerfa {erfa.__version__}",
            "units": "the largest difference at three instants, 1800 to 2199, in arcseconds; epochs as TT Julian dates",
            "largest": {key: float(value) for key, value in largest.items()},
        }, indent=1))
        return
    counts, worst = compare(rows)
    if args.fixture:
        Path(args.fixture).write_text(json.dumps({
            "generator": "docs/evidence/calc-epochs-2026-10-06/tools/epoch_reference.py --fixture",
            "erfa": f"pyerfa {erfa.__version__}",
            "units": "epochs and instants as TT Julian dates; mean in degrees, rate in degrees a day, ERFA's",
            "rows": fixture_rows(rows, worst),
        }, indent=1) + "\n")
        return
    out = {
        "generator": "docs/evidence/calc-epochs-2026-10-06/tools/epoch_reference.py",
        "erfa": f"pyerfa {erfa.__version__}",
        "units": "differences in arcseconds and arcseconds a day; epochs and instants as TT Julian dates",
        "comparisons": len(rows),
        "bands": {
            f"{model}/{where}": {
                "comparisons": counts[(model, where)],
                "position": {"largest": float(entry["position"][0]), "row": entry["position"][1]},
                "rate": {"largest": float(entry["rate"][0]), "row": entry["rate"][1]},
            }
            for (model, where), entry in sorted(worst.items())
        },
    }
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
