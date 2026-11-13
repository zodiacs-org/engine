import json, sys, collections
import numpy as np
import os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import reference as ref

BOUNDS = {"Sun": (3, 0.18), "Moon": (8.3, 1.1), "Mercury": (9.3, 2.2), "Venus": (11, 0.64), "Mars": (6.6, 0.45),
          "Jupiter": (13, 0.061), "Saturn": (18, 0.03), "Uranus": (20, 0.02), "Neptune": (21, 0.013),
          "Pluto": (25, 0.014), "North Node": (16, None)}
recs = [json.loads(l) for l in open(sys.argv[1])]
tt = np.array([r["tt"] for r in recs]); ut1 = np.array([r["ut1"] for r in recs])
sets = np.array([r["set"] for r in recs]); utc = [r["utc"] for r in recs]
years = np.array([int(u[:4]) for u in utc])
eng = collections.defaultdict(dict)
for i, r in enumerate(recs):
    for b, lon, lat, sp in r["bodies"]:
        eng[b][i] = (lon, lat, sp)


def wrap(x):
    return (x + 540.0) % 360.0 - 180.0


def stats(a):
    a = np.abs(np.asarray(a))
    return dict(n=int(a.size), median=float(np.median(a)), p95=float(np.percentile(a, 95)), max=float(a.max()))


out = {"positions": {}, "outliers": {}, "bysetmax": {}}
for b in ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]:
    idx = np.array(sorted(eng[b]))
    e = np.array([eng[b][i] for i in idx])
    lon, lat, _ = ref.apparent_lonlat(b, tt[idx])
    sp = ref.apparent_speed(b, tt[idx])
    lon0, lat0, _ = ref.apparent_lonlat(b, tt[idx], deflect=False)
    sp0 = ref.apparent_speed(b, tt[idx], deflect=False)
    sun = np.array([eng["Sun"][i] for i in idx])
    cosE = (np.sin(np.radians(e_lat := np.array([eng[b][i][1] for i in idx]))) * np.sin(np.radians(sun[:, 1]))
            + np.cos(np.radians(e_lat)) * np.cos(np.radians(sun[:, 1])) * np.cos(np.radians(np.array([eng[b][i][0] for i in idx]) - sun[:, 0])))
    elong = np.degrees(np.arccos(np.clip(cosE, -1, 1)))
    dl = wrap(e[:, 0] - lon) * 3600
    db = (e[:, 1] - lat) * 3600
    ang = np.hypot(dl * np.cos(np.radians(lat)), db)
    ds = (e[:, 2] - sp) * 3600
    dl0 = wrap(e[:, 0] - lon0) * 3600
    db0 = (e[:, 1] - lat0) * 3600
    ang0 = np.hypot(dl0 * np.cos(np.radians(lat0)), db0)
    ds0 = (e[:, 2] - sp0) * 3600
    vis = elong >= 0.5 if b != "Sun" else np.ones_like(elong, bool)
    bpos, bsp = BOUNDS[b]
    out.setdefault("nodefl", {})[b] = dict(lon=stats(dl0), angle=stats(ang0), speed=stats(ds0),
        over_bound=int((ang0 > bpos).sum()), speed_over_bound=int((np.abs(ds0) > bsp).sum()) if bsp else None)
    out.setdefault("visible", {})[b] = dict(n=int(vis.sum()), excluded=int((~vis).sum()), lon=stats(dl[vis]), angle=stats(ang[vis]),
        speed=stats(ds[vis]), over_bound=int((ang[vis] > bpos).sum()), speed_over_bound=int((np.abs(ds[vis]) > bsp).sum()) if bsp else None,
        excluded_utc=[utc[idx[j]] for j in np.where(~vis)[0]][:5])
    near = elong < 10
    out.setdefault("near_sun", {})[b] = dict(n=int(near.sum()), speed_over=int((np.abs(ds[near]) > bsp).sum()) if bsp else None,
        speed_over_far=int((np.abs(ds[~near]) > bsp).sum()) if bsp else None, speed_max_far=float(np.abs(ds[~near]).max()) if (~near).any() else None,
        speed0_over_far=int((np.abs(ds0[~near]) > bsp).sum()) if bsp else None, speed0_max_far=float(np.abs(ds0[~near]).max()) if (~near).any() else None)
    out["positions"][b] = dict(lon=stats(dl), lat=stats(db), angle=stats(ang), speed=stats(ds),
                               mean_dlon=float(dl.mean()), over_bound=int((ang > bpos).sum()),
                               speed_over_bound=int((np.abs(ds) > bsp).sum()) if bsp else None,
                               bound=bpos, speed_bound=bsp)
    for s in ("A", "B", "E"):
        m = sets[idx] == s
        if m.any():
            out["bysetmax"].setdefault(b, {})[s] = dict(n=int(m.sum()), lon_max=float(np.abs(dl[m]).max()),
                                                        lon_med=float(np.median(np.abs(dl[m]))), ang_max=float(ang[m].max()))
    # by era
    era = {}
    for lo, hi in ((1900, 1949), (1950, 1999), (2000, 2019), (2020, 2031), (2032, 2050)):
        m = (years[idx] >= lo) & (years[idx] <= hi)
        if m.any():
            era[f"{lo}-{hi}"] = dict(n=int(m.sum()), lon_max=float(np.abs(dl[m]).max()), ang_max=float(ang[m].max()))
    out["positions"][b]["era"] = era
    k = np.argsort(-ang)[:5]
    out["outliers"][b] = [dict(utc=utc[idx[j]], dlon=float(dl[j]), dlat=float(db[j]), angle=float(ang[j]),
                               dspeed=float(ds[j]), elong=float(elong[j]), angle_nodefl=float(ang0[j])) for j in k]
    ks = np.argsort(-np.abs(ds))[:3]
    out["outliers"][b + ":speed"] = [dict(utc=utc[idx[j]], dspeed=float(ds[j]), dspeed_nodefl=float(ds0[j]), elong=float(elong[j]), engine_speed=float(e[j, 2])) for j in ks]

