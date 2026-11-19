#!/usr/bin/env python3
"""Fetch JPL Horizons's apparent places (QUANTITIES 2 and 31: RA and Dec of date, ecliptic longitude and latitude
of date; airless, geocentric, TT, extra precision) of each planet and of the Sun at the instants passages.mjs
chose, and write them, with each response's SHA-256 and its query, to OUT.json.

    python3 horizons.py passages.json CACHE_DIR OUT.json

Mars to Pluto are their system barycentres (NAIF 4 to 9), Mercury and Venus 199 and 299, the Sun 10. Each query
is a TLIST of at most 40 instants, sent as the TT Julian dates passages.mjs wrote (six decimals). Responses are
kept in CACHE_DIR, one file per query, named by the SHA-256 of its URL, so a rerun reads them back; a response
without a table is fetched again. HORIZONS_ONLY=<body> fetches one body's queries into the cache and writes
nothing, so that several bodies can be fetched at once before the run that writes OUT.json. Uses curl and the standard library only.
"""
import hashlib, json, os, subprocess, sys, time, urllib.parse

NAIF = {'Sun': '10', 'Mercury': '199', 'Venus': '299', 'Mars': '4', 'Jupiter': '5', 'Saturn': '6', 'Uranus': '7',
        'Neptune': '8', 'Pluto': '9'}
API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
CHUNK = 40


def url_of(command, instants):
    p = {'format': 'text', 'COMMAND': f"'{command}'", 'CENTER': "'500@399'", 'MAKE_EPHEM': 'YES',
         'EPHEM_TYPE': 'OBSERVER', 'TIME_TYPE': 'TT', 'TLIST_TYPE': 'JD', 'TLIST': ' '.join(f"'{t:.6f}'" for t in instants),
         'QUANTITIES': "'2,31'", 'ANG_FORMAT': 'DEG', 'EXTRA_PREC': 'YES', 'CSV_FORMAT': 'YES', 'APPARENT': 'AIRLESS',
         'CAL_FORMAT': 'JD'}
    return API + '?' + urllib.parse.urlencode(p, quote_via=urllib.parse.quote)


def fetch(url, cache):
    path = os.path.join(cache, hashlib.sha256(url.encode()).hexdigest() + '.txt')
    if not (os.path.exists(path) and '$$SOE' in open(path).read()):
        for attempt in range(20):
            tmp = f'{path}.{os.getpid()}.tmp'
            r = subprocess.run(['curl', '-sS', '--max-time', '120', '-o', tmp, url], capture_output=True)
            if r.returncode == 0 and os.path.exists(tmp) and '$$SOE' in open(tmp).read():
                os.replace(tmp, path)
                break
            time.sleep(min(60, 5 * (attempt + 1)))
        else:
            raise SystemExit(f'Horizons gave no table for {url[:120]}')
        time.sleep(0.5)
    data = open(path, 'rb').read()
    return data.decode(), hashlib.sha256(data).hexdigest()


def rows_of(text):
    out = {}
    for line in text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines():
        f = [c.strip() for c in line.split(',')]
        out[round(float(f[0]), 6)] = {'ra': float(f[3]), 'dec': float(f[4]), 'lon': float(f[5]), 'lat': float(f[6])}
    return out


def banner(text, key):
    for line in text.splitlines():
        if line.startswith(key):
            return line.split(':', 1)[1].strip()
    return None


def main(passages_path, cache, out_path):
    os.makedirs(cache, exist_ok=True)
    doc = json.load(open(passages_path))
    wanted = {}
    for row in doc['rows']:
        wanted.setdefault(row['body'], set()).add(row['jdTt'])
        wanted.setdefault('Sun', set()).add(row['jdTt'])
    places, queries = {}, []
    only = os.environ.get('HORIZONS_ONLY')  # a body's name: fetch its queries into the cache and write nothing
    for body, instants in sorted(wanted.items()):
        if only and body != only:
            continue
        instants = sorted(instants)
        places[body] = {}
        share = os.environ.get('HORIZONS_SHARE')  # "k/n": with HORIZONS_ONLY, fetch every n-th query from the k-th
        for i in range(0, len(instants), CHUNK):
            if only and share and (i // CHUNK) % int(share.split('/')[1]) != int(share.split('/')[0]):
                continue
            part = instants[i:i + CHUNK]
            url = url_of(NAIF[body], part)
            text, digest = fetch(url, cache)
            got = rows_of(text)
            missing = [t for t in part if round(t, 6) not in got]
            if missing:
                raise SystemExit(f'{body}: Horizons gave no row for {missing[:3]}')
            for t in part:
                places[body][f'{t:.6f}'] = got[round(t, 6)]
            queries.append({'body': body, 'n': len(part), 'sha256': digest, 'url': url,
                            'target': banner(text, 'Target body name'), 'lightBend': banner(text, 'Rel. light bend'),
                            'eop': banner(text, 'EOP file'), 'fetched': banner(text, 'Ephemeris / API_USER')})
        print(body, len(instants), 'instants', file=sys.stderr)
    if only:
        return
    json.dump({'what': 'JPL Horizons apparent geocentric places (QUANTITIES 2 and 31, airless, TT, EXTRA_PREC) at the instants of passages.json',
               'queries': queries, 'places': places}, open(out_path, 'w'), indent=None, separators=(',', ':'))
    print(len(queries), 'queries', file=sys.stderr)


if __name__ == '__main__':
    main(*sys.argv[1:4])
