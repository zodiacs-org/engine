"""Breaker rc.12, item 0 (B2): ask the JPL Horizons API for the airless apparent RA and Dec (quantity 2), the
range (20) and the Sun-observer-target angle (23) of a planet and of the Sun, geocentric (500@399), at the TT
instants of instants.json. One query per group and target, sequential; every response is saved as fetched.
Targets: Mercury 199, Venus 299, and the system barycentres 4 to 9 (as the engine's pack places Mars to
Pluto), the Sun 10.
  python3 -I horizons_fetch.py <instants.json> <dir for the responses> <out.json>"""
import json, sys, time, hashlib, os, urllib.parse, urllib.request
TARGET = {'Mercury': '199', 'Venus': '299', 'Mars': '4', 'Jupiter': '5', 'Saturn': '6', 'Uranus': '7', 'Neptune': '8', 'Pluto': '9', 'Sun': '10'}
groups = json.load(open(sys.argv[1])); raw = sys.argv[2]; os.makedirs(raw, exist_ok=True)
def fetch(target, jds, name):
    path = os.path.join(raw, name)
    if not os.path.exists(path):
        q = {'format': 'text', 'COMMAND': f"'{target}'", 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'OBSERVER'", 'CENTER': "'500@399'",
             'TLIST': "'" + ' '.join(f'{j:.7f}' for j in jds) + "'", 'TLIST_TYPE': "'JD'", 'TIME_TYPE': "'TT'", 'QUANTITIES': "'2,20,23'", 'ANG_FORMAT': "'DEG'",
             'EXTRA_PREC': "'YES'", 'CSV_FORMAT': "'YES'", 'CAL_FORMAT': "'JD'", 'APPARENT': "'AIRLESS'"}
        url = 'https://ssd.jpl.nasa.gov/api/horizons.api?' + urllib.parse.urlencode(q)
        for attempt in range(5):
            try:
                text = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'ephemeris-check'}), timeout=60).read().decode()
                if '$$SOE' in text: break
            except Exception as e: text = f'ERROR {e}'
            time.sleep(3 + 5 * attempt)
        else: raise SystemExit(f'{name}: no table\n{text[:600]}')
        open(path, 'w').write(text); time.sleep(0.4)
    text = open(path).read()
    rows = []
    for line in text[text.index('$$SOE') + 5:text.index('$$EOE')].strip().split('\n'):
        f = [s.strip() for s in line.split(',')]
        rows.append({'jdTt': float(f[0]), 'ra': float(f[3]), 'dec': float(f[4]), 'rangeAu': float(f[5]), 'sot': float(f[7]), 'sotFlag': f[8]})
    assert len(rows) == len(jds) and all(abs(r['jdTt'] - j) < 2e-7 for r, j in zip(rows, jds)), name
    return rows, hashlib.sha256(text.encode()).hexdigest()
out = []
for i, g in enumerate(groups):
    tag = f"{i:03d}-{g['set']}-{g['body']}-{g['jd'][len(g['jd']) // 2]:.3f}"
    p, hp = fetch(TARGET[g['body']], g['jd'], f'{tag}-planet.txt'); s, hs = fetch('10', g['jd'], f'{tag}-sun.txt')
    out.append({**g, 'tag': tag, 'planet': p, 'sun': s, 'sha256': {'planet': hp, 'sun': hs}})
    if i % 10 == 0: print(i, tag, flush=True)
json.dump(out, open(sys.argv[3], 'w'))
print('groups', len(out), 'responses', 2 * len(out))
