#!/usr/bin/env python3
"""Fetch the Horizons responses PREREGISTRATION.md names.

Each response is kept verbatim in ../horizons/ and its exact URL, byte count,
SHA-256 and fetch time are appended to ../horizons/requests.jsonl. A file that
exists is never fetched again or edited, so running this twice changes
nothing. Requests are made one at a time.

Horizons answered at most 80 entries of a time list and dropped the rest
without a message, so each list's missing entries are asked for again, and
kept as NAME.2.txt beside NAME.txt (RESULTS.md, Deviations).

The topocentric LT requests and the two barycentric Sun checks were added
after the comparison, at its review (RESULTS.md, Deviations 7 and 8).

    python3 docs/evidence/calc-api/tools/fetch_horizons.py
"""
import datetime
import hashlib
import json
import math
import os
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', 'horizons'))
API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
STEP = 0.0001


def instants():
    """The 32 corpus instants, TT Julian dates to 6 decimals (PREREGISTRATION.md)."""
    phi = (math.sqrt(5) - 1) / 2
    return [round(2378496.5 + 146097 * ((0.5 + k * phi) % 1.0), 6) for k in range(32)]


def tlist(with_steps):
    days = []
    for jd in instants():
        days += [round(jd - STEP, 6), jd, round(jd + STEP, 6)] if with_steps else [jd]
    return ' '.join(f'{jd:.6f}' for jd in days)


CENTERS = {
    'geo': {'CENTER': "'500@399'"},
    'helio': {'CENTER': "'500@10'"},
    'bary': {'CENTER': "'500@0'"},
    'topo1': {'CENTER': "'coord@399'", 'COORD_TYPE': "'GEODETIC'", 'SITE_COORD': "'10.0,45.0,0.0'"},
    'topo2': {'CENTER': "'coord@399'", 'COORD_TYPE': "'GEODETIC'", 'SITE_COORD': "'-60.0,-35.0,1.5'"},
}
PLANETS = ['199', '299', '4', '5', '6', '7', '8', '9']
PLAN = [
    ('geo', ['10', '301'] + PLANETS, ['NONE', 'LT', 'LT+S']),
    ('helio', ['301', '399'] + PLANETS, ['NONE', 'LT', 'LT+S']),
    ('bary', ['10', '301', '399'] + PLANETS, ['NONE', 'LT']),
    ('topo1', ['10', '301', '4'], ['NONE', 'LT+S', 'LT']),
    ('topo2', ['10', '301', '4'], ['NONE', 'LT+S', 'LT']),
]
# The barycentric Sun at the days of a daily scan of 1800 to 2200 (on JD x.5,
# requested as TT) where astronomy-engine's barycentre is furthest from the full
# Newtonian one (the 25 largest peaks, at least 60 days apart), where the Sun
# is closest to the barycentre (the 20 deepest minima) and where their
# velocities differ most (10 peaks); src/calc-bounds.test.ts repeats the scan.
BARY_CHECKS = [
    2379521.5, 2380231.5, 2380665.5, 2382670.5, 2384288.5, 2384303.5, 2386598.5, 2391308.5, 2394220.5, 2394652.5,
    2395360.5, 2397080.5, 2400628.5, 2402945.5, 2405362.5, 2411782.5, 2414643.5, 2416955.5, 2419516.5, 2425873.5,
    2433785.5, 2442479.5, 2444930.5, 2445641.5, 2446072.5, 2448006.5, 2449722.5, 2456619.5, 2458448.5, 2459628.5,
    2460064.5, 2460773.5, 2462529.5, 2470608.5, 2474770.5, 2477100.5, 2477103.5, 2484865.5, 2488802.5, 2490945.5,
    2499095.5, 2500432.5, 2501137.5, 2501569.5, 2507844.5, 2510344.5, 2511053.5, 2511486.5, 2512191.5, 2513366.5,
    2515126.5, 2515560.5, 2516270.5, 2521925.5, 2523811.5,
]


