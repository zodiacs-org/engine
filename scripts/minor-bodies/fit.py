#!/usr/bin/env python3
"""Fit the tables of @zodiacs/engine/minor-bodies to NASA JPL Horizons vectors.

Reads the heliocentric ICRF position vectors fetch-horizons.py saved
(<body>-vectors.txt, km, at TDB Julian dates) for 2060 Chiron, 1 Ceres,
2 Pallas, 3 Juno and 4 Vesta, and fits each body's x, y and z, piece by
piece, with Chebyshev series in time: uniform contiguous intervals over
JD 2378494.5 to 2524595.5 TDB, 1800-01-01 to 2200-01-01 with two days more
at each end, for the light time and the speed's samples. Each interval's
series is a least-squares fit (numpy.polynomial.chebyshev.chebfit) to the
vectors from half a day before it to half a day after it, its coefficients
rounded to whole multiples of a unit of km.

For each body it tries the interval lengths, degrees and units listed in
CANDIDATES and keeps the one whose packed table is smallest gzipped, among
those whose largest error at the fitted vectors inside each interval is
within the body's limit: 250 km for Chiron, 100 km for the others.

The packed table (ZODMB01) of one body, little-endian, column by column:
for each axis (x, y, z), for each coefficient k from 0 to the degree, the
k-th coefficients of every interval in order, as int32 where k < k32, int16
where k < k8Start, and int8 beyond; a coefficient is that integer times
unitKm. The five tables follow each other, Chiron first, in one byte string.

Writes fitted-pack.json into the same directory: per body its offset and
size in the byte string, its interval count and length, degree, unit, k32,
k8Start and the largest fitting error found, and the byte string as base64.
scripts/minor-bodies/build-pack-data.mjs turns it into
src/minor-bodies/pack-data.ts. Needs numpy (2.0.2 made the committed tables).

    python3 -I scripts/minor-bodies/fit.py [--data DIR]
"""
from __future__ import annotations

import argparse
import base64
import gzip
import json
import os

import numpy as np
from numpy.polynomial import chebyshev as C

REPOSITORY = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SPAN_START = 2378494.5
SPAN_END = 2524595.5
SPAN_LEN = SPAN_END - SPAN_START  # 146101.0 days

BODIES = ["Chiron", "Ceres", "Pallas", "Juno", "Vesta"]
LIMIT_KM = {"Chiron": 250.0, "Ceres": 100.0, "Pallas": 100.0, "Juno": 100.0, "Vesta": 100.0}
# (interval days, degree, unit km), tried in this order; the first of equal size is kept.
CANDIDATES = {
    "Chiron": [(1461.01, d, u) for d in (9, 10, 11, 12, 13, 14) for u in (10.0, 20.0, 50.0)]
    + [(2922.02, d, u) for d in (12, 13, 14, 15, 16) for u in (10.0, 20.0, 50.0)]
    + [(730.505, d, u) for d in (7, 8, 9, 10) for u in (10.0, 20.0, 50.0)],
    "main belt": [(730.505, d, u) for d in (11, 12, 13, 14, 15, 16) for u in (5.0, 10.0, 20.0)]
    + [(487.00333333333333, d, u) for d in (10, 11, 12, 13, 14) for u in (5.0, 10.0, 20.0)]
    + [(365.2525, d, u) for d in (8, 9, 10, 11, 12) for u in (5.0, 10.0, 20.0)],
}


def load_vectors(data: str, name: str) -> tuple[np.ndarray, np.ndarray]:
    with open(os.path.join(data, f"{name.lower()}-vectors.txt"), "r", encoding="utf-8") as source:
        text = source.read()
    rows = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip()
    jds = []
    xyz = []
    for line in rows.splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) >= 5:
            jds.append(float(parts[0]))
            xyz.append([float(parts[2]), float(parts[3]), float(parts[4])])
    return np.array(jds, dtype=np.float64), np.array(xyz, dtype=np.float64)


