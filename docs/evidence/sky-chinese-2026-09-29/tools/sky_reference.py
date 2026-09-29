#!/usr/bin/env python3
"""S1 (PREREGISTRATION.md): rise, set and transits from first principles with
skyfield and JPL DE440s, compared with the engine's events.

Usage: python sky_reference.py ENGINE.jsonl DE440S.bsp OUT.json

ENGINE.jsonl is sky-engine.mjs's output. For each line (a convention, site,
UTC day and body) the reference finds, independently of the engine:
  - rise and set: roots of alt(t) - h0(t), where alt is skyfield's geometric
    (unrefracted) topocentric apparent altitude of the body's centre for a
    WGS84 observer at height 0, and h0 = -R - S (R = 34' with refraction,
    S = asin(radius / topocentric distance) for an upper limb);
  - upper and lower transit: roots of the topocentric apparent hour angle
    against 0 h and 12 h.
It samples every 10 minutes from 60 minutes before the day to 60 minutes
after it, looks for a turn without a sign change within 0.5 degrees of the
threshold by golden-section search, and bisects every root to 1 ms. skyfield
runs on the engine's TT and UT1 for the instant: the line's UT1 - UTC and
Delta T, held through the day. Only the line's convention, site, day and body,
and its UT1 - UTC and Delta T, are read from the engine before the events are
found; the engine's events are read afterwards, to pair them.
"""
import gzip
import json
import sys
from collections import defaultdict

import numpy as np
from skyfield.api import load, wgs84
from skyfield.timelib import Timescale

ENGINE, KERNEL, OUT = sys.argv[1:4]
eph = load(KERNEL)
earth = eph["earth"]
TARGETS = {"Sun": "sun", "Moon": "moon", "Mercury": "mercury", "Venus": "venus", "Mars": "mars barycenter",
           "Jupiter": "jupiter barycenter", "Saturn": "saturn barycenter", "Uranus": "uranus barycenter",
           "Neptune": "neptune barycenter", "Pluto": "pluto barycenter"}
RADIUS_KM = {"Sun": 696000.0, "Moon": 1737.4}
AU_KM = 149597870.7
base = load.timescale(builtin=True)
DAY_S = 86400.0
TOL_S = 5.0

lines = [json.loads(line) for line in gzip.open(ENGINE, "rt")]
groups = defaultdict(list)
for index, line in enumerate(lines):
    groups[(line["lat"], line["lon"], line["body"])].append(index)


def state_fn(site, body, conventions, windows):
    """Functions of UTC epoch seconds for the lines in `windows` (arrays per sample)."""
    target = eph[TARGETS[body]]
    observer = earth + wgs84.latlon(site[0], site[1], elevation_m=0.0)

    def evaluate(seconds, window_index):
        dut1 = np.array([windows[i]["dut1"] for i in window_index])
        delta_t = np.array([windows[i]["deltaT"] for i in window_index])
        ut1 = seconds + dut1
        tt_jd = 2440587.5 + (ut1 + delta_t) / DAY_S
        # skyfield's UT1 is TT - Delta T: give it the engine's Delta T for each sample.
        table_tt, table_dt = tt_jd.copy(), delta_t.copy()
        order = np.argsort(table_tt)
        ts = Timescale(lambda tt: np.interp(tt, table_tt[order], table_dt[order]), base.leap_dates, base.leap_offsets)
        t = ts.tt_jd(tt_jd)
        apparent = observer.at(t).observe(target).apparent()
        alt, _, distance = apparent.altaz()
        ha, _, _ = apparent.hadec()
        radius = RADIUS_KM.get(body, 0.0)
        out = {}
        for name, refraction, limb in conventions:
            semi = np.degrees(np.arcsin(radius / (distance.au * AU_KM))) if limb == "upper" else 0.0
            out[name] = alt.degrees - (-(34.0 / 60.0 if refraction else 0.0) - semi)
        out["ha"] = ha.hours
        return out

    return evaluate


def roots(values_at, lo, hi, window_index, key, target, periodic):
    """Bisect to 1 ms the roots bracketed by (lo, hi) pairs, vectorized."""
    lo, hi = lo.copy(), hi.copy()

    def offset(v):
        if not periodic:
            return v - target
        return (v - target + 12.0) % 24.0 - 12.0

    flo = offset(values_at(lo, window_index)[key])
    while np.max(hi - lo) > 0.001:
        mid = (lo + hi) / 2
        fm = offset(values_at(mid, window_index)[key])
        same = np.sign(fm) == np.sign(flo)
        lo = np.where(same, mid, lo)
        flo = np.where(same, fm, flo)
        hi = np.where(same, hi, mid)
    return (lo + hi) / 2


