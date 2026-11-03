#!/usr/bin/env python3
"""G-V4: the Ascendant's change instants against an independent computation
(PREREGISTRATION.md, section 8). It imports nothing from the engine and uses
no Swiss code or data.

  python3 -I -B varga_ascendant.py --results FILE [--births FILE] [--changes FILE]
                                   [--out FILE] [--control c4a|c4b] [--limit N]
  python3 -I -B varga_ascendant.py --self-test

--results is run.mjs's results.jsonl for F4 (node run.mjs --births
births-erfa.json --seams none --out DIR); --births is F4, births-erfa.json
beside this folder; --changes is F1, src/vedic/fixtures/varga-changes.json.

The arbiter, on a real UT1 axis with TT = UT1 + the birth's pinned Delta T:

- sidereal time from ERFA gst06a; the true obliquity from obl06 plus the
  nutation in obliquity of nut06a;
- the Ascendant, the ecliptic longitude on the eastern horizon:
  atan2(cos(theta), -(sin(theta) cos(eps) + tan(phi) sin(eps))) or that plus
  180 degrees, whichever lies east of the meridian (its hour angle's sine
  below zero), theta the local sidereal time;
- the ayanamsa of lahiri and krishnamurti as
  docs/evidence/vedic-2026-09-28/tools/reference_values.py builds the epoch
  ayanamsas (its epoch_ayanamsa, imported), plus nut06a's nutation in
  longitude for the true value; the sidereal Ascendant is the Ascendant less
  it;
- each key's runs from F1; the birth run is the run holding the arbiter's own
  sidereal Ascendant at the birth;
- for each key and side, the first crossing of the birth run's end, by
  60 s brackets on the Ascendant's unwrapped advance and bisection to 1
  microsecond.

The comparison, for each birth, key and side: if the birth lies within 5 s of
an arbiter crossing of that key's run ends, the key's sides are not judged;
a crossing within 5 s of either end of `searched` is not judged; otherwise
both report no change, or both a change with the same boundary, `from` and
`to`, and |engine at - arbiter instant| <= 5 s. Pass: no mismatch of
boundary or sign, and every difference within 5 s, over every judged side.
Reported: the largest, median and 99th percentile |difference| in the
latitude bands 0 to 45, 45 to 60 and 60 to 66 degrees, and the counts judged
and not judged.

The controls: --control c4a shifts the engine's instants by 6 s, which must
fail every compared side; --control c4b gives the arbiter the other
definition's ayanamsa (krishnamurti for lahiri and the reverse), which must
fail at least one comparison.

Needs pyerfa 2.0.1.5 and numpy 2.4.6 (OQ6), installed in a scratch
environment outside every repository; --self-test needs neither, and checks
the search and the comparison on synthetic longitudes with known crossings.
"""
import argparse
import bisect
import json
import math
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]
TICKS = 7560
CIRCLE = 360 * TICKS
DAY_MS = 86_400_000
UNIX_JD = 2_440_587.5
TOLERANCE_MS = 5_000
BRACKET_MS = 60_000
MICROSECOND = 1e-3  # ms
SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio",
         "sagittarius", "capricorn", "aquarius", "pisces"]
BANDS = [(0, 45), (45, 60), (60, 66)]


def iso_ms(text):
    """Milliseconds since 1970 of an ISO 8601 instant ending in Z, on its own scale (exact)."""
    from datetime import datetime, timezone
    whole, _, fraction = text.rstrip("Z").partition(".")
    moment = datetime.strptime(whole, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    since = moment - datetime(1970, 1, 1, tzinfo=timezone.utc)
    return (since.days * 86_400 + since.seconds) * 1000 + int((fraction + "000")[:3])


def ms_iso(ms):
    """An ISO 8601 instant ending in Z for whole milliseconds since 1970 (for the self-test)."""
    from datetime import datetime, timedelta, timezone
    moment = datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=ms)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def wrap(value):
    return value % 360.0


def signed(value):
    """A difference of longitudes, degrees, in [-180, 180)."""
    return (value + 180.0) % 360.0 - 180.0


def key_of(row):
    return f"{row['varga']}cyclic" if row["scheme"] == "cyclic" else row["varga"]


