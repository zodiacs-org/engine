#!/usr/bin/env python3
"""Rebuild independent synthetic checks of Odeh's lunar crescent criterion.

Only Python standard-library Decimal and integer arithmetic are used. The
published criterion and selected rounded boundaries are the reference, not an
ephemeris, the TypeScript implementation, or the paper's observation database.
"""

import argparse
import json
from datetime import datetime, timedelta
from decimal import Decimal, localcontext
from pathlib import Path


D = Decimal
OUTPUT = Path(__file__).resolve().parents[1] / "test/fixtures/odeh-reference.json"
SOURCE_URL = "https://astronomycenter.net/pdf/2006_cri.pdf"

# Inputs and tolerances were fixed before comparing any TypeScript result.
# Each tuple is (id, airless topocentric Moon altitude in degrees, airless
# topocentric Sun altitude in degrees, topocentric crescent width in arcminutes).
# These are invented criterion inputs, not observed or engine-derived positions.
SAMPLES = [
    ("unaided-region", "4", "-7", "0.5"),
    ("optical-and-possible-unaided-region", "3", "-5", "0.5"),
    ("optical-only-region", "1", "-4", "0.3"),
    ("below-optical-region", "0", "-4", "0.1"),
    ("negative-lunar-altitude", "-2", "-8", "0.4"),
    ("wide-crescent", "7", "-8", "0.9"),
    ("narrow-positive-width", "1", "-5", "0.000000000001"),
    ("zero-width", "0", "0", "0"),
    ("nonround-inputs", "2.718281", "-6.283185", "0.314159"),
]

# Selected numerical criterion boundaries, transcribed from the page image of
# Table V, printed p. 43. This is not Table VI's observational database.
PUBLISHED_BOUNDARIES = [
    {"widthArcmin": 0.1, "arcv1Deg": 5.6, "arcv2Deg": 8.5, "arcv3Deg": 12.2},
    {"widthArcmin": 0.5, "arcv1Deg": 3.2, "arcv2Deg": 6.2, "arcv3Deg": 9.8},
    {"widthArcmin": 0.9, "arcv1Deg": 1.0, "arcv2Deg": 4.0, "arcv3Deg": 7.6},
]


def category(v):
    for threshold, label in [("5.65", "A"), ("2", "B"), ("-0.96", "C")]:
        if v >= D(threshold):
            return label
    return "D"


def examples(precision):
    with localcontext() as context:
        context.prec = precision
        rows = []
        for identifier, moon_text, sun_text, width_text in SAMPLES:
            moon, sun, width = map(D, (moon_text, sun_text, width_text))
            arcv = moon - sun
            reference_arcv = (D("7.1651") - D("6.3226") * width
                              + D("0.7319") * width ** 2
                              - D("0.1018") * width ** 3)
            v = arcv - reference_arcv
            rows.append({
                "id": identifier,
                "sample": {
                    "moonAltitudeTopocentricDeg": float(moon),
                    "sunAltitudeTopocentricDeg": float(sun),
                    "crescentWidthTopocentricArcmin": float(width),
                },
                "expected": {
                    "arcOfVisionDeg": float(arcv),
                    "crescentWidthArcmin": float(width),
                    "referenceArcOfVisionDeg": float(reference_arcv),
                    "v": float(v),
                    "category": category(v),
                },
            })
        return rows


def boundary_examples():
    rows = []
    for text in ("5.65", "2", "-0.96"):
        threshold = D(text)
        for position, difference in (
            ("below", D("-1e-12")), ("equal", D(0)), ("above", D("1e-12")),
        ):
            v = threshold + difference
            rows.append({
                "id": f"{text}-{position}", "v": float(v), "category": category(v),
            })
    return rows


def best_time_examples():
    rows = []
    for identifier, sunset_text, lag in (
        ("exact-evening-fraction", "2002-03-04T18:00:00.000Z", 54 * 60 * 1000),
        ("crosses-utc-year", "2002-12-31T23:55:00.000Z", 27 * 60 * 1000),
        ("fractional-millisecond-down", "2002-03-04T18:00:00.000Z", 3),
        ("fractional-millisecond-up", "2002-03-04T18:00:00.000Z", 4),
        ("ordinary-lag-rounding", "2002-03-04T18:00:00.000Z", 3240002),
    ):
        sunset = datetime.fromisoformat(sunset_text.replace("Z", "+00:00"))
        # Nearest-integer rounding of the exact rational 4*lag/9. Integer
        # millisecond lags and an odd denominator cannot produce a half tie.
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
        "schema": "heliacal.odeh-reference.v1",
        "scope": "Criterion arithmetic on invented geometry and selected published boundaries, not sighting dates or predictive-performance evidence.",
        "source": {
            "author": "Mohammad Sh. Odeh",
            "title": "New Criterion for Lunar Crescent Visibility",
            "publication": "Experimental Astronomy 18 (2004), 39-64; Springer publication 2006",
            "doi": "10.1007/s10686-005-9002-5",
            "url": SOURCE_URL,
            "retrieved": "2026-10-15",
            "geometryLocator": "Printed p. 43, section 5: airless topocentric ARCV and topocentric W.",
            "criterionLocator": "Printed p. 61, equation (2), units and the four category intervals immediately below.",
            "publishedBoundaryLocator": "Printed p. 43, Table V, selected widths 0.1, 0.5 and 0.9 arcminutes.",
            "bestTimeLocator": "Printed p. 43, equation (1).",
            "sourceBasis": "Equation, category inequalities, units and selected criterion boundaries checked against rendered page images. No observational records, source program or publication prose is reproduced.",
        },
        "arithmetic": {
            "generator": "heliacal/scripts/build-odeh-reference.py",
            "method": "Original Python Decimal direct cubic evaluation; output unchanged at 70 and 90 significant decimal digits. Exact integer rational arithmetic for the evening best time.",
            "inputBasis": "Invented airless topocentric altitudes and directly supplied crescent width in arcminutes. No elongation-to-width formula is inferred. Sunset and moonset instants are invented.",
        },
        "tolerance": {
            "declaredBeforeImplementationComparison": True,
            "numericAbsolute": 1e-12,
            "publishedBoundaryAbsoluteDeg": 0.05,
            "bestTimeMilliseconds": 0,
            "basis": "The numeric gate checks formula arithmetic only. Table V values are printed to 0.1 degree, so half that printed unit is allowed for its boundary comparison. Exact category intervals and millisecond rounding are separate checks; no observational or ephemeris uncertainty is inferred.",
        },
        "criterionCases": higher_precision,
        "categoryCases": boundary_examples(),
        "publishedBoundaries": PUBLISHED_BOUNDARIES,
        "bestTimeCases": best_time_examples(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify committed bytes without writing")
    arguments = parser.parse_args()
    encoded = json.dumps(build(), indent=2, ensure_ascii=True) + "\n"
    if arguments.check:
        if OUTPUT.read_text(encoding="utf-8") != encoded:
            raise SystemExit("Odeh reference fixture differs; regenerate with this script")
        print("Odeh reference fixture matches independent Decimal arithmetic")
    else:
        OUTPUT.write_text(encoded, encoding="utf-8")
        print(f"Wrote {OUTPUT.name}")


if __name__ == "__main__":
    main()
