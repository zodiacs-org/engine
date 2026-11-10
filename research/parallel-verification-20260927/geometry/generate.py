#!/usr/bin/env python3
"""Independent angle fixtures: ERFA Earth orientation plus vector geometry.

No Zodiacs, astronomy-engine or Swiss Ephemeris import or subprocess is used.
Run with Python 3.10+ and pyerfa==2.0.1.5. See README.md for conventions.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import erfa

HERE = Path(__file__).resolve().parent
RAD = math.pi / 180.0
EXPECTED_VERSIONS = ("2.0.1.5", "2.0.1", "20231011")
DATES = (
    "1950-01-01T00:00:00.000Z",
    "2000-01-01T12:00:00.000Z",
    "2026-09-27T12:00:00.000Z",
    "2050-06-21T18:00:00.000Z",
    "2100-12-21T06:00:00.000Z",
)
LATITUDES = (-80, -66, -60, -45, -23.5, 0, 23.5, 45, 60, 66, 80)
LONGITUDES = (-179.999999, -120, -0.000001, 0, 0.000001, 101, 179.999999)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def norm(a):
    return math.sqrt(dot(a, a))


def scale(a, s):
    return tuple(x * s for x in a)


def wrap_deg(value):
    result = value % 360.0
    return 0.0 if result >= 360.0 else result


def separation_deg(a, b):
    return abs((a - b + 180.0) % 360.0 - 180.0)


def orientation(iso, delta_t=69):
    """ISO digits are synthetic UT1, with no leap-second/UTC conversion."""
    year, month, day = map(int, iso[:10].split("-"))
    hour, minute, second = map(float, iso[11:-1].split(":"))
    base, day_count = erfa.cal2jd(year, month, day)
    ut1a = float(base + day_count)
    ut1b = (hour * 3600 + minute * 60 + second) / 86400
    tta, ttb = ut1a, ut1b + delta_t / 86400
    gast = float(erfa.gst06a(ut1a, ut1b, tta, ttb))
    _, deps = erfa.nut06a(tta, ttb)
    obliquity = float(erfa.obl06(tta, ttb) + deps)
    return {
        "ut1JulianDateParts": [ut1a, ut1b],
        "ttJulianDateParts": [tta, ttb],
        "gastRad": gast,
        "trueObliquityRad": obliquity,
    }


def geometry(theta, latitude, obliquity):
    """Select the rising horizon intersection and upper meridian intersection."""
    phi = latitude * RAD
    cphi, sphi = math.cos(phi), math.sin(phi)
    ct, st = math.cos(theta), math.sin(theta)
    ce, se = math.cos(obliquity), math.sin(obliquity)
    zenith = (cphi * ct, cphi * st, sphi)
    east = (-st, ct, 0.0)
    meridian_equator = (ct, st, 0.0)
    ecliptic_normal = (0.0, -se, ce)
    ecliptic_y = (0.0, ce, se)
    horizon_intersection = cross(ecliptic_normal, zenith)
    hnorm = norm(horizon_intersection)
    if hnorm < 1e-14:
        # Entire ecliptic coincides with horizon: unique ASC does not exist.
        asc_vector = None
        asc = None
        east_projection = None
    else:
        asc_vector = scale(horizon_intersection, 1 / hnorm)
        if dot(asc_vector, east) < 0:
            asc_vector = scale(asc_vector, -1)
        east_projection = dot(asc_vector, east)
        asc = wrap_deg(math.atan2(dot(asc_vector, ecliptic_y), asc_vector[0]) / RAD)
    meridian_intersection = cross(east, ecliptic_normal)
    mc_vector = scale(meridian_intersection, 1 / norm(meridian_intersection))
    if dot(mc_vector, meridian_equator) < 0:
        mc_vector = scale(mc_vector, -1)
    mc = wrap_deg(math.atan2(dot(mc_vector, ecliptic_y), mc_vector[0]) / RAD)
    return {
        "asc": asc,
        "mc": mc,
        "horizonIntersectionNorm": hnorm,
        "risingEastProjection": east_projection,
        "horizonResidual": abs(dot(asc_vector, zenith)) if asc_vector else None,
        "ascEclipticResidual": abs(dot(asc_vector, ecliptic_normal)) if asc_vector else None,
        "mcMeridianResidual": abs(dot(mc_vector, east)),
        "mcEclipticResidual": abs(dot(mc_vector, ecliptic_normal)),
    }


def self_controls():
    """Upstream ERFA vectors, geometric invariants and independently derived forms."""
    checks = []

    def near(name, actual, expected, tolerance):
        error = abs(actual - expected)
        if error > tolerance:
            raise AssertionError(f"{name}: {actual!r} != {expected!r}; error {error}")
        checks.append({"name": name, "absoluteError": error, "tolerance": tolerance})

    versions = (erfa.__version__, erfa.version.erfa_version, erfa.version.sofa_version)
    if versions != EXPECTED_VERSIONS:
        raise RuntimeError(f"Pinned oracle versions {EXPECTED_VERSIONS}; installed {versions}")
    # Numeric references from PyERFA 2.0.1.5 erfa/tests/test_ufunc.py,
    # itself translated from the upstream ERFA t_erfa_c.c test suite.
    near("upstream-gst06a-rad", float(erfa.gst06a(2400000.5, 53736, 2400000.5, 53736)),
         1.754166137675019159, 1e-12)
    near("upstream-obl06-rad", float(erfa.obl06(2400000.5, 54388)),
         0.4090749229387258204, 1e-14)
    dpsi, deps = erfa.nut06a(2400000.5, 53736)
    near("upstream-nut06a-dpsi-rad", float(dpsi), -0.9630912025820308797e-5, 1e-13)
    near("upstream-nut06a-deps-rad", float(deps), 0.4063238496887249798e-4, 1e-13)
    eps = 23.4 * RAD
    for theta_deg, expected_asc in ((0, 90), (90, 180), (180, 270), (270, 0)):
        answer = geometry(theta_deg * RAD, 0, eps)
        near(f"equator-cardinal-asc-{theta_deg}", separation_deg(answer["asc"], expected_asc), 0, 1e-10)
        near(f"equator-cardinal-mc-{theta_deg}", separation_deg(answer["mc"], theta_deg), 0, 1e-10)
    # No obliquity: equatorial ecliptic ASC and MC independent of latitude.
    for lat in (-80, 0, 80):
        answer = geometry(37 * RAD, lat, 0)
        near(f"zero-obliquity-asc-{lat}", separation_deg(answer["asc"], 127), 0, 1e-10)
        near(f"zero-obliquity-mc-{lat}", separation_deg(answer["mc"], 37), 0, 1e-10)
    degeneracy = geometry(270 * RAD, 90 - 23.4, eps)
    if degeneracy["asc"] is not None:
        raise AssertionError("Horizon/ecliptic coincidence must not produce a unique ASC")
    checks.append({"name": "horizon-ecliptic-coincidence", "uniqueAsc": False})
    max_formula_error = 0.0
    max_residual = 0.0
    for lat in (-80, -66, -45, 0, 45, 66, 80):
        for theta_deg in range(0, 360, 7):
            theta = theta_deg * RAD
            answer = geometry(theta, lat, eps)
            # Separate scalar solution to A*cos(lambda)+B*sin(lambda)=0.
            a = math.cos(lat * RAD) * math.cos(theta)
            b = (math.cos(lat * RAD) * math.sin(theta) * math.cos(eps)
                 + math.sin(lat * RAD) * math.sin(eps))
            scalar = math.atan2(a, -b)
            v = (math.cos(scalar), math.sin(scalar) * math.cos(eps), math.sin(scalar) * math.sin(eps))
            # Finite rotation of the zenith gives a separate rising-side check.
            step = 1e-6
            def altitude_projection(t):
                return (v[0] * math.cos(lat * RAD) * math.cos(t)
                        + v[1] * math.cos(lat * RAD) * math.sin(t)
                        + v[2] * math.sin(lat * RAD))
            if altitude_projection(theta + step) < altitude_projection(theta - step):
                scalar += math.pi
            max_formula_error = max(max_formula_error,
                                    separation_deg(answer["asc"], wrap_deg(scalar / RAD)))
            scalar_mc = wrap_deg(math.atan2(math.sin(theta), math.cos(theta) * math.cos(eps)) / RAD)
            max_formula_error = max(max_formula_error, separation_deg(answer["mc"], scalar_mc))
            max_residual = max(max_residual, *(answer[key] for key in
                               ("horizonResidual", "ascEclipticResidual", "mcMeridianResidual", "mcEclipticResidual")))
    near("scalar-vs-vector-grid-max-deg", max_formula_error, 0, 1e-10)
    near("plane-equation-grid-max-residual", max_residual, 0, 1e-13)
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=HERE / "fixtures.json")
    args = parser.parse_args()
    gates_text = (HERE / "gates.json").read_bytes()
    gates = json.loads(gates_text)
    controls = self_controls()
    cases = []

    def add(iso, lat, lon, label, orient):
        angle = geometry(orient["gastRad"] + lon * RAD, lat, orient["trueObliquityRad"])
        eligible = abs(lat) <= gates["ascExtended"]["maximumAbsoluteLatitudeDeg"] and angle["horizonIntersectionNorm"] >= gates["minimumHorizonIntersectionNorm"]
        typical = abs(lat) <= gates["ascTypical"]["maximumAbsoluteLatitudeDeg"]
        cases.append({
            "id": f"geometry-{len(cases) + 1:04d}",
            "family": label,
            "input": {"utc": iso, "latitude": lat, "longitude": lon,
                      "deltaT": 69, "timeKnown": True, "houseSystem": "whole"},
            "expected": {"asc": angle.pop("asc"), "mc": angle.pop("mc")},
            "acceptance": {
                "asc": {"comparable": eligible,
                        "maximumErrorArcsec": gates["ascTypical" if typical else "ascExtended"]["maximumErrorArcsec"] if eligible else None,
                        "reason": "matched model convention, finite gate" if eligible else "exploratory high-latitude branch/conditioning; no acceptance gate"},
                "mc": {"comparable": True, "maximumErrorArcsec": gates["mc"]["maximumErrorArcsec"]},
            },
            "oracle": {**orient, **angle},
        })

    for iso in DATES:
        orient = orientation(iso)
        for lat in LATITUDES:
            for lon in LONGITUDES:
                add(iso, lat, lon, "epoch-latitude-longitude-grid", orient)
        for lat in (-66, -45, 0, 45, 66):
            for cardinal in (0, 90, 180, 270):
                for epsilon in (-1e-7, 0, 1e-7):
                    lon = (cardinal + epsilon - orient["gastRad"] / RAD + 180) % 360 - 180
                    add(iso, lat, lon, "right-ascension-quadrant-seam", orient)
    result = {
        "schemaVersion": 1,
        "oracle": "ERFA orientation with independently implemented vector plane intersections",
        "versions": {"pyerfa": erfa.__version__, "erfa": erfa.version.erfa_version, "sofa": erfa.version.sofa_version},
        "sources": [
            "https://github.com/liberfa/erfa/blob/v2.0.1/src/gst06a.c",
            "https://github.com/liberfa/erfa/blob/v2.0.1/src/obl06.c",
            "https://github.com/liberfa/erfa/blob/v2.0.1/src/nut06a.c",
            "https://github.com/liberfa/pyerfa/blob/v2.0.1.5/erfa/tests/test_ufunc.py",
            "https://www.iausofa.org/current-software",
        ],
        "gatesSha256": hashlib.sha256(gates_text).hexdigest(),
        "conventions": {
            "frame": "tropical longitude of date, true equator/equinox, IAU2006/2000A",
            "time": "ISO clock digits treated as UT1; TT=UT1+69s; UTC minus UT1 set to zero by design, not an Earth-orientation prediction",
            "latitude": "north-positive astronomical horizon latitude; same numerical value as supplied engine latitude, no deflection-of-vertical correction",
            "longitude": "east-positive terrestrial longitude",
            "asc": "rising intersection of geometric horizon and ecliptic; at high latitude this may differ by 180 degrees from another software convention",
            "mc": "ecliptic intersection on upper local meridian; no requirement to lie above the horizon",
            "omissions": ["polar motion", "free-core nutation", "refraction", "terrain", "local vertical deflection", "house cusps"],
        },
        "scope": "685 finite reference cases; these do not establish global error bounds, historical clock accuracy, or correctness of house cusps.",
        "selfControls": controls,
        "cases": cases,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"output": str(args.output), "cases": len(cases), "ascGated": sum(c["acceptance"]["asc"]["comparable"] for c in cases), "mcGated": len(cases), "selfControls": len(controls), "sha256": hashlib.sha256(args.output.read_bytes()).hexdigest()}))


if __name__ == "__main__":
    main()
