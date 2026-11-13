import json, sys, collections
import numpy as np
import os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import reference as ref

J0 = 2415020.5 - ref.J2000  # 1900-01-01 00:00 TT, days from J2000
N = 55153 + 1
grid = J0 + np.arange(N, dtype=float)
BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]
H = 0.01


def wrap(x):
    return (x + 540.0) % 360.0 - 180.0


def lon(b, t):
    return ref.apparent_lonlat(b, t)[0]


def spd(b, t):
    return ref.apparent_speed(b, t, h=H)


def refine(f, a, b, iters=46):
    a = a.copy(); b = b.copy()
    fa = f(a)
    for _ in range(iters):
        m = 0.5 * (a + b)
        fm = f(m)
        same = np.sign(fm) == np.sign(fa)
        a = np.where(same, m, a); fa = np.where(same, fm, fa)
        b = np.where(same, b, m)
    return 0.5 * (a + b)


L = {b: lon(b, grid) for b in BODIES}
print("grid done", flush=True)
ref_events = collections.defaultdict(list)  # key -> array of tt
# ingresses
for b in BODIES:
    for k in range(12):
        g = wrap(L[b] - 30 * k)
        i = np.where((np.sign(g[:-1]) != np.sign(g[1:])) & (np.abs(g[:-1] - g[1:]) < 90))[0]
        if i.size:
            tk = np.full(i.size, 30.0 * k)
            r = refine(lambda t: wrap(lon(b, t) - tk), grid[i], grid[i + 1])
            ref_events[("ingress", b, 30 * k)] = r
print("ingress done", flush=True)
# stations
for b in ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]:
    s = spd(b, grid)
    i = np.where(np.sign(s[:-1]) != np.sign(s[1:]))[0]
    typ = np.where(s[i] > 0, "R", "D")
    r = refine(lambda t: spd(b, t), grid[i], grid[i + 1])
    for T in ("R", "D"):
        ref_events[("station", b, T)] = r[typ == T]
print("stations done", flush=True)


def aspects(a, b, targets, y0, y1, kind):
    m0 = (2415020.5 + 365.25 * (y0 - 1900) - 2) - ref.J2000
    m1 = (2415020.5 + 365.25 * (y1 + 1 - 1900) + 2) - ref.J2000
    for tg in targets:
        g = wrap(L[a] - L[b] - tg)
        i = np.where((np.sign(g[:-1]) != np.sign(g[1:])) & (np.abs(g[:-1] - g[1:]) < 90) & (grid[:-1] >= m0) & (grid[:-1] <= m1))[0]
        if i.size:
            r = refine(lambda t: wrap(lon(a, t) - lon(b, t) - tg), grid[i], grid[i + 1])
            ref_events[(kind, a + "-" + b, tg)] = r


aspects("Moon", "Sun", [0, 180], 1900, 2050, "lunation")
aspects("Moon", "Sun", [90, 270], 2020, 2031, "quarter")
MAJ = [0, 60, 90, 120, 180, 240, 270, 300]
PL = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]
for i in range(len(PL)):
    for j in range(i + 1, len(PL)):
        slow = i >= 4
        aspects(PL[i], PL[j], MAJ, 1900 if slow else 2020, 2050 if slow else 2031, "aspect-slow" if slow else "aspect")
print("aspects done", flush=True)

# engine events
eng = collections.defaultdict(list)
extra = collections.defaultdict(list)
for l in open(sys.argv[1]):
    e = json.loads(l)
    k = e["kind"]
    if k == "ingress":
        eng[("ingress", e["body"], e["target"])].append(e)
    elif k == "station":
        eng[("station", e["body"], e["type"])].append(e)
    elif k in ("lunation", "quarter", "aspect", "aspect-slow"):
        eng[(k, e["a"] + "-" + e["b"], e["target"])].append(e)
    else:
        extra[k].append(e)


def year_of_tt(t):
    return 2000 + (t + 0.5) / 365.25


MOON_YEARS = set(range(2020, 2032)) | set(range(1900, 2051, 10))
WIN = {"ingress": 3.0, "station": 20.0, "lunation": 0.5, "quarter": 0.5, "aspect": 5.0, "aspect-slow": 20.0}
cat = collections.defaultdict(list)  # category -> list of (dt_s, record)
unmatched = collections.defaultdict(lambda: [0, 0])
unm_examples = collections.defaultdict(list)
for key in set(ref_events) | set(eng):
    kind, who, tg = key
    R = np.sort(np.asarray(ref_events.get(key, []), float))
    Ev = sorted(eng.get(key, []), key=lambda e: e["tt"])
    if kind == "ingress" and who == "Moon":
        yrs = np.floor(year_of_tt(R)).astype(int)
        R = R[np.isin(yrs, list(MOON_YEARS))]
    lo, hi = J0 + 0.01, J0 + 55152 - 0.01
    if kind in ("aspect", "quarter"):
        lo, hi = (2458849.5 - ref.J2000) + 0.01, (2463232.5 - ref.J2000) - 0.01  # 2020-01-01 .. 2032-01-01
    R = R[(R > lo) & (R < hi)]
    Et = np.array([e["tt"] for e in Ev]) if Ev else np.zeros(0)
    keepE = (Et > lo) & (Et < hi)
    if kind == "ingress" and who == "Moon":
        keepE &= np.isin(np.floor(year_of_tt(Et)).astype(int), list(MOON_YEARS))
    Ev = [e for e, k2 in zip(Ev, keepE) if k2]
    Et = Et[keepE]
    used = np.zeros(Et.size, bool)
    w = WIN[kind]
    category = kind + ":" + (who if kind != "aspect" else "planet pairs 2020-2031") if kind not in ("aspect",) else "aspect:planet pairs 2020-2031"
    if kind == "aspect-slow":
        category = "aspect-slow:" + who
    for r in R:
        if Et.size == 0:
            unmatched[category][0] += 1; unm_examples[category].append(("ref-only", float(r))); continue
        j = int(np.argmin(np.abs(Et - r) + used * 1e9))
        if abs(Et[j] - r) <= w and not used[j]:
            used[j] = True
            cat[category].append(((Et[j] - r) * 86400.0, Ev[j], float(r)))
        else:
            unmatched[category][0] += 1; unm_examples[category].append(("ref-only", float(r)))
    for j in np.where(~used)[0]:
        unmatched[category][1] += 1; unm_examples[category].append(("engine-only", float(Et[j])))


