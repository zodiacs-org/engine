#!/usr/bin/env python3
"""Checks src/civil-calendar.ts against an independent implementation.

The reference below is E. G. Richards's algorithms for converting between a
Julian Day Number and a date in the Julian or Gregorian calendar
(Explanatory Supplement to the Astronomical Almanac, 3rd ed., 2013, ch. 15,
section 15.11, with the parameters of its Table 15.14: y = 4716, j = 1401,
m = 2, n = 12, r = 4, p = 1461, q = 0, v = 3, u = 5, s = 153, t = 2, w = 2,
and for the Gregorian calendar A = 184, B = 274277, C = -38). It is written
from that description, not from the TypeScript, whose integer algorithm is a
different one (C. Toendering's Calendar FAQ, section 2.16.1).

For every Julian Day Number from 0 (-4712-01-01 in the Julian calendar)
through Julian 3000-12-31 it requires, of the TypeScript run under Node:

  1. civilDateOf(jdn, "julian") and civilDateOf(jdn, "gregorian") equal
     Richards's dates;
  2. julianDayNumber() of each of those dates is jdn again;
  3. where both dates fall in years 0000-9999, julianToGregorian() and
     gregorianToJulian() map the one YYYY-MM-DD string to the other;

and of the reference that its own date-to-JDN inverse returns jdn.

  python3 scripts/verify-jdn.py [--json result.json]

Needs Node 22.6 or later (it imports the TypeScript with type stripping).
"""
import hashlib
import json
import os
import subprocess
import sys
import time

Y, J, M, N, R, P, Q, V, U, S, T, W = 4716, 1401, 2, 12, 4, 1461, 0, 3, 5, 153, 2, 2
A, B, C = 184, 274277, -38


def jdn_to_date(jdn, gregorian):
    """Richards, Algorithm 3: Julian Day Number to calendar date (jdn >= 0)."""
    f = jdn + J
    if gregorian:
        f = f + (((4 * jdn + B) // 146097) * 3) // 4 + C
    e = R * f + V
    g = (e % P) // R
    h = U * g + W
    day = (h % S) // U + 1
    month = ((h // S + M) % N) + 1
    year = e // P - Y + (N + M - month) // N
    return year, month, day


def date_to_jdn(year, month, day, gregorian):
    """Richards, Algorithm 2: calendar date to Julian Day Number."""
    h = month - M
    g = year + Y - (N - h) // N
    f = (h - 1 + N) % N
    e = (P * g + Q) // R + day - 1 - J
    jdn = e + (S * f + T) // U
    if gregorian:
        jdn = jdn - (3 * ((g + A) // 100)) // 4 - C
    return jdn


NODE = r"""
import { civilDateOf, gregorianToJulian, julianDayNumber, julianToGregorian } from "./src/civil-calendar.ts";
const [first, last] = process.argv.slice(1).map(Number);
const iso = (d) => `${String(d.year).padStart(4, "0")}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
let out = "";
for (let jdn = first; jdn <= last; jdn += 1) {
  const j = civilDateOf(jdn, "julian");
  const g = civilDateOf(jdn, "gregorian");
  let strings = "-";
  if (j.year >= 0 && j.year <= 9999 && g.year >= 0 && g.year <= 9999) {
    strings = julianToGregorian(iso(j)) === iso(g) && gregorianToJulian(iso(g)) === iso(j) ? "1" : "0";
  }
  out += `${j.year} ${j.month} ${j.day} ${g.year} ${g.month} ${g.day} ${julianDayNumber(j, "julian")} ${julianDayNumber(g, "gregorian")} ${strings}\n`;
  if (out.length > 1 << 20) { process.stdout.write(out); out = ""; }
}
process.stdout.write(out);
"""


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    first = 0
    last = date_to_jdn(3000, 12, 31, gregorian=False)
    assert jdn_to_date(first, False) == (-4712, 1, 1)
    started = time.time()
    node = subprocess.Popen(
        ["node", "--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", NODE, str(first), str(last)],
        cwd=root,
        stdout=subprocess.PIPE,
        text=True,
    )
    digest = hashlib.sha256()
    failures = []
    days = 0
    string_checks = 0
    for jdn, line in enumerate(node.stdout, start=first):
        digest.update(line.encode())
        fields = line.split()
        julian = tuple(map(int, fields[0:3]))
        gregorian = tuple(map(int, fields[3:6]))
        expected_julian = jdn_to_date(jdn, False)
        expected_gregorian = jdn_to_date(jdn, True)
        problems = []
        if julian != expected_julian:
            problems.append(f"julian {julian} != {expected_julian}")
        if gregorian != expected_gregorian:
            problems.append(f"gregorian {gregorian} != {expected_gregorian}")
        if int(fields[6]) != jdn or int(fields[7]) != jdn:
            problems.append(f"julianDayNumber gave {fields[6]} and {fields[7]}")
        if date_to_jdn(*expected_julian, False) != jdn or date_to_jdn(*expected_gregorian, True) != jdn:
            problems.append("the reference does not invert itself")
        if fields[8] == "0":
            problems.append("julianToGregorian/gregorianToJulian disagree")
        elif fields[8] == "1":
            string_checks += 1
        if problems and len(failures) < 20:
            failures.append({"jdn": jdn, "problems": problems})
        elif problems:
            failures.append(None)
        days += 1
    if node.wait() != 0:
        sys.exit("verify-jdn: the Node side failed")
    if days != last - first + 1:
        sys.exit(f"verify-jdn: expected {last - first + 1} days, read {days}")
    result = {
        "check": "src/civil-calendar.ts against Richards (Explanatory Supplement, 3rd ed., 2013, section 15.11)",
        "from": {"jdn": first, "julian": "-4712-01-01", "gregorian": "-4713-11-24"},
        "to": {"jdn": last, "julian": "3000-12-31", "gregorian": "%04d-%02d-%02d" % jdn_to_date(last, True)},
        "days": days,
        "stringRoundTrips": string_checks,
        "failures": len(failures),
        "firstFailures": [failure for failure in failures if failure][:20],
        "nodeOutputSha256": digest.hexdigest(),
        "node": subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip(),
        "python": sys.version.split()[0],
        "seconds": round(time.time() - started, 1),
    }
    text = json.dumps(result, indent=1)
    if "--json" in sys.argv:
        with open(sys.argv[sys.argv.index("--json") + 1], "w") as handle:
            handle.write(text + "\n")
    print(text)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
