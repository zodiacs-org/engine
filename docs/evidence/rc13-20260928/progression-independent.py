#!/usr/bin/env python3
"""Independent exact-rational time mapping against an archive-bound runtime.

Usage: python3 progression-independent.py --entry /consumer/dist/index.js \
       --archive artifacts/zodiacs-engine-0.1.1-rc.13.tgz --output report.json

rc.13 copy of the rc.12 checker: the published example is cited to printed
pages 84-85 with the PDF's SHA-256, and the book's own arithmetic is also
checked from the 19.677 h birth time it computed with (see
docs/evidence/rc12-20260928/sources.md).
"""
import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import random
import subprocess
import tarfile


YEAR_DAYS = Fraction(3652422, 10000)
MAPPING_TOLERANCE_MS = 1
PUBLISHED_TIME_TOLERANCE_MS = 5000   # the book's own precision allows up to 4.73 s
BOOK_ARITHMETIC_TOLERANCE_MS = 50    # its six-decimal quotient alone moves the result 42 ms
BOOK_PDF_SHA256 = "bf52656b367ad7d1415a7b021a0a0db3a609bf35c7a40053ff0622e7a3325622"
TIME_CLIP_LIMIT = 8640000000000000
BOOK_URL = "https://juanestadella.com/Predictive_Astrology_Juan-Estadella_3rd_edition.pdf"
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)

# Node invokes only the candidate. All expected arithmetic is computed below
# using exact Python rational numbers, independently of JavaScript arithmetic.
BRIDGE = r"""
import { pathToFileURL } from 'node:url';
const engine = await import(pathToFileURL(process.argv[1]).href);
let input = '';
for await (const chunk of process.stdin) input += chunk;
const cases = JSON.parse(input);
const results = cases.map(row => {
  const convert = value => row.inputType === 'date' ? new Date(value) : value;
  try {
    const result = engine.progressedInstant(convert(row.birth), convert(row.target));
    return {id: row.id, milliseconds: result.getTime()};
  } catch (error) {
    return {id: row.id, error: String(error)};
  }
});
process.stdout.write(JSON.stringify({yearDays: engine.PROGRESSION_DAYS_PER_YEAR, results}));
"""


def iso_ms(value):
    delta = datetime.fromisoformat(value.replace("Z", "+00:00")) - EPOCH
    return delta.days * 86400000 + delta.seconds * 1000 + delta.microseconds // 1000


def exact_mapping(birth_ms, target_ms):
    # int(Fraction) truncates toward zero, matching ECMAScript TimeClip.
    return int(Fraction(birth_ms) + Fraction(target_ms - birth_ms) / YEAR_DAYS)


