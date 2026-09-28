#!/usr/bin/env python3
"""How far the engine's declinations, and so its out-of-bounds margins, are from DE440s.

20,000 TT instants drawn uniformly from 1850-01-01 to 2150-01-01 (seeded), and
the three UTC instants the rc.13 review gave as wrong-sign flags. For the Sun,
the Moon and the eight planets it compares the engine's declination and bound
margin (engine-at-tt.mjs) with DE440s's apparent declination and margin
(apparent.py), each side against its own true obliquity of date. It also
compares the engine's true obliquity, astronomy-engine's e_tilt().tobl, with
obl06 + nut00b and obl06 + nut06a.

A flag disagrees with the reference only where the reference margin is smaller
than the engine's margin error, so the largest margin error seen for a body is
the margin beyond which its flag agreed with DE440s at every sampled instant.

Only statistics and the three examples are written.

usage: python declination-truth.py <dist/index.js> <de440s.bsp> <out.json>
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile

import erfa
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from apparent import ARCSEC, DE440s, parts  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]
EXAMPLES = [("2022-10-22T08:11:10.756Z", "Mars"), ("2029-10-09T13:02:38.126Z", "Venus"), ("2021-05-30T06:32:15.389Z", "Mercury")]
SAMPLES = 20000


def engine(dist, request):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
        json.dump(request, handle)
    try:
        output = subprocess.run(["node", os.path.join(HERE, "engine-at-tt.mjs"), dist, handle.name],
                                check=True, capture_output=True, text=True).stdout
    finally:
        os.unlink(handle.name)
    return json.loads(output)


def rows(result, body):
    return [next(row for row in instant["rows"] if row["body"] == body) for instant in result["instants"]]


def main():
    dist, kernel_path, out = sys.argv[1:4]
    start, end = (sum(erfa.cal2jd(year, 1, 1)) for year in (1850, 2150))
    jd = np.sort(np.random.default_rng(20260928).uniform(start, end, SAMPLES))
    result = engine(dist, {"jd_tt": [float(value) for value in jd]})
    kernel = DE440s(kernel_path)

    bodies = {}
    for body in BODIES:
        truth = kernel.body(body, jd)
        truth_margin = (np.abs(truth["dec"]) - truth["eps"]) * ARCSEC
        mine = rows(result, body)
        dec = np.radians([row["dec"] for row in mine])
        margin = np.array([row["margin"] for row in mine])
        dec_error = np.abs(dec - truth["dec"]) * ARCSEC
        margin_error = np.abs(margin - truth_margin)
        wrong = (margin > 0) != (truth_margin > 0)
        bodies[body] = {
            "declinationErrorArcsec": {"median": round(float(np.median(dec_error)), 3), "p99": round(float(np.percentile(dec_error, 99)), 3),
                                       "max": round(float(np.max(dec_error)), 3)},
            "maxMarginErrorArcsec": round(float(np.max(margin_error)), 3),
            "outOfBoundsShare": round(float(np.mean(truth_margin > 0)), 4),
            "signDisagreements": int(np.sum(wrong)),
            "maxAbsEngineMarginWhereSignDisagreesArcsec": round(float(np.max(np.abs(margin[wrong]))), 3) if np.any(wrong) else None,
        }

    one, two = parts(jd)
    base = erfa.obl06(one, two)
    tobl = np.radians([instant["trueObliquity"] for instant in result["instants"]])
    obliquity = {
        "againstObl06PlusNut00bMilliarcsec": round(float(np.max(np.abs(tobl - base - erfa.nut00b(one, two)[1])) * ARCSEC * 1000), 2),
        "againstObl06PlusNut06aMilliarcsec": round(float(np.max(np.abs(tobl - base - erfa.nut06a(one, two)[1])) * ARCSEC * 1000), 2),
    }

    examples = []
    at = engine(dist, {"utc": [utc for utc, _ in EXAMPLES]})
    for (utc, body), instant in zip(EXAMPLES, at["instants"]):
        row = next(row for row in instant["rows"] if row["body"] == body)
        truth = kernel.body(body, np.array([instant["jd_tt"]]))
        truth_margin = float((abs(truth["dec"][0]) - truth["eps"][0]) * ARCSEC)
        examples.append({"utc": utc, "body": body, "engineMarginArcsec": round(row["margin"], 3), "engineFlag": row["flag"],
                         "de440sMarginArcsec": round(truth_margin, 3), "de440sOutOfBounds": truth_margin > 0})

    with open(kernel_path, "rb") as handle:
        kernel_digest = hashlib.sha256(handle.read()).hexdigest()
    report = {
        "question": "How large is the engine's declination error, and so the margin within which its out-of-bounds flag can disagree with the sky?",
        "instrument": {"erfa": erfa.__version__, "numpy": np.__version__, "de440s": {"file": os.path.basename(kernel_path), "sha256": kernel_digest},
                       "engine": result["version"], "scripts": ["apparent.py", "declination-truth.py", "engine-at-tt.mjs"],
                       "samples": SAMPLES, "seed": 20260928, "span": "1850-01-01 to 2150-01-01 TT"},
        "bodies": bodies,
        "trueObliquity": obliquity,
        "reviewExamples": examples,
    }
    with open(out, "w") as handle:
        json.dump(report, handle, indent=2)
        handle.write("\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
