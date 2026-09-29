#!/usr/bin/env python3
"""Boundary fixtures for nakshatras, padas, KP subs and sub-subs, and vargas.

Writes src/vedic/fixtures/boundaries.json. Expected values come from the
rules as the texts state them, transcribed below as tables, and exact
rational arithmetic (fractions.Fraction) on the exact binary value of each
test longitude. Nothing here imports or runs the engine.

Sources transcribed:
  * Nakshatra lords and Vimshottari years: BPHS ch. 46 vv. 12-15 and its
    table of constellations per lord (R. Santhanam tr., 1984).
  * KP subs: each star cut into nine parts in proportion to the Vimshottari
    years, the first part the star lord's, then in dasha order; each sub cut
    again the same way (K. S. Krishnamurti, KP Reader); subs numbered 1-249
    from 0 Aries, a sub cut by a sign boundary counted once in each sign.
  * Vargas: BPHS ch. 6 vv. 5-41 and the specula (tables) in Santhanam's notes;
    the trimsamsa as P. V. R. Narasimha Rao, Vedic Astrology: An Integrated
    Approach (2000), sec. 6.2.17, states it in degrees.

Test points for each boundary b, a whole number T of 1/7560 degree:
  x0 = the double nearest T/7560 (JavaScript T / 7560 is the same double),
  x- = x0 - 1e-9 and x+ = x0 + 1e-9 in IEEE double arithmetic,
  each normalised into [0, 360) as the engine does.

Usage: python3 boundary_fixtures.py [--output PATH]
"""
import argparse
import hashlib
import json
import math
from bisect import bisect_right
from fractions import Fraction as F
from pathlib import Path

TICKS = 7560
SIGN_NAMES = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra",
              "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"]

# --- Nakshatras (BPHS 46, table of Dasha lords) -----------------------------
NAKSHATRAS = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
              "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
              "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha",
              "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha",
              "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada",
              "Uttara Bhadrapada", "Revati"]
LORD_TABLE = {  # lord: (years, its three constellations)
    "Sun": (6, ["Krittika", "Uttara Phalguni", "Uttara Ashadha"]),
    "Moon": (10, ["Rohini", "Hasta", "Shravana"]),
    "Mars": (7, ["Mrigashira", "Chitra", "Dhanishta"]),
    "Rahu": (18, ["Ardra", "Swati", "Shatabhisha"]),
    "Jupiter": (16, ["Punarvasu", "Vishakha", "Purva Bhadrapada"]),
    "Saturn": (19, ["Pushya", "Anuradha", "Uttara Bhadrapada"]),
    "Mercury": (17, ["Ashlesha", "Jyeshtha", "Revati"]),
    "Ketu": (7, ["Magha", "Mula", "Ashwini"]),
    "Venus": (20, ["Purva Phalguni", "Purva Ashadha", "Bharani"]),
}
# "Beginning from Krittika the lords are the Sun, the Moon, Mars, Rahu,
# Jupiter, Saturn, Mercury, Ketu and Venus in that order."
DASHA_ORDER = ["Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury", "Ketu", "Venus"]
STAR_LORD = {name: lord for lord, (_, names) in LORD_TABLE.items() for name in names}
YEARS = {lord: years for lord, (years, _) in LORD_TABLE.items()}
assert sum(YEARS.values()) == 120 and len(STAR_LORD) == 27
# Index order the fixture file uses for lords (the engine's VIMSHOTTARI_LORDS
# order is not assumed: the file names it and the test maps names).
LORD_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"]

NAKSHATRA = F(40, 3)
PADA = F(10, 3)


def after(lord):
    """Dasha order starting at `lord`."""
    i = DASHA_ORDER.index(lord)
    return DASHA_ORDER[i:] + DASHA_ORDER[:i]


# --- KP subs and sub-subs ---------------------------------------------------
SUBS = []       # (start, end, sub lord, star index)
SUBSUBS = []    # (start, sub-sub lord)
for n, star in enumerate(NAKSHATRAS):
    at = n * NAKSHATRA
    for sub_lord in after(STAR_LORD[star]):
        length = NAKSHATRA * F(YEARS[sub_lord], 120)
        SUBS.append((at, at + length, sub_lord, n))
        inner = at
        for ss_lord in after(sub_lord):
            SUBSUBS.append((inner, ss_lord))
            inner += length * F(YEARS[ss_lord], 120)
        assert inner == at + length
        at += length