def fit_body(name: str, jds: np.ndarray, xyz: np.ndarray, interval_days: float, degree: int, unit_km: float) -> dict:
    n_intervals = int(round(SPAN_LEN / interval_days))
    step = SPAN_LEN / n_intervals
    assert abs(step - interval_days) < 1e-6, (step, interval_days)

    quantised = []  # per interval: 3 axes of degree + 1 integers
    max_err_km = 0.0
    max_abs = np.zeros(degree + 1, dtype=np.float64)
    for index in range(n_intervals):
        t0 = SPAN_START + index * step
        t1 = t0 + step
        fitted = (jds >= t0 - 0.5) & (jds <= t1 + 0.5)
        if fitted.sum() < degree + 4:
            fitted = (jds >= t0 - 15.0) & (jds <= t1 + 15.0)
        u = 2.0 * (jds[fitted] - t0) / step - 1.0
        inside = (jds >= t0) & (jds <= t1)
        u_inside = 2.0 * (jds[inside] - t0) / step - 1.0
        predicted = np.zeros_like(xyz[inside])
        axes = []
        for axis in range(3):
            q = np.rint(C.chebfit(u, xyz[fitted][:, axis], degree) / unit_km).astype(np.int64)
            max_abs = np.maximum(max_abs, np.abs(q))
            axes.append(q)
            predicted[:, axis] = C.chebval(u_inside, q * unit_km)
        max_err_km = max(max_err_km, float(np.linalg.norm(predicted - xyz[inside], axis=1).max()))
        quantised.append(axes)

    # The leading coefficients that need 32 bits, and the trailing ones that fit in 8.
    k32 = 0
    for k in range(degree + 1):
        if max_abs[k] > 32767:
            k32 = k + 1
    k8_start = degree + 1
    for k in range(degree, k32 - 1, -1):
        if max_abs[k] <= 127:
            k8_start = k
        else:
            break

    packed = bytearray()
    table = np.array(quantised, dtype=np.int64)  # (intervals, 3, degree + 1)
    for axis in range(3):
        for k in range(degree + 1):
            column = table[:, axis, k]
            if k < k32:
                packed.extend(column.astype("<i4").tobytes())
            elif k < k8_start:
                packed.extend(column.astype("<i2").tobytes())
            else:
                packed.extend(column.astype("i1").tobytes())
    raw = bytes(packed)
    return {
        "intervals": n_intervals,
        "intervalDays": step,
        "degree": degree,
        "unitKm": unit_km,
        "k32": k32,
        "k8Start": k8_start,
        "maxErrKm": max_err_km,
        "raw": raw,
        "gzipBytes": len(gzip.compress(raw, compresslevel=9)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", default=os.path.join(REPOSITORY, ".cache", "minor-bodies"))
    data = parser.parse_args().data

    meta = {"format": "ZODMB01", "spanStartJd": SPAN_START, "spanEndJd": SPAN_END, "bodies": {}}
    combined = bytearray()
    for name in BODIES:
        jds, xyz = load_vectors(data, name)
        best = None
        for interval_days, degree, unit_km in CANDIDATES["Chiron" if name == "Chiron" else "main belt"]:
            result = fit_body(name, jds, xyz, interval_days, degree, unit_km)
            if result["maxErrKm"] <= LIMIT_KM[name] and (best is None or result["gzipBytes"] < best["gzipBytes"]):
                best = result
        if best is None:
            raise RuntimeError(f"{name}: no candidate fits within {LIMIT_KM[name]} km")
        meta["bodies"][name] = {
            "offset": len(combined),
            "bytes": len(best["raw"]),
            "intervals": best["intervals"],
            "intervalDays": best["intervalDays"],
            "degree": best["degree"],
            "unitKm": best["unitKm"],
            "k32": best["k32"],
            "k8Start": best["k8Start"],
            "maxFitResidualKm": round(best["maxErrKm"], 3),
        }
        combined.extend(best["raw"])
        print(
            f"{name:7s}: {best['intervals']} intervals of {best['intervalDays']:.2f} d, degree {best['degree']}, "
            f"unit {best['unitKm']} km, k32 {best['k32']}, k8 {best['k8Start']}, largest error {best['maxErrKm']:.2f} km, "
            f"{len(best['raw'])} bytes, {best['gzipBytes']} gzipped"
        )

    encoded = base64.b64encode(bytes(combined)).decode("ascii")
    meta["totalRawBytes"] = len(combined)
    meta["totalGzipBytes"] = len(gzip.compress(bytes(combined), compresslevel=9))
    meta["totalBase64GzipBytes"] = len(gzip.compress(encoded.encode("ascii"), compresslevel=9))
    with open(os.path.join(data, "fitted-pack.json"), "w", encoding="utf-8") as written:
        json.dump({**meta, "base64": encoded}, written)
    print(f"wrote {os.path.join(data, 'fitted-pack.json')}: {len(combined)} bytes, {meta['totalBase64GzipBytes']} as gzipped base64")


if __name__ == "__main__":
    main()
