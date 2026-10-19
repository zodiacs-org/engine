"""Acquire selected NASA catalog rows; no engine output enters the references."""
import argparse
import datetime as dt
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ATTRIBUTION = "Eclipse Predictions by Fred Espenak and Jean Meeus (NASA's GSFC)"
URLS = {k: f'https://eclipse.gsfc.nasa.gov/{p}cat5/{p}2001-2100.html'
        for k, p in [('solar', 'SE'), ('lunar', 'LE')]}
KEYS = {k: f'https://eclipse.gsfc.nasa.gov/{p}cat5/{p}catkey.html'
        for k, p in [('solar', 'SE'), ('lunar', 'LE')]}
MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()


def digest(data):
    return hashlib.sha256(data).hexdigest()


class CatalogText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)


def parse_row(row):
    fields = row.split()
    if len(fields) < 11 or not re.fullmatch(r'\d{5}', fields[0]):
        raise ValueError('Invalid catalog row')
    number, year, month, day, time, delta, luna, saros, type_ = fields[:9]
    if month not in MONTHS or not re.fullmatch(r'\d{4}', year) or not re.fullmatch(r'\d{2}:\d{2}:\d{2}', time):
        raise ValueError('Invalid catalog date')
    # NASA TD labels are treated as TT, never as UTC; no catalog Delta T subtraction.
    date = dt.datetime(int(year), MONTHS.index(month) + 1, int(day),
                       *map(int, time.split(':')), tzinfo=dt.timezone.utc)
    return {'catalogNumber': number, 'date': date.strftime('%Y-%m-%d'),
            'tdLabel': date.strftime('%Y-%m-%dT%H:%M:%S'),
            'atMs': int(date.timestamp()) * 1000, 'catalogType': type_,
            'catalogDeltaTSeconds': int(delta), 'lunation': int(luna), 'saros': int(saros)}


def select_rows(data, cases):
    parser = CatalogText()
    parser.feed(data.decode('latin-1'))
    selected = {}
    wanted = {c['catalogNumber'] for c in cases}
    for line in ''.join(parser.parts).splitlines():
        row = ' '.join(line.split())
        if row and row.split()[0] in wanted:
            parsed = parse_row(row)
            number = parsed['catalogNumber']
            if number in selected:
                raise ValueError('Duplicate catalog number')
            selected[number] = (row, parsed)
    if set(selected) != wanted:
        raise ValueError('Missing selected catalog rows')
    return selected


def configuration():
    return json.loads((ROOT / 'references/nasa-cases.json').read_text())


def verify(fixture, source_dir=None):
    config = configuration()
    if fixture['configuration'] != config or fixture['clock'] != 'tt' or fixture['schema'] != 1:
        raise ValueError('Changed reference configuration or clock')
    if fixture['attribution'] != ATTRIBUTION or set(fixture['sources']) != set(URLS):
        raise ValueError('Invalid attribution or sources')
    dt.date.fromisoformat(fixture['retrievedOn'])
    for kind, source in fixture['sources'].items():
        if source['url'] != URLS[kind] or source['keyUrl'] != KEYS[kind]:
            raise ValueError('Unexpected source URL')
        for key in ['sha256', 'keySha256']:
            if not re.fullmatch('[0-9a-f]{64}', source[key]):
                raise ValueError('Invalid source digest')
        if source_dir:
            for filename, key in [(f'{kind}.html', 'sha256'), (f'{kind}-key.html', 'keySha256')]:
                if digest((source_dir / filename).read_bytes()) != source[key]:
                    raise ValueError('Changed source page')
    if len(fixture['events']) != len(config['cases']):
        raise ValueError('Changed selection')
    for case, event in zip(config['cases'], fixture['events']):
        row = event['row']
        if row != ' '.join(row.split()) or digest(row.encode()) != event['rowSha256']:
            raise ValueError('Changed row digest')
        parsed = parse_row(row)
        if event != {'kind': case['kind'], 'row': row, 'rowSha256': digest(row.encode()), **parsed}:
            raise ValueError('Changed parsed event')
        if any(parsed[k] != case[k] for k in ['catalogNumber', 'date', 'catalogType']):
            raise ValueError('Row does not match selected case')
        if source_dir:
            rows = select_rows((source_dir / f"{case['kind']}.html").read_bytes(), [case])
            if rows[case['catalogNumber']][0] != row:
                raise ValueError('Row does not match source page')
    return len(fixture['events'])


def acquire(directory):
    config = configuration()
    directory.mkdir(parents=True, exist_ok=True)
    fixture = {'schema': 1, 'clock': 'tt', 'configuration': config,
               'retrievedOn': dt.datetime.now(dt.timezone.utc).date().isoformat(),
               'attribution': ATTRIBUTION, 'sources': {}, 'events': []}
    rows = {}
    for kind in URLS:
        data = urllib.request.urlopen(URLS[kind], timeout=60).read(2_000_000)
        key = urllib.request.urlopen(KEYS[kind], timeout=60).read(2_000_000)
        if max(len(data), len(key)) >= 2_000_000:
            raise ValueError('Source exceeds file cap')
        parser = CatalogText()
        parser.feed(key.decode('latin-1'))
        if ATTRIBUTION not in ''.join(parser.parts):
            raise ValueError('Redistribution acknowledgment missing')
        (directory / f'{kind}.html').write_bytes(data)
        (directory / f'{kind}-key.html').write_bytes(key)
        fixture['sources'][kind] = {'url': URLS[kind], 'sha256': digest(data),
                                    'keyUrl': KEYS[kind], 'keySha256': digest(key)}
        rows[kind] = select_rows(data, [c for c in config['cases'] if c['kind'] == kind])
    for case in config['cases']:
        row, parsed = rows[case['kind']][case['catalogNumber']]
        fixture['events'].append({'kind': case['kind'], 'row': row,
                                  'rowSha256': digest(row.encode()), **parsed})
    verify(fixture, directory)
    path = directory / 'nasa.json'
    path.write_text(json.dumps(fixture, indent=2) + '\n')
    print(f'Acquired {len(fixture["events"])} catalog rows into {path}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--acquire', type=Path, help='Write only into a gitignored generated directory')
    action.add_argument('--verify', type=Path)
    parser.add_argument('--source-dir', type=Path, help='Also verify complete downloaded page hashes and selected rows')
    args = parser.parse_args()
    if args.acquire:
        target = args.acquire.resolve()
        if not target.is_relative_to(ROOT / 'generated'):
            parser.error('Acquisition output must stay below events/generated/')
        acquire(target)
    else:
        print(f'verified {verify(json.loads(args.verify.read_text()), args.source_dir)} NASA rows')
