"""Independent Horizons/ERFA limb boundaries and published USNO phase instants.

Run with pyerfa 2.0.1.5 and numpy. No engine imports or subprocesses.
Writes proposals only to ignored generated/; --offline replays cached responses.
"""
import argparse
import csv
import datetime as dt
import hashlib
import importlib.util
import io
import json
import math
from pathlib import Path
import sys
import urllib.parse
import urllib.request

import erfa
import numpy as np

sys.dont_write_bytecode = True
PROJECT = Path(__file__).resolve().parents[1]
GENERATED = PROJECT / "generated"
TOOL = PROJECT.parent / "docs/evidence/vedic-2026-09-28/tools/reference_values.py"
DATES = ("2024-03-20", "2024-04-08", "2024-09-17")
COUNTS = {"tithi": 30, "nakshatra": 27, "yoga": 27, "karana": 60, "pada": 108}
# Registered in SOURCES.md before evaluating this engine against these cases.
ACCEPTANCE_SECONDS = 60


def iso(at):
    return at.isoformat(timespec="milliseconds") + "Z"


def fetch(url, filename, offline):
    path = GENERATED / filename
    if offline:
        cached = json.loads(path.read_text())
        if cached["url"] != url:
            raise ValueError("Cached request URL mismatch")
        raw = cached["raw"].encode()
    else:
        raw = urllib.request.urlopen(url, timeout=45).read()
        if len(raw) >= 2_000_000:
            raise ValueError("Response exceeds project file limit")
        path.write_text(json.dumps({"url": url, "raw": raw.decode()}) + "\n")
    response = json.loads(raw)
    if response.get("error"):
        raise ValueError(response["error"])
    return response, {"url": url, "responseSHA256": hashlib.sha256(raw).hexdigest()}


def horizons(body, start, offline):
    stop = start + dt.timedelta(days=1)
    parameters = {"format": "json", "COMMAND": f"'{body}'", "OBJ_DATA": "'NO'",
                  "EPHEM_TYPE": "'OBSERVER'", "CENTER": "'500@399'",
                  "START_TIME": f"'{start:%Y-%m-%d %H:%M}'",
                  "STOP_TIME": f"'{stop:%Y-%m-%d %H:%M}'", "TIME_TYPE": "'UT'",
                  "STEP_SIZE": "'1 m'", "QUANTITIES": "'31'", "CSV_FORMAT": "'YES'",
                  "EXTRA_PREC": "'YES'", "APPARENT": "'AIRLESS'", "CAL_FORMAT": "'CAL'"}
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(parameters)
    response, origin = fetch(url, f"transitions-{start:%Y-%m-%d}-{body}.json", offline)
    result = response.get("result", "")
    for required in ("{source: DE441}", "GEOCENTRIC", "Date__(UT)__HR:MN", "ObsEcLon"):
        if required not in result:
            raise ValueError(f"Missing Horizons convention: {required}")
    table = result.split("$$SOE\n")[1].split("$$EOE")[0].strip()
    rows = list(csv.reader(io.StringIO(table)))
    if len(rows) != 1441:
        raise ValueError("Incomplete Horizons minute grid")
    longitudes = []
    for minute, row in enumerate(rows):
        at = dt.datetime.strptime(row[0].strip(), "%Y-%b-%d %H:%M")
        lon = float(row[3])
        if at != start + dt.timedelta(minutes=minute) or not 0 <= lon < 360:
            raise ValueError("Invalid Horizons grid row")
        longitudes.append(lon)
    return longitudes, {**origin, **response["signature"]}


def true_lahiri(at, ref):
    a, b = erfa.dtf2d("UTC", at.year, at.month, at.day, at.hour, at.minute, at.second)
    tt = erfa.taitt(*erfa.utctai(a, b))
    epoch, mean, model = ref.EPOCHS["lahiri"]
    return ref.epoch_ayanamsa(mean, epoch, model, sum(tt)) + erfa.nut00b(*tt)[0] / ref.AS2R / 3600


def angle(sample, kind):
    sun, moon, ayanamsa = (sample[key] for key in ("sunTropical", "moonTropical", "lahiriTrue"))
    if kind in ("tithi", "karana"):
        return (moon - sun) % 360
    if kind == "yoga":
        return (sun + moon - 2 * ayanamsa) % 360
    return (moon - ayanamsa) % 360