def fixtures():
    cases = []

    def add(label, birth, target, kind="number"):
        b = iso_ms(birth) if isinstance(birth, str) else birth
        t = iso_ms(target) if isinstance(target, str) else target
        expected = exact_mapping(b, t)
        if abs(expected) > TIME_CLIP_LIMIT:
            raise ValueError("Fixture maps outside the JavaScript Date range")
        cases.append(dict(id=label, birth=birth, target=target, inputType=kind,
                          birthMs=b, targetMs=t, expectedMs=expected))

    named = [
        ("epoch", "1970-01-01T00:00:00.000Z", "1970-01-01T00:00:00.000Z"),
        ("prebirth", "2000-02-29T12:34:56.789Z", "1900-03-01T00:00:00.001Z"),
        ("leap-birthday", "2000-02-29T12:34:56.789Z", "2024-02-29T12:34:56.789Z"),
        ("century-nonleap", "1896-02-29T00:00:00.000Z", "1900-03-01T00:00:00.000Z"),
        ("negative-epoch", "1800-01-01T00:00:00.001Z", "1850-07-01T06:00:00.999Z"),
        ("cross-epoch", "1969-12-31T23:59:59.999Z", "2000-01-01T00:00:00.001Z"),
        ("offset-input", "2005-08-23T08:15:30+05:45", "2024-11-05T17:01:09-04:00"),
        ("published-chaplin", "1889-04-16T19:40:40.000Z", "1901-05-09T12:00:00.000Z"),
        ("book-effective-birth", "1889-04-16T19:40:37.200Z", "1901-05-09T12:00:00.000Z"),
    ]
    for label, birth, target in named:
        for kind in ("iso", "number", "date"):
            add(f"{label}-{kind}", birth if kind == "iso" else iso_ms(birth),
                target if kind == "iso" else iso_ms(target), kind)

    # Exercise truncation around either side of epoch zero, signed mappings,
    # sub-day intervals, and large finite Date values without calendar parsing.
    anchors = [-TIME_CLIP_LIMIT, -8000000000000000, -1, 0, 1,
               8000000000000000, TIME_CLIP_LIMIT]
    targets = [-TIME_CLIP_LIMIT, -86400000, -1, 0, 1, 86400000, TIME_CLIP_LIMIT]
    for birth in anchors:
        for target in targets:
            add(f"numeric-{len(cases)}", birth, target)

    rng = random.Random(20260928)
    start, end = iso_ms("1800-01-01T00:00:00Z"), iso_ms("2200-01-01T00:00:00Z")
    for index in range(128):
        add(f"deterministic-{index}", rng.randint(start, end), rng.randint(start, end))
    return cases


def digest(data):
    return hashlib.sha256(data).hexdigest()


