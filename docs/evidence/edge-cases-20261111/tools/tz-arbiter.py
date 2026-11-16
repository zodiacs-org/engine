#!/usr/bin/env python3
"""ZOD-97, T1 to T3: the IANA arbiter for ../results/local-time-rule.json.

    python3 tz-arbiter.py ZONEINFO_DIR TZDATA_TARBALL ENGINE_RESULTS.json OUT.json

ZONEINFO_DIR holds TZif files compiled by zic 2025c (built from tzcode2025c.tar.gz)
from tzdata2025c.tar.gz's africa, antarctica, asia, australasia, europe,
northamerica, southamerica, etcetera and backward. Neither tarball nor any
compiled file is committed; the tarball's SHA-256 is checked against
conformance/sources/l3/tzdata.json and recorded.

For each wall time it scans every second of UTC within 26 hours either side and
lists the instants whose local reading is that wall time. Two readings: a
repeated time, and the rule under test takes the earlier. None: a skipped time,
and the rule under test is the wall time less the offset in force just before
the jump. It uses none of the engine's code; it reads the engine's answers only
to compare.
"""
import hashlib, json, os, sys
from datetime import datetime, timedelta, timezone

zi, tarball, results_path, out_path = sys.argv[1:5]
os.environ['PYTHONTZPATH'] = zi
import zoneinfo
zoneinfo.reset_tzpath(to=[os.path.abspath(zi)])

here = os.path.dirname(os.path.abspath(__file__))
pinned = json.load(open(os.path.join(here, '..', '..', '..', '..', 'conformance', 'sources', 'l3', 'tzdata.json')))['tzdata']['sha256']
digest = hashlib.sha256(open(tarball, 'rb').read()).hexdigest()
if digest != pinned:
    raise SystemExit(f'{tarball}: sha256 {digest}, not the pinned {pinned}')

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
doc = json.load(open(results_path))
rows, bad = [], 0
for record in doc['records']:
    zone = zoneinfo.ZoneInfo(record['zone'])
    wall = datetime.fromisoformat(f"{record['date']}T{record['time']}:00").replace(tzinfo=timezone.utc)
    w = int((wall - EPOCH).total_seconds())
    readings, before = [], None
    for u in range(w - 26 * 3600, w + 26 * 3600 + 1):
        offset = int((EPOCH + timedelta(seconds=u)).astimezone(zone).utcoffset().total_seconds())
        if u + offset == w:
            readings.append((u, offset))
        if u + offset < w:
            before = (u, offset)
    if len(readings) == 2:
        kind, expected = 'fold', readings[0][0]
    elif len(readings) == 1:
        kind, expected = None, readings[0][0]
    elif not readings:
        kind, expected = 'gap', w - before[1]
    else:
        raise SystemExit(f"{record['id']}: {len(readings)} readings")
    iso = (EPOCH + timedelta(seconds=expected)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    engine = record.get('engine') or {}
    flags = [f for f in engine.get('flags', []) if f.startswith('dst-')]
    want = [] if kind is None else ['dst-' + kind]
    ok = engine.get('utc') == iso and flags == want
    bad += not ok
    rows.append({'id': record['id'], 'zone': record['zone'], 'wall': f"{record['date']}T{record['time']}", 'iana': {'kind': kind,
                 'readings': [{'utc': (EPOCH + timedelta(seconds=u)).strftime('%Y-%m-%dT%H:%M:%SZ'), 'offsetSeconds': o} for u, o in readings],
                 'offsetBeforeJumpSeconds': before[1] if kind == 'gap' else None, 'ruleUtc': iso},
                 'engine': {'utc': engine.get('utc'), 'flags': engine.get('flags'), 'zoneSource': engine.get('zoneSource'), 'tzdbVersion': engine.get('tzdbVersion')},
                 'verdict': 'pass' if ok else 'fail'})
    print(('pass ' if ok else 'FAIL ') + f"{record['id']:<14} {record['zone']} {record['date']} {record['time']} IANA {kind or 'single'} -> {iso}; engine {engine.get('utc')} {engine.get('flags')}")
out = {'what': 'IANA tzdb 2025c (main data, compiled by zic 2025c) against the engine, T1 to T3', 'tzdata': {'url': 'https://data.iana.org/time-zones/releases/tzdata2025c.tar.gz', 'sha256': digest},
       'tzcode': {'url': 'https://data.iana.org/time-zones/releases/tzcode2025c.tar.gz', 'sha256': sys.argv[5] if len(sys.argv) > 5 else None},
       'python': sys.version.split()[0], 'engineHostTz': doc.get('hostTz'), 'counts': {'pass': len(rows) - bad, 'fail': bad}, 'records': rows}
json.dump(out, open(out_path, 'w'), indent=1)
open(out_path, 'a').write('\n')
print(json.dumps(out['counts']))
sys.exit(1 if bad else 0)
