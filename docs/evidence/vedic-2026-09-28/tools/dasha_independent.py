#!/usr/bin/env python3
"""Independent dasha boundaries in exact rational arithmetic, compared with the engine.

  python3 dasha_independent.py [--entry dist/index.js] [--output results/dasha-independent.json]

Rules are taken from BPHS ch. 46 and 51 (R. Santhanam tr., 1984) as written,
not from the engine: lords counted from Krittika (46.12-14), years (46.15),
balance by the elapsed part of the birth nakshatra (46.16; here by the Moon's
longitude), sub-periods proportional to years from the period's own lord
(51.1-2); Yogini by (nakshatra number + 3) mod 8 (46.195-199); Ashtottari
groups of 4 and 3 nakshatras from Ardra with Abhijit, equal shares per
nakshatra (46.17-22). All arithmetic is fractions.Fraction on the exact
binary values of the synthetic inputs; birth instants are integers of ms.
Synthetic births only; no person's data.
"""
import argparse
import json
import subprocess
from fractions import Fraction as F
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
GATE_SECONDS = 5
MS_PER_DAY = 86_400_000
YEAR_DAYS = {"julian": F(36525, 100), "tropical": F(3652422, 10000), "savana": F(360)}

NAKSHATRAS = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya",
              "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha",
              "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta",
              "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"]
# BPHS 46.12-15: from Krittika, Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury, Ketu, Venus.
ORDER = ["Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury", "Ketu", "Venus"]
YEARS = {"Sun": 6, "Moon": 10, "Mars": 7, "Rahu": 18, "Jupiter": 16, "Saturn": 19, "Mercury": 17, "Ketu": 7, "Venus": 20}
KRITTIKA = NAKSHATRAS.index("Krittika")
YOGINI = [("Mangala", 1), ("Pingala", 2), ("Dhanya", 3), ("Bhramari", 4), ("Bhadrika", 5), ("Ulka", 6),
          ("Siddha", 7), ("Sankata", 8)]
ASHTOTTARI = [("Sun", 6, 4), ("Moon", 15, 3), ("Mars", 8, 4), ("Mercury", 17, 3), ("Saturn", 10, 4),
              ("Jupiter", 19, 3), ("Rahu", 12, 4), ("Venus", 21, 3)]
NAK = F(40, 3)


def js_round(x):
    """JavaScript's Math.round on an exact value: halves go up. The engine's ISO boundaries use it."""
    return (x + F(1, 2)).__floor__()


def lord_of(n):
    return ORDER[(n - KRITTIKA) % 9]


def run_from(lord):
    i = ORDER.index(lord)
    return ORDER[i:] + ORDER[:i]


