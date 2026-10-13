#!/usr/bin/env python3
"""Select unchanged GeoNames rows. MIT; selected data is CC-BY-4.0.

No full download is written to disk. --refresh intentionally replaces the
sample and receipt with the current daily upstream snapshot. --check verifies
local receipt bindings without network. --check-upstream also downloads inputs
and requires their pinned hashes, or reads saved inputs with --source-dir.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import sys
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RECEIPT = DATA / "sample-receipt.json"
BASE = "https://download.geonames.org/export/dump/"
FILE_LIMIT = 2_000_000
INPUT_LIMIT = 64_000_000
SELECTION = {
    "cities15000.zip": {
        "184745",   # Nairobi
        "1275004",  # Kolkata
        "1283240",  # Kathmandu
        "1850147",  # Tokyo
        "2078025",  # Adelaide
        "2729907",  # Longyearbyen
        "2973783",  # Strasbourg
        "2988507",  # Paris
        "3030300",  # Brest
        "3448439",  # Sao Paulo
        "4250542",  # Springfield, Illinois
        "4409896",  # Springfield, Missouri
        "4951788",  # Springfield, Massachusetts
        "5128581",  # New York City
    },
    "NZ.zip": {"4032804"},  # Waitangi, Chatham Islands
    "AQ.zip": {"13664897"},  # McMurdo Station, populated-place record
}
TABLES = {
    "geonames-sample.tsv": 19,
    "admin1-sample.tsv": 4,
    "country-info-sample.tsv": 19,
}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def fields(raw, count):
    text = raw.removesuffix(b"\n").removesuffix(b"\r").decode("utf-8")
    result = text.split("\t")
    if len(result) != count:
        raise ValueError(f"Expected {count} fields, got {len(result)}")
    return result


def select(raw, keys, count):
    """Keep the entire source row, including its original newline bytes."""
    found = {}
    for row in raw.splitlines(keepends=True):
        if row.startswith(b"#") or not row.strip():
            continue
        key = row.split(b"\t", 1)[0].decode("utf-8")
        if key in keys:
            fields(row, count)
            if key in found:
                raise ValueError(f"Duplicate source key: {key}")
            if not row.endswith(b"\n"):
                raise ValueError("Selected source row has no final newline")
            found[key] = row
    missing = keys - found.keys()
    if missing:
        raise ValueError(f"Missing source keys: {sorted(missing)}")
    return found


def fetch(file, source_dir=None):
    url = BASE + file
    if source_dir is None:
        request = urllib.request.Request(url, headers={"User-Agent": "zodiacs-geocode-sample/1"})
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read(INPUT_LIMIT + 1)
            metadata = {
                "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "lastModified": response.headers.get("Last-Modified"),
            }
    else:
        with (source_dir / file).open("rb") as source:
            raw = source.read(INPUT_LIMIT + 1)
        metadata = {}
    if len(raw) > INPUT_LIMIT:
        raise ValueError(f"Input exceeds bounded sample-download size: {file}")
    metadata.update({"file": file, "url": url, "sha256": digest(raw), "bytes": len(raw)})
    if file.endswith(".zip"):
        member = file.removesuffix(".zip") + ".txt"
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            members = [item for item in archive.infolist() if item.filename == member]
            if len(members) != 1 or members[0].file_size > INPUT_LIMIT:
                raise ValueError(f"Invalid or oversized archive member: {member}")
            with archive.open(members[0]) as source:
                raw = source.read(INPUT_LIMIT + 1)
            if len(raw) > INPUT_LIMIT:
                raise ValueError(f"Oversized decompressed input: {member}")
        metadata.update({
            "archiveMember": member,
            "memberSha256": digest(raw),
            "memberBytes": len(raw),
        })
    return raw, metadata


def collect(source_dir=None):
    upstream = []
    places = {}
    for file, ids in SELECTION.items():
        raw, metadata = fetch(file, source_dir)
        selected = select(raw, ids, 19)
        if places.keys() & selected.keys():
            raise ValueError("Repeated place across sample inputs")
        places.update(selected)
        metadata["selectedKeys"] = sorted(ids, key=int)
        upstream.append(metadata)
    place_rows = [fields(row, 19) for row in places.values()]
    region_keys = {row[8] + "." + row[10] for row in place_rows if row[10] and row[10] != "00"}
    country_keys = {row[8] for row in place_rows}
    outputs = {
        "geonames-sample.tsv": b"".join(places[key] for key in sorted(places, key=int)),
    }
    for source, output, keys, count in [
        ("admin1CodesASCII.txt", "admin1-sample.tsv", region_keys, 4),
        ("countryInfo.txt", "country-info-sample.tsv", country_keys, 19),
    ]:
        raw, metadata = fetch(source, source_dir)
        selected = select(raw, keys, count)
        outputs[output] = b"".join(selected[key] for key in sorted(selected))
        metadata["selectedKeys"] = sorted(keys)
        upstream.append(metadata)
    return outputs, upstream


def verify_local():
    receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
    if receipt["schemaVersion"] != 1 or receipt["license"] != "CC-BY-4.0":
        raise ValueError("Unexpected sample receipt schema or license")
    expected_ids = set().union(*SELECTION.values())
    for file, count in TABLES.items():
        raw = (DATA / file).read_bytes()
        metadata = next(item for item in receipt["outputs"] if item["file"] == file)
        rows = [fields(row, count) for row in raw.splitlines(keepends=True)]
        if not len(raw) < FILE_LIMIT or len(raw) != metadata["bytes"]:
            raise ValueError(f"Sample size mismatch: {file}")
        if digest(raw) != metadata["sha256"] or len(rows) != metadata["rows"]:
            raise ValueError(f"Sample receipt mismatch: {file}")
        keys = [row[0] for row in rows]
        if len(set(keys)) != len(keys):
            raise ValueError(f"Duplicate sample keys: {file}")
        if file == "geonames-sample.tsv" and set(keys) != expected_ids:
            raise ValueError("Sample does not match explicit place selection")
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--check", action="store_true", help="Check committed sample without network")
    modes.add_argument("--check-upstream", action="store_true", help="Check sample against pinned upstream input bytes")
    modes.add_argument("--refresh", action="store_true", help="Fetch daily sources and replace sample and receipt")
    parser.add_argument("--source-dir", type=Path, help="Read saved upstream inputs for --check-upstream")
    args = parser.parse_args()
    if args.source_dir is not None and not args.check_upstream:
        parser.error("--source-dir requires --check-upstream")
    if args.check:
        verify_local()
        print("GeoNames sample files match their receipt and selection.")
        return
    previous = verify_local() if args.check_upstream else None
    outputs, upstream = collect(args.source_dir)
    if previous:
        for source in upstream:
            pinned = next(item for item in previous["upstream"] if item["file"] == source["file"])
            if source["sha256"] != pinned["sha256"]:
                raise ValueError(f"Upstream snapshot changed: {source['file']}; use saved pinned inputs or explicitly refresh")
            if source.get("memberSha256") != pinned.get("memberSha256"):
                raise ValueError(f"Upstream member digest mismatch: {source['file']}")
        for file, raw in outputs.items():
            if raw != (DATA / file).read_bytes():
                raise ValueError(f"Selected upstream rows differ from sample: {file}")
        print("GeoNames sample rows match pinned upstream input bytes.")
        return
    raw_readme, readme = fetch("readme.txt")
    if b"Creative Commons Attribution 4.0" not in raw_readme:
        raise ValueError("Upstream licensing statement changed; review it before refreshing")
    receipt = {
        "schemaVersion": 1,
        "dataset": "GeoNames Gazetteer extract",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "attribution": "Contains geographical data from GeoNames (https://www.geonames.org/), licensed CC BY 4.0.",
        "changes": "Selected complete source rows, sorted by numeric GeoNames id for places and by source code for metadata. Row bytes, field values and line endings are unchanged.",
        "selectionTool": "geocode/scripts/select-sample.py",
        "licenseEvidence": readme,
        "upstream": upstream,
        "outputs": [
            {"file": file, "sha256": digest(raw), "bytes": len(raw), "rows": len(raw.splitlines())}
            for file, raw in outputs.items()
        ],
    }
    encoded_receipt = (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    pending = {**outputs, "sample-receipt.json": encoded_receipt}
    if any(len(raw) >= FILE_LIMIT for raw in pending.values()):
        raise ValueError("Selected output exceeds repository file limit")
    DATA.mkdir(parents=True, exist_ok=True)
    for file, raw in pending.items():
        (DATA / file).write_bytes(raw)
    verify_local()
    print("Refreshed GeoNames sample and receipt from official daily dumps.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, StopIteration, zipfile.BadZipFile) as error:
        print(f"Sample selection failed: {error}", file=sys.stderr)
        sys.exit(1)
