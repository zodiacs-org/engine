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
the repository, which git ignores): each raw response, as <body>-vectors.txt
and <body>-observer-<batch>.txt, each with a sidecar beside it
(<body>-vectors.meta.json, <body>-observer-<batch>.meta.json) that records
the API, the exact query sent, the response's size and SHA-256, and when it
was fetched (fetchedAtUtc); provenance.json, with the query, and each
VECTORS response's fetch time, SHA-256, size, row count and the solution
Horizons names; and oos-observer-100.json, the observer checks with the
SHA-256 and the fetch time of each raw response. provenance.json's and
oos-observer-100.json's own fetchedAtUtc is the earliest of their
responses'.

A response already in that directory is read, not fetched again, only where
its sidecar records the same API and query and the file's SHA-256; the two
files then give the time it was first fetched, not the time of the run. A
response without a sidecar (as this script wrote them before it kept
sidecars), or whose sidecar records another query or other bytes, is fetched
again. scripts/minor-bodies/build-pack-data.mjs copies provenance.json to
src/minor-bodies/provenance.json and oos-observer-100.json to
src/fixtures/minor-bodies-horizons-oos.json.

Horizons is a public service of NASA JPL's Solar System Dynamics group and
needs no key. The script reads no other source.

    python3 -I scripts/minor-bodies/fetch-horizons.py [--out DIR]

scripts/minor-bodies/test-fetch-horizons.py tests the reuse, offline.
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
from typing import Callable

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


def utc_now() -> str:
    """The time now, UTC, as fetchedAtUtc records it."""
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sidecar_of(path: str) -> str:
    """The sidecar of the raw response at <target>.txt: <target>.meta.json."""
    return os.path.splitext(path)[0] + ".meta.json"


def write_whole(path: str, data: bytes) -> None:
    """Writes `data` to `path` whole or not at all, through a file beside it."""
    partial = path + ".partial"
    with open(partial, "wb") as written:
        written.write(data)
    os.replace(partial, path)


def cached(path: str, params: dict[str, str]) -> tuple[bytes, str] | None:
    """The response at `path` and when it was fetched, where its sidecar records this API, `params` and its SHA-256."""
    try:
        with open(sidecar_of(path), encoding="utf-8") as opened:
            meta = json.load(opened)
        with open(path, "rb") as opened:
            raw = opened.read()
    except (OSError, ValueError):
        return None
    if not isinstance(meta, dict) or meta.get("api") != API or meta.get("params") != params:
        return None
    if meta.get("sha256") != hashlib.sha256(raw).hexdigest() or not isinstance(meta.get("fetchedAtUtc"), str):
        return None
    return raw, meta["fetchedAtUtc"]