def vimshottari(moon, birth, year_ms):
    n = int(moon // NAK)
    f = moon / NAK - n
    first = lord_of(n)
    start = birth - f * YEARS[first] * year_ms
    periods, at = [], start
    for lord in run_from(first):
        years = F(YEARS[lord])
        periods.append(((lord,), at, at + years * year_ms, years))
        at += years * year_ms
    return periods, (1 - f) * YEARS[first]


def children(period, year_ms):
    lords, start, _, years = period
    out, at = [], start
    for lord in run_from(lords[-1]):
        length = years * YEARS[lord] / 120
        out.append((lords + (lord,), at, at + length * year_ms, length))
        at += length * year_ms
    return out


def yogini(moon, birth, year_ms, cycles=2):
    n = int(moon // NAK)
    f = moon / NAK - n
    k = (n + 1 + 3) % 8 or 8           # nakshatra number (Ashwini 1) + 3, remainder by 8
    first = k - 1
    start = birth - f * YOGINI[first][1] * year_ms
    out, at = [], start
    for i in range(8 * cycles):
        name, years = YOGINI[(first + i) % 8]
        out.append(((name,), at, at + years * year_ms))
        at += years * year_ms
    return out


def ashtottari(moon, birth, year_ms, cycles=2):
    # The 28 with Abhijit: Uttara Ashadha keeps its first three padas, Abhijit is its
    # fourth pada plus the first fifteenth of Shravana, Shravana keeps the rest.
    n = int(moon // NAK)
    u_start, s_start = 20 * NAK, 21 * NAK
    abhijit = (u_start + 3 * NAK / 4, s_start + NAK / 15)
    if abhijit[0] <= moon < abhijit[1]:
        name, lo, hi = "Abhijit", abhijit[0], abhijit[1]
    elif n == 20:
        name, lo, hi = NAKSHATRAS[20], u_start, abhijit[0]
    elif n == 21:
        name, lo, hi = NAKSHATRAS[21], abhijit[1], s_start + NAK
    else:
        name, lo, hi = NAKSHATRAS[n], n * NAK, (n + 1) * NAK
    sequence = NAKSHATRAS[:21] + ["Abhijit"] + NAKSHATRAS[21:]
    counted = sequence[sequence.index("Ardra"):] + sequence[:sequence.index("Ardra")]
    position = counted.index(name)
    for g, (lord, years, size) in enumerate(ASHTOTTARI):
        if position < size:
            break
        position -= size
    share = F(years, size)
    elapsed = (moon - lo) / (hi - lo)
    balance = (1 - elapsed) * share + (size - 1 - position) * share
    start = birth - (years - balance) * year_ms
    out, at = [], start
    for i in range(8 * cycles):
        lord, y, _ = ASHTOTTARI[(g + i) % 8]
        out.append(((lord,), at, at + y * year_ms))
        at += y * year_ms
    return out


def cases():
    seed = 20260928

    def rand():
        nonlocal seed
        seed = (seed * 1103515245 + 12345) % 2**31
        return seed / 2**31

    lo, hi = -5_364_662_400_000, 4_102_444_800_000   # 1800-01-01 to 2100-01-01
    moons = [0.0, 1e-9, 40 / 3, 40 / 3 - 1e-9, 359.99999999999994, 253.0, 276 + 2 / 3, 280 + 8 / 9, 266 + 2 / 3,
             80 + 1e-9, 120.0, 300.0 - 1e-9]
    moons += [rand() * 360 for _ in range(228)]
    births = [0, -1, 951_782_400_000, -5_364_662_400_000] + [lo + int(rand() * (hi - lo)) for _ in range(236)]
    lengths = list(YEAR_DAYS)
    out = []
    for i, (moon, birth) in enumerate(zip(moons, births)):
        out.append({"id": i, "moon": moon, "birthMs": birth, "yearLength": lengths[i % 3],
                    # Within 95 × 360 days of birth: inside the cycle for every year length.
                    "probes": [birth + int(rand() * 95 * 360 * MS_PER_DAY) for _ in range(3)],
                    "expand": [i % 9, (i * 7) % 9]})
    return out


def compare_rows(expected, actual, stats, key):
    for (lords, start, end, *_), (names, s, e) in zip(expected, actual):
        if "/".join(lords) != names:
            stats["lordMismatches"] += 1
        stats[key] = max(stats[key], abs(float(start - F(s))), abs(float(end - F(e))))
        stats["compared"] += 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--entry", default=str(ROOT / "dist/index.js"))
    parser.add_argument("--output", default=str(HERE.parent / "results/dasha-independent.json"))
    args = parser.parse_args()
    grid = cases()
    request = {"kind": "dasha", "cases": grid}
    done = subprocess.run(["node", str(HERE / "engine-bridge.mjs"), args.entry], input=json.dumps(request),
                          capture_output=True, text=True, check=True)
    engine = json.loads(done.stdout)
    stats = {"compared": 0, "lordMismatches": 0, "vimshottariMs": 0.0, "chainMs": 0.0, "yoginiMs": 0.0,
             "ashtottariMs": 0.0, "balanceYears": 0.0, "countMismatches": 0}
    levels = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for case, got in zip(grid, engine["result"]):
        moon, birth = F(case["moon"]), F(case["birthMs"])
        year_ms = YEAR_DAYS[case["yearLength"]] * MS_PER_DAY
        mahas, balance = vimshottari(moon, birth, year_ms)
        stats["balanceYears"] = max(stats["balanceYears"], abs(float(balance - F(got["balance"]["years"]))))
        expected = []
        for maha in mahas:
            expected.append(maha)
            for antar in children(maha, year_ms):
                expected.append(antar)
                expected.extend(children(antar, year_ms))
        chosen = children(mahas[case["expand"][0]], year_ms)[case["expand"][1]]
        for pratyantar in children(chosen, year_ms):
            for sookshma in children(pratyantar, year_ms):
                expected.append(sookshma)
                expected.extend(children(sookshma, year_ms))
        if len(expected) != len(got["periods"]):
            stats["countMismatches"] += 1
        for period in expected:
            levels[len(period[0])] += 1
        compare_rows(expected, got["periods"], stats, "vimshottariMs")
        for probe, chain in zip(case["probes"], got["chains"]):
            periods, want = mahas, []
            for _ in range(5):
                # As the engine compares: whole-millisecond instants against the rounded boundaries.
                found = next(p for p in periods if js_round(p[1]) <= probe < js_round(p[2]))
                want.append(found)
                periods = children(found, year_ms)
            compare_rows(want, chain, stats, "chainMs")
        compare_rows(yogini(moon, birth, year_ms), got["yogini"], stats, "yoginiMs")
        compare_rows(ashtottari(moon, birth, year_ms), got["ashtottari"], stats, "ashtottariMs")
    # Published example: BPHS 46, notes to v. 16 (Santhanam, vol. 2, from Lahiri's balance
    # table): the Moon at 8s 13° (Sagittarius 13°), Moola pada 4, leaves 2 months 3 days of Ketu.
    example = next(got for case, got in zip(grid, engine["result"]) if case["moon"] == 253.0)
    days = round(example["balance"]["years"] * 360, 6)   # the texts' 12 months of 30 days
    published = {"source": "BPHS 46, notes to v. 16 (R. Santhanam tr.), Moon at Sagittarius 13 deg",
                 "publishedBalance": "Ketu, 2 months 3 days", "engineLord": example["balance"]["lord"],
                 "engineBalanceYears": example["balance"]["years"],
                 "engineBalanceMonthsDays": [int(days // 30), round(days % 30, 6)]}
    published["matches"] = published["engineLord"] == "Ketu" and published["engineBalanceMonthsDays"] == [2, 3.0]
    worst = max(stats["vimshottariMs"], stats["chainMs"], stats["yoginiMs"], stats["ashtottariMs"])
    report = {
        "tool": "docs/evidence/vedic-2026-09-28/tools/dasha_independent.py",
        "engineVersion": engine["engineVersion"],
        "cases": len(grid),
        "yearLengths": {k: str(v) for k, v in YEAR_DAYS.items()},
        "periodsCompared": stats["compared"],
        "vimshottariPeriodsByLevel": levels,
        "lordMismatches": stats["lordMismatches"],
        "countMismatches": stats["countMismatches"],
        "maxAbsDifferenceSeconds": {
            "vimshottari": stats["vimshottariMs"] / 1000, "vimshottariAt": stats["chainMs"] / 1000,
            "yogini": stats["yoginiMs"] / 1000, "ashtottari": stats["ashtottariMs"] / 1000},
        "maxAbsBalanceDifferenceYears": stats["balanceYears"],
        "publishedExample": published,
        "gateSeconds": GATE_SECONDS,
        "passes": worst / 1000 <= GATE_SECONDS and stats["lordMismatches"] == 0 and stats["countMismatches"] == 0
        and published["matches"],
        "note": ("Engine instants are unrounded milliseconds (startMs/endMs); its ISO strings round them to the "
                 "millisecond, and vimshottariAt compares whole-millisecond instants with those rounded boundaries, "
                 "as this tool does with the exact ones. An exact boundary within a few microseconds of a half "
                 "millisecond can round the other way from the engine's; src/vedic/dasha.test.ts checks that each "
                 "period's own ISO start and end find it."),
    }
    Path(args.output).write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
