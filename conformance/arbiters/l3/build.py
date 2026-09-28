#!/usr/bin/env python3
"""Generate vectors/L3-time-calendars.json: level L3 (time and calendars) of the
zodiacs-conformance suite, v0.  The format is fixed by conformance/SPEC.md.

Every expected value comes from an arbiter outside any astrology engine:

  tzdb-2025c-backzone      time.zone-offset      IANA tzdb 2025c with backzone, compiled by zic
                                                 2025c, read back by three independent readers
  lmt-definition           time.local-mean-time  15 degrees of longitude per hour (240 s per degree)
  iers-leap-seconds-2025c  time.tt-minus-utc     leap-seconds.list of tzdata 2025c; TT = TAI + 32.184 s
  iers-ut1-finals2000a     time.delta-t          IERS UT1-UTC (observed rows) and the leap-second table
  calendar-arithmetic      calendar.to-jdn,      exact integer arithmetic, two published algorithms
                           calendar.from-jdn     per calendar that must agree (plus a third check)

Swiss Ephemeris is not used here (see check_swiss.py for the after-the-fact statistics).
Node's Intl and the host's tz data are not used: the zone arbiter reads only the TZif files
it compiles itself, by explicit path.

Usage (from anywhere):
  python3 build.py                          # fetch both tz tarballs from IANA, build, write the file
  python3 build.py --tzdata T.tar.gz --tzcode C.tar.gz        # local tarballs (digests checked)
  python3 build.py --tzdata DIR --zic ZIC --zdump ZDUMP       # extracted tzdata, prebuilt 2025c tools
  python3 build.py --check                  # rebuild and compare with the committed file

Requirements: python3 >= 3.9 (zoneinfo), a POSIX awk (for tzdb's own ziguard.awk and zishrink.awk),
and zic/zdump from tzcode 2025c: either prebuilt (--zic/--zdump) or built here from the tzcode
tarball, which needs make and a C compiler.  The output is the same bytes on every run.
"""

import argparse
import bisect
import csv
import datetime as dtm
import hashlib
import html
import io
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zoneinfo
from decimal import Decimal
from fractions import Fraction
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent                      # conformance/
SRC = ROOT / "sources" / "l3"
OUT_DEFAULT = ROOT / "vectors" / "L3-time-calendars.json"
GENERATOR = "arbiters/l3/build.py"

# Copies of committed evidence, pinned (they are copied unchanged; see README.md).
PINNED = {
    "iers-finals2000A-ut1.csv": "c698117a9c11524196e51a71493776e3287223b9ee75582548392dec8d45f669",
    "tzdb-divergence-98.json": "d3258be9118494fba3cff97dea1a954f13f7c084249494674f5eaed7b816ee3e",
}

# ---------------------------------------------------------------------------------------------
# Case design.  Everything below is fixed by rule; the expected values are computed.
# ---------------------------------------------------------------------------------------------

# time.zone-offset, part 1: the divergence list (sources/l3/tzdb-divergence-98.json), the 98 zones
# where the audit found tzdb-with-backzone and ICU's default build disagreeing on the UTC offset.
# Rule, applied to the zones in the list's own order:
#   1. keep a zone only if this build compiles it from a Zone line (not a Link);
#   2. keep it only if it has a sample segment ending on or before 1970-01-01; take the longest
#      such segment (the first one listed on a tie);
#   3. the local time is 12:00:00 on the middle day of that segment, from + floor(days / 2);
#   4. drop the zone if the compiled data give that local time the abbreviation "-00" (tzdb's
#      mark for "local time unspecified", used for uninhabited places: there is no civil offset
#      to test);
#   5. of the zones left, take every fourth, starting with the first: 20 cases.
# Rule 1 matters because the 2025c Makefile's ziguard.awk shortens link chains using a link
# table that backzone's Zone lines do not clear, so backzone links such as America/Kralendijk ->
# America/Curacao come out as links to the main-data target (America/Puerto_Rico): their answer
# would test a build-script quirk, not backzone data.
DIVERGENCE_STRIDE = 4
DIVERGENCE_COUNT = 20

# Part 2: ordinary cases after 1970 (both hemispheres, a half-hour and two 45-minute offsets,
# and one beyond the last explicit transition of a slim TZif file).
ORDINARY_CASES = [
    ("America/New_York", "1995-07-04T12:00:00", "Northern summer time (EDT)."),
    ("Australia/Sydney", "2001-01-15T09:30:00", "Southern summer time (AEDT)."),
    ("America/Sao_Paulo", "1999-12-25T18:00:00",
     "Southern summer time in a zone that dropped it in 2019."),
    ("Asia/Kolkata", "2010-06-01T12:00:00", "Half-hour offset, +05:30."),
    ("Asia/Kathmandu", "2005-03-10T12:00:00", "45-minute offset, +05:45."),
    ("Pacific/Chatham", "2020-02-01T12:00:00", "45-minute offset in summer time, +13:45."),
    ("Europe/Paris", "2035-07-15T12:00:00",
     "Summer time after the last explicit transition in the TZif file, from its TZ string."),
]

# Part 3: transitions, skipped and repeated local times in several zones and eras.
TRANSITION_CASES = [
    ("America/New_York", "2021-03-14T02:30:00", "Spring forward: 02:00 EST becomes 03:00 EDT."),
    ("America/New_York", "2021-11-07T01:30:00", "Fall back: 01:00-02:00 occurs in EDT, then in EST."),
    ("Australia/Sydney", "2020-04-05T02:30:00",
     "Southern fall back: 02:00-03:00 occurs in AEDT, then in AEST."),
    ("Australia/Lord_Howe", "2021-04-04T01:45:00",
     "Half-hour summer time ends: 01:30-02:00 occurs at +11:00, then at +10:30."),
    ("Europe/London", "1941-05-04T02:30:00",
     "Double summer time begins: BST (+1) to BDST (+2) skips 02:00-03:00."),
    ("Europe/London", "1941-08-10T02:30:00",
     "Double summer time ends: 02:00-03:00 occurs at +2, then at +1."),
    ("America/Caracas", "2016-05-01T02:40:00",
     "Standard offset change from -04:30 to -04:00 skips 02:30-03:00."),
    ("Pacific/Apia", "2011-12-30T12:00:00", "Date line change: 30 December 2011 was skipped."),
    ("America/Sitka", "1867-10-19T00:00:00",
     "Date line change of 1867: local mean time went back a day, so this time occurs twice."),
]

# Part 4: local mean time before a zone's first standard-time transition.  The expected offset
# is the one stored in the compiled TZif file: tzdb 2025c states it to the whole second (see
# the arbiter text on #STDOFF comments and rounding).
LMT_CASES = [
    ("America/New_York", "1870-01-01T12:00:00",
     "LMT before 1883-11-18; tzdb gives -4:56:02 (its #STDOFF comment says -4:56:01.6)."),
    ("Europe/Lisbon", "1880-06-01T12:00:00",
     "LMT before 1912; tzdb gives -0:36:45 (its #STDOFF comment says -0:36:44.68)."),
    ("Europe/Paris", "1880-06-01T12:00:00", "LMT before 1891-03-16; tzdb gives +0:09:21."),
    ("Asia/Tokyo", "1880-06-01T12:00:00", "LMT before 1888; tzdb gives +9:18:59."),
    ("Australia/Sydney", "1880-06-01T12:00:00", "LMT before 1895; tzdb gives +10:04:52."),
    ("America/Sao_Paulo", "1900-06-01T12:00:00", "LMT before 1914; tzdb gives -3:06:28."),
]

# Part 5: to taste.
TASTE_CASES = [
    ("Europe/Dublin", "1916-07-01T12:00:00",
     "Summer time on Dublin Mean Time: -0:25:21 + 1:00 = +0:34:39, an offset with seconds."),
    ("Pacific/Kiritimati", "2020-06-01T12:00:00", "The largest offset in use, +14:00."),
    ("Africa/Casablanca", "2030-01-20T12:00:00",
     "tzdb 2025c's answer, its predicted Ramadan offset (+00) from explicit transitions rather "
     "than the TZ string; later releases differ: 2026d puts Morocco on permanent +00 from "
     "2026-09-20, which gives the same offset here but +00 instead of +01 on most 2030 dates."),
]

# The tag on part 1's vectors (SPEC.md: `tags`, short lowercase strings).
BACKZONE_TAG = "backzone-history"

# The maintainers' caveat on backzone, quoted verbatim from tzdata 2025c; the build checks both
# quotes against the release's Makefile and theory.html.
CAVEAT_MAKEFILE = "out-of-scope and often-wrong data"
CAVEAT_THEORY = "is less reliable and does not necessarily follow database guidelines"
# The example in the arbiter text (checked against the vectors): Africa/Banjul at this local
# time, with backzone and in tzdb's default build.
BANJUL_EXAMPLE = ("Africa/Banjul", "1880-12-31T12:00:00", -3996, -968)

# The zdump window (years; the lower bound inclusive, the upper exclusive).  Every case lies in it.
ZDUMP_LO, ZDUMP_HI = 1600, 2040

# time.local-mean-time: multiples of 1/16 degree (= 5 x 0.0125), so both the decimal input and
# lon x 240 are exact binary numbers and the expected offset is an exact integer.
LMT_LONGITUDES = [
    (-0.125, "Just west of Greenwich."),
    (2.3125, "Near the Paris meridian."),
    (-77.0625, "Near Washington."),
    (139.75, "Near Tokyo."),
    (179.9375, "Near the antimeridian."),
]

# time.tt-minus-utc: 1972 to 2026, the first leap second's neighbours, the 2016 leap second with
# its neighbours, and a 2026 instant before the table's expiry.
TTU_CASES = [
    ("1972-01-01T00:00:00Z", "First line of the table: TAI - UTC = 10 s."),
    ("1972-06-30T23:59:59Z", "Last whole second before the first leap second."),
    ("1972-07-01T00:00:00Z", "First second after the first leap second."),
    ("1980-01-06T00:00:00Z", "The GPS epoch."),
    ("1990-06-15T12:00:00Z", "Mid-1990."),
    ("2000-01-01T12:00:00Z", "The J2000 instant read as UTC."),
    ("2016-12-31T23:59:59Z", "Last second before the latest leap second."),
    ("2016-12-31T23:59:60Z", "The leap second itself: TAI - UTC keeps the old value, 36 s."),
    ("2017-01-01T00:00:00Z", "First second after the latest leap second: 37 s."),
    ("2026-03-01T00:00:00Z", "Before the table's expiry, 2026-06-28."),
]

