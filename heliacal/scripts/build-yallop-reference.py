#!/usr/bin/env python3
"""Rebuild synthetic checks of Yallop's published criterion, without an ephemeris.

Original Python Decimal arithmetic, including Taylor-series trigonometry, is
independent of the TypeScript implementation and JavaScript's binary64 math.
The only inputs from Yallop are the cited mathematical definitions. No source
program, observational table or prior output from this project is used.
"""

import argparse
import json
from datetime import datetime, timedelta
from decimal import Decimal, localcontext
from pathlib import Path


D = Decimal
OUTPUT = Path(__file__).resolve().parents[1] / "test/fixtures/yallop-reference.json"
SOURCE_URL = "https://webspace.science.uu.nl/~gent0113/islam/downloads/naotn_69.pdf"

# Inputs were chosen before comparing any result with the TypeScript library.
# Each geometry obeys |Moon altitude - Sun altitude| <= elongation. They are
# synthetic arithmetic cases, not observations or engine-derived positions.
SAMPLES = [
    ("clear-positive-altitude", "8", "-7", "16", "61"),
    ("near-zero-q", "4", "-7", "11", "60"),
    ("optical-finding-region", "3", "-7", "10", "58"),
    ("optical-only-region", "2", "-6.7", "9", "55"),
    ("below-optical-region", "1", "-7.2", "8.5", "61"),
    ("small-crescent", "1", "-5", "7", "54"),
    ("negative-lunar-altitude", "-3", "-10", "8", "60"),
    ("lunar-geocentric-horizon", "0", "-8", "9", "57"),
    ("tiny-positive-elongation", "0", "0", "0.0000001", "60"),
    ("zero-elongation", "0", "0", "0", "60"),
]


def arctangent(x):
    """Alternating power series for |x| < 1, rounded at the active precision."""
    power, total, index = x, x, 1
    while True:
        power *= -(x * x)
        next_total = total + power / (2 * index + 1)
        if next_total == total:
            return total
        total = next_total
        index += 1


def sine(x):
    term, total, index = x, x, 1
    while True:
        term *= -(x * x) / ((2 * index) * (2 * index + 1))
        next_total = total + term
        if next_total == total:
            return total
        total = next_total
        index += 1


def cosine(x):
    term, total, index = D(1), D(1), 1
    while True:
        term *= -(x * x) / ((2 * index - 1) * (2 * index))
        next_total = total + term
        if next_total == total:
            return total
        total = next_total
        index += 1


def category(q):
    for threshold, label in [
        ("0.216", "A"), ("-0.014", "B"), ("-0.160", "C"),
        ("-0.232", "D"), ("-0.293", "E"),
    ]:
        if q > D(threshold):
            return label
    return "F"


def examples(precision):
    with localcontext() as context:
        context.prec = precision
        # Machin's identity supplies pi without binary64 or a copied constant.
        pi = 16 * arctangent(D(1) / 5) - 4 * arctangent(D(1) / 239)
        radians_per_degree = pi / 180
        rows = []
        for identifier, moon, sun, elongation, parallax in SAMPLES:
            h, s, arcl, hp = map(D, (moon, sun, elongation, parallax))
            sd = D("0.27245") * hp
            sd_top = sd * (1 + sine(h * radians_per_degree)
                           * sine(hp / 60 * radians_per_degree))
            width = sd_top * (1 - cosine(arcl * radians_per_degree))
            arcv = h - s
            reference_arcv = (D("11.8371") - D("6.3226") * width
                              + D("0.7319") * width ** 2
                              - D("0.1018") * width ** 3)
            q = (arcv - reference_arcv) / 10
            rows.append({
                "id": identifier,
                "sample": {
                    "moonAltitudeGeocentricDeg": float(h),
                    "sunAltitudeGeocentricDeg": float(s),
                    "elongationGeocentricDeg": float(arcl),
                    "moonHorizontalParallaxArcmin": float(hp),
                },
                "expected": {
                    "arcOfVisionDeg": float(arcv),
                    "geocentricSemidiameterArcmin": float(sd),
                    "topocentricSemidiameterArcmin": float(sd_top),
                    "crescentWidthArcmin": float(width),
                    "referenceArcOfVisionDeg": float(reference_arcv),
                    "q": float(q),
                    "category": category(q),
                },
            })
        return rows