def load_changes(path):
    """F1: key -> (sorted change boundaries in ticks, {T: (below, at)})."""
    data = json.loads(Path(path).read_text())
    out = {}
    for key, rows in data["varga"].items():
        changes = {t: (below, at) for t, below, at, change in rows if change == 1}
        out[key] = (sorted(changes), changes)
    return out


def run_holding(boundaries, ticks):
    """The run (start, end) of change boundaries holding a tick: start <= ticks < end round the circle."""
    k = bisect.bisect_right(boundaries, ticks)
    return boundaries[(k - 1) % len(boundaries)], boundaries[k % len(boundaries)]


def crossing(x, t0, x0, limit, direction, run):
    """The first crossing of the birth run's end after t0 (direction +1) or
    before it (-1), within limit (ms): bracketed in 60 s steps on the unwrapped
    advance from x0, bisected to 1 microsecond. None if there is none."""
    start, end = run
    ahead = (end / TICKS - x0) % 360.0 or 360.0
    behind = (x0 - start / TICKS) % 360.0
    target = ahead if direction > 0 else -behind
    passed = (lambda advance: advance >= target) if direction > 0 else (lambda advance: advance < target)
    t, advance, value = t0, 0.0, x0
    while (limit - t) * direction > 0:
        step = min(BRACKET_MS, abs(limit - t)) * direction
        nxt = x(t + step)
        moved = advance + signed(nxt - value)
        if passed(moved):
            low, high, base = t, t + step, (advance, value)
            while abs(high - low) > MICROSECOND:
                middle = (low + high) / 2
                there = base[0] + signed(x(middle) - base[1])
                if passed(there):
                    high = middle
                else:
                    low, base = middle, (there, x(middle))
            return high
        t, advance, value = t + step, moved, nxt
    return None


def arbiter_runs(x, t0, lo, hi, changes, keys):
    """For each key: (boundary ticks crossed, from, to, instant) on each side, or None, and both crossings."""
    x0 = x(t0)
    ticks = math.floor(x0 * TICKS)
    out = {}
    for key in keys:
        boundaries, signs = changes[key]
        run = run_holding(boundaries, ticks)
        found = {}
        for side, direction, end in (("previous", -1, lo), ("next", 1, hi)):
            instant = crossing(x, t0, x0, end + direction * (TOLERANCE_MS + BRACKET_MS), direction, run)
            if instant is None:
                found[side] = None
                continue
            tick = run[1] if direction > 0 else run[0]
            below, at = signs[tick]
            found[side] = {"tick": tick, "boundary": tick / TICKS, "from": SIGNS[below], "to": SIGNS[at], "instant": instant}
        out[key] = found
    return out


def compare(engine_rows, arbiter, t0, lo, hi, shift_ms=0):
    """Each judged side's verdict and difference (ms), and the sides not judged."""
    judged, not_judged = [], []
    for row in engine_rows:
        key = key_of(row)
        sides = arbiter[key]
        near_birth = any(sides[side] is not None and abs(sides[side]["instant"] - t0) <= TOLERANCE_MS for side in sides)
        for side in ("previous", "next"):
            mine = sides[side]
            theirs = row[side]
            if near_birth:
                not_judged.append((key, side, "birth within 5 s of a crossing"))
                continue
            if mine is not None and (abs(mine["instant"] - lo) <= TOLERANCE_MS or abs(mine["instant"] - hi) <= TOLERANCE_MS):
                not_judged.append((key, side, "crossing within 5 s of an end of searched"))
                continue
            if mine is not None and not (lo <= mine["instant"] <= hi):
                mine = None
            if mine is None and theirs is None:
                judged.append({"key": key, "side": side, "ok": True, "difference": None})
                continue
            if mine is None or theirs is None:
                judged.append({"key": key, "side": side, "ok": False, "difference": None, "why": "a change on one side only"})
                continue
            difference = iso_ms(theirs["at"]) + shift_ms - mine["instant"]
            same = theirs["boundary"] == mine["boundary"] and theirs["from"] == mine["from"] and theirs["to"] == mine["to"]
            judged.append({"key": key, "side": side, "ok": same and abs(difference) <= TOLERANCE_MS, "difference": difference,
                           "why": None if same else "boundary or signs differ"})
    return judged, not_judged