def archive_binding(entry, archive):
    if entry.name != "index.js" or entry.parent.name != "dist":
        raise ValueError("--entry must identify the package's dist/index.js")
    package_root = entry.parent.parent
    archive_bytes = archive.read_bytes()
    expected = {}
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle.getmembers():
            if not (member.isfile() and (member.name.startswith("package/dist/")
                                        or member.name == "package/package.json")):
                continue
            relative = member.name.removeprefix("package/")
            if ".." in Path(relative).parts or relative in expected:
                raise ValueError("Unsafe or duplicated archive member")
            expected[relative] = digest(bundle.extractfile(member).read())
    actual = {str(path.relative_to(package_root)): digest(path.read_bytes())
              for path in sorted(entry.parent.rglob("*")) if path.is_file()}
    actual["package.json"] = digest((package_root / "package.json").read_bytes())
    if not expected or expected != actual:
        raise ValueError("Invoked package metadata/dist bytes do not match the archive")
    return dict(archiveSha256=digest(archive_bytes), archiveBytes=len(archive_bytes),
                packageFiles=actual)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entry", type=Path, required=True)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    entry, archive = args.entry.resolve(), args.archive.resolve()
    # Fail before execution if the selected runtime is not the frozen archive.
    before = archive_binding(entry, archive)
    cases = fixtures()
    payload = json.dumps(cases, separators=(",", ":"), allow_nan=False).encode()
    completed = subprocess.run(["node", "--input-type=module", "--eval", BRIDGE, str(entry)],
                               input=payload, capture_output=True, check=True, timeout=60)
    observed = json.loads(completed.stdout)
    after = archive_binding(entry, archive)
    failures = []
    if before != after:
        failures.append(dict(reason="Archive or invoked bytes changed during execution"))
    if observed.get("yearDays") != float(YEAR_DAYS):
        failures.append(dict(reason="Exported year convention differs", actual=observed.get("yearDays")))
    rows = observed.get("results", [])
    if len(rows) != len(cases):
        raise ValueError("Candidate returned an unexpected number of results")
    max_error = 0
    case_results = []
    for case, row in zip(cases, rows, strict=True):
        actual = row.get("milliseconds")
        valid = row.get("id") == case["id"] and type(actual) is int
        error = abs(actual - case["expectedMs"]) if valid else None
        passed = error is not None and error <= MAPPING_TOLERANCE_MS
        max_error = max(max_error, error or 0)
        result = dict(id=case["id"], actualMs=actual, expectedMs=case["expectedMs"],
                      errorMs=error, passed=passed)
        case_results.append(result)
        if not passed:
            failures.append(dict(reason="Exact-rational mapping discrepancy", case=case, observed=row))

    published = next(row for row in case_results if row["id"] == "published-chaplin-iso")
    printed_ms = iso_ms("1889-04-28T21:06:27.000Z")
    printed_error = abs(published["actualMs"] - printed_ms) if published["actualMs"] is not None else None
    published_pass = printed_error is not None and printed_error <= PUBLISHED_TIME_TOLERANCE_MS
    if not published_pass:
        failures.append(dict(reason="Published worked-time discrepancy", errorMs=printed_error))
    # The book writes 19:40:40 as 19.677 h (19:40:37.2) and reaches 0.879489 d,
    # 21:06:27.8496, before truncating to the printed 21:06:27.
    effective = next(row for row in case_results if row["id"] == "book-effective-birth-iso")
    unrounded_ms = iso_ms("1889-04-28T21:06:27.000Z") + Fraction(8496, 10)
    book_error = abs(effective["actualMs"] - unrounded_ms) if effective["actualMs"] is not None else None
    floors_to_printed = effective["actualMs"] is not None and effective["actualMs"] // 1000 * 1000 == printed_ms
    book_pass = book_error is not None and book_error <= BOOK_ARITHMETIC_TOLERANCE_MS and floors_to_printed
    if not book_pass:
        failures.append(dict(reason="Book-arithmetic discrepancy", errorMs=float(book_error) if book_error is not None else None))
    report = dict(schema="zodiacs.independent-progression-time.v1",
                  timestamp=datetime.now(timezone.utc).isoformat(), allPassed=not failures,
                  entry=str(entry), archive=str(archive), bindingBefore=before, bindingAfter=after,
                  scriptSha256=digest(Path(__file__).read_bytes()), bridgeSha256=digest(BRIDGE.encode()),
                  fixturesSha256=digest(payload), caseCount=len(cases),
                  oracle=dict(yearDaysNumerator=YEAR_DAYS.numerator, yearDaysDenominator=YEAR_DAYS.denominator,
                              outputRounding="truncate toward zero", toleranceMs=MAPPING_TOLERANCE_MS),
                  maximumMappingErrorMs=max_error,
                  publishedWorkedExample=dict(source=BOOK_URL, sourceSha256=BOOK_PDF_SHA256, printedPages=[84, 85],
                      birth="1889-04-16T19:40:40Z", target="1901-05-09T12:00:00Z",
                      printedProgressedTime="1889-04-28T21:06:27Z", toleranceMs=PUBLISHED_TIME_TOLERANCE_MS,
                      toleranceBasis="book precision: 0.001 h birth time (3.6 s) + three six-decimal day values (0.13 s) + seconds truncation (1 s) = 4.73 s",
                      errorMs=printed_error, passed=published_pass,
                      bookArithmetic=dict(effectiveBirth="1889-04-16T19:40:37.200Z", unroundedResult="1889-04-28T21:06:27.8496Z",
                                          actualMs=effective["actualMs"], errorMs=float(book_error) if book_error is not None else None,
                                          floorsToPrinted=floors_to_printed, toleranceMs=BOOK_ARITHMETIC_TOLERANCE_MS, passed=book_pass)),
                  results=case_results, failures=failures,
                  limits=["Time mapping only; not physical ephemeris or astrological validity.",
                          "Published example uses rounded intermediate manual arithmetic.",
                          "Published planetary table, angles, houses and mean node are not accepted by this gate."])
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(json.dumps({key: report[key] for key in ["allPassed", "caseCount", "maximumMappingErrorMs",
                                                 "publishedWorkedExample"]}))
    raise SystemExit(0 if report["allPassed"] else 1)


if __name__ == "__main__":
    main()