def boundary_examples():
    rows = []
    for text in ("0.216", "-0.014", "-0.160", "-0.232", "-0.293"):
        threshold = D(text)
        for position, difference in (
            ("below", D("-1e-12")), ("equal", D(0)), ("above", D("1e-12")),
        ):
            q = threshold + difference
            rows.append({
                "id": f"{text}-{position}",
                "q": float(q),
                "category": category(q),
            })
    return rows


def best_time_examples():
    rows = []
    for identifier, sunset_text, lag in (
        ("exact-evening-fraction", "2001-06-15T18:00:00.000Z", 81 * 60 * 1000),
        ("crosses-utc-midnight", "2001-12-31T23:50:00.000Z", 45 * 60 * 1000),
        ("fractional-millisecond-down", "2001-06-15T18:00:00.000Z", 1),
        ("fractional-millisecond-up", "2001-06-15T18:00:00.000Z", 2),
        ("ordinary-lag-rounding", "2001-06-15T18:00:00.000Z", 2700001),
    ):
        sunset = datetime.fromisoformat(sunset_text.replace("Z", "+00:00"))
        # Exact rational rounding. Denominator nine cannot produce a half tie.
        offset = (8 * lag + 9) // 18
        rows.append({
            "id": identifier,
            "sunset": sunset_text,
            "moonset": (sunset + timedelta(milliseconds=lag)).isoformat(
                timespec="milliseconds").replace("+00:00", "Z"),
            "expected": {
                "at": (sunset + timedelta(milliseconds=offset)).isoformat(
                    timespec="milliseconds").replace("+00:00", "Z"),
                "lagMilliseconds": lag,
                "offsetMilliseconds": offset,
            },
        })
    return rows


def build():
    lower_precision, higher_precision = examples(70), examples(90)
    if lower_precision != higher_precision:
        raise AssertionError("Reference output changed with Decimal precision")
    return {
        "schema": "heliacal.yallop-reference.v1",
        "scope": "Synthetic worked calculations of the published criterion, not observed sightings or predictive-performance evidence.",
        "source": {
            "author": "B. D. Yallop",
            "title": "A Method for Predicting the First Sighting of the New Crescent Moon",
            "publication": "HM Nautical Almanac Office, NAO Technical Note No. 69 (1997), updated April 1998",
            "url": SOURCE_URL,
            "retrieved": "2026-10-15",
            "geometryLocator": "Printed p. 1, section 2; p. 3, equations (3.8)-(3.10).",
            "qLocator": "Printed p. 11, section 6, equation (6.1); p. 12, Table 5 category intervals.",
            "bestTimeLocator": "Printed p. 4, section 4, equation (4.1).",
            "sourceBasis": "Formula and interval notation checked against page images. No paper text, program, table of observations or source-calculated values is reproduced.",
        },
        "arithmetic": {
            "generator": "heliacal/scripts/build-yallop-reference.py",
            "method": "Original Python standard-library Decimal power series for sin, cos and Machin pi; independent direct polynomial evaluation; output unchanged at 70 and 90 significant decimal digits.",
            "inputBasis": "Invented airless geocentric lunar/solar altitudes, geocentric angular separation and lunar horizontal parallax. Best-time inputs are invented sunset/moonset instants.",
        },
        "tolerance": {
            "declaredBeforeImplementationComparison": True,
            "numericAbsolute": 1e-12,
            "nonzeroWidthRelative": 1e-12,
            "bestTimeMilliseconds": 0,
            "basis": "Arithmetic-only gates for these inputs; relative width additionally checks cancellation at tiny positive elongation. Category and rounded time results are exact. No ephemeris or observational error allowance is inferred.",
        },
        "criterionCases": higher_precision,
        "categoryCases": boundary_examples(),
        "bestTimeCases": best_time_examples(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify committed bytes without writing")
    arguments = parser.parse_args()
    encoded = json.dumps(build(), indent=2, ensure_ascii=True) + "\n"
    if arguments.check:
        if OUTPUT.read_text(encoding="utf-8") != encoded:
            raise SystemExit("Yallop reference fixture differs; regenerate with this script")
        print("Yallop reference fixture matches independent Decimal arithmetic")
    else:
        OUTPUT.write_text(encoded, encoding="utf-8")
        print(f"Wrote {OUTPUT.name}")


if __name__ == "__main__":
    main()