def fetch_once(
    path: str, params: dict[str, str], what: str, pause: float, check: Callable[[str], object] | None = None
) -> tuple[bytes, str]:
    """The response to `params` and the UTC time it was fetched.

    Read from `path` where its sidecar records the same query and the file's
    SHA-256, with the time the sidecar records; fetched otherwise, checked for
    its $$SOE and $$EOE markers and by `check`, which raises on a response it
    refuses, and only then written to `path` with a new sidecar, then a pause
    of `pause` seconds before the next request.
    """
    hit = cached(path, params)
    if hit is not None:
        print(f"[{what}] read {path} ({len(hit[0])} bytes, fetched {hit[1]})")
        return hit
    if os.path.exists(path):
        print(f"[{what}] {path} has no sidecar that records this query and these bytes: fetching it again")
    raw = fetch(params)
    fetched_at = utc_now()
    text = raw.decode("utf-8", errors="replace")
    between_markers(text, what)
    if check is not None:
        check(text)
    meta = {"api": API, "params": params, "fetchedAtUtc": fetched_at, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    write_whole(path, raw)
    write_whole(sidecar_of(path), (json.dumps(meta, indent=2) + "\n").encode("utf-8"))
    time.sleep(pause)
    return raw, fetched_at


def earliest(times: list[str]) -> str:
    """The earliest of fetchedAtUtc times."""
    return min(times, key=datetime.datetime.fromisoformat)


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


def observer_rows(text: str, what: str, count: int) -> list[dict[str, float]]:
    """The rows of an OBSERVER response, Julian day (TT), longitude and latitude, refused unless there are `count`."""
    rows = []
    for line in between_markers(text, what).splitlines():
        parts = line.split()
        if len(parts) >= 3:
            rows.append({"jdTt": float(parts[0]), "lon": float(parts[1]), "lat": float(parts[2])})
    if len(rows) != count:
        raise RuntimeError(f"{what}: {count} instants asked, {len(rows)} rows given")
    return rows


def observer_instants() -> list[float]:
    rng = random.Random(SEED)
    instants = sorted(
        [2378497.234567, 2378550.876543, 2524500.123456, 2524592.765432]
        + [round(rng.uniform(2378497.0, 2524593.0), 6) for _ in range(96)]
    )
    assert len(instants) == 100
    return instants


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default=os.path.join(REPOSITORY, ".cache", "minor-bodies"))
    out = parser.parse_args(argv).out
    os.makedirs(out, exist_ok=True)

    provenance = {
        "fetchedAtUtc": "",
        "api": API,
        "vectorParams": VECTOR_PARAMS,
        "bodies": {},
    }
    for body in BODIES:
        name = body["name"]
        params = {"format": "text", "OBJ_DATA": "YES", "MAKE_EPHEM": "YES", "COMMAND": f"'{body['command']}'"}
        params.update(quoted(VECTOR_PARAMS))
        params["STEP_SIZE"] = f"'{body['step']}'"
        print(f"[{name}] VECTORS every {body['step']}")
        raw, fetched_at = fetch_once(os.path.join(out, f"{name.lower()}-vectors.txt"), params, name, 1.0)
        text = raw.decode("utf-8", errors="replace")
        rows = [line for line in between_markers(text, name).splitlines() if line.strip()]
        provenance["bodies"][name] = {
            "command": body["command"],
            "step": body["step"],
            "fetchedAtUtc": fetched_at,
            "rows": len(rows),
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            **solution_of(text),
        }
        print(f"[{name}] {len(rows)} rows, sha256 {provenance['bodies'][name]['sha256']}")
    provenance["fetchedAtUtc"] = earliest([entry["fetchedAtUtc"] for entry in provenance["bodies"].values()])

    instants = observer_instants()
    checks = {
        "fetchedAtUtc": "",
        "seed": SEED,
        "observerParams": OBSERVER_PARAMS,
        "bodies": {},
    }
    for body in BODIES:
        name = body["name"]
        points = []
        digests = []
        times = []
        for batch in range(2):
            chunk = instants[batch * 50 : (batch + 1) * 50]
            params = {"format": "text", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES", "COMMAND": f"'{body['command']}'"}
            params.update(quoted(OBSERVER_PARAMS))
            params["TLIST"] = " ".join(f"'{jd:.6f}'" for jd in chunk)
            path = os.path.join(out, f"{name.lower()}-observer-{batch}.txt")
            what = f"{name} batch {batch}"
            raw, fetched_at = fetch_once(path, params, what, 0.8, lambda text: observer_rows(text, what, len(chunk)))
            digests.append(hashlib.sha256(raw).hexdigest())
            times.append(fetched_at)
            points.extend(observer_rows(raw.decode("utf-8", errors="replace"), what, len(chunk)))
        checks["bodies"][name] = {"command": body["command"], "batchSha256": digests, "batchFetchedAtUtc": times, "points": points}
        print(f"[{name}] {len(points)} observer checks")
    checks["fetchedAtUtc"] = earliest([moment for entry in checks["bodies"].values() for moment in entry["batchFetchedAtUtc"]])

    with open(os.path.join(out, "provenance.json"), "w", encoding="utf-8") as written:
        json.dump(provenance, written, indent=2)
    with open(os.path.join(out, "oos-observer-100.json"), "w", encoding="utf-8") as written:
        json.dump(checks, written, indent=2)
    print(f"wrote {out}/provenance.json and {out}/oos-observer-100.json")


if __name__ == "__main__":
    main()
