#!/usr/bin/env python3
"""Reduce held-out ICRF vectors with independent ERFA IAU 2006/2000A frames.

Read {"samples": [{"jdTt": number, "positionAu": [x, y, z]}]} from stdin.
Write a JSON object with reference metadata and reduced samples to stdout.
The caller must validate source conventions and isolate these epochs from
training. This tool neither fetches Horizons nor imports engine or fit code.

The input already includes Horizons receive light-time and stellar aberration.
Only a frame rotation is applied; no further aberration, light-time or
gravitational-deflection correction is added. Dates are TT Julian dates.

Primary API references, read 2026-10-15:
https://github.com/liberfa/erfa/blob/v2.0.1/src/pnm06a.c
https://github.com/liberfa/erfa/blob/v2.0.1/src/nut06a.c
https://github.com/liberfa/erfa/blob/v2.0.1/src/obl06.c
https://github.com/liberfa/erfa/blob/v2.0.1/src/rx.c
"""

import hashlib
import json
import math
from pathlib import Path
import sys

import erfa
import numpy as np


PINNED_VERSIONS = {
    "pyerfa": "2.0.1.5",
    "erfa": "2.0.1",
    "sofa": "20231011",
    "numpy": "2.2.6",
}
MAX_INPUT_BYTES = 1_999_999
MAX_SAMPLES = 4096
J2000 = 2451545.0


def check_versions():
    actual = {
        "pyerfa": erfa.__version__,
        "erfa": erfa.version.erfa_version,
        "sofa": erfa.version.sofa_version,
        "numpy": np.__version__,
    }
    if actual != PINNED_VERSIONS:
        raise ValueError("Reference dependency versions differ from the pinned recipe")
    return actual


def finite_number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a finite number")
    try:
        finite = math.isfinite(value)
    except OverflowError:
        finite = False
    if not finite:
        raise ValueError(f"{name} must be a finite number")
    return float(value)


def true_ecliptic_matrix(jd_tt):
    """ICRF-aligned axes to true ecliptic and equinox of the supplied TT date."""
    date1, date2 = J2000, jd_tt - J2000
    bias_precession_nutation = erfa.pnm06a(date1, date2)
    _, nutation_obliquity = erfa.nut06a(date1, date2)
    true_obliquity = erfa.obl06(date1, date2) + nutation_obliquity
    # ERFA rx left-multiplies the equatorial matrix by the obliquity rotation.
    return erfa.rx(true_obliquity, bias_precession_nutation)


def reduce_sample(sample):
    if not isinstance(sample, dict) or set(sample) != {"jdTt", "positionAu"}:
        raise ValueError("Each sample must contain only jdTt and positionAu")
    jd_tt = finite_number(sample["jdTt"], "jdTt")
    if not 0 < jd_tt <= 10_000_000:
        raise ValueError("jdTt is outside the reference tool's numerical input range")
    coordinates = sample["positionAu"]
    if not isinstance(coordinates, list) or len(coordinates) != 3:
        raise ValueError("positionAu must contain three numbers")
    vector = np.array([finite_number(value, "positionAu component") for value in coordinates])
    if np.any(np.abs(vector) > 1_000_000):
        raise ValueError("positionAu component exceeds the reference input limit")
    distance = math.hypot(*vector)
    if distance == 0:
        raise ValueError("positionAu must have nonzero length")
    rotated = erfa.rxp(true_ecliptic_matrix(jd_tt), vector)
    longitude, latitude = erfa.c2s(rotated)
    result = {
        "jdTt": jd_tt,
        "longitudeDeg": math.degrees(erfa.anp(longitude)),
        "latitudeDeg": math.degrees(latitude),
        "distanceAu": distance,
    }
    if not all(math.isfinite(value) for value in result.values()):
        raise ValueError("ERFA reduction produced a nonfinite result")
    return result


def reference_metadata():
    script = Path(__file__)
    requirements = script.with_name("requirements-reference.txt")
    return {
        "tool": "minorbodies-erfa-reference-v1",
        **check_versions(),
        "scriptSha256": hashlib.sha256(script.read_bytes()).hexdigest(),
        "requirementsSha256": hashlib.sha256(requirements.read_bytes()).hexdigest(),
        "frame": "ecliptic-true-of-date;IAU2006/2000A",
        "inputFrame": "ICRF-aligned-geocentric",
        "timeScale": "TT",
        "correctionsApplied": "rotation-only;input-already-LT+S;no-deflection",
        "formula": "rx(obl06+nut06a.deps,pnm06a) * positionAu",
    }


def reduce_document(document):
    if not isinstance(document, dict) or set(document) != {"samples"}:
        raise ValueError("Input must contain only samples")
    samples = document["samples"]
    if not isinstance(samples, list) or not 1 <= len(samples) <= MAX_SAMPLES:
        raise ValueError("samples must be a nonempty array within the reference sample limit")
    # Preserve the supplied ordering, including repetitions used in stencil groups.
    return {
        "schema": "minorbodies-erfa-reference-v1",
        "reference": reference_metadata(),
        "samples": [reduce_sample(sample) for sample in samples],
    }


def unique_fields(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def reject_constant(_):
    raise ValueError("JSON nonfinite constants are unsupported")


def parse_document(raw):
    if not isinstance(raw, bytes) or len(raw) > MAX_INPUT_BYTES:
        raise ValueError("Input exceeds the reference byte limit")
    return json.loads(raw.decode("utf-8"), object_pairs_hook=unique_fields, parse_constant=reject_constant)


def main():
    if len(sys.argv) != 1:
        raise ValueError("Read the reference JSON request from stdin; no arguments are supported")
    raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
    document = reduce_document(parse_document(raw))
    encoded = json.dumps(document, indent=2, ensure_ascii=True, allow_nan=False) + "\n"
    if len(encoded.encode("utf-8")) >= 2_000_000:
        raise ValueError("Output exceeds the reference byte limit")
    sys.stdout.write(encoded)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OverflowError, RecursionError) as error:
        print(f"reference-erfa: {error}", file=sys.stderr)
        sys.exit(1)
