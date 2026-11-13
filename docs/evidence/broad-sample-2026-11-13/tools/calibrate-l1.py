import json, sys, numpy as np
import os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import reference as ref
d = json.load(open(os.path.join(HERE, "..", "..", "..", "..", "conformance", "vectors", "L1-positions.json")))
rows = []
for v in d["vectors"]:
    jd = v["input"]["jd_tt"]
    if not (2415020.5 <= jd <= 2469807.5):  # 1900..2050 inside DE421
        continue
    b = v["input"]["body"]
    lon, lat, _ = ref.apparent_lonlat(b, np.array([jd - ref.J2000]))
    dl = ((lon[0] - v["expected"]["lon"] + 540) % 360 - 180) * 3600
    db = (lat[0] - v["expected"]["lat"]) * 3600
    rows.append((b, jd, dl, db))
import collections
by = collections.defaultdict(list)
for r in rows: by[r[0]].append(r)
print("n", len(rows))
for b, rs in by.items():
    dl = np.array([r[2] for r in rs]); db = np.array([r[3] for r in rs])
    print(f"{b:8s} n={len(rs):2d} max|dlon|={abs(dl).max():.4f}\" max|dlat|={abs(db).max():.4f}\" mean dlon={dl.mean():+.4f}")
