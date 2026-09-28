#!/usr/bin/env python3
"""Fetch the Horizons responses PREREGISTRATION.md names.

Each response is kept verbatim in ../horizons/ and its exact URL, byte count,
SHA-256 and fetch time are appended to ../horizons/requests.jsonl. A file that
exists is never fetched again or edited, so running this twice changes
nothing. Requests are made one at a time.

Horizons answered at most 80 entries of a time list and dropped the rest
without a message, so each list's missing entries are asked for again, and
kept as NAME.2.txt beside NAME.txt (RESULTS.md, Deviations).

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
    ('topo1', ['10', '301', '4'], ['NONE', 'LT+S']),
    ('topo2', ['10', '301', '4'], ['NONE', 'LT+S']),
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