def golden_extrema(values_at, lo, hi, window_index, key, maximize):
    """Golden-section search for the extremum of each bracket, to 0.5 s."""
    g = (np.sqrt(5) - 1) / 2
    sign = -1.0 if maximize else 1.0
    f = lambda x: sign * values_at(x, window_index)[key]
    a, b = lo.copy(), hi.copy()
    c, d = b - g * (b - a), a + g * (b - a)
    fc, fd = f(c), f(d)
    while np.max(b - a) > 0.5:
        left = fc < fd
        a, b = np.where(left, a, c), np.where(left, d, b)
        new_c = np.where(left, b - g * (b - a), d)
        new_d = np.where(left, c, a + g * (b - a))
        fc_new, fd_new = f(new_c), f(new_d)
        fc, fd = np.where(left, fc_new, fd), np.where(left, fc, fd_new)
        c, d = new_c, new_d
    return (a + b) / 2


results = []
for (lat, lon, body), indices in groups.items():
    windows = [lines[i] for i in indices]
    conventions = sorted({(w["convention"], w["convention"] == "default", "upper" if (w["convention"] == "default" and body in RADIUS_KM) else "centre") for w in windows})
    # One reference per UTC day of this site and body; conventions share the samples.
    days = sorted({w["date"] for w in windows})
    day_windows = []
    for day in days:
        w = next(x for x in windows if x["date"] == day)
        day_windows.append(w)
    evaluate = state_fn((lat, lon), body, conventions, day_windows)
    starts = np.array([np.datetime64(day + "T00:00:00", "s").astype(np.int64) for day in days], dtype=float)
    offsets = np.arange(-3600.0, DAY_S + 3600.0 + 1, 600.0)
    grid = starts[:, None] + offsets[None, :]
    widx = np.repeat(np.arange(len(days)), len(offsets))
    sampled = evaluate(grid.ravel(), widx)
    found = defaultdict(list)  # (day index, convention) -> [(kind, seconds)]
    for name, _, _ in conventions:
        f = sampled[name].reshape(grid.shape)
        # Sign changes.
        cells = np.argwhere(np.sign(f[:, :-1]) != np.sign(f[:, 1:]))
        if len(cells):
            lo = grid[cells[:, 0], cells[:, 1]]
            hi = grid[cells[:, 0], cells[:, 1] + 1]
            t = roots(evaluate, lo, hi, cells[:, 0], name, 0.0, False)
            rising = f[cells[:, 0], cells[:, 1] + 1] > f[cells[:, 0], cells[:, 1]]
            for (d_i, _), ti, up in zip(cells, t, rising):
                found[(d_i, name)].append(("rise" if up else "set", ti))
        # Turns within 0.5 degrees of the threshold without a sign change.
        mid = f[:, 1:-1]
        maxima = (mid > f[:, :-2]) & (mid >= f[:, 2:]) & (mid < 0) & (mid > -0.5)
        minima = (mid < f[:, :-2]) & (mid <= f[:, 2:]) & (mid > 0) & (mid < 0.5)
        for mask, maximize in ((maxima, True), (minima, False)):
            cells = np.argwhere(mask)
            if not len(cells):
                continue
            lo = grid[cells[:, 0], cells[:, 1]]
            hi = grid[cells[:, 0], cells[:, 1] + 2]
            ext = golden_extrema(evaluate, lo, hi, cells[:, 0], name, maximize)
            fe = evaluate(ext, cells[:, 0])[name]
            crossed = (fe > 0) if maximize else (fe < 0)
            for k in np.nonzero(crossed)[0]:
                d_i = cells[k, 0]
                first = roots(evaluate, lo[k:k + 1], ext[k:k + 1], cells[k:k + 1, 0], name, 0.0, False)[0]
                second = roots(evaluate, ext[k:k + 1], hi[k:k + 1], cells[k:k + 1, 0], name, 0.0, False)[0]
                found[(d_i, name)] += [("rise" if maximize else "set", first), ("set" if maximize else "rise", second)]
    # Transits: hour angle against 0 h and 12 h.
    ha = sampled["ha"].reshape(grid.shape)
    for target, kind in ((0.0, "upper-transit"), (12.0, "lower-transit")):
        off = (ha - target + 12.0) % 24.0 - 12.0
        cells = np.argwhere((np.sign(off[:, :-1]) != np.sign(off[:, 1:])) & (np.abs(off[:, :-1]) < 6) & (np.abs(off[:, 1:]) < 6))
        if len(cells):
            lo = grid[cells[:, 0], cells[:, 1]]
            hi = grid[cells[:, 0], cells[:, 1] + 1]
            t = roots(evaluate, lo, hi, cells[:, 0], "ha", target, True)
            for (d_i, _), ti in zip(cells, t):
                for name, _, _ in conventions:
                    found[(d_i, name)].append((kind, ti))
    for w in windows:
        d_i = days.index(w["date"])
        start = starts[d_i]
        reference = found[(d_i, w["convention"])]
        engine = [(kind, ms / 1000.0) for kind, ms in w["events"]]
        used = set()
        pairs, extra = [], []
        for kind, te in engine:
            best = None
            for j, (rk, tr) in enumerate(reference):
                if rk == kind and j not in used and abs(tr - te) <= 1800 and (best is None or abs(tr - te) < abs(reference[best][1] - te)):
                    best = j
            if best is None:
                extra.append((kind, te))
            else:
                used.add(best)
                pairs.append((kind, te, reference[best][1]))
        missing = [(rk, tr) for j, (rk, tr) in enumerate(reference) if j not in used and start + 60 <= tr <= start + DAY_S - 60]
        failing = []
        for k, te, tr in pairs:
            if abs(te - tr) > TOL_S:
                # The altitude rate at the event, arcminutes per minute (not gated).
                rate = None
                if k in ("rise", "set"):
                    name = w["convention"]
                    around = evaluate(np.array([tr - 30.0, tr + 30.0]), np.array([d_i, d_i]))[name]
                    rate = round(float(abs(around[1] - around[0]) * 60.0), 4)
                failing.append({"kind": k, "deltaSeconds": round(te - tr, 3), "rateArcminPerMinute": rate})
        results.append({"convention": w["convention"], "body": body, "lat": lat, "lon": lon, "date": w["date"],
                        "deltas": [te - tr for _, te, tr in pairs], "kinds": [k for k, _, _ in pairs],
                        "failing": failing, "extra": [k for k, _ in extra], "missing": [k for k, _ in missing]})
    print(f"{lat:>4} {lon:>5} {body:8} {len(results)}", flush=True)