def requests():
    for center, targets, corrections in PLAN:
        for correction in corrections:
            for command in targets:
                geometric = correction == 'NONE'
                params = {
                    'format': 'text', 'COMMAND': f"'{command}'", 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'",
                    'EPHEM_TYPE': "'VECTORS'", **CENTERS[center], 'REF_SYSTEM': "'ICRF'", 'REF_PLANE': "'FRAME'",
                    'VEC_TABLE': "'2'" if geometric else "'1'", 'VEC_CORR': f"'{correction}'",
                    'OUT_UNITS': "'AU-D'", 'CSV_FORMAT': "'YES'", 'TLIST': f"'{tlist(not geometric)}'",
                    'TLIST_TYPE': "'JD'", 'TIME_TYPE': "'TT'",
                }
                yield f"{center}-{correction.replace('+', '')}-{command}.txt", params
    yield 'deltat.txt', {
        'format': 'text', 'COMMAND': "'10'", 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'OBSERVER'",
        'CENTER': "'500@399'", 'QUANTITIES': "'30'", 'CSV_FORMAT': "'YES'", 'EXTRA_PREC': "'YES'",
        'TLIST': f"'{tlist(False)}'", 'TLIST_TYPE': "'JD'", 'TIME_TYPE': "'TT'",
    }
    sun = {'format': 'text', 'COMMAND': "'10'", 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'VECTORS'",
           **CENTERS['bary'], 'REF_SYSTEM': "'ICRF'", 'REF_PLANE': "'FRAME'", 'VEC_TABLE': "'2'",
           'VEC_CORR': "'NONE'", 'OUT_UNITS': "'AU-D'", 'CSV_FORMAT': "'YES'", 'TLIST_TYPE': "'JD'"}
    # The review's instant, 2130-03-05T00:00 UT.
    yield 'bary-NONE-10-2130.txt', {**sun, 'TLIST': "'2499089.5'", 'TIME_TYPE': "'UT'"}
    yield 'bary-NONE-10-scan.txt', {**sun, 'TLIST': "'" + ' '.join(f'{jd:.1f}' for jd in BARY_CHECKS) + "'",
                                    'TIME_TYPE': "'TT'"}


def returned(path):
    """The TT Julian dates (6 decimals) of a VECTORS response's rows."""
    text = open(path, encoding='utf-8').read()
    return {round(float(line.split(',')[0]), 6)
            for line in text.split('$$SOE', 1)[1].split('$$EOE', 1)[0].strip().splitlines()}


def missing(name, params):
    """The time-list entries of a request that none of its parts returned."""
    asked = [round(float(x), 6) for x in params['TLIST'].strip("'").split()]
    got = set()
    for part in (name, name.replace('.txt', '.2.txt')):
        if os.path.exists(os.path.join(OUT, part)):
            got |= returned(os.path.join(OUT, part))
    return [jd for jd in asked if jd not in got]


def main():
    os.makedirs(OUT, exist_ok=True)
    plan = list(requests())
    for name, params in plan:
        fetch(name, params)
    for name, params in plan:
        if name == 'deltat.txt':
            continue
        rest = missing(name, params)
        if rest:
            fetch(name.replace('.txt', '.2.txt'), {**params, 'TLIST': "'" + ' '.join(f'{jd:.6f}' for jd in rest) + "'"})
            if missing(name, params):
                raise SystemExit(f'{name}: entries still missing')


def fetch(name, params):
    """Fetch one response unless it is already kept, and log it."""
    path = os.path.join(OUT, name)
    if os.path.exists(path):
        return
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=180) as response:
                body = response.read()
            break
        except OSError as error:
            print(name, 'attempt', attempt + 1, 'failed:', error)
            time.sleep(10)
    else:
        raise SystemExit(f'{name}: not fetched')
    text = body.decode('utf-8')
    if '$$SOE' not in text:
        raise SystemExit(f'{name}: no ephemeris in the response:\n{text[:2000]}')
    with open(path, 'wb') as f:
        f.write(body)
    with open(os.path.join(OUT, 'requests.jsonl'), 'a') as f:
        f.write(json.dumps({
            'file': name,
            'url': url,
            'bytes': len(body),
            'sha256': hashlib.sha256(body).hexdigest(),
            'fetched': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        }) + '\n')
    print(name, len(body), 'bytes')
    time.sleep(1)


if __name__ == '__main__':
    main()