# time.delta-t: 1 January and 1 July alternately, every 3.5 years from 1974-01-01 to 2023-01-01
# (15 dates; four of them follow a leap second).  Each is the IERS row at 0h UTC.
DT_DATES = ["1974-01-01", "1977-07-01", "1981-01-01", "1984-07-01", "1988-01-01", "1991-07-01",
            "1995-01-01", "1998-07-01", "2002-01-01", "2005-07-01", "2009-01-01", "2012-07-01",
            "2016-01-01", "2019-07-01", "2023-01-01"]

# calendar.to-jdn (astronomical years).
TO_JDN_CASES = [
    ("julian", -4712, 1, 1, "JDN 0: the start of the Julian Period."),
    ("gregorian", -4713, 11, 24, "JDN 0 in the proleptic Gregorian calendar."),
    ("julian", -4712, 2, 29, "Leap day of the first Julian Period year."),
    ("gregorian", -4000, 2, 29, "Leap day of a negative Gregorian year divisible by 400."),
    ("julian", -1000, 2, 29, "Julian leap day of a negative century year."),
    ("gregorian", -1000, 3, 1, "Day after 28 February in a negative Gregorian common century year."),
    ("julian", -1, 12, 31, "Last day of year -1 (2 BC)."),
    ("julian", 0, 1, 1, "Year 0 (1 BC)."),
    ("gregorian", 0, 2, 29, "Year 0 is a Gregorian leap year."),
    ("julian", 1, 1, 1, "1 January AD 1, Julian."),
    ("gregorian", 1, 1, 1, "1 January AD 1, proleptic Gregorian."),
    ("julian", 1582, 10, 4, "Last Julian day of the 1582 switch."),
    ("gregorian", 1582, 10, 15, "First Gregorian day of the 1582 switch."),
    ("julian", 1582, 10, 15, "The same label in the Julian calendar: ten days later."),
    ("gregorian", 1582, 10, 4, "The same label in the proleptic Gregorian calendar: ten days earlier."),
    ("julian", 1700, 2, 29, "1700: leap in the Julian calendar only."),
    ("gregorian", 1700, 3, 1, "1700: common in the Gregorian calendar."),
    ("julian", 1752, 9, 2, "Last Julian day of the British 1752 switch."),
    ("gregorian", 1752, 9, 14, "First Gregorian day of the British 1752 switch."),
    ("julian", 1900, 2, 29, "1900: leap in the Julian calendar only."),
    ("gregorian", 1900, 3, 1, "1900: common in the Gregorian calendar."),
    ("gregorian", 2000, 1, 1, "The J2000 day."),
    ("gregorian", 2000, 2, 29, "2000: a Gregorian leap century year."),
    ("julian", 4000, 2, 29, "Far future, Julian."),
    ("gregorian", 9999, 12, 31, "Far future, Gregorian."),
]

# calendar.from-jdn.
FROM_JDN_CASES = [
    ("julian", 0, "JDN 0, Julian."),
    ("gregorian", 0, "JDN 0, proleptic Gregorian."),
    ("julian", 1721423, "Last day of year 0, Julian."),
    ("gregorian", 1721119, "Leap day of year 0, Gregorian."),
    ("julian", 2299160, "Last Julian day of the 1582 switch."),
    ("gregorian", 2299161, "First Gregorian day of the 1582 switch."),
    ("julian", 2415092, "A Julian leap day that the Gregorian calendar lacks."),
    ("gregorian", 2451604, "A Gregorian leap day."),
    ("julian", 2451545, "The J2000 day in the Julian calendar."),
    ("gregorian", 5373484, "Far future, Gregorian."),
]

DENSE_YEARS = (-5000, 5000)

# ---------------------------------------------------------------------------------------------
# Small utilities
# ---------------------------------------------------------------------------------------------

LOG = []


def log(msg):
    LOG.append(msg)
    print(msg, file=sys.stderr)


def die(msg):
    print("build.py: error: " + msg, file=sys.stderr)
    sys.exit(2)


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha256_file(path):
    return sha256_bytes(Path(path).read_bytes())


def run(cmd, cwd=None, env=None, stdout_path=None):
    """Run a command; return (stdout bytes, stderr text).  Fail loudly."""
    full_env = dict(os.environ)
    full_env.update(env or {})
    p = subprocess.run([str(c) for c in cmd], cwd=cwd, env=full_env, capture_output=True)
    if p.returncode != 0:
        die("command failed (%d): %s\n%s" % (p.returncode, " ".join(map(str, cmd)),
                                             p.stderr.decode(errors="replace")))
    if stdout_path:
        Path(stdout_path).write_bytes(p.stdout)
    return p.stdout, p.stderr.decode(errors="replace")


def fetch(url, dest):
    try:
        with urllib.request.urlopen(url, timeout=120) as r, open(dest, "wb") as f:
            shutil.copyfileobj(r, f)
        return
    except Exception as exc:                    # e.g. a TLS proxy unknown to Python's CA store
        if not shutil.which("curl"):
            die("download of %s failed: %s" % (url, exc))
        log("  urllib failed (%s); retrying with curl" % exc)
    run(["curl", "-fsSL", "-o", dest, url])


EPOCH_ORDINAL = dtm.date(1970, 1, 1).toordinal()
MJD_UNIX_EPOCH = 40587                          # MJD of 1970-01-01


def days_since_epoch(y, m, d):
    return dtm.date(y, m, d).toordinal() - EPOCH_ORDINAL


def civil_seconds(y, mo, d, h=0, mi=0, s=0):
    """Seconds of a civil date-time counted as if it were UT (no leap seconds)."""
    return days_since_epoch(y, mo, d) * 86400 + h * 3600 + mi * 60 + s


def parse_local(text):
    m = re.fullmatch(r"(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)", text)
    if not m:
        die("bad local time %r" % text)
    return tuple(int(g) for g in m.groups())


# ---------------------------------------------------------------------------------------------
# The tz release: fetch or read, check every digest, assemble one source tree
# ---------------------------------------------------------------------------------------------

TREE_MTIME = 1765406580        # one fixed mtime for every file, so make never remakes 'version'


def load_release(kind, spec, rec, work):
    """Return {name: bytes} for every file recorded for this release, digests checked."""
    if spec == "download":
        tgz = work / Path(rec["url"]).name
        log("  fetching %s" % rec["url"])
        fetch(rec["url"], tgz)
        spec = str(tgz)
    path = Path(spec)
    files = {}
    if path.is_file():
        digest = sha256_file(path)
        if digest != rec["sha256"]:
            die("%s: sha256 %s, expected %s" % (path, digest, rec["sha256"]))
        log("  %s: sha256 %s (matches sources/l3/tzdata.json)" % (path.name, digest))
        with tarfile.open(path) as tf:
            for m in tf.getmembers():
                if m.isfile():
                    files[m.name] = tf.extractfile(m).read()
    elif path.is_dir():
        log("  %s: directory (the tarball digest cannot be checked; file digests are)" % path)
        for f in rec["files"]:
            fp = path / f["name"]
            if fp.is_file():
                files[f["name"]] = fp.read_bytes()
    else:
        die("%s source %r is neither a file nor a directory" % (kind, spec))
    for f in rec["files"]:
        b = files.get(f["name"])
        if b is None:
            die("%s: %s is missing" % (kind, f["name"]))
        if sha256_bytes(b) != f["sha256"]:
            die("%s: %s has sha256 %s, expected %s" % (kind, f["name"], sha256_bytes(b), f["sha256"]))
    log("  %s: %d file digests match" % (kind, len(rec["files"])))
    return {f["name"]: files[f["name"]] for f in rec["files"]}


def assemble_tree(tree, *releases):
    tree.mkdir(parents=True)
    seen = {}
    for files in releases:
        for name, b in sorted(files.items()):
            if name in seen and seen[name] != b:
                die("tzdata and tzcode disagree on %s" % name)
            seen[name] = b
            (tree / name).write_bytes(b)
            os.utime(tree / name, (TREE_MTIME, TREE_MTIME))


def tool_version(tool):
    out, err = run([tool, "--version"])
    return (out.decode(errors="replace") + err).strip().splitlines()[0]


def build_tzdb(tree, work, awk, zic, rec):
    """tzdb's own recipe for `make PACKRATDATA=backzone PACKRATLIST=zone.tab tzdata.zi`, then zic."""
    build = rec["build"]
    tdata = [n for n in build["zicInputs"] if n != "backzone"]
    env = {"LC_ALL": "C"}
    version = (tree / "version").read_text().splitlines()[0]
    run([awk, "-v", "DATAFORM=main", "-v", "PACKRATDATA=backzone", "-v", "PACKRATLIST=zone.tab",
         "-f", "ziguard.awk", *tdata, "backzone"], cwd=tree, env=env, stdout_path=tree / "main.zi")
    deps = ("ziguard.awk africa antarctica asia australasia  europe northamerica southamerica "
            "etcetera factory backward backzone zone.tab zishrink.awk")
    run([awk, "-v", "dataform=main", "-v", "deps=" + deps, "-v", "redo=posix_right",
         "-v", "version=" + version, "-f", "zishrink.awk", "main.zi"],
        cwd=tree, env=env, stdout_path=tree / "tzdata.zi")
    zoneinfo_dir = work / "zoneinfo"
    _, warn1 = run([zic, "-d", zoneinfo_dir, "tzdata.zi"], cwd=tree)
    _, warn2 = run([zic, "-d", work / "zoneinfo-main", "main.zi"], cwd=tree)
    for w in (warn1 + warn2).splitlines():
        log("  zic: " + w)
    t1, t2 = tree_digest(zoneinfo_dir), tree_digest(work / "zoneinfo-main")
    if t1 != t2:
        die("TZif compiled from tzdata.zi and from main.zi differ")
    log("  compiled %d TZif files; tzdata.zi and main.zi compile to identical bytes" % t1[0])
    recorded = rec.get("compiledTree", {})
    log("  compiled tree digest %s (%s)" % (t1[1], "as recorded in tzdata.json for zic 2025c"
                                            if recorded.get("sha256") == t1[1] else
                                            "NOT the digest recorded in tzdata.json"))
    # tzdb's default build (no backzone): used only for the informative notes of part 1.
    run([awk, "-v", "DATAFORM=main", "-v", "PACKRATDATA=", "-v", "PACKRATLIST=",
         "-f", "ziguard.awk", *tdata], cwd=tree, env=env, stdout_path=tree / "main-default.zi")
    run([zic, "-d", work / "zoneinfo-default", "main-default.zi"], cwd=tree)
    zone_lines = set()
    for line in (tree / "main.zi").read_text(encoding="utf-8").splitlines():
        if line.startswith("Zone"):
            zone_lines.add(line.split()[1])
    notes = stdoff_audit(tree, build["zicInputs"])
    log("  no data line has fractional seconds; %d #STDOFF comments each round (half to even) to "
        "their data line" % notes)
    makefile = (tree / "Makefile").read_text(encoding="utf-8")
    theory = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ",
                                                      (tree / "theory.html").read_text(encoding="utf-8"))))
    if CAVEAT_MAKEFILE not in makefile or CAVEAT_THEORY not in theory:
        die("the backzone caveat quotes are not verbatim in the release's Makefile and theory.html")
    log("  backzone caveat quotes found verbatim in Makefile and theory.html")
    log("  zic rounding probe: %s" % zic_rounding_probe(zic, work))
    return zoneinfo_dir, work / "zoneinfo-default", zone_lines, (t1[0], notes)


