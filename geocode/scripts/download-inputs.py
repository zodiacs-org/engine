#!/usr/bin/env python3
"""Download GeoNames index inputs into small local files. MIT, data CC-BY-4.0.

Uses the sample selector's bounded in-memory HTTPS/ZIP reader. Full archives
and extracted dumps are never persisted. --source-dir allows offline replay
from saved source archives. This command deliberately adopts a new snapshot.
"""

import argparse
import json
from pathlib import Path
import re
import runpy
import shutil


helpers = runpy.run_path(str(Path(__file__).with_name("select-sample.py")))
fetch = helpers["fetch"]
FILE_LIMIT = helpers["FILE_LIMIT"]
PART_BYTES = 1_000_000


def download(output, archive, source_dir=None):
    if not re.fullmatch(r"(?:cities(?:500|1000|5000|15000)|[A-Z]{2})\.zip", archive):
        raise ValueError("Expected a GeoNames city extract or country archive filename")
    # A new directory only. Never erase an existing source snapshot.
    output.mkdir(parents=True, exist_ok=False)
    try:
        inputs = []
        for source, target in [(archive, "places"), ("countryInfo.txt", "countries.tsv"),
                               ("admin1CodesASCII.txt", "admin1.tsv")]:
            raw, receipt = fetch(source, source_dir)
            receipt["path"] = target
            if source == archive:
                parts = output / target
                parts.mkdir()
                # Byte chunks concatenate exactly to the extracted member, even
                # when a UTF-8 character or line crosses a part boundary.
                for number, start in enumerate(range(0, len(raw), PART_BYTES)):
                    (parts / f"part-{number:06d}.tsv").write_bytes(raw[start:start + PART_BYTES])
            else:
                if len(raw) >= FILE_LIMIT:
                    raise ValueError("Metadata file exceeds repository file limit")
                (output / target).write_bytes(raw)
            inputs.append(receipt)
        receipt = {
            "schemaVersion": 1,
            "dataset": "geonames",
            "license": "CC-BY-4.0",
            "attribution": "GeoNames (https://www.geonames.org/), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Extracted source bytes split into local parts without modification.",
            "inputs": inputs,
        }
        encoded = (json.dumps(receipt, indent=2) + "\n").encode("utf-8")
        if len(encoded) >= FILE_LIMIT:
            raise ValueError("Source receipt exceeds file limit")
        (output / "sources.json").write_bytes(encoded)
        print("Downloaded GeoNames source parts and sources.json into " + str(output))
    except BaseException:
        shutil.rmtree(output)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--places-archive", default="cities15000.zip")
    parser.add_argument("--source-dir", type=Path)
    args = parser.parse_args()
    download(args.out, args.places_archive, args.source_dir)
