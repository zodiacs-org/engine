#!/usr/bin/env python3
"""Build test-only references with the existing independent L3 IANA arbiter.

No engine or atlas output enters this fixture. Downloads and compiled files
stay in ignored geocode folders. Selected results are also generated there;
no generated timezone dataset is committed.
"""
import argparse
import datetime as dt
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile

# Reading the shared arbiter must not write __pycache__ outside this project.
sys.dont_write_bytecode = True

PROJECT = Path(__file__).resolve().parent.parent
ROOT = PROJECT.parent
OUTPUT = PROJECT / "generated/m9-time-evidence.json"
ARBITER = ROOT / "conformance/arbiters/l3/build.py"

# Fixed synthetic civil readings, chosen before running any engine comparison.
# Boundary probes are at the API's minute precision.
GROUPS = [
    ("first-british-dst", "Europe/London", "1916-05-21", ["01:59", "02:00", "02:30", "02:59", "03:00"]),
    ("double-summer-gap", "Europe/London", "1941-05-04", ["01:59", "02:00", "02:30", "02:59", "03:00"]),
    ("double-summer-fold", "Europe/London", "1941-08-10", ["01:59", "02:00", "02:30", "02:59", "03:00"]),
    ("half-hour-fold", "Australia/Lord_Howe", "1986-03-16", ["01:29", "01:30", "01:45", "01:59", "02:00"]),
    ("half-hour-gap", "Australia/Lord_Howe", "1985-10-27", ["01:59", "02:00", "02:15", "02:29", "02:30"]),
    ("quarter-hour-change", "Asia/Kathmandu", "1986-01-01", ["00:00", "00:07", "00:14", "00:15"]),
    ("skipped-date", "Pacific/Apia", "2011-12-30", ["00:00", "12:00", "23:59"]),
    ("skipped-date-before", "Pacific/Apia", "2011-12-29", ["23:59"]),
    ("skipped-date-after", "Pacific/Apia", "2011-12-31", ["00:00"]),
    ("repeated-date", "America/Sitka", "1867-10-19", ["12:00"]),
    ("seconds-offset", "Europe/Dublin", "1916-06-15", ["12:00"]),
    ("old-mean-time", "Asia/Tokyo", "1880-06-01", ["12:00"]),
    ("polar-link-history", "Arctic/Longyearbyen", "1945-06-01", ["12:00"]),
    ("polar-winter", "Arctic/Longyearbyen", "2000-01-15", ["12:00"]),
    ("polar-summer", "Arctic/Longyearbyen", "2000-07-15", ["12:00"]),
    ("antarctic-winter", "Antarctica/McMurdo", "2000-07-15", ["12:00"]),
    ("antarctic-summer", "Antarctica/McMurdo", "2000-01-15", ["12:00"]),
    ("three-hour-fold", "Antarctica/Casey", "2018-03-11", ["00:59", "01:00", "01:30", "03:59", "04:00"]),
    ("half-hour-zone", "Asia/Kolkata", "2000-06-15", ["12:00"]),
    ("quarter-hour-zone", "Pacific/Chatham", "2000-01-15", ["12:00"]),
]


def utc(seconds):
    return (dt.datetime(1970, 1, 1) + dt.timedelta(seconds=seconds)).isoformat(timespec="seconds") + "Z"


