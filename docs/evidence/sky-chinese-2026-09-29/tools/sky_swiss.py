#!/usr/bin/env python3
"""S2 (PREREGISTRATION.md): the engine's rise, set and transits against Swiss
Ephemeris rise_trans, used as an instrument. Only statistics leave memory.

Usage: python3 sky_swiss.py ENGINE.jsonl EPHE_PATH OUT.json

For each line of sky-engine.mjs's output, Swiss's next event of each kind from
the start of the UTC day (the engine's UT1 for it, with Delta T fixed at the
engine's) is paired with the engine's first event of that kind in the day.
Flags: default convention: rise_trans_true_hor with BIT_NO_REFRACTION and a
horizon of -34', upper limb for the Sun and Moon, BIT_DISC_CENTER for the
planets; centre-no-refraction: BIT_DISC_CENTER | BIT_NO_REFRACTION, horizon 0.
"""
import json
import sys

import swisseph as swe

ENGINE, EPHE, OUT = sys.argv[1:4]
swe.set_ephe_path(EPHE)
BODY = {"Sun": swe.SUN, "Moon": swe.MOON, "Mercury": swe.MERCURY, "Venus": swe.VENUS, "Mars": swe.MARS,
        "Jupiter": swe.JUPITER, "Saturn": swe.SATURN, "Uranus": swe.URANUS, "Neptune": swe.NEPTUNE, "Pluto": swe.PLUTO}
KINDS = {"rise": swe.CALC_RISE, "set": swe.CALC_SET, "upper-transit": swe.CALC_MTRANSIT, "lower-transit": swe.CALC_ITRANSIT}
DAY_S = 86400.0

rows = []
for text in open(ENGINE):
    line = json.loads(text)
    start_s = __import__("calendar").timegm(tuple(int(v) for v in line["date"].split("-")) + (0, 0, 0))
    ut1_jd = 2440587.5 + (start_s + line["dut1"]) / DAY_S
    swe.set_delta_t_userdef(line["deltaT"] / DAY_S)
    geopos = (float(line["lon"]), float(line["lat"]), 0.0)
    disc = line["body"] in ("Sun", "Moon")
    if line["convention"] == "default":
        bits, horizon = (0 if disc else swe.BIT_DISC_CENTER) | swe.BIT_NO_REFRACTION, -34.0 / 60.0
    else:
        bits, horizon = swe.BIT_DISC_CENTER | swe.BIT_NO_REFRACTION, 0.0
    for kind, flag in KINDS.items():
        engine = [ms / 1000.0 for k, ms in line["events"] if k == kind]
        first = engine[0] if engine else None
        try:
            if kind in ("rise", "set"):
                code, tret = swe.rise_trans_true_hor(ut1_jd, BODY[line["body"]], flag | bits, geopos, 0.0, 0.0, horizon, swe.FLG_SWIEPH)
            else:
                code, tret = swe.rise_trans(ut1_jd, BODY[line["body"]], flag, geopos, 0.0, 0.0, swe.FLG_SWIEPH)
        except swe.Error as error:
            code, tret = -99, (0.0,)
        swiss = None
        if code == 0:
            swiss = (tret[0] - 2440587.5) * DAY_S - line["dut1"]
            if swiss >= start_s + DAY_S:
                swiss = None
        edge = lambda t: t is not None and (t - start_s < 60 or start_s + DAY_S - t < 60)
        if first is not None and swiss is not None and abs(first - swiss) <= 1800:
            rows.append({"convention": line["convention"], "body": line["body"], "lat": line["lat"], "kind": kind, "delta": first - swiss})
        elif first is None and swiss is None:
            continue
        elif edge(first) or edge(swiss):
            rows.append({"convention": line["convention"], "body": line["body"], "lat": line["lat"], "kind": kind, "edge": True, "code": code})
        else:
            rows.append({"convention": line["convention"], "body": line["body"], "lat": line["lat"], "kind": kind, "unpaired": True,
                         "engine": first is not None, "swiss": swiss is not None, "code": code})
swe.set_delta_t_userdef(swe.DELTAT_AUTOMATIC)


def stats(values, tolerance):
    values = sorted(abs(v) for v in values)
    n = len(values)
    if not n:
        return {"count": 0}
    return {"count": n, "median": values[(n - 1) // 2], "p95": values[max(0, -(-95 * n // 100) - 1)], "max": values[-1],
            "over": sum(v > tolerance for v in values)}


summary = {}
for convention in sorted({r["convention"] for r in rows}):
    part = [r for r in rows if r["convention"] == convention]
    by_body = {}
    for body in BODY:
        sub = [r for r in part if r["body"] == body]
        if sub:
            by_body[body] = dict(stats([r["delta"] for r in sub if "delta" in r], 5.0),
                                 unpaired=sum(1 for r in sub if r.get("unpaired")), edge=sum(1 for r in sub if r.get("edge")))
    by_latitude = {}
    for lat in sorted({abs(r["lat"]) for r in part}):
        sub = [r for r in part if abs(r["lat"]) == lat]
        by_latitude[str(lat)] = dict(stats([r["delta"] for r in sub if "delta" in r], 5.0), unpaired=sum(1 for r in sub if r.get("unpaired")))
    summary[convention] = {
        "all": dict(stats([r["delta"] for r in part if "delta" in r], 5.0), unpaired=sum(1 for r in part if r.get("unpaired")),
                    edge=sum(1 for r in part if r.get("edge"))),
        "byBody": by_body,
        "byAbsLatitude": by_latitude,
        "unpairedCodes": sorted({(r["body"], r["kind"], r["code"], r["engine"], r["swiss"]) for r in part if r.get("unpaired")})[:40],
    }
json.dump({"instrument": f"pyswisseph {swe.version}", "tolerance_s": 5.0, "summary": summary}, open(OUT, "w"), indent=1)
print(json.dumps({c: s["all"] for c, s in summary.items()}, indent=1))
