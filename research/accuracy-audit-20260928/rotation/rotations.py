#!/usr/bin/env python3
"""Independent ERFA orientation transforms for already corrected geocentric vectors.

No ephemeris, light-time, aberration or NASA request is performed here.
Vectors are column vectors; input units are preserved. TT is a two-part JD.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import erfa
import numpy as np

VERSION_PIN = {"pyerfa": "2.0.1.5", "erfa": "2.0.1", "sofa_heritage": "20231011"}
ARCSEC_RAD = math.pi / (180 * 3600)
VARIANTS = ("fixed_j2000_iau2006", "fixed_j2000_obliquity_84381_448",
            "mean_of_date_iau2006", "true_of_date_iau2006_2000a")


def versions():
    actual = {"pyerfa": erfa.__version__, "erfa": erfa.version.erfa_version,
              "sofa_heritage": erfa.version.sofa_version}
    if actual != VERSION_PIN:
        raise RuntimeError(f"Expected {VERSION_PIN}; installed {actual}")
    return actual


def rx(angle):
    """Passive right-handed rotation, matching the SOFA row-matrix convention."""
    c, s = math.cos(angle), math.sin(angle)
    return np.array([[1, 0, 0], [0, c, s], [0, -s, c]], dtype=float)


def rz(angle):
    c, s = math.cos(angle), math.sin(angle)
    return np.array([[c, s, 0], [-s, c, 0], [0, 0, 1]], dtype=float)


def _date(tt_jd1, tt_jd2):
    if not math.isfinite(tt_jd1) or not math.isfinite(tt_jd2):
        raise ValueError("TT Julian-date parts must be finite")
    return float(tt_jd1), float(tt_jd2)


def orientation_matrices(tt_jd1, tt_jd2=0.0, *, input_frame="icrs"):
    """Return four named 3x3 transforms; no positional effects are added.

    input_frame='icrs': use ERFA ICRS/GCRS aligned axes with frame bias.
    input_frame='mean_j2000': the supplied coordinates already refer to the
    dynamical mean equator/equinox J2000, so cancel ERFA's initial frame bias.
    This option is a controlled convention comparison, not a new ephemeris.
    """
    versions()
    d1, d2 = _date(tt_jd1, tt_jd2)
    if input_frame not in ("icrs", "mean_j2000"):
        raise ValueError("input_frame must be 'icrs' or 'mean_j2000'")
    bias = np.asarray(erfa.pmat06(2451545.0, 0.0))
    input_to_icrs = np.eye(3) if input_frame == "icrs" else bias.T
    epsa = float(erfa.obl06(d1, d2))
    _, deps = erfa.nut06a(d1, d2)
    return {
        "fixed_j2000_iau2006": np.asarray(erfa.ecm06(2451545.0, 0.0)) @ input_to_icrs,
        "fixed_j2000_obliquity_84381_448": rx(84381.448 * ARCSEC_RAD) @ bias @ input_to_icrs,
        "mean_of_date_iau2006": np.asarray(erfa.ecm06(d1, d2)) @ input_to_icrs,
        "true_of_date_iau2006_2000a": rx(epsa + float(deps)) @ np.asarray(erfa.pnm06a(d1, d2)) @ input_to_icrs,
    }


def spherical(vector):
    values = np.asarray(vector, dtype=float)
    if values.shape != (3,) or not np.isfinite(values).all():
        raise ValueError("Expected three finite Cartesian components")
    radius = math.hypot(*values)
    if not math.isfinite(radius) or radius == 0:
        raise ValueError("A finite nonzero vector is required")
    horizontal = math.hypot(values[0], values[1])
    lon = math.degrees(math.atan2(values[1], values[0])) % 360
    if lon >= 360:
        lon = 0.0
    return {"longitude_deg": lon, "latitude_deg": math.degrees(math.atan2(values[2], horizontal)),
            "radius_input_units": radius, "longitude_defined": horizontal != 0}


def project_vector(vector, tt_jd1, tt_jd2=0.0, *, input_frame="icrs"):
    """Project one already geocentric vector into each conventional variant.

    Result is JSON serializable. Time must be observation TT, not emission
    TT or unlabelled TDB. Input light-time/aberration flags remain caller's
    responsibility and must accompany a report using this transformation.
    """
    source = np.asarray(vector, dtype=float)
    spherical(source)  # Validate before any matrix operation.
    matrices = orientation_matrices(tt_jd1, tt_jd2, input_frame=input_frame)
    projections = {}
    for name, matrix in matrices.items():
        rotated = matrix @ source
        projections[name] = {"vector": rotated.tolist(), **spherical(rotated)}
    return {"tt_jd_parts": [float(tt_jd1), float(tt_jd2)], "input_frame": input_frame,
            "input_vector": source.tolist(), "versions": versions(), "projections": projections}


def metadata(tt_jd1, tt_jd2=0.0, *, input_frame="icrs"):
    """Expose matrices and numerical orientation controls for an audit record."""
    d1, d2 = _date(tt_jd1, tt_jd2)
    dpsi, deps = erfa.nut06a(d1, d2)
    matrices = orientation_matrices(d1, d2, input_frame=input_frame)
    return {
        "versions": versions(), "tt_jd_parts": [d1, d2], "input_frame": input_frame,
        "mean_obliquity_rad": float(erfa.obl06(d1, d2)),
        "nutation_longitude_rad": float(dpsi), "nutation_obliquity_rad": float(deps),
        "matrix_sense": "output_column_vector = rotation_matrix @ input_column_vector",
        "units": "input Cartesian units preserved; spherical angles in degrees",
        "frame_note": "ICRS axes are treated as GCRS aligned axes for this rotation only; no relativistic BCRS/GCRS positional transformation is performed",
        "omitted_effects": ["ephemeris", "light time", "stellar aberration", "gravitational deflection", "parallax", "observer displacement", "time-scale conversion"],
        "matrices": {name: {"values": mat.tolist(), "determinant": float(np.linalg.det(mat)),
                            "max_orthogonality_residual": float(np.max(np.abs(mat @ mat.T - np.eye(3))))}
                     for name, mat in matrices.items()},
        "primary_sources": [
            "https://github.com/liberfa/erfa/blob/v2.0.1/src/ecm06.c",
            "https://github.com/liberfa/erfa/blob/v2.0.1/src/pmat06.c",
            "https://github.com/liberfa/erfa/blob/v2.0.1/src/pnm06a.c",
            "https://github.com/liberfa/erfa/blob/v2.0.1/src/nut06a.c",
            "https://github.com/liberfa/pyerfa/blob/v2.0.1.5/erfa/tests/test_ufunc.py",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True,
                        help="JSON with vector[3], tt_jd_parts[2] and optional input_frame")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    row = json.loads(args.input.read_text())
    d1, d2 = row["tt_jd_parts"]
    frame = row.get("input_frame", "icrs")
    result = {**project_vector(row["vector"], d1, d2, input_frame=frame),
              "orientation_metadata": metadata(d1, d2, input_frame=frame)}
    encoded = json.dumps(result, indent=2, allow_nan=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    else:
        print(encoded, end="")


if __name__ == "__main__":
    main()