def iso(t):
    jd = t + ref.J2000
    y, m, d, f = __import__("erfa").jd2cal(2451545.0, t)
    hh = f * 24
    return f"{int(y):04d}-{int(m):02d}-{int(d):02d}T{int(hh):02d}:{int((hh % 1) * 60):02d} TT"


res = {}
for c, lst in sorted(cat.items()):
    dt = np.array([x[0] for x in lst])
    a = np.abs(dt)
    j = int(np.argmax(a))
    res[c] = dict(n=int(a.size), median=float(np.median(a)), p95=float(np.percentile(a, 95)), max=float(a.max()),
                  mean=float(dt.mean()), worst_tt=iso(lst[j][2]), worst_dt=float(dt[j]),
                  over1s=int((a > 1).sum()), over60s=int((a > 60).sum()),
                  unmatched_ref_only=unmatched[c][0], unmatched_engine_only=unmatched[c][1])
for c in unmatched:
    if c not in res:
        res[c] = dict(n=0, unmatched_ref_only=unmatched[c][0], unmatched_engine_only=unmatched[c][1])
# Sun ingresses by era, with 2026 to 2030 on its own
sun = cat.get("ingress:Sun", [])
by = {}
for lo_y, hi_y in ((1900, 1949), (1950, 1999), (2000, 2025), (2026, 2030), (2031, 2050)):
    sel = [abs(x[0]) for x in sun if lo_y <= year_of_tt(x[2]) < hi_y + 1]
    if sel:
        by[f"{lo_y}-{hi_y}"] = dict(n=len(sel), median=float(np.median(sel)), max=float(max(sel)))
res["_sun_by_era"] = by
# Sun extras: step 0.25 and solar return vs the main ingress solver
ingS = {(e["target"], round(e["tt"])): e["tt"] for e in eng[("ingress", "Sun", 0)] + eng[("ingress", "Sun", 90)] + eng[("ingress", "Sun", 180)] + eng[("ingress", "Sun", 270)]}
mx = 0.0
for k, lst in extra.items():
    pass
s025 = extra.get("ingress-step0.25", [])
allSun = {}
for k in range(12):
    for e in eng[("ingress", "Sun", 30 * k)]:
        allSun[(30 * k, int(round(e["tt"])))] = e["tt"]
d1 = [abs(e["tt"] - allSun.get((e["target"], int(round(e["tt"]))), np.nan)) * 86400 for e in s025]
d2 = [abs(e["tt"] - allSun.get((e["target"], int(round(e["tt"]))), np.nan)) * 86400 for e in extra.get("solar-return", [])]
res["_solver_consistency"] = dict(step025_vs_step5_max_s=float(np.nanmax(d1)) if d1 else None, n_step025=len(d1),
                                  solarReturn_vs_crossing_max_s=float(np.nanmax(d2)) if d2 else None, n_solarReturn=len(d2))
# moonIngresses (techniques) vs solver
mi = extra.get("moonIngresses-2026", [])
SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]
moonS = []
for k in range(12):
    moonS += [(30 * k, e["tt"]) for e in eng[("ingress", "Moon", 30 * k)]]
d3 = []
for e in mi:
    tg = 30 * SIGNS.index(e["sign"]) if e.get("sign") in SIGNS else None
    c = [abs(t - e["tt"]) for (k, t) in moonS if k == tg]
    if c:
        d3.append(min(c) * 86400)
res["_moonIngresses_vs_solver"] = dict(n=len(d3), max_s=float(max(d3)) if d3 else None)
# worst examples per category
res["_worst"] = {c: sorted([(round(x[0], 3), iso(x[2])) for x in lst], key=lambda z: -abs(z[0]))[:5] for c, lst in cat.items()}
res["_unmatched_examples"] = {c: [(s, iso(t)) for s, t in v[:6]] for c, v in unm_examples.items()}
json.dump(res, open(sys.argv[2], "w"), indent=1)
for c, v in res.items():
    if c.startswith("_"):
        continue
    if v["n"]:
        print(f"{c:34s} n={v['n']:5d} med={v['median']:9.2f}s p95={v['p95']:9.2f}s max={v['max']:10.2f}s mean={v['mean']:+9.2f} >1s={v['over1s']:5d} >60s={v['over60s']:5d} unm(ref/eng)={v['unmatched_ref_only']}/{v['unmatched_engine_only']} worst={v['worst_tt']}")
    else:
        print(c, v)
for k in ("_sun_by_era", "_solver_consistency", "_moonIngresses_vs_solver"):
    print(k, json.dumps(res[k]))
