"""Acquire independent NASA numerical rows and reproduce a fixed year selection."""
import argparse
import datetime as dt
import json
from pathlib import Path
import re
import urllib.request

from nasa import ATTRIBUTION, CatalogText, KEYS, ROOT, digest, parse_row

TIME_URL = 'https://eclipse.gsfc.nasa.gov/LEcat5/time.html'
FILE_CAP = 2_000_000


def configuration():
    return json.loads((ROOT / 'references/nasa-sample-plan.json').read_text())


def source_specs(config):
    specs = {}
    centuries = sorted({(year - 1) // 100 * 100 + 1 for year in config['years']})
    for kind, prefix in [('solar', 'SE'), ('lunar', 'LE')]:
        for first in centuries:
            last = first + 99
            specs[f'{kind}-{first}-{last}'] = {
                'kind': kind, 'firstYear': first, 'lastYear': last,
                'url': f'https://eclipse.gsfc.nasa.gov/{prefix}cat5/{prefix}{first}-{last}.html'}
    return specs


def classification(kind, catalog_type):
    if kind == 'solar' and re.fullmatch(r'[PATH][mns+\-23be]?', catalog_type):
        return 'partial' if catalog_type[0] == 'P' or catalog_type[-1] in '+-' else 'central'
    # The current catalog contains Nx; preserve its suffix and use the key's
    # documented N coarse class, without interpreting or rewriting the x.
    if kind == 'lunar' and re.fullmatch(r'[NPT][m+\-*bex]?', catalog_type):
        return {'N': 'penumbral', 'P': 'partial', 'T': 'total'}[catalog_type[0]]
    raise ValueError('Unsupported catalog kind or type')


def validate_rows(rows, kind, first_year, last_year):
    if not rows:
        raise ValueError('Empty catalog rows')
    previous_number = previous_time = None
    years = set()
    for row in rows:
        if row != ' '.join(row.split()) or not row.isascii():
            raise ValueError('Catalog row is not normalized ASCII')
        parsed = parse_row(row)
        classification(kind, parsed['catalogType'])
        year = int(parsed['date'][:4])
        if not first_year <= year <= last_year:
            raise ValueError('Row outside source century')
        number, at_ms = int(parsed['catalogNumber']), parsed['atMs']
        if previous_number is not None and (number != previous_number + 1 or at_ms <= previous_time):
            raise ValueError('Catalog rows are missing, duplicated or unordered')
        previous_number, previous_time = number, at_ms
        years.add(year)
    if years != set(range(first_year, last_year + 1)):
        raise ValueError('Incomplete source century')


def catalog_rows(data, kind, first_year, last_year):
    parser = CatalogText()
    parser.feed(data.decode('latin-1'))
    rows = [' '.join(line.split()) for line in ''.join(parser.parts).splitlines()
            if re.match(r'^\s*\d{5}\s+\d{4}\s+[A-Z][a-z]{2}\s', line)]
    validate_rows(rows, kind, first_year, last_year)
    return rows


def rows_digest(rows):
    return digest(('\n'.join(rows) + '\n').encode('ascii'))


def selected_events(sources, config):
    events = []
    for source_id, spec in source_specs(config).items():
        for row in sources[source_id]['rows']:
            parsed = parse_row(row)
            if int(parsed['date'][:4]) in config['years']:
                events.append({'sourceId': source_id, 'kind': spec['kind'], 'row': row,
                               'rowSha256': digest(row.encode('ascii')),
                               'classification': classification(spec['kind'], parsed['catalogType']), **parsed})
    for kind in ['solar', 'lunar']:
        if {int(e['date'][:4]) for e in events if e['kind'] == kind} != set(config['years']):
            raise ValueError('Selected year has no catalog rows')
    return events


def documents():
    return {**{f'{kind}-key': url for kind, url in KEYS.items()}, 'time': TIME_URL}


def check_retrieval(record):
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z', record['retrievedAt']):
        raise ValueError('Invalid retrieval clock')
    dt.datetime.fromisoformat(record['retrievedAt'].replace('Z', '+00:00'))
    if not re.fullmatch(r'[0-9a-f]{64}', record['sha256']):
        raise ValueError('Invalid downloaded source digest')


def verify(fixture):
    config = configuration()
    if fixture['schema'] != 1 or fixture['clock'] != 'tt' or fixture['configuration'] != config:
        raise ValueError('Changed configuration or clock')
    if fixture['attribution'] != ATTRIBUTION:
        raise ValueError('Changed attribution')
    specs = source_specs(config)
    if set(fixture['sources']) != set(specs) or set(fixture['documents']) != set(documents()):
        raise ValueError('Changed source set')
    for source_id, spec in specs.items():
        source = fixture['sources'][source_id]
        if any(source[key] != value for key, value in spec.items()):
            raise ValueError('Changed source identity')
        check_retrieval(source)
        validate_rows(source['rows'], spec['kind'], spec['firstYear'], spec['lastYear'])
        if rows_digest(source['rows']) != source['rowsSha256']:
            raise ValueError('Changed numerical source rows')
    for document_id, url in documents().items():
        source = fixture['documents'][document_id]
        if source['url'] != url:
            raise ValueError('Changed document URL')
        check_retrieval(source)
    events = selected_events(fixture['sources'], config)
    if fixture['events'] != events:
        raise ValueError('Changed selected events')
    return len(events)


def download(url):
    with urllib.request.urlopen(url, timeout=45) as response:
        data = response.read(FILE_CAP)
    if len(data) >= FILE_CAP:
        raise ValueError('Downloaded source reaches file cap')
    return data, {'url': url, 'sha256': digest(data),
                  'retrievedAt': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}


def acquire(directory):
    config = configuration()
    fixture = {'schema': 1, 'clock': 'tt', 'configuration': config,
               'attribution': ATTRIBUTION, 'sources': {}, 'documents': {}, 'events': []}
    for document_id, url in documents().items():
        data, metadata = download(url)
        parser = CatalogText()
        parser.feed(data.decode('latin-1'))
        text = ''.join(parser.parts)
        if document_id.endswith('-key') and ATTRIBUTION not in text:
            raise ValueError('Redistribution acknowledgment missing')
        if document_id == 'time' and 'Terrestrial Time (TT)' not in text:
            raise ValueError('Clock definition missing')
        fixture['documents'][document_id] = metadata
    for source_id, spec in source_specs(config).items():
        data, metadata = download(spec['url'])
        rows = catalog_rows(data, spec['kind'], spec['firstYear'], spec['lastYear'])
        fixture['sources'][source_id] = {**spec, **metadata, 'rowsSha256': rows_digest(rows), 'rows': rows}
    fixture['events'] = selected_events(fixture['sources'], config)
    verify(fixture)
    encoded = json.dumps(fixture, indent=2) + '\n'
    if len(encoded.encode()) >= FILE_CAP:
        raise ValueError('Fixture reaches file cap')
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / 'nasa-sample.json'
    path.write_text(encoded)
    print(f'Acquired {len(fixture["events"])} selected NASA numerical rows into {path}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--acquire', type=Path)
    action.add_argument('--verify', type=Path)
    args = parser.parse_args()
    if args.acquire:
        target = args.acquire.resolve()
        if not target.is_relative_to(ROOT / 'generated'):
            parser.error('Acquisition output must stay below events/generated/')
        acquire(target)
    else:
        print(f'verified {verify(json.loads(args.verify.read_text()))} broader NASA rows')