def _hms_fraction(text):
    sign = -1 if text.startswith("-") else 1
    parts = [Fraction(x) for x in text.lstrip("+-").split(":")] + [Fraction(0)] * 2
    return sign * (parts[0] * 3600 + parts[1] * 60 + parts[2])


def _round_half_even(x):
    """Nearest integer to the Fraction x, ties to even."""
    fl = x.numerator // x.denominator
    rem = x - fl
    if rem > Fraction(1, 2) or (rem == Fraction(1, 2) and fl % 2):
        fl += 1
    return fl


def stdoff_audit(tree, inputs):
    """How tzdb 2025c states sub-second offsets: no data line may carry a fraction, and every
    '#STDOFF' comment must round (half to even) to the STDOFF of the data line after it."""
    frac = re.compile(r"\d:\d\d:\d\d\.\d")
    notes = 0
    for name in inputs:
        lines = (tree / name).read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            body = line.split("#")[0]
            if frac.search(body):
                die("%s:%d: a data line with fractional seconds" % (name, i + 1))
            m = re.match(r"\s*#STDOFF\s+(\S+)", line)
            if not m:
                continue
            j = i + 1
            while lines[j].lstrip().startswith("#"):
                j += 1
            fields = lines[j].split()
            stdoff = fields[2] if fields[0] == "Zone" else fields[0]
            if _hms_fraction(stdoff) != _round_half_even(_hms_fraction(m.group(1))):
                die("%s:%d: #STDOFF %s does not round to %s" % (name, i + 1, m.group(1), stdoff))
            notes += 1
    return notes


ZIC_ROUNDING_PROBE = [("-4:56:01.6", -17762), ("-0:36:44.68", -2205), ("0:29:45.5", 1786),
                      ("0:29:44.5", 1784), ("0:29:45.51", 1786)]


def zic_rounding_probe(zic, work):
    """Compile a throwaway zone per fractional offset and read the offset zic stores."""
    src = "".join("Zone\tProbe/P%d\t%s\t-\tLMT\t1900\n\t\t\t0:00\t-\tGMT\n" % (i, off)
                  for i, (off, _) in enumerate(ZIC_ROUNDING_PROBE))
    (work / "probe.zi").write_text(src)
    run([zic, "-d", work / "probe", work / "probe.zi"])
    for i, (off, want) in enumerate(ZIC_ROUNDING_PROBE):
        got = TzifReader((work / "probe" / "Probe" / ("P%d" % i)).read_bytes()).offset_at(-3000000000)
        if got != want:
            die("zic stored %d s for %s, expected %d s (nearest second, ties to even)" % (got, off, want))
    return ", ".join("%s -> %d" % (off, want) for off, want in ZIC_ROUNDING_PROBE)


def tree_digest(d):
    rows = []
    for p in sorted(Path(d).rglob("*")):
        if p.is_file():
            rows.append("%s %s\n" % (p.relative_to(d).as_posix(), sha256_file(p)))
    return len(rows), sha256_bytes("".join(rows).encode())


# ---------------------------------------------------------------------------------------------
# Reader B: an independent TZif (RFC 8536, version 2+) parser with a POSIX TZ-string evaluator
# ---------------------------------------------------------------------------------------------

def parse_tzif(blob):
    if blob[:4] != b"TZif" or blob[4:5] == b"\0":
        raise ValueError("not a version 2+ TZif file")

    def counts(off):
        return struct.unpack(">6L", blob[off + 20:off + 44])
    isut, isstd, leap, timecnt, typecnt, charcnt = counts(0)
    off = 44 + timecnt * 5 + typecnt * 6 + charcnt + leap * 8 + isstd + isut
    if blob[off:off + 4] != b"TZif":
        raise ValueError("second header missing")
    isut, isstd, leap, timecnt, typecnt, charcnt = counts(off)
    if leap:
        raise ValueError("leap-second records present (a 'right' file?)")
    p = off + 44
    times = list(struct.unpack(">%dq" % timecnt, blob[p:p + 8 * timecnt]))
    p += 8 * timecnt
    idx = list(blob[p:p + timecnt])
    p += timecnt
    types = []
    for _ in range(typecnt):
        types.append(struct.unpack(">lBB", blob[p:p + 6]))
        p += 6
    chars = blob[p:p + charcnt]
    p += charcnt + isstd + isut
    if blob[p:p + 1] != b"\n":
        raise ValueError("footer missing")
    footer = blob[p + 1:blob.index(b"\n", p + 1)].decode("ascii")

    def abbr(i):
        return chars[i:chars.index(b"\0", i)].decode("ascii")
    return {"times": times,
            "types": [(types[i][0], abbr(types[i][2])) for i in idx],
            "type0": (types[0][0], abbr(types[0][2])),
            "offsets": sorted({t[0] for t in types}),
            "footer": footer}


_TZNAME = r"(?:[A-Za-z]{3,}|<[A-Za-z0-9+-]{3,}>)"
_TZOFF = r"[+-]?\d{1,3}(?::\d{1,2}(?::\d{1,2})?)?"
_TZDATE = r"(?:J\d{1,3}|\d{1,3}|M\d{1,2}\.\d\.\d)"
_TZRE = re.compile(
    rf"(?P<std>{_TZNAME})(?P<stdoff>{_TZOFF})"
    rf"(?:(?P<dst>{_TZNAME})(?P<dstoff>{_TZOFF})?"
    rf",(?P<start>{_TZDATE})(?:/(?P<stime>{_TZOFF}))?"
    rf",(?P<end>{_TZDATE})(?:/(?P<etime>{_TZOFF}))?)?")


def _hms(text):
    sign = -1 if text.startswith("-") else 1
    parts = [int(x) for x in text.lstrip("+-").split(":")] + [0, 0]
    return sign * (parts[0] * 3600 + parts[1] * 60 + parts[2])


def parse_posix_tz(s):
    m = _TZRE.fullmatch(s)
    if not m:
        raise ValueError("TZ string not understood: %r" % s)
    std = (-_hms(m["stdoff"]), m["std"].strip("<>"))       # POSIX offsets are west-positive
    if not m["dst"]:
        return {"std": std, "dst": None}
    dst = (-_hms(m["dstoff"]) if m["dstoff"] else std[0] + 3600, m["dst"].strip("<>"))
    return {"std": std, "dst": dst,
            "start": m["start"], "stime": _hms(m["stime"]) if m["stime"] else 7200,
            "end": m["end"], "etime": _hms(m["etime"]) if m["etime"] else 7200}