def generate(args):
    spec = importlib.util.spec_from_file_location("l3_iana_arbiter", ARBITER)
    arb = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(arb)
    receipt_path = ROOT / "conformance/sources/l3/tzdata.json"
    receipt = json.loads(receipt_path.read_text())
    downloads = PROJECT / "downloads"
    downloads.mkdir(exist_ok=True)
    for kind in ("tzdata", "tzcode"):
        if getattr(args, kind) == "download":
            archive = downloads / Path(receipt[kind]["url"]).name
            if not archive.is_file():
                arb.fetch(receipt[kind]["url"], archive)
            setattr(args, kind, str(archive))
    cache = PROJECT / ".cache"
    cache.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="m9-tz-", dir=cache) as temp:
        work = Path(temp).resolve()
        data = arb.load_release("tzdata", args.tzdata, receipt["tzdata"], work)
        code = arb.load_release("tzcode", args.tzcode, receipt["tzcode"], work)
        tree = work / "tzdb"
        arb.assemble_tree(tree, data, code)
        if args.cc:
            # Minimal compilation of the pinned Makefile's TZCOBJS/TZDOBJS.
            # Every TZif byte must still match the existing L3 tree receipt.
            cc = shutil.which(args.cc)
            if not cc:
                raise ValueError("C compiler unavailable")
            (tree / "version.h").write_text(
                'static char const PKGVERSION[]="(tzcode) ";\n'
                'static char const TZVERSION[]="2025c";\n'
                'static char const REPORT_BUGS_TO[]="tz@iana.org";\n')
            (tree / "tzdir.h").write_text(
                '#define TZDEFAULT "/nonexistent"\n#define TZDIR "/nonexistent"\n')
            arb.run([cc, "-o", "zic", "zic.c"], cwd=tree)
            arb.run([cc, "-o", "zdump", "zdump.c", "localtime.c", "strftime.c"], cwd=tree)
        else:
            make = shutil.which(args.make)
            if not make:
                raise ValueError("make unavailable; supply --make or --cc")
            arb.run([make, "zic", "zdump"], cwd=tree)
        zic, zdump = tree / "zic", tree / "zdump"
        versions = [arb.tool_version(tool) for tool in (zic, zdump)]
        if not all(version.endswith(" 2025c") for version in versions):
            raise ValueError("Expected pinned tzcode 2025c")
        zones, _, _, _ = arb.build_tzdb(tree, work, shutil.which("awk"), zic, receipt)
        if arb.tree_digest(zones)[1] != receipt["compiledTree"]["sha256"]:
            raise ValueError("Compiled timezone tree differs from L3 receipt")
        oracle = arb.ZoneOracle(zdump, zones)
        cases = []
        for group, zone, date, times in GROUPS:
            for time in times:
                local = f"{date}T{time}:00"
                expected, _ = oracle.solve(zone, local)
                zd, reader, zi = oracle.readers(zone)
                wall = arb.civil_seconds(*arb.parse_local(local))
                hits = arb.solve_by_offsets(reader, wall)
                expected["instants"] = [{"utc": utc(t), "offsetSeconds": off} for t, off, _ in hits]
                if expected["status"] != "ok":
                    # Read the actual discontinuity, independently of engine policy.
                    jumps = []
                    for at in reader.breakpoints(wall - 3 * 86400, wall + 3 * 86400):
                        before, after = reader.offset_at(at - 1), reader.offset_at(at)
                        if min(at + before, at + after) <= wall < max(at + before, at + after):
                            if zd.offset_at(at - 1) != before or zd.offset_at(at) != after:
                                raise ValueError("Transition readers disagree")
                            for instant, offset in ((at - 1, before), (at, after)):
                                wall_at = dt.datetime.fromtimestamp(instant, tz=dt.timezone.utc).astimezone(zi)
                                if int(wall_at.utcoffset().total_seconds()) != offset:
                                    raise ValueError("Python transition offset disagrees")
                            jumps.append({"at": utc(at), "offsetBeforeSeconds": before, "offsetAfterSeconds": after})
                    if len(jumps) != 1:
                        raise ValueError(f"Expected one discontinuity for {zone} {local}")
                    expected["transition"] = jumps[0]
                    if expected["status"] == "nonexistent":
                        chosen = wall - jumps[0]["offsetBeforeSeconds"]
                        actual = reader.offset_at(chosen)
                        if actual != jumps[0]["offsetAfterSeconds"]:
                            raise ValueError("Gap policy crosses another transition")
                        expected["shiftForward"] = {"utc": utc(chosen), "offsetSeconds": actual}
                case = {"id": f"{group}-{time.replace(':', '')}", "zone": zone, "local": local, "expected": expected}
                if group == "polar-link-history":
                    # L3 documents this name's backzone link-chain quirk. Keep
                    # both independently computed answers, never engine output.
                    links = [line.split() for line in data["backzone"].decode().splitlines()
                             if line.startswith("Link")]
                    target = next(parts[1] for parts in links if parts[2] == zone)
                    target_expected, _ = oracle.solve(target, local)
                    _, target_reader, _ = oracle.readers(target)
                    target_hits = arb.solve_by_offsets(target_reader, wall)
                    target_expected["instants"] = [
                        {"utc": utc(t), "offsetSeconds": off} for t, off, _ in target_hits]
                    case["backzoneLink"] = {"zone": target, "expected": target_expected}
                cases.append(case)
        return {
            "schemaVersion": 1,
            "reference": {
                "arbiter": "conformance/arbiters/l3/build.py",
                "arbiterSha256": arb.sha256_file(ARBITER),
                "receipt": "conformance/sources/l3/tzdata.json",
                "receiptSha256": arb.sha256_file(receipt_path),
                "release": receipt["release"], "form": "main+backzone",
                "sources": [{"url": receipt[k]["url"], "sha256": receipt[k]["sha256"]} for k in ("tzdata", "tzcode")],
                "compiledTreeSha256": receipt["compiledTree"]["sha256"],
                "tools": versions,
                "readers": ["tzcode zdump", "L3 independent TZif reader", "CPython zoneinfo.ZoneInfo.from_file"],
                "license": "public-domain",
                "scope": "Selected synthetic readings only; agreement with tzdb, not historical ground truth."
            },
            "cases": cases
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tzdata", default="download")
    parser.add_argument("--tzcode", default="download")
    parser.add_argument("--make", default="make")
    parser.add_argument("--cc", help="Compile the pinned tools directly when make is unavailable")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(generate(args), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if OUTPUT.read_text() != rendered:
            raise SystemExit("Timezone evidence is stale")
        print("PASS: timezone evidence rebuilds byte for byte")
    else:
        OUTPUT.parent.mkdir(exist_ok=True)
        OUTPUT.write_text(rendered)
        print("Wrote selected independent timezone evidence")


if __name__ == "__main__":
    main()