assert at == 360 and len(SUBS) == 243
NUMBERED = []   # starts of the numbered subs 1..249
for start, end, lord, n in SUBS:
    NUMBERED.append(start)
    for edge in range(30, 360, 30):
        if start < edge < end:
            NUMBERED.append(F(edge))
assert len(NUMBERED) == 249, len(NUMBERED)
SUBSUB_STARTS = [s for s, _ in SUBSUBS]

# --- Vargas (BPHS ch. 6, specula) --------------------------------------------
# Signs are 1..12 here, as in the specula. Each table gives, per natal sign,
# the sign of the first part; parts then run on in zodiacal order.
MOVABLE, FIXED, DUAL = {1, 4, 7, 10}, {2, 5, 8, 11}, {3, 6, 9, 12}
ODD = {1, 3, 5, 7, 9, 11}
DREKKANA = {1: [1, 5, 9], 2: [2, 6, 10], 3: [3, 7, 11], 4: [4, 8, 12], 5: [5, 9, 1], 6: [6, 10, 2],
            7: [7, 11, 3], 8: [8, 12, 4], 9: [9, 1, 5], 10: [10, 2, 6], 11: [11, 3, 7], 12: [12, 4, 8]}
CHATURTHAMSA_ROWS = [  # quarters 1..4, columns Aries..Pisces
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3],
    [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6],
    [10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9],
]
FIRST = {
    # Saptamsa: odd signs from the sign, even from the 7th.
    7: [1, 8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6],
    # Navamsa: movable from the sign, fixed from the 9th, dual from the 5th.
    9: [1, 10, 7, 4, 1, 10, 7, 4, 1, 10, 7, 4],
    # Dasamsa: odd from the sign, even from the 9th.
    10: [1, 10, 3, 12, 5, 2, 7, 4, 9, 6, 11, 8],
    # Dvadasamsa: from the sign itself.
    12: list(range(1, 13)),
    # Shodasamsa: movable from Aries, fixed from Leo, dual from Sagittarius.
    16: [1, 5, 9] * 4,
    # Vimsamsa: movable from Aries, fixed from Sagittarius, dual from Leo.
    20: [1, 9, 5] * 4,
    # Siddhamsa: odd from Leo, even from Cancer.
    24: [5, 4] * 6,
    # Bhamsa: fiery from Aries, earthy from Cancer, airy from Libra, watery from Capricorn.
    27: [1, 4, 7, 10] * 3,
    # Khavedamsa: odd from Aries, even from Libra.
    40: [1, 7] * 6,
    # Akshavedamsa: movable from Aries, fixed from Leo, dual from Sagittarius.
    45: [1, 5, 9] * 4,
}
TRIMSAMSA = {  # (end degree, sign) in degree order
    "odd": [(5, 1), (10, 11), (18, 9), (25, 3), (30, 7)],    # Mars, Saturn, Jupiter, Mercury, Venus
    "even": [(5, 2), (12, 6), (20, 12), (25, 10), (30, 8)],  # Venus, Mercury, Jupiter, Saturn, Mars
}
DIVISIONS = {"D1": 1, "D2": 2, "D3": 3, "D4": 4, "D7": 7, "D9": 9, "D10": 10, "D12": 12, "D16": 16,
             "D20": 20, "D24": 24, "D27": 27, "D30": 5, "D40": 40, "D45": 45, "D60": 60}