def summary(differences):
    values = sorted(abs(d) for d in differences)
    if not values:
        return {"count": 0}
    return {"count": len(values), "maxMs": values[-1], "medianMs": statistics.median(values),
            "p99Ms": values[min(len(values) - 1, math.ceil(0.99 * len(values)) - 1)]}


def erfa_ascendant():
    """The arbiter's sidereal Ascendant: (birth, ayanamsa name) -> x(ms on UT1)."""
    sys.dont_write_bytecode = True
    import erfa
    sys.path.insert(0, str(ROOT / "docs/evidence/vedic-2026-09-28/tools"))
    import reference_values as reference

    def make(birth, name):
        pin = birth["deltaT"]
        phi = math.radians(birth["latitude"])
        east = math.radians(birth["longitude"])
        t0, value, model = reference.EPOCHS[name]

        def x(ms):
            days = math.floor(ms / DAY_MS)
            uta, utb = UNIX_JD + days, (ms - days * DAY_MS) / DAY_MS
            tt = ms + pin * 1000
            ttdays = math.floor(tt / DAY_MS)
            tta, ttb = UNIX_JD + ttdays, (tt - ttdays * DAY_MS) / DAY_MS
            dpsi, deps = erfa.nut06a(tta, ttb)
            eps = erfa.obl06(tta, ttb) + deps
            theta = erfa.gst06a(uta, utb, tta, ttb) + east
            first = math.atan2(math.cos(theta), -(math.sin(theta) * math.cos(eps) + math.tan(phi) * math.sin(eps)))
            for lam in (first, first + math.pi):
                alpha = math.atan2(math.sin(lam) * math.cos(eps), math.cos(lam))
                if math.sin(theta - alpha) < 0:
                    break
            true = reference.epoch_ayanamsa(value, t0, model, tta + ttb) + dpsi / (math.pi / 648_000) / 3600
            return wrap(math.degrees(lam) - true)

        return x

    return make, f"pyerfa {erfa.__version__}"


def main_compare(args):
    make, erfa_version = erfa_ascendant()
    births = {entry["id"]: entry for entry in json.loads(Path(args.births).read_text())["births"]}
    changes = load_changes(args.changes)
    lines = [json.loads(text) for text in Path(args.results).read_text().splitlines() if text.strip()]
    if args.limit:
        lines = lines[: args.limit]
    other = {"lahiri": "krishnamurti", "krishnamurti": "lahiri"}
    shift = 6_000 if args.control == "c4a" else 0
    bands = {band: [] for band in BANDS}
    totals = {"judged": 0, "notJudged": 0, "mismatches": 0}
    failures = []
    for line in lines:
        birth = births[line["id"]]
        result = line.get("result")
        if result is None:
            failures.append({"id": line["id"], "why": "the engine's call threw"})
            continue
        name = other[birth["ayanamsa"]] if args.control == "c4b" else birth["ayanamsa"]
        x = make(birth, name)
        t0 = iso_ms(result["utc"])
        lo, hi = iso_ms(result["searched"]["from"]), iso_ms(result["searched"]["to"])
        rows = [row for row in result["rows"] if row["point"] == "Ascendant"]
        if any(row["refusal"] for row in rows):
            failures.append({"id": line["id"], "why": "a row was refused"})
            continue
        arbiter = arbiter_runs(x, t0, lo, hi, changes, [key_of(row) for row in rows])
        judged, not_judged = compare(rows, arbiter, t0, lo, hi, shift)
        totals["judged"] += len(judged)
        totals["notJudged"] += len(not_judged)
        band = next(b for b in BANDS if b[0] <= abs(birth["latitude"]) <= b[1])
        for entry in judged:
            if entry["difference"] is not None:
                bands[band].append(entry["difference"])
            if not entry["ok"]:
                totals["mismatches"] += 1
                failures.append({"id": line["id"], **entry})
    compared = sum(len(values) for values in bands.values())
    report = {
        "tool": "docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/varga_ascendant.py",
        "erfa": erfa_version,
        "python": sys.version.split()[0],
        "control": args.control,
        "births": len(lines),
        **totals,
        "compared": compared,
        "bands": {f"{low} to {high} degrees": summary(values) for (low, high), values in bands.items()},
        "failures": failures[:200],
    }
    if args.control == "c4a":
        report["verdict"] = "control failed as it must" if totals["mismatches"] >= compared and compared > 0 else "CONTROL DID NOT FAIL"
    elif args.control == "c4b":
        report["verdict"] = "control failed as it must" if totals["mismatches"] > 0 else "CONTROL DID NOT FAIL"
    else:
        report["verdict"] = "PASS" if not failures else "FAIL"
    text = json.dumps(report, indent=1) + "\n"
    if args.out:
        Path(args.out).write_text(text)
    print(json.dumps({key: report[key] for key in ("births", "judged", "notJudged", "compared", "mismatches", "verdict")}))


