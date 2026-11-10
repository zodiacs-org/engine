#!/usr/bin/env python3
"""Write deterministic, independently calculated orientation matrices for cases."""
import argparse
import datetime as dt
import hashlib
import json
import math
from pathlib import Path

import erfa
import numpy as np

from rotations import metadata, orientation_matrices, versions

HERE = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--cases", type=Path, required=True)
    ap.add_argument("--output", type=Path, default=HERE / "rotation-matrices.json")
    args = ap.parse_args()
    raw = args.cases.read_bytes()
    cases = json.loads(raw)
    delta_t = cases["deltaTSeconds"]
    if not math.isfinite(delta_t):
        raise ValueError("A finite DeltaT is required")
    rows = []
    for utc in cases["instants"]:
        instant = dt.datetime.fromisoformat(utc.replace("Z", "+00:00"))
        if instant.tzinfo is None or instant.utcoffset() != dt.timedelta(0):
            raise ValueError("This matrix fixture generator requires an explicit zero UTC offset")
        base, mjd = erfa.cal2jd(instant.year, instant.month, instant.day)
        jd1 = float(base + mjd)
        jd2 = (instant.hour * 3600 + instant.minute * 60 + instant.second
               + instant.microsecond / 1e6 + delta_t) / 86400
        icrs = orientation_matrices(jd1, jd2, input_frame="icrs")
        mean_j2000 = orientation_matrices(jd1, jd2, input_frame="mean_j2000")
        mats = {
            "trueOfDateICRS": icrs["true_of_date_iau2006_2000a"],
            "meanOfDateICRS": icrs["mean_of_date_iau2006"],
            "fixedJ2000ICRS": icrs["fixed_j2000_iau2006"],
            "fixedJ2000Obliquity84381_448ICRS": icrs["fixed_j2000_obliquity_84381_448"],
            "trueOfDateMeanJ2000": mean_j2000["true_of_date_iau2006_2000a"],
        }
        controls = {}
        for name, mat in mats.items():
            orthogonality = float(np.max(np.abs(mat @ mat.T - np.eye(3))))
            det_error = abs(float(np.linalg.det(mat)) - 1)
            if orthogonality > 1e-14 or det_error > 1e-14:
                raise AssertionError(f"Invalid rotation matrix for {utc} / {name}")
            controls[name] = {"maxOrthogonalityResidual": orthogonality,
                              "determinantErrorFromOne": det_error}
        rows.append({
            "utc": utc, "deltaTSeconds": delta_t,
            "ttIso": (instant + dt.timedelta(seconds=delta_t)).isoformat().replace("+00:00", "Z"),
            "ttJdParts": [jd1, jd2], "ttJd": jd1 + jd2,
            "matrices": {name: mat.tolist() for name, mat in mats.items()},
            "controls": controls,
        })
    package = Path(erfa.__file__).resolve().parent
    artifacts = [package / "core.py", package / "tests" / "test_ufunc.py", *package.glob("ufunc*.so")]
    source_hashes = [{"path": "erfa/" + str(p.relative_to(package)), "sha256": digest(p)} for p in artifacts]
    source_hashes.extend({"path": p.name, "sha256": digest(p)} for p in
                         (HERE / "rotations.py", HERE / "generate_matrices.py", HERE / "test_rotations.py"))
    result = {
        "schemaVersion": 1, "versions": versions(), "numpyVersion": np.__version__,
        "casesSha256": hashlib.sha256(raw).hexdigest(),
        "sourceArtifacts": source_hashes,
        "matrixSense": "outputColumnVector = matrix @ inputColumnVector; JSON stores matrix rows",
        "inputVectorRequirement": "Already geocentric Cartesian vectors; caller records light-time/aberration and input axes. Rotations add no positional correction.",
        "timeConvention": "ISO clock treated as UT1 by design; orientation TT=encoded clock+deltaTSeconds. Not a historical/future UTC/UT1 prediction. Rotation evaluated at observation TT.",
        "definitions": {
            "trueOfDateICRS": "Rx(obl06(TT)+nut06a(TT).deps) @ pnm06a(TT), IAU2006/2000A plus ERFA frame bias",
            "meanOfDateICRS": "ecm06(TT), IAU2006 mean ecliptic/equinox of date plus ERFA frame bias",
            "fixedJ2000ICRS": "ecm06(J2000), fixed IAU2006 mean J2000 ecliptic/equinox plus frame bias",
            "fixedJ2000Obliquity84381_448ICRS": "Rx(84381.448 arcsec) @ pmat06(J2000), optional constant-obliquity comparison",
            "trueOfDateMeanJ2000": "trueOfDateICRS @ transpose(pmat06(J2000)); deliberately interpret numerical input as dynamical meanJ2000 axes, not strict ICRS",
        },
        "limitations": [
            "Orientation-only: no ephemeris, light time, stellar aberration, gravitational deflection, parallax, or time-scale conversion.",
            "ICRS directions treated as aligned GCRS axes for rotation; no relativistic BCRS/GCRS positional transform.",
            "MeanJ2000 diagnostic is not an exact FK5-to-ICRS orientation/spin transform and does not prove target vector axes.",
            "Q31 observer ecliptic conventions must be assessed separately; neither Q31 nor these variants are interchangeable by label alone.",
            "Controls validate finite arithmetic/reference vectors; no physical or global engine accuracy bound follows.",
        ],
        "primarySources": metadata(2451545)["primary_sources"],
        "rows": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"output": str(args.output), "rows": len(rows), "sha256": digest(args.output)}))


if __name__ == "__main__":
    main()
