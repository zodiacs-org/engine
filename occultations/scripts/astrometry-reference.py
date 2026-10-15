#!/usr/bin/env python3
"""Build independent ERFA references only in occultations/.generated/.

No engine import and no network access, except the explicit source-verification
mode. Install pinned dependencies in an ignored virtual environment; see the
fixture preregistration. No implementation code is vendored from ERFA.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import urllib.request
import warnings


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "test" / "fixtures"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    raw = path.read_bytes()
    if len(raw) >= 2_000_000:
        raise ValueError("Reference input exceeds the file-size policy.")
    return json.loads(raw), digest(raw)


def verify_published_source():
    published, _ = read_json(FIXTURES / "erfa-published.json")
    source = published["source"]
    with urllib.request.urlopen(source["url"], timeout=30) as response:
        data = response.read(2_000_000)
    if len(data) != source["bytes"] or digest(data) != source["sha256"]:
        raise ValueError("Published ERFA source digest mismatch.")
    text = data.decode("utf-8")

    def block(name):
        start = text.index("static void t_" + name + "(")
        return text[start:text.index("\nstatic void ", start + 1)]

    def assignment(section, name):
        match = re.search(re.escape(name) + r"\s*=\s*([+\-\de.]+);", section)
        if match is None:
            raise ValueError("Missing published ERFA input.")
        return float(match.group(1))

    def expected(section, name):
        match = re.search(r"vvd\(" + re.escape(name) + r",\s*([+\-\de.]+),", section)
        if match is None:
            raise ValueError("Missing published ERFA assertion.")
        return float(match.group(1))

    def require_equal(actual, retained):
        if actual != retained:
            raise ValueError("Published ERFA transcription mismatch.")

    fk5 = block("fk5hip")
    for row in range(3):
        for column in range(3):
            require_equal(expected(fk5, f"r5h[{row}][{column}]"), published["fk5hip"]["rotationRows"][row][column])
        require_equal(expected(fk5, f"s5h[{row}]"), published["fk5hip"]["spinRadiansPerYear"][row])

    pmpx = block("pmpx")
    for upstream, local in {
        "rc": "raRadians", "dc": "decRadians", "pr": "raRateRadiansPerYear",
        "pd": "decRateRadiansPerYear", "px": "parallaxArcseconds",
        "rv": "radialVelocityKmPerSecond", "pmt": "elapsedJulianYears",
    }.items():
        require_equal(assignment(pmpx, upstream), published["pmpx"][local])
    for i in range(3):
        require_equal(assignment(pmpx, f"pob[{i}]"), published["pmpx"]["observerBarycentricAu"][i])
        require_equal(expected(pmpx, f"pco[{i}]"), published["pmpx"]["expectedDirection"][i])

    ab = block("ab")
    for upstream, local in {"s": "sunDistanceAu", "bm1": "inverseLorentzFactor"}.items():
        require_equal(assignment(ab, upstream), published["ab"][local])
    for i in range(3):
        require_equal(assignment(ab, f"pnat[{i}]"), published["ab"]["naturalDirection"][i])
        require_equal(assignment(ab, f"v[{i}]"), published["ab"]["observerVelocityOverC"][i])
        require_equal(expected(ab, f"ppr[{i}]"), published["ab"]["expectedDirection"][i])
    print("Published ERFA source digest and every retained input/output transcription verified.")


def generate():
    # Import only after dispatch: source verification requires the standard library alone.
    # Support either pip --target .cache/erfa or an ignored virtual environment.
    local_dependencies = ROOT / ".cache" / "erfa"
    virtual_site = local_dependencies / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages"
    for path in (local_dependencies, virtual_site):
        if path.is_dir():
            sys.path.insert(0, str(path))
    import erfa
    import numpy as np

    cases, cases_digest = read_json(FIXTURES / "astrometry-cases.json")
    if erfa.__version__ != cases["versions"]["pyerfa"] or np.__version__ != cases["versions"]["numpy"]:
        raise ValueError("Install exactly the PyERFA and NumPy versions in astrometry-cases.json.")
    sao, sao_digest = read_json(ROOT / "data" / "sao-source.json")
    if sao_digest != "d63beb48d1ed66e3ac0a8d245ce7670a072321351405cf8a0d6a81889f968e47":
        raise ValueError("SAO source bytes changed; review the preregistered astrometry inputs.")
    arcseconds_per_radian = 180 * 3600 / math.pi
    milliarcseconds_per_radian = 1000 * arcseconds_per_radian
    c_au_per_day = 299792458 * 86400 / 149597870700
    rotation, spin = erfa.fk5hip()

    def spherical_input(row):
        ra, dec = np.deg2rad([row["raDegrees"], row["decDegrees"]])
        pr = row["raCosDecMasPerYear"] / milliarcseconds_per_radian / math.cos(dec)
        pd = row["decMasPerYear"] / milliarcseconds_per_radian
        return float(ra), float(dec), pr, pd

    def fk5_to_icrs(ra, dec, pr, pd):
        # ERFA's own spherical/PV and vector/matrix routines apply its supplied
        # orientation and spin; this is not a reimplementation of those routines.
        pv = erfa.s2pv(ra, dec, 1.0, pr, pd, 0.0)
        position = erfa.rxp(rotation, pv["p"])
        motion = erfa.rxp(rotation, erfa.ppp(pv["v"], erfa.pxp(pv["p"], spin)))
        transformed = np.zeros((), dtype=erfa.dt_pv)
        transformed["p"], transformed["v"] = position, motion
        ra1, dec1, _, pr1, pd1, _ = erfa.pv2s(transformed)
        return [float(ra1), float(dec1), float(pr1), float(pd1)]

    propagation = []
    fk5_spin = []
    for row in cases["propagation"]:
        ra, dec, pr, pd = spherical_input(row)
        px = (row["parallaxMas"] or 0.0) / 1000
        rv = row["radialVelocityKmPerSecond"] or 0.0
        direction = erfa.pmpx(ra, dec, pr, pd, px, rv,
                              row["elapsedJulianYears"], row["observerBarycentricAu"])
        propagation.append({"id": row["id"], "expectedDirection": direction.tolist()})
        transformed = fk5_to_icrs(ra, dec, pr, pd)
        spin_direction = erfa.pmpx(*transformed, 0.0, 0.0,
                                   row["elapsedJulianYears"], [0.0, 0.0, 0.0])
        fk5_spin.append({"id": row["id"], "expectedDirection": spin_direction.tolist()})

    aberration = []
    for row in cases["aberration"]:
        velocity = np.array(row["observerVelocityOverC"])
        # Infinite Sun distance suppresses only the solar potential contribution.
        direction = erfa.ab(row["direction"], velocity, math.inf,
                            math.sqrt(1 - float(np.dot(velocity, velocity))))
        aberration.append({"id": row["id"], "expectedDirection": direction.tolist()})

    source_rows = {}
    for line in sao["rows"]:
        cells = [cell.strip() for cell in line.split("|")]
        source_rows[int(cells[0].removeprefix("SAO "))] = cells

    apparent = []
    epochs = []
    for epoch in cases["epochs"]:
        calendar = [int(x) for x in re.split(r"[-T:]", epoch["ttCalendar"])]
        tt1, tt2 = erfa.dtf2d("TT", *calendar)
        elapsed_days = float((tt1 - 2451545.0) + tt2)
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", erfa.ErfaWarning)
            _, earth_barycentric = erfa.epv00(2451545.0, elapsed_days)
        has_warning = bool(caught)
        if has_warning != epoch["referenceEphemerisWarning"]:
            raise ValueError("ERFA ephemeris warning differs from the preregistration.")
        rotation_of_date = erfa.pnm06a(2451545.0, elapsed_days)
        beta = earth_barycentric["v"] / c_au_per_day
        inverse_gamma = math.sqrt(1 - float(np.dot(beta, beta)))
        epochs.append({"label": epoch["label"], "ttDaysFromJ2000": elapsed_days,
                       "referenceEphemerisWarnings": [str(w.message) for w in caught]})
        for sao_id in cases["saoIdentifiers"]:
            cells = source_rows[sao_id]
            if cells[4] == "" or cells[5] == "":
                raise ValueError("Preregistered full-chain case has missing proper motion.")
            ra, dec = np.deg2rad([float(cells[1]), float(cells[2])])
            pr = float(cells[4]) * 15 / arcseconds_per_radian
            pd = float(cells[5]) / arcseconds_per_radian
            hip = fk5_to_icrs(ra, dec, pr, pd)
            coordinate = erfa.pmpx(*hip, 0.0, 0.0, elapsed_days / 365.25,
                                   earth_barycentric["p"])
            proper = erfa.ab(coordinate, beta, math.inf, inverse_gamma)
            true_of_date = erfa.rxp(rotation_of_date, proper)
            apparent.append({"epoch": epoch["label"], "sao": sao_id,
                             "expectedDirection": true_of_date.tolist()})

    result = {
        "schema": "zodiacs.occultations.astrometry-erfa.v1",
        "receipt": {
            "implementation": "astrometry-reference.py/1",
            "pyerfa": erfa.__version__, "erfa": erfa.version.erfa_version,
            "numpy": np.__version__, "casesSha256": cases_digest,
            "saoSourceSha256": sao_digest,
            "generatorSha256": digest(Path(__file__).read_bytes()),
            "conventions": [
                "reference:ERFA;no-engine-import", "epoch:TT;TDB-approximated-by-TT",
                "frame:ICRS-to-IAU2006-2000A-true-equator-and-equinox",
                "FK5:rotation-and-spin;no-zonal-correction",
                "SAO:parallax-and-radial-velocity-unavailable;omitted-not-measured-zero",
                "aberration:relativistic;solar-potential-term-suppressed",
                "deflection:none", "center:geocentric", "refraction:none",
            ],
            "validationScope": "reduction-of-common-inputs;not-catalogue-or-contact-accuracy",
        },
        "maximumErrorArcseconds": cases["maximumErrorArcseconds"],
        "epochs": epochs, "propagation": propagation, "fk5Spin": fk5_spin,
        "aberration": aberration, "apparent": apparent,
    }
    encoded = (json.dumps(result, indent=2, allow_nan=False) + "\n").encode()
    if len(encoded) >= 2_000_000:
        raise ValueError("Generated reference exceeds the file-size policy.")
    target = ROOT / ".generated" / "astrometry-erfa.json"
    target.parent.mkdir(exist_ok=True)
    target.write_bytes(encoded)
    print(f"Wrote {target.relative_to(ROOT)}: {len(apparent)} apparent directions and component references.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-published-source", action="store_true")
    options = parser.parse_args()
    if options.verify_published_source:
        verify_published_source()
    else:
        generate()