def self_test():
    """The search and the comparison on synthetic longitudes whose crossings are known."""
    rate = 360 / DAY_MS  # degrees a millisecond
    x = lambda ms: wrap(100.25 + ms * rate)  # noqa: E731
    run = (round(100 * TICKS), round(100.5 * TICKS))
    up = crossing(x, 0, x(0), 10 * DAY_MS, 1, run)
    down = crossing(x, 0, x(0), -10 * DAY_MS, -1, run)
    assert abs(up - 0.25 / rate) < 2e-3 and abs(down + 0.25 / rate) < 2e-3, (up, down)
    # Through 0 degrees: the run [330, 0) is left at 360.
    x2 = lambda ms: wrap(359.5 + ms * rate)  # noqa: E731
    assert abs(crossing(x2, 0, x2(0), DAY_MS, 1, (330 * TICKS, 0)) - 0.5 / rate) < 2e-3
    assert crossing(x, 0, x(0), 1000, 1, run) is None
    changes = {"D1": ([t * 30 * TICKS for t in range(12)], {t * 30 * TICKS: ((t - 1) % 12, t) for t in range(12)})}
    arbiter = arbiter_runs(x2, 0, -DAY_MS, DAY_MS, changes, ["D1"])
    assert arbiter["D1"]["next"]["boundary"] == 0 and arbiter["D1"]["next"]["from"] == "pisces" and arbiter["D1"]["next"]["to"] == "aries"
    at = arbiter["D1"]["next"]["instant"]
    previous = arbiter["D1"]["previous"]
    row = {"varga": "D1", "scheme": "parashari",
           "previous": {"at": ms_iso(math.ceil(previous["instant"])), "boundary": 330, "from": "aquarius", "to": "pisces"},
           "next": {"at": ms_iso(math.ceil(at)), "boundary": 0, "from": "pisces", "to": "aries"}}
    judged, not_judged = compare([row], arbiter, 0, -DAY_MS, DAY_MS)
    assert all(entry["ok"] for entry in judged) and not not_judged, (judged, not_judged)
    judged, _ = compare([row], arbiter, 0, -DAY_MS, DAY_MS, shift_ms=6_000)
    assert not any(entry["ok"] for entry in judged), judged
    wrong = dict(row, next=dict(row["next"], to="taurus"))
    judged, _ = compare([wrong], arbiter, 0, -DAY_MS, DAY_MS)
    assert [entry["ok"] for entry in judged] == [True, False], judged
    near = arbiter_runs(lambda ms: wrap(359.99999 + ms * rate), 0, -DAY_MS, DAY_MS, changes, ["D1"])
    _, not_judged = compare([row], near, 0, -DAY_MS, DAY_MS)
    assert len(not_judged) == 2, not_judged
    assert iso_ms("2000-01-01T12:00:00.250Z") == 946_728_000_250
    assert summary([1, -3, 2])["maxMs"] == 3
    print("self-test: the search, the comparison, its controls' shifts and the side rule behave on synthetic longitudes")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--results")
    parser.add_argument("--births", default=str(HERE.parent / "births-erfa.json"))
    parser.add_argument("--changes", default=str(ROOT / "src/vedic/fixtures/varga-changes.json"))
    parser.add_argument("--out")
    parser.add_argument("--control", choices=["c4a", "c4b"])
    parser.add_argument("--limit", type=int)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.results:
        parser.error("--results is required")
    main_compare(args)


if __name__ == "__main__":
    main()
