#!/usr/bin/env python3
"""Fetch the NASA JPL Horizons data behind @zodiacs/engine/minor-bodies.

For 2060 Chiron, 1 Ceres, 2 Pallas, 3 Juno and 4 Vesta it asks the Horizons
API (https://ssd.jpl.nasa.gov/api/horizons.api) for:

1. heliocentric geometric position vectors in the ICRF, km, from JD 2378480.5
   to 2524610.5 TDB (1799-12-16 to 2200-01-18), one VECTORS request per body,
   every 10 days for Chiron and every 4 days for the others; fit.py fits the
   tables to them;
2. 100 apparent geocentric ecliptic-of-date longitudes and latitudes per body
   (OBSERVER, quantity 31, TT), at four fixed instants near the span's ends and
   96 drawn with the seed 300001 across it, in two TLIST requests of 50: the
   check src/minor-bodies.test.ts holds the tables and the reduction to, kept
   out of the fit.

It writes into the directory --out names (by default .cache/minor-bodies/ in
the repository, which git ignores): each body's raw VECTORS response as
<body>-vectors.txt; provenance.json, with the query, and each response's
SHA-256, size, row count and the solution Horizons names; and
oos-observer-100.json, the observer checks with the SHA-256 of each raw
response. A VECTORS response already in that directory is read, not fetched
again. scripts/minor-bodies/build-pack-data.mjs copies provenance.json to
src/minor-bodies/provenance.json and oos-observer-100.json to
src/fixtures/minor-bodies-horizons-oos.json.

Horizons is a public service of NASA JPL's Solar System Dynamics group and
needs no key. The script reads no other source.

    python3 -I scripts/minor-bodies/fetch-horizons.py [--out DIR]
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import random
import time
import urllib.parse
import urllib.request

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
REPOSITORY = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# One VECTORS request per body stays under the API's cap of about 90,000 rows:
# 14,614 rows for Chiron at 10 days, 36,533 for each of the others at 4 days.
BODIES = [
    {"name": "Chiron", "command": "2060;", "step": "10 d"},
    {"name": "Ceres", "command": "1;", "step": "4 d"},
    {"name": "Pallas", "command": "2;", "step": "4 d"},
    {"name": "Juno", "command": "3;", "step": "4 d"},
    {"name": "Vesta", "command": "4;", "step": "4 d"},
]

# 1800-01-01 00:00 TDB is JD 2378496.5 and 2200-01-01 JD 2524593.5; the
# vectors run 16 days before and 17 after, so that the fit's intervals, which
# reach two days past each end, are anchored on both sides.
START_JD = 2378480.5
STOP_JD = 2524610.5

VECTOR_PARAMS = {
    "EPHEM_TYPE": "VECTORS",
    "CENTER": "500@10",
    "REF_PLANE": "FRAME",
    "REF_SYSTEM": "ICRF",
    "VEC_TABLE": "1",
    "VEC_CORR": "NONE",
    "OUT_UNITS": "KM-S",
    "CSV_FORMAT": "YES",
    "START_TIME": f"JD {START_JD}",
    "STOP_TIME": f"JD {STOP_JD}",
}

OBSERVER_PARAMS = {
    "EPHEM_TYPE": "OBSERVER",
    "CENTER": "500@399",
    "TIME_TYPE": "TT",
    "QUANTITIES": "31",
    "ANG_FORMAT": "DEG",
    "EXTRA_PREC": "YES",
    "CAL_FORMAT": "JD",
    "APPARENT": "AIRLESS",
    "CSV_FORMAT": "NO",
}

SEED = 300001


def fetch(params: dict[str, str]) -> bytes:
    url = API + "?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": "zodiacs-engine-minor-bodies/3.0.0"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return response.read()
        except Exception:
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("unreachable")


def quoted(params: dict[str, str]) -> dict[str, str]:
    """The parameters as the API takes them, each value in single quotes."""
    return {key: f"'{value}'" for key, value in params.items()}


def solution_of(text: str) -> dict[str, str]:
    info: dict[str, str] = {}
    for line in text.splitlines()[:80]:
        if "Target body name:" in line:
            info["target"] = line.split("Target body name:", 1)[1].strip()
        elif "soln ref.=" in line:
            info["solution"] = line.strip()
        elif "Rec #:" in line and "Soln.date:" in line:
            info["record"] = line.strip()
    return info


def between_markers(text: str, what: str) -> str:
    if "$$SOE" not in text or "$$EOE" not in text:
        raise RuntimeError(f"{what}: no $$SOE/$$EOE in the response: {text[:500]}")
    return text.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip()


def observer_instants() -> list[float]:
    rng = random.Random(SEED)
    instants = sorted(
        [2378497.234567, 2378550.876543, 2524500.123456, 2524592.765432]
        + [round(rng.uniform(2378497.0, 2524593.0), 6) for _ in range(96)]
    )
    assert len(instants) == 100
    return instants


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default=os.path.join(REPOSITORY, ".cache", "minor-bodies"))
    out = parser.parse_args().out
    os.makedirs(out, exist_ok=True)

    provenance = {
        "fetchedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "api": API,
        "vectorParams": VECTOR_PARAMS,
        "bodies": {},
    }
    for body in BODIES:
        name = body["name"]
        path = os.path.join(out, f"{name.lower()}-vectors.txt")
        if os.path.exists(path) and os.path.getsize(path) > 10000:
            with open(path, "rb") as cached:
                raw = cached.read()
            print(f"[{name}] read {path} ({len(raw)} bytes)")
        else:
            params = {"format": "text", "OBJ_DATA": "YES", "MAKE_EPHEM": "YES", "COMMAND": f"'{body['command']}'"}
            params.update(quoted(VECTOR_PARAMS))
            params["STEP_SIZE"] = f"'{body['step']}'"
            print(f"[{name}] fetching VECTORS every {body['step']}")
            raw = fetch(params)
            between_markers(raw.decode("utf-8", errors="replace"), name)
            with open(path, "wb") as written:
                written.write(raw)
            time.sleep(1.0)
        text = raw.decode("utf-8", errors="replace")
        rows = [line for line in between_markers(text, name).splitlines() if line.strip()]
        provenance["bodies"][name] = {
            "command": body["command"],
            "step": body["step"],
            "rows": len(rows),
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            **solution_of(text),
        }
        print(f"[{name}] {len(rows)} rows, sha256 {provenance['bodies'][name]['sha256']}")

    instants = observer_instants()
    checks = {
        "fetchedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "seed": SEED,
        "observerParams": OBSERVER_PARAMS,
        "bodies": {},
    }
    for body in BODIES:
        name = body["name"]
        points = []
        digests = []
        for batch in range(2):
            chunk = instants[batch * 50 : (batch + 1) * 50]
            params = {"format": "text", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES", "COMMAND": f"'{body['command']}'"}
            params.update(quoted(OBSERVER_PARAMS))
            params["TLIST"] = " ".join(f"'{jd:.6f}'" for jd in chunk)
            raw = fetch(params)
            digests.append(hashlib.sha256(raw).hexdigest())
            rows = []
            for line in between_markers(raw.decode("utf-8", errors="replace"), f"{name} batch {batch}").splitlines():
                parts = line.split()
                if len(parts) >= 3:
                    rows.append({"jdTt": float(parts[0]), "lon": float(parts[1]), "lat": float(parts[2])})
            if len(rows) != len(chunk):
                raise RuntimeError(f"{name} batch {batch}: {len(chunk)} instants asked, {len(rows)} rows given")
            points.extend(rows)
            time.sleep(0.8)
        checks["bodies"][name] = {"command": body["command"], "batchSha256": digests, "points": points}
        print(f"[{name}] {len(points)} observer checks")

    with open(os.path.join(out, "provenance.json"), "w", encoding="utf-8") as written:
        json.dump(provenance, written, indent=2)
    with open(os.path.join(out, "oos-observer-100.json"), "w", encoding="utf-8") as written:
        json.dump(checks, written, indent=2)
    print(f"wrote {out}/provenance.json and {out}/oos-observer-100.json")


if __name__ == "__main__":
    main()