def sector(sample, kind):
    return math.floor(angle(sample, kind) * COUNTS[kind] / 360)


def window(date, ref, offline):
    start = dt.datetime.fromisoformat(date)
    sun, sun_origin = horizons(10, start, offline)
    moon, moon_origin = horizons(301, start, offline)
    samples = [{"utc": iso(start + dt.timedelta(minutes=i)), "sunTropical": s,
                "moonTropical": m, "lahiriTrue": true_lahiri(start + dt.timedelta(minutes=i), ref)}
               for i, (s, m) in enumerate(zip(sun, moon))]
    events = []
    for left, right in zip(samples, samples[1:]):
        for kind, count in COUNTS.items():
            a, b = angle(left, kind), angle(right, kind)
            advance = (b - a) % 360
            if not 0 < advance < 360 / count:
                raise ValueError("Reference motion violates single-sector assumption")
            before, after = sector(left, kind), sector(right, kind)
            if before == after:
                continue
            if after != (before + 1) % count:
                raise ValueError("Unexpected reference sector sequence")
            target = (before + 1) * 360 / count
            fraction = (target - a) / advance
            if not 0 < fraction <= 1:
                raise ValueError("Unbracketed reference boundary")
            at = dt.datetime.fromisoformat(left["utc"].removesuffix("Z")) + dt.timedelta(seconds=60 * fraction)
            # The selected windows have no endpoint boundary. Refuse rather than
            # silently assigning a boundary to the wrong half-open window.
            if not start < at < start + dt.timedelta(days=1):
                raise ValueError("Reference boundary at window edge")
            events.append({"kind": kind, "beforeIndex": before, "afterIndex": after,
                           "at": iso(at), "left": left, "right": right})
    events.sort(key=lambda event: (event["at"], list(COUNTS).index(event["kind"])))
    return {"from": iso(start), "to": iso(start + dt.timedelta(days=1)),
            "horizons": {"sun": sun_origin, "moon": moon_origin},
            "start": samples[0], "end": samples[-1], "transitions": events}


def phases(offline):
    url = "https://aa.usno.navy.mil/api/moon/phases/date?date=2024-04-01&nump=4"
    response, origin = fetch(url, "transitions-usno-2024-phases.json", offline)
    indices = {"New Moon": 0, "First Quarter": 15, "Full Moon": 30, "Last Quarter": 45}
    rows = []
    for row in response["phasedata"]:
        at = f'{row["year"]:04}-{row["month"]:02}-{row["day"]:02}T{row["time"]}:00.000Z'
        rows.append({"phase": row["phase"], "at": at, "karanaAfterIndex": indices[row["phase"]]})
    if len(rows) != 4 or {row["phase"] for row in rows} != set(indices):
        raise ValueError("Incomplete primary phase reference")
    return {**origin, "apiVersion": response["apiversion"], "rows": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="Replay ignored cached responses without network access")
    args = parser.parse_args()
    if erfa.__version__ != "2.0.1.5":
        raise ValueError("Use the registered pyerfa 2.0.1.5")
    spec = importlib.util.spec_from_file_location("independent_reference", TOOL)
    ref = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(ref)
    GENERATED.mkdir(exist_ok=True)
    fixture = {"retrieved": dt.date.today().isoformat(), "acceptanceSeconds": ACCEPTANCE_SECONDS,
               "sourceScale": "Horizons UT (UTC for these dates); USNO UT minute labels treated as UTC",
               "ayanamsa": "lahiri", "reduction": "true Lahiri: independent ERFA epoch construction + nut00b",
               "python": sys.version.split()[0], "numpy": np.__version__,
               "pyerfa": erfa.__version__, "referenceTool": str(TOOL.relative_to(PROJECT.parent)),
               "referenceToolSHA256": hashlib.sha256(TOOL.read_bytes()).hexdigest(),
               "licenseBasis": "US Government numerical facts and ERFA numerical results only; see SOURCES.md",
               "windows": [window(date, ref, args.offline) for date in DATES], "usno": phases(args.offline)}
    output = GENERATED / "transition-references.json"
    encoded = json.dumps(fixture, indent=2) + "\n"
    if len(encoded.encode()) >= 2_000_000:
        raise ValueError("Extract exceeds project file limit")
    output.write_text(encoded)
    print("Wrote independent transition proposal in panchang/generated/ for review.")


if __name__ == "__main__":
    main()
