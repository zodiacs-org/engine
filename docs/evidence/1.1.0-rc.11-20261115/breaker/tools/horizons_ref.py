"""Breaker, B2: this review's reduction of de440.bsp (calc_check.py's) against JPL Horizons's apparent RA and Dec
at the four instants of results/horizons-near-sun.json, with erfa.ldsun's limiter, with the engine's limiter (1e-14)
and without the deflection. Says which treatment Horizons agrees with behind the Sun's disc.
  python horizons_ref.py de440.bsp horizons-near-sun.json out.json"""
import sys, json, math
rows = json.load(open(sys.argv[2])); out_path = sys.argv[3]
sys.argv = [sys.argv[0], sys.argv[1], '/dev/null', '/dev/null']
src = open(__file__.replace('horizons_ref.py', 'calc_check.py')).read().split("result = {}")[0].replace("sample = json.load(open(sys.argv[2]))", "sample = {}")
exec(src)
out = []
for r in rows:
    row = {'body': r['body'], 'jdTt': r['jdTt'], 'fromHorizonsArcsec': {}}
    for lim, name in (('erfa', "deflection with erfa.ldsun's limiter"), ('none', "deflection with the engine's limiter, 1e-14"), ('no-deflection', 'no deflection')):
        v, sep = apparent(r['body'], r['jdTt'], lim)
        ra, dec, _ = sph(frames(r['jdTt'])['equatorial-true-of-date'] @ v)
        row['fromHorizonsArcsec'][name] = round(angle(ra, dec, r['horizons']['ra'], r['horizons']['dec']), 4)
    row['packFromHorizonsArcsec'] = round(r['pack']['angleFromHorizonsArcsec'], 4)
    out.append(row); print(json.dumps(row))
json.dump(out, open(out_path, 'w'), indent=1)