# true node
idx = np.array(sorted(eng["North Node"]))
e = np.array([eng["North Node"][i] for i in idx])
tn = ref.true_node(tt[idx])
dn = wrap(e[:, 0] - tn) * 3600
out["positions"]["North Node (true)"] = dict(lon=stats(dn), mean_dlon=float(dn.mean()), over_bound=int((np.abs(dn) > 16).sum()), bound=16)
k = np.argsort(-np.abs(dn))[:5]
out["outliers"]["North Node"] = [dict(utc=utc[idx[j]], dlon=float(dn[j])) for j in k]
idxs = np.array(sorted(eng["South Node"]))
es = np.array([eng["South Node"][i] for i in idxs])
out["positions"]["South Node consistency"] = float(np.abs(wrap(es[:, 0] - e[:, 0] - 180)).max() * 3600)

# houses / angles / points
H = collections.defaultdict(list)
A = collections.defaultdict(list)
pts = collections.defaultdict(list)
houtl = []
nh = 0
for i, r in enumerate(recs):
    if "houses" not in r:
        continue
    g, eps = ref.gast_and_eps(np.array([r["ut1"]]), np.array([r["tt"]]))
    g = float(np.degrees(g[0])); eps = float(eps[0])
    node, lil, lilb = ref.mean_points(np.array([r["tt"]]))
    for row in r["houses"]:
        armc = (g + row["lon"]) % 360
        asc, mc, vx, ep = angles_ref(armc, row["lat"], eps) if False else ref.angles_ref(armc, row["lat"], eps)
        A["asc"].append(wrap(row["angles"]["asc"] - asc) * 3600)
        A["mc"].append(wrap(row["angles"]["mc"] - mc) * 3600)
        p = row["points"]
        pts["Vertex"].append(wrap(p["Vertex"][0] - vx) * 3600)
        pts["East Point"].append(wrap(p["East Point"][0] - ep) * 3600)
        pts["Mean Node"].append(wrap(p["Mean Node"][0] - node[0]) * 3600)
        pts["Black Moon Lilith"].append(wrap(p["Black Moon Lilith"][0] - lil[0]) * 3600)
        pts["Black Moon Lilith lat"].append((p["Black Moon Lilith"][1] - lilb[0]) * 3600)
        for hs, v in row["sys"].items():
            if v["cusps"] is None:
                continue
            if v["system"] != hs:
                H[hs + " (fallback:" + str(v["system"]) + ")"].append(0.0)
                continue
            rc = ref.houses_ref(armc, row["lat"], eps, hs)
            d = [abs(wrap(a - float(b))) * 3600 for a, b in zip(v["cusps"], rc)]
            H[hs].append(max(d))
            nh += 1
            if max(d) > 1.0:
                houtl.append(dict(utc=r["utc"], lat=row["lat"], lon=row["lon"], system=hs, maxcusp=max(d),
                                  which=int(np.argmax(d)) + 1))
out["angles"] = {k: stats(v) for k, v in A.items()}
out["points"] = {k: stats(v) for k, v in pts.items()}
out["houses"] = {k: stats(v) for k, v in H.items()}
out["houses_outliers"] = sorted(houtl, key=lambda x: -x["maxcusp"])[:20]
out["houses_outlier_count"] = len(houtl)
out["n_house_charts"] = nh
out["n_instants"] = len(recs)
out["sets"] = {s: int((sets == s).sum()) for s in ("A", "B", "E")}
json.dump(out, open(sys.argv[2], "w"), indent=1)
P = out["positions"]
print(f"{'body':20s} {'n':>5s} {'lon med':>8s} {'lon p95':>8s} {'lon max':>8s} {'lat max':>8s} {'ang max':>8s} {'>bound':>6s} {'spd max':>8s} {'spd>b':>5s}")
for b, v in P.items():
    if not isinstance(v, dict):
        print(b, v); continue
    print(f"{b:20s} {v['lon']['n']:5d} {v['lon']['median']:8.3f} {v['lon']['p95']:8.3f} {v['lon']['max']:8.3f} "
          f"{v.get('lat', {}).get('max', float('nan')):8.3f} {v.get('angle', {}).get('max', float('nan')):8.3f} {v['over_bound']:6d} "
          f"{v.get('speed', {}).get('max', float('nan')):8.4f} {str(v.get('speed_over_bound')):>5s}")
for k in ("visible", "nodefl", "near_sun"):
    print("==", k)
    for b, v in out[k].items():
        print(" ", b, json.dumps({kk: (vv if not isinstance(vv, dict) else {x: round(y, 3) for x, y in vv.items()}) for kk, vv in v.items()}))
print("angles", json.dumps(out["angles"]))
print("points", json.dumps(out["points"]))
for k, v in out["houses"].items():
    print(f"  {k:28s} n={v['n']:4d} max={v['max']:.5f}\" p95={v['p95']:.5f}")
print("house outliers >1\":", out["houses_outlier_count"], json.dumps(out["houses_outliers"][:6]))