def stats(values):
    values = sorted(abs(float(v)) for v in values)
    n = len(values)
    if not n:
        return {"count": 0}
    return {"count": n, "median": values[(n - 1) // 2], "p95": values[-(-95 * n // 100) - 1], "max": values[-1],
            "over": int(sum(v > TOL_S for v in values))}


summary = {}
for convention in sorted({r["convention"] for r in results}):
    part = [r for r in results if r["convention"] == convention]
    block = {"all": dict(stats([d for r in part for d in r["deltas"]]),
                         extra=sum(len(r["extra"]) for r in part), missing=sum(len(r["missing"]) for r in part))}
    block["byBody"] = {body: dict(stats([d for r in part if r["body"] == body for d in r["deltas"]]),
                                  extra=sum(len(r["extra"]) for r in part if r["body"] == body),
                                  missing=sum(len(r["missing"]) for r in part if r["body"] == body))
                       for body in TARGETS if any(r["body"] == body for r in part)}
    block["byAbsLatitude"] = {str(lat): stats([d for r in part if abs(r["lat"]) == lat for d in r["deltas"]])
                              for lat in sorted({abs(r["lat"]) for r in part})}
    block["byKind"] = {kind: stats([d for r in part for d, k in zip(r["deltas"], r["kinds"]) if k == kind])
                       for kind in ("rise", "set", "upper-transit", "lower-transit")}
    block["failing"] = [dict(f, body=r["body"], lat=r["lat"], lon=r["lon"], date=r["date"]) for r in part for f in r["failing"]]
    block["extra"] = [dict(kind=k, body=r["body"], lat=r["lat"], lon=r["lon"], date=r["date"]) for r in part for k in r["extra"]]
    block["missing"] = [dict(kind=k, body=r["body"], lat=r["lat"], lon=r["lon"], date=r["date"]) for r in part for k in r["missing"]]
    summary[convention] = block
json.dump({"reference": "skyfield 1.55, JPL DE440s (sha256 c1c7feea...), WGS84, IAU 2006/2000A; engine UT1 and Delta T",
           "tolerance_s": TOL_S, "summary": summary}, open(OUT, "w"), indent=1)
print(json.dumps({c: v["all"] for c, v in summary.items()}, indent=1))
