#!/usr/bin/env python3
"""After-the-fact statistics: Swiss Ephemeris (pyswisseph) against the L3 calendar and
leap-second arbiters.

Swiss Ephemeris is an instrument here, never an arbiter (SPEC.md rule 3): nothing it returns
is written into a vector, and this script only prints counts.  It reads the committed vectors
and reuses build.py's calendar and leap-second arithmetic for the dense comparisons.

Run it with a Python that has pyswisseph installed:
  /path/to/venv/bin/python arbiters/l3/check_swiss.py
"""

import datetime as dtm
import json
import sys
from pathlib import Path

import swisseph as swe

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build  # noqa: E402  (the arbiter's own arithmetic, for the dense comparisons)

VECTORS = HERE.parent.parent / "vectors" / "L3-time-calendars.json"
CAL = {"julian": swe.JUL_CAL, "gregorian": swe.GREG_CAL}


def swiss_tt_minus_utc(y, mo, d, h, mi, s):
    """TT - UTC from swe_utc_to_jd, against the UTC reading taken as day + seconds / 86400
    (so 23:59:60 reads as 86,400 s into its day)."""
    jd_tt, _ = swe.utc_to_jd(y, mo, d, h, mi, float(s), swe.GREG_CAL)
    label = swe.julday(y, mo, d, 0.0, swe.GREG_CAL)
    return ((jd_tt - label) * 86400.0) - (h * 3600 + mi * 60 + s)


def main():
    doc = json.loads(VECTORS.read_text(encoding="utf-8"))
    report = {"pyswisseph": swe.version}

    # 1. The calendar vectors.
    to_n = to_ok = from_n = from_ok = 0
    for v in doc["vectors"]:
        i = v["input"]
        if v["kind"] == "calendar.to-jdn":
            to_n += 1
            to_ok += swe.julday(i["year"], i["month"], i["day"], 12.0, CAL[i["calendar"]]) == v["expected"]["jdn"]
        elif v["kind"] == "calendar.from-jdn":
            from_n += 1
            y, m, d, h = swe.revjul(float(i["jdn"]), CAL[i["calendar"]])
            e = v["expected"]
            from_ok += (y, m, d, h) == (e["year"], e["month"], e["day"], 12.0)
    report["calendarVectors"] = {"toJdn": "%d of %d agree" % (to_ok, to_n),
                                 "fromJdn": "%d of %d agree" % (from_ok, from_n)}

    # 2. Dense: every day of the build's dense range, both calendars, both directions.
    lo, hi = build.DENSE_YEARS
    for cal in ("julian", "gregorian"):
        days = diff_nonneg = diff_neg = 0
        first = None
        for y in range(lo, hi + 1):
            for m in range(1, 13):
                for d in range(1, build.month_length(cal, y, m) + 1):
                    days += 1
                    j = build.richards_to_jdn(cal, y, m, d)
                    ok = (swe.julday(y, m, d, 12.0, CAL[cal]) == j
                          and swe.revjul(float(j), CAL[cal]) == (y, m, d, 12.0))
                    if not ok:
                        if j >= 0:
                            diff_nonneg += 1
                        else:
                            diff_neg += 1
                        first = first or (y, m, d, j)
        report["dense_" + cal] = {"range": "%d-01-01..%d-12-31" % (lo, hi), "days": days,
                                  "differJdnNonNegative": diff_nonneg, "differJdnNegative": diff_neg,
                                  "firstDifference": first}

    # 3. The tt-minus-utc vectors.
    worst, n, within = 0.0, 0, 0
    for v in doc["vectors"]:
        if v["kind"] != "time.tt-minus-utc":
            continue
        n += 1
        got = swiss_tt_minus_utc(*build.parse_utc(v["input"]["utc"]))
        err = abs(got - v["expected"]["tt_minus_utc_s"])
        worst = max(worst, err)
        within += err <= v["tolerance"]["tt_minus_utc_s"]["abs"]
    report["ttMinusUtcVectors"] = {"withinTolerance": "%d of %d" % (within, n), "largestDifferenceS": worst}

    # 4. Dense leap seconds: 00:00:00 and 23:59:59 of every day from the table's first line to the
    #    day before its expiry, and 23:59:60 of every leap-second day.
    leap = build.load_leap_seconds(build.SRC / "leap-seconds.list")
    first_day = build.civil_of_mjd(leap["table"][0][0])
    last_day = build.civil_of_mjd(leap["expires_mjd"] - 1)
    leap_days = {build.civil_of_mjd(m - 1) for m, _ in leap["table"][1:]}
    points = differ = 0
    worst = 0.0
    day = first_day
    while day <= last_day:
        times = [(0, 0, 0), (23, 59, 59)] + ([(23, 59, 60)] if day in leap_days else [])
        for h, mi, s in times:
            ours = float(build.TT_MINUS_TAI + build.tai_minus_utc(leap, day.year, day.month, day.day, h, mi, s))
            got = swiss_tt_minus_utc(day.year, day.month, day.day, h, mi, s)
            points += 1
            worst = max(worst, abs(got - ours))
            differ += abs(got - ours) > 0.0005
        day += dtm.timedelta(days=1)
    report["denseLeapSeconds"] = {"range": "%s..%s" % (first_day, last_day), "instants": points,
                                  "leapSecondInstants": len(leap_days),
                                  "differByMoreThan0.5ms": differ, "largestDifferenceS": worst}

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
