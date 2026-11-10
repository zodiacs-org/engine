"""Independent reference acquisition. No imports of the engine or its outputs."""
import argparse
import csv
import datetime
import hashlib
import json
import math
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
LIMIT = 1_000_000
FRAME = 'apparent geocentric IAU76/80 ecliptic-of-date, Horizons quantity 31'
TERMS = 'Public numerical ephemeris facts; credit NASA/JPL SSD Horizons; no separate license stated by API/manual or responses.'


def parameters(case, command):
    values = dict(COMMAND=command, CENTER='500@399', EPHEM_TYPE='OBSERVER',
                  START_TIME=case['start'], STOP_TIME=case['end'], STEP_SIZE='1 h',
                  QUANTITIES='31', TIME_TYPE='TT', CSV_FORMAT='YES', CAL_FORMAT='JD',
                  EXTRA_PREC='YES', OBJ_DATA='NO')
    return {'format': 'json', **{k: "'" + v + "'" for k, v in values.items()}}


def parse_response(raw):
    result = json.loads(raw)
    if result.get('error'):
        raise ValueError(result['error'])
    text = result['result']
    for required in ['GEOCENTRIC', 'DE441', 'Date_________JDTT', 'ObsEcLon']:
        if required not in text:
            raise ValueError('Missing required Horizons convention: ' + required)
    if text.count('$$SOE') != 1 or text.count('$$EOE') != 1:
        raise ValueError('Missing or duplicate ephemeris delimiters')
    rows = []
    for row in csv.reader(text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()):
        jd, lon = float(row[0]), float(row[3])
        if not math.isfinite(jd) or not 0 <= lon < 360:
            raise ValueError('Invalid longitude row')
        at = round((jd - 2440587.5) * 86400000)
        if rows and at - rows[-1][0] != 3600000:
            raise ValueError('Expected increasing hourly rows')
        rows.append([at, lon])
    if len(rows) < 3:
        raise ValueError('Too few rows')
    return rows


def arc(value):
    return (value + 180) % 360 - 180


def derive(case, tables):
    rows = tables[0]
    if len(tables) == 2:
        if [r[0] for r in rows] != [r[0] for r in tables[1]]:
            raise ValueError('Mismatched pair times')
        rows = [[a[0], (a[1] - b[1]) % 360] for a, b in zip(rows, tables[1])]
    if case['kind'] == 'station':
        # Secant speeds at cell midpoints, interpolated to their sign-changing zero.
        values = [[(a[0] + b[0]) / 2, arc(b[1] - a[1])]
                  for a, b in zip(rows, rows[1:])]
    else:
        values = [[t, arc(lon - case['targetDegrees'])] for t, lon in rows]
    roots = []
    for a, b in zip(values, values[1:]):
        if a[1] * b[1] < 0 and (case['kind'] == 'station' or abs(b[1] - a[1]) < 180):
            direction = 'direct' if b[1] > a[1] else 'retrograde'
            if direction == case['direction']:
                roots.append(round(a[0] - a[1] * (b[0] - a[0]) / (b[1] - a[1])))
    if len(roots) != 1:
        raise ValueError(f"{case['id']}: expected one reference root, got {len(roots)}")
    return roots[0]


def verify(fixture):
    if fixture['clock'] != 'tt' or fixture['source'] != 'NASA JPL Horizons DE441' or fixture['frame'] != FRAME or fixture['redistribution'] != TERMS:
        raise ValueError('Unexpected source, clock, frame or redistribution record')
    datetime.datetime.fromisoformat(fixture['retrievedAt'])
    cases = json.loads((ROOT / 'references/cases.json').read_text())
    if [e['case'] for e in fixture['events']] != cases:
        raise ValueError('Fixture cases differ from declared cases')
    for entry in fixture['events']:
        case = entry['case']
        commands = [case['command']] + ([case['otherCommand']] if 'otherCommand' in case else [])
        tables = []
        for response, command in zip(entry['responses'], commands, strict=True):
            raw = response['raw'].encode()
            if len(raw) > LIMIT or hashlib.sha256(raw).hexdigest() != response['sha256']:
                raise ValueError('Response digest or size mismatch')
            expected = parameters(case, command)
            if response['parameters'] != expected or response['url'] != API + '?' + urllib.parse.urlencode(expected):
                raise ValueError('Request provenance mismatch')
            rows = parse_response(raw)
            start = round(datetime.datetime.fromisoformat(case['start']).replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
            end = round(datetime.datetime.fromisoformat(case['end']).replace(tzinfo=datetime.timezone.utc).timestamp() * 1000)
            if rows[0][0] != start or rows[-1][0] != end:
                raise ValueError('Response does not cover requested TT labels')
            tables.append(rows)
        if derive(case, tables) != entry['atMs']:
            raise ValueError('Reference time does not reproduce')


def acquire():
    events = []
    for case in json.loads((ROOT / 'references/cases.json').read_text()):
        responses, tables = [], []
        commands = [case['command']] + ([case['otherCommand']] if 'otherCommand' in case else [])
        for command in commands:
            params = parameters(case, command)
            url = API + '?' + urllib.parse.urlencode(params)
            with urllib.request.urlopen(url, timeout=60) as response:
                raw = response.read(LIMIT + 1)
            if len(raw) > LIMIT:
                raise ValueError('Response exceeds size cap')
            tables.append(parse_response(raw))
            responses.append(dict(parameters=params, url=url, raw=raw.decode(),
                                  sha256=hashlib.sha256(raw).hexdigest()))
        events.append(dict(case=case, atMs=derive(case, tables), responses=responses))
        print(case['id'], events[-1]['atMs'])
    fixture = dict(source='NASA JPL Horizons DE441', clock='tt', frame=FRAME, redistribution=TERMS,
                   retrievedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), events=events)
    verify(fixture)
    output = json.dumps(fixture, indent=2) + '\n'
    if len(output.encode()) >= 2_000_000:
        raise ValueError('Fixture exceeds file cap')
    # Live acquisition never overwrites the reviewed fixture.
    destination = ROOT / 'generated/horizons.json'
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', type=Path)
    args = parser.parse_args()
    if args.verify:
        verify(json.loads(args.verify.read_text()))
        print('Horizons fixture requests, digests and dates verified')
    else:
        acquire()