def _rule_date_seconds(spec, year):
    leap = year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    jan1 = civil_seconds(year, 1, 1)
    if spec.startswith("J"):                                  # Jn: 1..365, never 29 February
        n = int(spec[1:])
        return jan1 + (n - 1 + (1 if leap and n >= 60 else 0)) * 86400
    if spec.startswith("M"):                                  # Mm.w.d
        mo, w, d = (int(x) for x in spec[1:].split("."))
        wd_first = (dtm.date(year, mo, 1).weekday() + 1) % 7  # 0 = Sunday
        mlen = (dtm.date(year + mo // 12, mo % 12 + 1, 1) - dtm.date(year, mo, 1)).days
        day = 1 + (d - wd_first) % 7 + 7 * (w - 1)
        while day > mlen:
            day -= 7
        return civil_seconds(year, mo, day)
    return jan1 + int(spec) * 86400                           # n: 0..365, counting 29 February


def posix_type_at(rule, t):
    if rule["dst"] is None:
        return rule["std"]
    year = (dtm.datetime(1970, 1, 1) + dtm.timedelta(seconds=t)).year
    events = []
    for y in (year - 1, year, year + 1):
        events.append((_rule_date_seconds(rule["start"], y) + rule["stime"] - rule["std"][0], 1, rule["dst"]))
        events.append((_rule_date_seconds(rule["end"], y) + rule["etime"] - rule["dst"][0], 0, rule["std"]))
    current = rule["std"]
    for instant, _, typ in sorted(events):
        if instant <= t:
            current = typ
    return current


class TzifReader:
    name = "own TZif parser"

    def __init__(self, blob):
        self.d = parse_tzif(blob)
        self.rule = parse_posix_tz(self.d["footer"]) if self.d["footer"] else None
        cands = set(self.d["offsets"])
        if self.rule:
            cands.add(self.rule["std"][0])
            if self.rule["dst"]:
                cands.add(self.rule["dst"][0])
        self.candidates = sorted(cands)

    def type_at(self, t):
        times = self.d["times"]
        if not times or t < times[0]:
            return self.d["type0"]
        if t >= times[-1] and self.rule:
            return posix_type_at(self.rule, t)
        return self.d["types"][bisect.bisect_right(times, t) - 1]

    def offset_at(self, t):
        return self.type_at(t)[0]

    def breakpoints(self, lo, hi):
        """Explicit transitions plus the TZ string's own, within [lo, hi)."""
        out = {t for t in self.d["times"] if lo <= t < hi}
        if self.rule and self.rule["dst"]:
            last = self.d["times"][-1] if self.d["times"] else lo
            y0 = (dtm.datetime(1970, 1, 1) + dtm.timedelta(seconds=max(last, lo))).year
            y1 = (dtm.datetime(1970, 1, 1) + dtm.timedelta(seconds=hi)).year
            for y in range(y0, y1 + 1):
                for spec, tm, off in ((self.rule["start"], self.rule["stime"], self.rule["std"][0]),
                                      (self.rule["end"], self.rule["etime"], self.rule["dst"][0])):
                    t = _rule_date_seconds(spec, y) + tm - off
                    if max(last, lo) <= t < hi:
                        out.add(t)
        return out


# ---------------------------------------------------------------------------------------------
# Reader A: zdump -V (tzcode's localtime.c), transitions within [ZDUMP_LO, ZDUMP_HI)
# ---------------------------------------------------------------------------------------------

_MONTHS = {m: i + 1 for i, m in enumerate("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split())}
_ZDUMP_RE = re.compile(
    r"\s\w{3} (?P<mon>\w{3}) +(?P<day>\d+) (?P<h>\d\d):(?P<mi>\d\d):(?P<s>\d\d) (?P<y>-?\d+) UT"
    r" = \w{3} \w{3} +\d+ \d\d:\d\d:\d\d -?\d+ (?P<abbr>\S+) isdst=[01] gmtoff=(?P<off>-?\d+)$")


class ZdumpReader:
    name = "zdump -V"

    def __init__(self, zdump, path):
        # Always an absolute path: tzcode's localtime.c reads a TZ value that does not start
        # with '/' as a zone name under its compiled-in TZDIR, not as this file.
        path = str(Path(path).resolve())
        window = "%d,%d" % (ZDUMP_LO, ZDUMP_HI)
        out, _ = run([zdump, "-V", "-c", window, path])
        rows = []
        for line in out.decode().splitlines():
            m = _ZDUMP_RE.search(line)
            if not m:
                raise ValueError("zdump line not understood: %r" % line)
            t = civil_seconds(int(m["y"]), _MONTHS[m["mon"]], int(m["day"]), int(m["h"]), int(m["mi"]), int(m["s"]))
            rows.append((t, (int(m["off"]), m["abbr"])))
        if len(rows) % 2:
            raise ValueError("unexpected zdump output for %s" % path)
        if rows:
            self.before = rows[0][1]
        else:
            # No transition in the window: take the one type from the first line of zdump -i
            # ("-<TAB>-<TAB>[+-]hh[mm[ss]][<TAB>abbr]"; the abbreviation is left out when it
            # is the numeric offset itself).
            out, _ = run([zdump, "-i", "-c", window, path])
            first = [ln.split("\t") for ln in out.decode().splitlines() if ln.startswith("-\t-\t")]
            if len(first) != 1:
                raise ValueError("unexpected zdump -i output for %s" % path)
            off = first[0][2]
            digits = (off[1:] + "0000")[:6]
            sec = int(digits[:2]) * 3600 + int(digits[2:4]) * 60 + int(digits[4:6])
            self.before = (-sec if off[0] == "-" else sec, first[0][3] if len(first[0]) > 3 else off)
        self.trans = []
        for i in range(0, len(rows), 2):
            if rows[i + 1][0] != rows[i][0] + 1:
                raise ValueError("zdump transition lines not one second apart")
            self.trans.append(rows[i + 1])
        self.times = [t for t, _ in self.trans]
        self.candidates = sorted({self.before[0]} | {typ[0] for _, typ in self.trans})
        self.window = (civil_seconds(ZDUMP_LO, 1, 1), civil_seconds(ZDUMP_HI, 1, 1))

    def type_at(self, t):
        if not self.window[0] <= t < self.window[1]:
            raise ValueError("instant outside the zdump window")
        i = bisect.bisect_right(self.times, t) - 1
        return self.before if i < 0 else self.trans[i][1]

    def offset_at(self, t):
        return self.type_at(t)[0]


def solve_by_offsets(reader, local_s):
    """Every UT instant t with t + offset(t) = local_s, as (t, offset, abbr), earliest first."""
    hits = []
    for o in reader.candidates:
        t = local_s - o
        typ = reader.type_at(t)
        if typ[0] == o:
            hits.append((t, o, typ[1]))
    return sorted(hits)


# ---------------------------------------------------------------------------------------------
# Reader C: CPython zoneinfo on the same file (ZoneInfo.from_file: no search path, no fallback)
# ---------------------------------------------------------------------------------------------

UTC = dtm.timezone.utc


def solve_zoneinfo(zi, local):
    naive = dtm.datetime(*local)
    hits = {}
    for fold in (0, 1):
        aware = naive.replace(tzinfo=zi, fold=fold)
        off = aware.utcoffset()
        utc = (naive - off).replace(tzinfo=UTC)
        back = utc.astimezone(zi)
        if back.replace(tzinfo=None, fold=0) == naive:
            t = int((utc - dtm.datetime(1970, 1, 1, tzinfo=UTC)).total_seconds())
            hits[t] = (int(off.total_seconds()), back.tzname())
    return sorted((t, o, a) for t, (o, a) in hits.items())


def verdict(hits):
    offs = [o for _, o, _ in hits]
    if not offs:
        return {"status": "nonexistent"}
    if len(offs) == 1:
        return {"status": "ok", "utc_offset_s": offs[0]}
    if len(offs) == 2:
        return {"status": "ambiguous", "utc_offsets_s": offs}
    raise ValueError("a local time occurring %d times" % len(offs))


class ZoneOracle:
    """The three readers over one compiled tree; answers only when all agree."""

    def __init__(self, zdump, zoneinfo_dir):
        self.zdump = zdump
        self.dir = Path(zoneinfo_dir).resolve()
        self.cache = {}
        self.checked = 0

    def readers(self, zone):
        if zone not in self.cache:
            path = self.dir / zone
            if not path.is_file():
                die("zone %s is not in the compiled tree" % zone)
            blob = path.read_bytes()
            self.cache[zone] = (ZdumpReader(self.zdump, path), TzifReader(blob),
                                zoneinfo.ZoneInfo.from_file(io.BytesIO(blob), key=zone))
        return self.cache[zone]

    def solve(self, zone, local_text):
        local = parse_local(local_text)
        local_s = civil_seconds(*local)
        zd, own, zi = self.readers(zone)
        a = solve_by_offsets(zd, local_s)
        b = solve_by_offsets(own, local_s)
        c = solve_zoneinfo(zi, local)
        va, vb, vc = verdict(a), verdict(b), verdict(c)
        if not (va == vb == vc):
            die("readers disagree on %s %s: zdump %s, parser %s, zoneinfo %s" % (zone, local_text, va, vb, vc))
        abbrs = ([x[2] for x in a], [x[2] for x in b], [x[2] for x in c])
        if not (abbrs[0] == abbrs[1] == abbrs[2]):
            die("readers disagree on the abbreviation for %s %s: %s" % (zone, local_text, abbrs))
        self.checked += 1
        return va, abbrs[0]


def default_build_answer(default_dir, zone, local_text):
    path = Path(default_dir) / zone
    if not path.is_file():
        return None
    local_s = civil_seconds(*parse_local(local_text))
    return verdict(solve_by_offsets(TzifReader(path.read_bytes()), local_s))


def describe(v):
    if v["status"] == "ok":
        return "%+d s" % v["utc_offset_s"]
    if v["status"] == "ambiguous":
        return "ambiguous %+d/%+d s" % tuple(v["utc_offsets_s"])
    return "nonexistent"


def full_tree_check(zdump, zoneinfo_dir):
    """Optional: compare the three readers' offset functions on every compiled file, at every
    breakpoint either TZif reader or zdump reports in the zdump window (and one second before)."""
    lo, hi = civil_seconds(ZDUMP_LO, 1, 1), civil_seconds(ZDUMP_HI, 1, 1)
    epoch = dtm.datetime(1970, 1, 1, tzinfo=UTC)
    files = sorted(p for p in Path(zoneinfo_dir).rglob("*") if p.is_file())
    points = 0
    for p in files:
        blob = p.read_bytes()
        zd, own = ZdumpReader(zdump, p), TzifReader(blob)
        zi = zoneinfo.ZoneInfo.from_file(io.BytesIO(blob))
        instants = {lo} | set(zd.times) | own.breakpoints(lo, hi)
        for t0 in sorted(instants):
            for t in (t0 - 1, t0):
                if not lo <= t < hi:
                    continue
                a, b = zd.offset_at(t), own.offset_at(t)
                c = int((epoch + dtm.timedelta(seconds=t)).astimezone(zi).utcoffset().total_seconds())
                if not a == b == c:
                    die("full check: %s at %d: zdump %d, parser %d, zoneinfo %d" % (p, t, a, b, c))
                points += 1
    return len(files), points


# ---------------------------------------------------------------------------------------------
# Leap seconds (leap-seconds.list) and Delta T
# ---------------------------------------------------------------------------------------------

NTP_MJD0 = 15020                                # MJD = NTP seconds / 86400 + 15020


def load_leap_seconds(path):
    text = Path(path).read_text(encoding="ascii")
    entries, digits = [], []
    updated = expires = hash_line = None
    for line in text.splitlines():
        if line.startswith("#h"):
            hash_line = "".join(line[2:].split()).lower()
            continue
        if line.startswith("#$"):
            body = line[2:]
            updated = int(body.split()[0])
        elif line.startswith("#@"):
            body = line[2:]
            expires = int(body.split()[0])
        elif line[:1].isdigit():
            body = line
            ntp, dtai = body.split("#")[0].split()
            entries.append((int(ntp), int(dtai)))
        else:
            continue
        # The hash covers the digits of the '#$' and '#@' lines and of the data lines, in file
        # order, up to any comment (the procedure of NTP's leapsec_validate).
        digits.append("".join(ch for ch in body.split("#")[0] if ch.isdigit()))
    computed = hashlib.sha1("".join(digits).encode()).hexdigest()
    if computed != hash_line:
        die("leap-seconds.list: SHA-1 %s does not match its #h line %s" % (computed, hash_line))
    table = []
    for ntp, dtai in entries:
        if ntp % 86400:
            die("leap-seconds.list: epoch %d is not at 00:00:00" % ntp)
        table.append((ntp // 86400 + NTP_MJD0, dtai))
    for (m0, d0), (m1, d1) in zip(table, table[1:]):
        if not (m1 > m0 and d1 == d0 + 1):
            die("leap-seconds.list: unexpected step at MJD %d" % m1)
    return {"table": table, "updated_ntp": updated, "expires_ntp": expires,
            "updated_mjd": updated // 86400 + NTP_MJD0, "expires_mjd": expires // 86400 + NTP_MJD0,
            "sha1": computed}


def mjd_of(y, m, d):
    return days_since_epoch(y, m, d) + MJD_UNIX_EPOCH


def civil_of_mjd(mjd):
    return dtm.date.fromordinal(mjd - MJD_UNIX_EPOCH + EPOCH_ORDINAL)


def tai_minus_utc(leap, y, mo, d, h, mi, s):
    """TAI - UTC for a UTC reading.  Each line of the table holds from 00:00:00 UTC of its day
    until the next line's day begins.  A reading of 23:59:60 belongs to the day it ends (the
    86,401st second of that day), before the next line's epoch, so it takes the old value."""
    mjd = mjd_of(y, mo, d)
    sod = h * 3600 + mi * 60 + s
    table = leap["table"]
    if s == 60:
        if not (h == 23 and mi == 59 and any(m == mjd + 1 for m, _ in table[1:])):
            die("%04d-%02d-%02dT23:59:60 is not a leap second in the table" % (y, mo, d))
    if (mjd, sod) < (table[0][0], 0):
        die("UTC reading before the table's first line")
    if (mjd, sod) >= (leap["expires_mjd"], 0):
        die("UTC reading after the table's expiry")
    value = None
    for m, dtai in table:
        if (m, 0) <= (mjd, sod):
            value = dtai
    return value


def parse_utc(text):
    m = re.fullmatch(r"(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)Z", text)
    if not m:
        die("bad UTC instant %r" % text)
    return tuple(int(g) for g in m.groups())


TT_MINUS_TAI = Decimal("32.184")


def num(x):
    """A JSON number: an exact integer stays an int, anything else becomes the nearest double."""
    if isinstance(x, (Fraction, Decimal)) and x == int(x):
        return int(x)
    return float(x)


# ---------------------------------------------------------------------------------------------
# Calendar arithmetic
# ---------------------------------------------------------------------------------------------
# Richards, E. G. (2013), "Calendars", ch. 15 of Urban & Seidelmann (eds.), Explanatory
# Supplement to the Astronomical Almanac, 3rd ed., sec. 15.11: Algorithm 3 (JDN -> date) and
# Algorithm 4 (date -> JDN) with the Julian/Gregorian parameters.  "div" and "mod" are floor
# division and remainder (identical to the book's for its stated domain, JDN >= 0).
_y, _j, _m, _n, _r, _p, _q, _v, _u, _s, _t, _w = 4716, 1401, 2, 12, 4, 1461, 0, 3, 5, 153, 2, 2
_A, _B, _C = 184, 274277, -38


def richards_to_jdn(cal, Y, M, D):
    h = M - _m
    g = Y + _y - (_n - h) // _n
    f = (h - 1 + _n) % _n
    e = (_p * g + _q) // _r + D - 1 - _j
    J = e + (_s * f + _t) // _u
    if cal == "gregorian":
        J = J - (3 * ((g + _A) // 100)) // 4 - _C
    return J


def richards_from_jdn(cal, J):
    f = J + _j
    if cal == "gregorian":
        f = f + (((4 * J + _B) // 146097) * 3) // 4 + _C
    e = _r * f + _v
    g = (e % _p) // _r
    h = _u * g + _w
    D = (h % _s) // _u + 1
    M = ((h // _s + _m) % _n) + 1
    Y = e // _p - _y + (_n + _m - M) // _n
    return Y, M, D


def tdiv(a, b):
    """Integer division truncating toward zero (Fortran's '/', Meeus's INT of a quotient)."""
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


# Fliegel, H. F. & Van Flandern, T. C. (1968), "A machine algorithm for processing calendar
# dates", Communications of the ACM 11(10), 657 (Gregorian; Fortran integer arithmetic).
def fvf_to_jdn(I, J, K):
    a = tdiv(J - 14, 12)
    return (K - 32075 + tdiv(1461 * (I + 4800 + a), 4) + tdiv(367 * (J - 2 - a * 12), 12)
            - tdiv(3 * tdiv(I + 4900 + a, 100), 4))


def fvf_from_jdn(jd):
    L = jd + 68569
    N = tdiv(4 * L, 146097)
    L = L - tdiv(146097 * N + 3, 4)
    I = tdiv(4000 * (L + 1), 1461001)
    L = L - tdiv(1461 * I, 4) + 31
    J = tdiv(80 * L, 2447)
    K = L - tdiv(2447 * J, 80)
    L = tdiv(J, 11)
    J = J + 2 - 12 * L
    I = 100 * (N - 49) + I + L
    return I, J, K


# Meeus, J. (1998), Astronomical Algorithms, 2nd ed., ch. 7.  The decimal constants are exact
# rationals (365.25 = 1461/4, 30.6001 = 306001/10000, ...).  `idiv` is Meeus's INT of a
# quotient: truncation (as published) or floor (the check variant, see below).
def meeus_to_jdn(cal, Y, M, D, idiv=tdiv):
    if M <= 2:
        Y, M = Y - 1, M + 12
    B = 0
    if cal == "gregorian":
        A = idiv(Y, 100)
        B = 2 - A + idiv(A, 4)
    # JD(0h) = INT(365.25(Y + 4716)) + INT(30.6001(M + 1)) + D + B - 1524.5; the JDN is JD(0h) + 0.5
    return idiv(1461 * (Y + 4716), 4) + idiv(306001 * (M + 1), 10000) + D + B - 1524


def meeus_from_jdn(cal, Z, idiv=tdiv):
    # Z = INT(JD + 0.5) = the JDN; the day fraction F = 0.5 (noon) is dropped from the day.
    A = Z
    if cal == "gregorian":
        alpha = idiv(100 * Z - 186721625, 3652425)           # INT((Z - 1867216.25) / 36524.25)
        A = Z + 1 + alpha - idiv(alpha, 4)
    B = A + 1524
    C = idiv(100 * B - 12210, 36525)                         # INT((B - 122.1) / 365.25)
    D = idiv(36525 * C, 100)                                 # INT(365.25 C)
    E = idiv(10000 * (B - D), 306001)                        # INT((B - D) / 30.6001)
    day = B - D - idiv(306001 * E, 10000)
    month = E - 1 if E < 14 else E - 13
    year = C - 4716 if month > 2 else C - 4715
    return year, month, day


def floordiv(a, b):
    return a // b


def is_leap(cal, y):
    if cal == "julian":
        return y % 4 == 0
    return y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)


def month_length(cal, y, m):
    return [31, 29 if is_leap(cal, y) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]


def second_to_jdn(cal, y, m, d):
    return fvf_to_jdn(y, m, d) if cal == "gregorian" else meeus_to_jdn(cal, y, m, d)


def second_from_jdn(cal, j):
    return fvf_from_jdn(j) if cal == "gregorian" else meeus_from_jdn(cal, j)


def calendar_to_jdn(cal, y, m, d):
    if not (1 <= m <= 12 and 1 <= d <= month_length(cal, y, m)):
        die("%s %d-%d-%d is not a date" % (cal, y, m, d))
    answers = {richards_to_jdn(cal, y, m, d), second_to_jdn(cal, y, m, d)}
    if cal == "gregorian":
        answers.add(meeus_to_jdn(cal, y, m, d, floordiv))
    if len(answers) != 1:
        die("calendar algorithms disagree on %s %d-%d-%d: %s" % (cal, y, m, d, sorted(answers)))
    return answers.pop()


def calendar_from_jdn(cal, j):
    answers = {richards_from_jdn(cal, j), second_from_jdn(cal, j)}
    if cal == "gregorian":
        answers.add(meeus_from_jdn(cal, j, floordiv))
    if len(answers) != 1:
        die("calendar algorithms disagree on %s JDN %d: %s" % (cal, j, sorted(answers)))
    return answers.pop()


def dense_calendar_check():
    """Every day from DENSE_YEARS[0]-01-01 to DENSE_YEARS[1]-12-31 in both calendars, walked
    one day at a time with the calendar's own month lengths."""
    anchors = {("julian", -4712, 1, 1): 0, ("gregorian", -4713, 11, 24): 0,
               ("julian", 1582, 10, 4): 2299160, ("gregorian", 1582, 10, 15): 2299161,
               ("gregorian", 2000, 1, 1): 2451545}
    report = {}
    for cal in ("julian", "gregorian"):
        r = {"days": 0, "jdnNonNegative": 0, "richardsRoundTripFailures": 0, "stepFailures": 0,
             "anchorFailures": 0, "secondFailuresJdnNonNegative": 0, "secondFailuresJdnNegative": 0,
             "meeusFloorFailures": 0, "meeusTruncFailuresJdnNonNegative": 0}
        prev = None
        for y in range(DENSE_YEARS[0], DENSE_YEARS[1] + 1):
            for m in range(1, 13):
                for d in range(1, month_length(cal, y, m) + 1):
                    r["days"] += 1
                    j = richards_to_jdn(cal, y, m, d)
                    if prev is not None and j != prev + 1:
                        r["stepFailures"] += 1
                    prev = j
                    if anchors.get((cal, y, m, d), j) != j:
                        r["anchorFailures"] += 1
                    if richards_from_jdn(cal, j) != (y, m, d):
                        r["richardsRoundTripFailures"] += 1
                    second_ok = second_to_jdn(cal, y, m, d) == j and second_from_jdn(cal, j) == (y, m, d)
                    if j >= 0:
                        r["jdnNonNegative"] += 1
                        r["secondFailuresJdnNonNegative"] += not second_ok
                    else:
                        r["secondFailuresJdnNegative"] += not second_ok
                    if cal == "gregorian":
                        floor_ok = (meeus_to_jdn(cal, y, m, d, floordiv) == j
                                    and meeus_from_jdn(cal, j, floordiv) == (y, m, d))
                        r["meeusFloorFailures"] += not floor_ok
                        if j >= 0:
                            trunc_ok = meeus_to_jdn(cal, y, m, d) == j and meeus_from_jdn(cal, j) == (y, m, d)
                            r["meeusTruncFailuresJdnNonNegative"] += not trunc_ok
        if cal == "julian":
            del r["meeusFloorFailures"], r["meeusTruncFailuresJdnNonNegative"]
        report[cal] = r
    for cal, r in report.items():
        bad = r["richardsRoundTripFailures"] + r["stepFailures"] + r["anchorFailures"] \
            + r["secondFailuresJdnNonNegative"] + r.get("meeusFloorFailures", 0)
        if bad:
            die("dense calendar check failed for %s: %s" % (cal, r))
    return report


# ---------------------------------------------------------------------------------------------
# Vector assembly
# ---------------------------------------------------------------------------------------------

def exact_tolerance(expected):
    return {k: {"exact": True} for k in expected}


def zone_vectors(oracle, default_dir, zone_lines, corpus):
    cases = []                                               # (zone, local, note)
    eligible, dropped = [], {"link": [], "no pre-1970 sample": [], "-00": []}
    for i, z in enumerate(corpus["zones"]):
        name = z["tz"]
        if name not in zone_lines:
            dropped["link"].append(name)
            continue
        segs = [s for s in z["sample"] if s["to"] <= "1970-01-01"]
        if not segs:
            dropped["no pre-1970 sample"].append(name)
            continue
        seg = segs[0]
        for s in segs[1:]:
            if s["days"] > seg["days"]:
                seg = s
        a, b = dtm.date.fromisoformat(seg["from"]), dtm.date.fromisoformat(seg["to"])
        local = (a + dtm.timedelta(days=(b - a).days // 2)).isoformat() + "T12:00:00"
        _, abbrs = oracle.solve(name, local)
        if "-00" in abbrs:
            dropped["-00"].append(name)
            continue
        eligible.append((i, name, seg, local))
    picks = eligible[::DIVERGENCE_STRIDE]
    if len(picks) != DIVERGENCE_COUNT:
        die("divergence rule gives %d cases, not %d" % (len(picks), DIVERGENCE_COUNT))
    log("  divergence list: %d zones, %d eligible, %d taken; dropped as links %s; without a "
        "pre-1970 sample %d; '-00' %s" % (len(corpus["zones"]), len(eligible), len(picks),
                                           dropped["link"], len(dropped["no pre-1970 sample"]),
                                           dropped["-00"]))
    for i, name, seg, local in picks:
        cases.append((name, local, "Divergence list entry %d of %d: middle of its %s..%s segment"
                      % (i + 1, len(corpus["zones"]), seg["from"], seg["to"]), True))
    for group in (ORDINARY_CASES, TRANSITION_CASES, LMT_CASES, TASTE_CASES):
        for zone, local, note in group:
            cases.append((zone, local, note, False))
    vectors, statuses, differs = [], {}, 0
    for n, (zone, local, note, from_list) in enumerate(cases, 1):
        expected, _ = oracle.solve(zone, local)
        statuses[expected["status"]] = statuses.get(expected["status"], 0) + 1
        if from_list:
            alt = default_build_answer(default_dir, zone, local)
            if alt == expected:
                note += "; tzdb's default build (no backzone) agrees."
            else:
                differs += 1
                note += "; tzdb's default build (no backzone) gives %s." % describe(alt)
        vector = {
            "id": "L3-TZ-%04d" % n,
            "kind": "time.zone-offset",
            "input": {"zone": zone, "local": local},
            "expected": expected,
            "tolerance": exact_tolerance(expected),
            "arbiter": "tzdb-2025c-backzone",
            "note": note,
        }
        if from_list:
            vector["tags"] = [BACKZONE_TAG]              # SPEC.md's order: ..., note, tags
        vectors.append(vector)
    log("  zone vectors: %d (%s); three readers agree on all; %d of the 20 divergence cases "
        "differ from tzdb's default build" % (len(vectors), ", ".join(
            "%d %s" % (v, k) for k, v in sorted(statuses.items())), differs))
    return vectors


def lmt_vectors():
    out = []
    for n, (lon, note) in enumerate(LMT_LONGITUDES, 1):
        exact = Fraction(lon) * 240                          # the double is the exact decimal here
        if Fraction(str(lon)) != Fraction(lon) or exact.denominator != 1:
            die("longitude %r is not a multiple of 1/16 degree" % lon)
        out.append({
            "id": "L3-LMT-%04d" % n,
            "kind": "time.local-mean-time",
            "input": {"lon": lon},
            "expected": {"utc_offset_s": int(exact)},
            "tolerance": {"utc_offset_s": {"abs": 0.001, "unit": "s"}},
            "arbiter": "lmt-definition",
            "note": note,
        })
    return out


def ttu_vectors(leap):
    out = []
    for n, (utc, note) in enumerate(TTU_CASES, 1):
        dtai = tai_minus_utc(leap, *parse_utc(utc))
        out.append({
            "id": "L3-TTU-%04d" % n,
            "kind": "time.tt-minus-utc",
            "input": {"utc": utc},
            "expected": {"tt_minus_utc_s": num(TT_MINUS_TAI + dtai)},
            "tolerance": {"tt_minus_utc_s": {"abs": 0.0005, "unit": "s"}},
            "arbiter": "iers-leap-seconds-2025c",
            "note": note,
        })
    return out


def dt_vectors(leap, iers_rows):
    out, max_err = [], Decimal(0)
    for n, date in enumerate(DT_DATES, 1):
        row = iers_rows.get(date)
        if row is None or row["flag"] != "I":
            die("IERS row %s missing or not observed" % date)
        y, m, d = (int(x) for x in date.split("-"))
        mjd = int(row["mjd"])
        if mjd != mjd_of(y, m, d):
            die("IERS row %s has MJD %d" % (date, mjd))
        dut1 = Decimal(row["ut1_minus_utc_s"])
        max_err = max(max_err, Decimal(row["ut1_minus_utc_error_s"]))
        dtai = tai_minus_utc(leap, y, m, d, 0, 0, 0)
        delta_t = TT_MINUS_TAI + dtai - dut1
        jd_ut1 = Fraction(4800001, 2) + mjd + Fraction(dut1) / 86400
        after_leap = any(mm == mjd for mm, _ in leap["table"][1:])
        note = "IERS row %s 0h UTC: UT1 - UTC = %s s, TAI - UTC = %d s%s." % (
            date, row["ut1_minus_utc_s"], dtai, ", the first day after a leap second" if after_leap else "")
        out.append({
            "id": "L3-DT-%04d" % n,
            "kind": "time.delta-t",
            "input": {"jd_ut1": float(jd_ut1), "utc": date + "T00:00:00Z"},
            "expected": {"delta_t_s": num(delta_t)},
            "tolerance": {"delta_t_s": {"abs": 0.1, "unit": "s"}},
            "arbiter": "iers-ut1-finals2000a",
            "note": note,
        })
    return out, max_err


def calendar_vectors():
    to_jdn, from_jdn = [], []
    for n, (cal, y, m, d, note) in enumerate(TO_JDN_CASES, 1):
        to_jdn.append({
            "id": "L3-JDN-%04d" % n,
            "kind": "calendar.to-jdn",
            "input": {"calendar": cal, "year": y, "month": m, "day": d},
            "expected": {"jdn": calendar_to_jdn(cal, y, m, d)},
            "tolerance": {"jdn": {"exact": True}},
            "arbiter": "calendar-arithmetic",
            "note": note,
        })
    for n, (cal, j, note) in enumerate(FROM_JDN_CASES, 1):
        y, m, d = calendar_from_jdn(cal, j)
        if j < 0 or calendar_to_jdn(cal, y, m, d) != j:
            die("from-jdn case %s %d does not round-trip" % (cal, j))
        expected = {"year": y, "month": m, "day": d}
        from_jdn.append({
            "id": "L3-CAL-%04d" % n,
            "kind": "calendar.from-jdn",
            "input": {"calendar": cal, "jdn": j},
            "expected": expected,
            "tolerance": exact_tolerance(expected),
            "arbiter": "calendar-arithmetic",
            "note": note,
        })
    return to_jdn, from_jdn


def src_input(name):
    return {"path": "sources/l3/" + name, "sha256": sha256_file(SRC / name)}


def arbiters(rec, leap, max_err, tree_info):
    td, tc = rec["tzdata"], rec["tzcode"]
    upd, exp = civil_of_mjd(leap["updated_mjd"]), civil_of_mjd(leap["expires_mjd"])
    return {
        "tzdb-2025c-backzone": {
            "name": "IANA tzdb 2025c with backzone, compiled by zic 2025c",
            "source": ("IANA time zone database release 2025c: %s (sha256 %s) and %s (sha256 %s), "
                       "both OpenPGP-signed by Paul Eggert (key 7E37 92A9 D8AC F7D6 33BC 1588 ED97 E90E "
                       "62AA 7E34; signatures checked 2026-09-28). The data are the Makefile's "
                       "`make PACKRATDATA=backzone PACKRATLIST=zone.tab` build: backzone's pre-1970 "
                       "history for the zone.tab zones that the main data merge into links. Why "
                       "backzone: a birth chart needs the local time in force where and when the birth "
                       "happened, often before 1970, and tzdb's default build does not keep that "
                       "history for these zones; it makes each of them a link to another zone whose "
                       "clocks have agreed with it since 1970, so the zone answers with the other "
                       "zone's history (%s at %s gets Abidjan's local mean time, %d s, instead of its "
                       "own, %d s). The maintainers' caveat applies: the Makefile of tzdata 2025c "
                       "offers backzone as '%s', and its theory.html says the file '%s'. zic and zdump "
                       "are built from the same release's tzcode."
                       % (td["url"], td["sha256"], tc["url"], tc["sha256"], BANJUL_EXAMPLE[0],
                          BANJUL_EXAMPLE[1], BANJUL_EXAMPLE[3], BANJUL_EXAMPLE[2], CAVEAT_MAKEFILE,
                          CAVEAT_THEORY)),
            "inputs": [
                src_input("tzdata.json"),
                {"url": td["url"], "sha256": td["sha256"]},
                {"url": tc["url"], "sha256": tc["sha256"]},
                src_input("tzdb-divergence-98.json"),
            ],
            "method": ("After checking every file digest recorded in sources/l3/tzdata.json, the "
                       "generator runs tzdb's own recipe: ziguard.awk (DATAFORM=main, "
                       "PACKRATDATA=backzone, PACKRATLIST=zone.tab) over africa, antarctica, asia, "
                       "australasia, europe, northamerica, southamerica, etcetera, factory, backward "
                       "and backzone, then zishrink.awk to tzdata.zi, then `zic -d DIR tzdata.zi` "
                       "(zic's defaults: slim TZif, no leap seconds); main.zi compiled on its own "
                       "gives byte-identical files (%d TZif files). For each vector "
                       "three readers of the compiled file find every UT instant whose offset maps it "
                       "to the given local time: zdump -V -c %d,%d (tzcode's localtime.c), an "
                       "independent TZif v2+ parser with its own POSIX TZ-string evaluator, and "
                       "CPython's zoneinfo.ZoneInfo.from_file (both folds, kept when they round-trip). "
                       "They must agree on the verdict and the abbreviation; one instant gives ok with "
                       "its offset, two give ambiguous (the earlier instant's offset first), none gives "
                       "nonexistent. utc_offset_s is local time minus UTC in seconds, positive east of "
                       "Greenwich (UTC = local time - utc_offset_s); utc_offsets_s holds the two offsets "
                       "of an ambiguous local time, the earlier instant's first. Local mean time: in tzdb 2025c no Zone or Rule line has "
                       "fractional seconds; LMT and other mean-time offsets are stated to the whole "
                       "second, and the %d more precise values the files know appear only in #STDOFF "
                       "comments, each rounded to the nearest second (ties to even) in the data line "
                       "(checked). zic rounds any fraction it is given the same way (zic(8), and a "
                       "probe: 0:29:45.5 is stored as 1786 s, 0:29:44.5 as 1784 s). The expected "
                       "offset is the one stored in the compiled TZif file. Case design (fixed rules, documented "
                       "in the generator): 20 cases from the divergence list, the zones where "
                       "tzdb-with-backzone and ICU's default build disagree before 1970, tagged %s: "
                       "they test which build an engine uses, and each one's note gives the answer of "
                       "tzdb's default build (no backzone); then 7 ordinary cases after 1970, 9 skipped "
                       "or repeated local times, 6 local-mean-time cases and 3 others; nothing after "
                       "2037."
                       % (tree_info[0], ZDUMP_LO, ZDUMP_HI, tree_info[1], BACKZONE_TAG)),
            "generator": GENERATOR,
            "uncertainty": ("None in the computation: the three readers agree exactly on every "
                            "vector. The data are tzdb's reconstruction, not history: offsets before "
                            "1970 are tzdb's best estimates and backzone's are the least reliable (see "
                            "the maintainers' caveat under source), and some future offsets are "
                            "predictions (the 2030 Ramadan rule, which tzdb 2026d has already replaced, "
                            "and the 2035 summer time). A vector tests agreement with this build of "
                            "tzdb 2025c."),
        },
        "lmt-definition": {
            "name": "Local mean time from longitude",
            "source": ("The definition of local mean time: mean solar time at east longitude lon "
                       "runs ahead of UT by lon/15 hours, 240 s of UTC offset per degree."),
            "inputs": [],
            "method": ("utc_offset_s is local mean time minus UT in seconds, positive east of "
                       "Greenwich: lon x 240, computed exactly with rational arithmetic. The "
                       "longitudes are multiples of 1/16 degree (5 x 0.0125), so the decimal input "
                       "and the product are exact binary numbers and the expected value is an exact "
                       "integer."),
            "generator": GENERATOR,
            "uncertainty": ("None: a definition. The 0.001 s tolerance only absorbs an "
                            "implementation's floating-point rounding."),
        },
        "iers-leap-seconds-2025c": {
            "name": "IERS leap-second table (leap-seconds.list, tzdata 2025c)",
            "source": ("leap-seconds.list as distributed in tzdata 2025c (IERS Earth Orientation "
                       "Centre, Paris Observatory; updated through IERS Bulletin C; last update %s "
                       "(NTP %d); expires %s (NTP %d); its #h line, SHA-1 %s, verified). TT = TAI + "
                       "32.184 s exactly (IAU 1991 Resolution A4), so TT - UTC = 32.184 s + (TAI - UTC)."
                       % (upd.isoformat(), leap["updated_ntp"], exp.isoformat(), leap["expires_ntp"],
                          leap["sha1"])),
            "inputs": [src_input("leap-seconds.list")],
            "method": ("tt_minus_utc_s is TT - UTC in seconds. "
                       "Parse the %d data lines (NTP epoch, DTAI). Each epoch is 00:00:00 UTC of the "
                       "day the line names (MJD = X/86400 + 15020, 'epoch in clear'), and DTAI is "
                       "'the quantity to add to UTC to get the time in TAI' from that epoch until "
                       "the next line's. A UTC reading takes the DTAI of the last line whose epoch "
                       "is at or before it. The leap second itself: 23:59:60 is the 86,401st second "
                       "of the day that ends with it, so it precedes the next line's epoch "
                       "(00:00:00 of the following day) and takes the old value; e.g. at "
                       "2016-12-31T23:59:60 TAI - UTC = 36 s and TT - UTC = 68.184 s, which puts TAI "
                       "at 2017-01-01T00:00:36, one second after 23:59:59 + 36 s, and the new value "
                       "37 s applies from 2017-01-01T00:00:00. A 23:59:60 input is accepted only on a "
                       "day the table ends with a leap second, and every input lies between the "
                       "first line and the expiry." % len(leap["table"])),
            "generator": GENERATOR,
            "uncertainty": ("None: TAI - UTC is an integer number of seconds by definition and "
                            "32.184 s is exact. The 0.5 ms tolerance only absorbs floating-point "
                            "representation."),
        },
        "iers-ut1-finals2000a": {
            "name": "IERS UT1 - UTC (finals2000A, observed rows) with the leap-second table",
            "source": ("UT1 - UTC per day at 0h UTC from the IERS finals.all (IAU 2000) file fetched "
                       "2026-09-22 (sha256 c672540e026d3cd4840c0858d4ce2bc4a18c3bc9751f9636c3285e11950d58a1, "
                       "3,767,520 bytes), extracted to CSV (MJD, date, I/P flag, UT1 - UTC, formal "
                       "error) and copied here unchanged; TAI - UTC from leap-seconds.list of tzdata "
                       "2025c (arbiter iers-leap-seconds-2025c)."),
            "inputs": [src_input("iers-finals2000A-ut1.csv"), src_input("leap-seconds.list")],
            "method": ("For 1 January and 1 July alternately, every 3.5 years from 1974-01-01 to "
                       "2023-01-01 (15 rows, all flagged I, observed), take the row at 0h UTC. The "
                       "input is the UT1 reading at that instant, jd_ut1 = 2400000.5 + MJD + "
                       "(UT1 - UTC)/86400 s, so nothing is interpolated; the extra input key utc "
                       "names the row's instant. delta_t_s is Delta T = TT - UT1 in seconds: "
                       "32.184 s + (TAI - UTC) - (UT1 - UTC), with TAI - UTC at 0h UTC of that day."),
            "generator": GENERATOR,
            "uncertainty": ("The IERS formal error of UT1 - UTC on these rows is at most %s s; the "
                            "values are published to 0.1 microsecond, and TAI - UTC and 32.184 s are "
                            "exact. The tolerance is 0.1 s: a Delta T error of 0.1 s moves the Moon "
                            "by about 0.05 arcsec (its mean motion is about 0.55 arcsec per second of "
                            "time), which keeps Delta T's share of the L1 positional tolerance "
                            "(1 arcsec) near 5%%." % max_err),
        },
        "calendar-arithmetic": {
            "name": "Julian and Gregorian calendar arithmetic, two published algorithms",
            "source": ("Richards, E. G. (2013), 'Calendars', in Urban & Seidelmann (eds.), "
                       "Explanatory Supplement to the Astronomical Almanac, 3rd ed., sec. 15.11 "
                       "(Algorithms 3 and 4, Julian and Gregorian parameters); Fliegel, H. F. & Van "
                       "Flandern, T. C. (1968), Communications of the ACM 11(10), 657; Meeus, J. "
                       "(1998), Astronomical Algorithms, 2nd ed., ch. 7. Both calendars proleptic, "
                       "astronomical year numbering; the JDN of a civil day is the Julian date at "
                       "its noon."),
            "inputs": [],
            "method": ("jdn is the integer Julian Day Number of the civil day: the Julian date at its "
                       "noon, so the day that begins at JD n - 0.5 has JDN n (JDN 0 is Julian "
                       "-4712-01-01). Exact integer arithmetic. Every vector is computed by Richards's algorithms "
                       "and must be matched by a second published algorithm: Fliegel & Van Flandern "
                       "for the Gregorian calendar, Meeus ch. 7 for the Julian calendar (INT as "
                       "truncation, as published); Gregorian vectors must also match Meeus's "
                       "Gregorian formulas with INT read as floor. to-jdn inputs are checked to be "
                       "real dates of their calendar; from-jdn outputs round-trip. A dense check "
                       "walks every day from %d-01-01 to %d-12-31 in both calendars with the "
                       "calendar's month lengths: Richards gives consecutive JDNs, hits the anchors "
                       "(JDN 0 = Julian -4712-01-01, 2451545 = Gregorian 2000-01-01) and round-trips "
                       "every day; the second algorithm agrees on every day with JDN >= 0 (before "
                       "JDN 0, with the truncating division it is published with, it does not; no "
                       "vector lies there)." % DENSE_YEARS),
            "generator": GENERATOR,
            "uncertainty": ("None: exact integer arithmetic, with independent published algorithms "
                            "agreeing on every vector and on the dense range."),
        },
    }


def build(args):
    rec = json.loads((SRC / "tzdata.json").read_text(encoding="utf-8"))
    for name, digest in PINNED.items():
        if sha256_file(SRC / name) != digest:
            die("sources/l3/%s has changed (sha256 %s)" % (name, sha256_file(SRC / name)))
    leap_rec = {f["name"]: f for f in rec["tzdata"]["files"]}["leap-seconds.list"]
    if sha256_file(SRC / "leap-seconds.list") != leap_rec["sha256"]:
        die("sources/l3/leap-seconds.list differs from tzdata 2025c's copy")
    log("sources/l3: pinned digests match")

    def locate(value, what):                                   # some commands run inside the tree
        found = str(Path(value).resolve()) if os.sep in value else shutil.which(value)
        if not found:
            die("%s not found: %s" % (what, value))
        return found
    args.awk = locate(args.awk, "awk")
    if args.zic:
        args.zic, args.zdump = locate(args.zic, "zic"), locate(args.zdump, "zdump")
    else:
        args.make = locate(args.make, "make")
    work = Path(args.work).resolve() if args.work else Path(tempfile.mkdtemp(prefix="l3-build-"))
    work.mkdir(parents=True, exist_ok=True)
    try:
        log("tz release 2025c:")
        tzdata = load_release("tzdata", args.tzdata, rec["tzdata"], work)
        releases = [tzdata]
        if not (args.zic and args.zdump):
            releases.append(load_release("tzcode", args.tzcode, rec["tzcode"], work))
        tree = work / "tzdb"
        if tree.exists():
            shutil.rmtree(tree)
        assemble_tree(tree, *releases)
        if args.zic and args.zdump:
            zic, zdump = args.zic, args.zdump
        else:
            run([args.make, "zic", "zdump"], cwd=tree)
            zic, zdump = tree / "zic", tree / "zdump"
        versions = (tool_version(zic), tool_version(zdump))
        log("  %s; %s; awk: %s" % (versions[0], versions[1], args.awk))
        if not all(v.endswith(" 2025c") for v in versions) and not args.any_zic:
            die("zic/zdump are not tzcode 2025c (%s); pass --any-zic to proceed anyway" % (versions,))
        for d in ("zoneinfo", "zoneinfo-main", "zoneinfo-default"):
            if (work / d).exists():
                shutil.rmtree(work / d)
        zoneinfo_dir, default_dir, zone_lines, tree_info = build_tzdb(tree, work, args.awk, zic, rec)

        corpus = json.loads((SRC / "tzdb-divergence-98.json").read_text(encoding="utf-8"))
        oracle = ZoneOracle(zdump, zoneinfo_dir)
        tz = zone_vectors(oracle, default_dir, zone_lines, corpus)
        zone, local, with_bz, default = BANJUL_EXAMPLE
        example = [v for v in tz if v["input"] == {"zone": zone, "local": local}]
        if not (example and example[0]["expected"] == {"status": "ok", "utc_offset_s": with_bz}
                and example[0]["note"].endswith("gives %+d s." % default)
                and example[0].get("tags") == [BACKZONE_TAG]
                and (default_dir / zone).read_bytes() == (default_dir / "Africa/Abidjan").read_bytes()):
            die("the Banjul example in the arbiter text no longer matches the build")
        if args.full_tz_check:
            nfiles, npoints = full_tree_check(zdump, zoneinfo_dir)
            log("  full check: the three readers agree on all %d compiled files at %d instants "
                "(every breakpoint and the second before it, %d-%d)" % (nfiles, npoints, ZDUMP_LO, ZDUMP_HI))
    finally:
        if not args.keep_work and not args.work:
            shutil.rmtree(work, ignore_errors=True)

    log("leap seconds:")
    leap = load_leap_seconds(SRC / "leap-seconds.list")
    log("  %d lines, SHA-1 line verified, expires %s" % (len(leap["table"]), civil_of_mjd(leap["expires_mjd"])))
    ttu = ttu_vectors(leap)
    with open(SRC / "iers-finals2000A-ut1.csv", newline="", encoding="ascii") as f:
        iers_rows = {r["date"]: r for r in csv.DictReader(f)}
    dt, max_err = dt_vectors(leap, iers_rows)
    log("  delta-t: %d observed IERS rows, largest formal error %s s" % (len(dt), max_err))

    log("calendar:")
    jdn, cal = calendar_vectors()
    log("  %d to-jdn and %d from-jdn vectors; all algorithms agree" % (len(jdn), len(cal)))
    if not args.skip_dense_check:
        for c, r in dense_calendar_check().items():
            log("  dense %s: %s" % (c, json.dumps(r)))

    vectors = tz + lmt_vectors() + ttu + dt + jdn + cal
    doc = {
        "suite": "zodiacs-conformance",
        "suiteVersion": "0.1.0",
        "level": "L3",
        "title": "Time and calendars",
        "arbiters": arbiters(rec, leap, max_err, tree_info),
        "vectors": vectors,
    }
    validate(doc)
    return json.dumps(doc, indent=2, ensure_ascii=False) + "\n"


# SPEC.md, "Kinds in v0": required input keys and the possible expected key sets, per kind.
SPEC_KINDS = {
    "time.zone-offset": ({"zone", "local"}, [{"status", "utc_offset_s"}, {"status", "utc_offsets_s"},
                                             {"status"}]),
    "time.local-mean-time": ({"lon"}, [{"utc_offset_s"}]),
    "time.tt-minus-utc": ({"utc"}, [{"tt_minus_utc_s"}]),
    "time.delta-t": ({"jd_ut1"}, [{"delta_t_s"}]),
    "calendar.to-jdn": ({"calendar", "year", "month", "day"}, [{"jdn"}]),
    "calendar.from-jdn": ({"calendar", "jdn"}, [{"year", "month", "day"}]),
}
ID_TAGS = {"time.zone-offset": "TZ", "time.local-mean-time": "LMT", "time.tt-minus-utc": "TTU",
           "time.delta-t": "DT", "calendar.to-jdn": "JDN", "calendar.from-jdn": "CAL"}
WANT_COUNTS = {"time.zone-offset": 45, "time.local-mean-time": 5, "time.tt-minus-utc": 10,
               "time.delta-t": 15, "calendar.to-jdn": 25, "calendar.from-jdn": 10}


def validate(doc):
    """The output against SPEC.md: file keys, arbiters, ids, kinds, keys, formats, tolerances."""
    if list(doc) != ["suite", "suiteVersion", "level", "title", "arbiters", "vectors"]:
        die("top-level keys %s" % list(doc))
    for aid, a in doc["arbiters"].items():
        if list(a) != ["name", "source", "inputs", "method", "generator", "uncertainty"]:
            die("arbiter %s has keys %s" % (aid, list(a)))
        for i in a["inputs"]:
            # A committed file under conformance/ ({path, sha256}) or a published file that is not
            # committed ({url, sha256}), which this generator downloads or reads and checks.
            if list(i) == ["path", "sha256"]:
                if not (ROOT / i["path"]).is_file() or sha256_file(ROOT / i["path"]) != i["sha256"]:
                    die("arbiter %s: input %s missing or not matching its sha256" % (aid, i["path"]))
            elif list(i) != ["url", "sha256"] or not i["url"].startswith("https://"):
                die("arbiter %s: bad input %s" % (aid, i))
            if not re.fullmatch(r"[0-9a-f]{64}", i["sha256"]):
                die("arbiter %s: bad sha256 in %s" % (aid, i))
        if not (ROOT / a["generator"]).is_file():
            die("arbiter %s: generator %s missing" % (aid, a["generator"]))
    ids = [v["id"] for v in doc["vectors"]]
    if len(ids) != 110 or len(set(ids)) != len(ids):
        die("expected 110 unique ids, got %d (%d unique)" % (len(ids), len(set(ids))))
    counts, used = {}, set()
    for v in doc["vectors"]:
        vid, kind = v["id"], v["kind"]
        if not set(v) <= {"id", "kind", "input", "expected", "tolerance", "arbiter", "tags", "note"} or \
                not {"id", "kind", "input", "expected", "tolerance", "arbiter"} <= set(v):
            die("%s has keys %s" % (vid, list(v)))
        if "tags" in v and not (isinstance(v["tags"], list) and v["tags"] and all(
                isinstance(t, str) and re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", t) and len(t) <= 32
                for t in v["tags"])):
            die("%s: tags must be short lowercase strings" % vid)
        if kind not in SPEC_KINDS:
            die("%s: unknown kind %s" % (vid, kind))
        counts[kind] = counts.get(kind, 0) + 1
        if vid != "L3-%s-%04d" % (ID_TAGS[kind], counts[kind]):
            die("%s: id out of sequence for %s" % (vid, kind))
        need, expected_sets = SPEC_KINDS[kind]
        if not need <= set(v["input"]):
            die("%s: input lacks %s" % (vid, need - set(v["input"])))
        if set(v["expected"]) not in expected_sets:
            die("%s: expected keys %s" % (vid, sorted(v["expected"])))
        if v["arbiter"] not in doc["arbiters"]:
            die("%s names an unknown arbiter" % vid)
        used.add(v["arbiter"])
        if set(v["tolerance"]) != set(v["expected"]):
            die("%s: tolerance keys differ from expected keys" % vid)
        for key, tol in v["tolerance"].items():
            if tol != {"exact": True} and not (set(tol) == {"abs", "unit"} and tol["unit"] == "s"
                                               and isinstance(tol["abs"], (int, float))):
                die("%s: tolerance form %s not allowed here" % (vid, tol))
        inp = v["input"]
        if "local" in inp and not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d", inp["local"]):
            die("%s: civil time format" % vid)
        if "utc" in inp and not re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", inp["utc"]):
            die("%s: UTC instant format" % vid)
        if kind.startswith("calendar.") and inp["calendar"] not in ("gregorian", "julian"):
            die("%s: calendar %s" % (vid, inp["calendar"]))
        if kind == "time.zone-offset" and ("local" in inp and inp["local"][:4] > "2037"):
            die("%s: after 2037" % vid)
        if "note" in v and (not v["note"].endswith(".") or v["note"].count(". ") > 0):
            die("%s: the note should be one sentence" % vid)
    if counts != WANT_COUNTS:
        die("kind counts %s, expected %s" % (counts, WANT_COUNTS))
    if used != set(doc["arbiters"]):
        die("arbiters listed but unused: %s" % (set(doc["arbiters"]) - used))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--tzdata", default="download",
                    help="tzdata2025c.tar.gz, an extracted tzdata directory, or 'download' (default)")
    ap.add_argument("--tzcode", default="download",
                    help="tzcode2025c.tar.gz, an extracted tzcode directory, or 'download' (default); "
                         "not needed with --zic and --zdump")
    ap.add_argument("--zic", help="a prebuilt zic from tzcode 2025c")
    ap.add_argument("--zdump", help="a prebuilt zdump from tzcode 2025c")
    ap.add_argument("--any-zic", action="store_true", help="accept zic/zdump that are not tzcode 2025c")
    ap.add_argument("--awk", default="awk")
    ap.add_argument("--make", default="make")
    ap.add_argument("--work", help="work directory (kept); default: a temporary one, removed")
    ap.add_argument("--keep-work", action="store_true")
    ap.add_argument("--out", default=str(OUT_DEFAULT))
    ap.add_argument("--check", action="store_true", help="compare with --out instead of writing it")
    ap.add_argument("--skip-dense-check", action="store_true", help="skip the dense calendar walk")
    ap.add_argument("--full-tz-check", action="store_true",
                    help="also compare the three readers on every compiled TZif file")
    args = ap.parse_args()
    if bool(args.zic) != bool(args.zdump):
        die("pass both --zic and --zdump, or neither")
    text = build(args)
    out = Path(args.out)
    if args.check:
        same = out.is_file() and out.read_text(encoding="utf-8") == text
        log("check: %s is %s" % (out, "up to date" if same else "DIFFERENT"))
        sys.exit(0 if same else 1)
    out.write_text(text, encoding="utf-8")
    log("wrote %s (sha256 %s)" % (out, sha256_bytes(text.encode())))


if __name__ == "__main__":
    main()