def varga_sign(name, x):
    """Sign 1..12 of exact longitude x in varga `name` (or D2cyclic/D3cyclic)."""
    sign = int(x // 30) + 1
    w = x - 30 * (sign - 1)
    if name == "D30":
        table = TRIMSAMSA["odd" if sign in ODD else "even"]
        return next(s for end, s in table if w < end)
    n = int(name[1:].replace("cyclic", ""))
    part = int(w * n // 30)
    if name.endswith("cyclic"):  # 24 horas / 36 drekkanas counted on from Aries
        return (n * (sign - 1) + part) % 12 + 1
    if name == "D1":
        return sign
    if name == "D2":  # odd: Sun's hora (Leo) then Moon's (Cancer); even: reversed
        sun_first = sign in ODD
        return 5 if (part == 0) == sun_first else 4
    if name == "D3":
        return DREKKANA[sign][part]
    if name == "D4":
        return CHATURTHAMSA_ROWS[part][sign - 1]
    if name == "D60":  # twice the degrees, remainder by 12, counted from the sign
        return (sign - 1 + int(2 * w) % 12) % 12 + 1
    return (FIRST[n][sign - 1] - 1 + part) % 12 + 1


def boundary_ticks(name):
    out = set()
    for s in range(12):
        if name == "D30":
            ends = [e for e, _ in TRIMSAMSA["odd" if (s + 1) in ODD else "even"]]
            edges = [0] + ends[:-1]
            out.update((30 * s + e) * TICKS for e in edges)
        else:
            n = int(name[1:].replace("cyclic", ""))
            out.update(30 * s * TICKS + k * (30 * TICKS // n) for k in range(n))
    return sorted(out)


def norm(x):
    """Into [0, 360) as the engine's sidereal constructors do: a value already
    there is unchanged; otherwise C fmod (JavaScript %) and one addition of 360."""
    if 0 <= x < 360:
        return x
    r = math.fmod(x, 360.0)
    if r < 0:
        r += 360.0
    return 0.0 if r in (0.0, 360.0) else r


def points(t):
    x0 = t / TICKS  # correctly rounded, as T / 7560 in JavaScript
    return [norm(x0 - 1e-9), norm(x0), norm(x0 + 1e-9)]


def nakshatra_pada(x):
    n = int(x // NAKSHATRA)
    return n, int((x - n * NAKSHATRA) // PADA) + 1


def kp(x):
    number = bisect_right(NUMBERED, x)          # 1..249
    ss = SUBSUBS[bisect_right(SUBSUB_STARTS, x) - 1][1]
    return number, LORD_ORDER.index(ss)


def to_ticks(value):
    t = value * TICKS
    assert t.denominator == 1
    return int(t)


def build():
    nak_ticks = sorted({to_ticks(k * PADA) for k in range(108)})
    kp_ticks = sorted({to_ticks(s) for s in SUBSUB_STARTS} | {to_ticks(s) for s in NUMBERED})
    rows = {"nakshatra": [], "kp": []}
    for t in nak_ticks:
        row = [t]
        for x in points(t):
            row += list(nakshatra_pada(F(x)))
        rows["nakshatra"].append(row)
    for t in kp_ticks:
        row = [t]
        for x in points(t):
            row += list(kp(F(x)))
        rows["kp"].append(row)
    vargas = {}
    for name in list(DIVISIONS) + ["D2cyclic", "D3cyclic"]:
        vargas[name] = [[t] + [varga_sign(name, F(x)) - 1 for x in points(t)] for t in boundary_ticks(name)]
    return {
        "generator": "docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py",
        "ticksPerDegree": TICKS,
        "points": "x0 = T/7560 (nearest double); x- = x0 - 1e-9 and x+ = x0 + 1e-9 (IEEE); each normalised into [0, 360)",
        "lordOrder": LORD_ORDER,
        "nakshatraColumns": ["T", "index-", "pada-", "index0", "pada0", "index+", "pada+"],
        "kpColumns": ["T", "sub-", "subSubLord-", "sub0", "subSubLord0", "sub+", "subSubLord+"],
        "vargaColumns": ["T", "signIndex-", "signIndex0", "signIndex+"],
        "nakshatra": rows["nakshatra"],
        "kp": rows["kp"],
        "varga": vargas,
    }


def main():
    parser = argparse.ArgumentParser()
    root = Path(__file__).resolve().parents[4]
    parser.add_argument("--output", default=str(root / "src/vedic/fixtures/boundaries.json"))
    args = parser.parse_args()
    data = build()
    text = json.dumps(data, separators=(",", ":")) + "\n"
    Path(args.output).write_text(text)
    boundaries = len(data["nakshatra"]) + len(data["kp"]) + sum(len(v) for v in data["varga"].values())
    print(json.dumps({
        "output": args.output,
        "sha256": hashlib.sha256(text.encode()).hexdigest(),
        "boundaries": {"nakshatra+pada": len(data["nakshatra"]), "kp": len(data["kp"]),
                       **{k: len(v) for k, v in data["varga"].items()}},
        "totalBoundaries": boundaries,
        "totalPoints": 3 * boundaries,
    }, indent=1))


if __name__ == "__main__":
    main()
