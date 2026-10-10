#!/usr/bin/env python3
"""Independent JPL ICRF vector acquisition and offline raw reconstruction."""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api'
UTC = timezone.utc

def digest(value):
    return hashlib.sha256(value).hexdigest()

def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()

def write_json(path, value):
    path.write_bytes(json_bytes(value))

def epoch(value, offset):
    seconds = datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() + offset
    return seconds, 2440587.5 + seconds / 86400

def table_specs(protocol):
    result = []
    for correction in protocol['primaryCorrections']:
        suffix = {'NONE': 'none', 'LT+S': 'lts'}[correction]
        for body in protocol['primaryBodies']:
            result.append({**body, 'id': body['body'].lower() + '-' + suffix,
                           'group': 'primary', 'correction': correction,
                           'epochIndices': protocol['primaryEpochIndices']})
    control = protocol['optionalBodyCenterControls']
    for body in control['bodies']:
        result.append({**body, 'id': body['body'].lower() + '-body-center-lts',
                       'group': 'optional-body-center', 'correction': control['correction'],
                       'epochIndices': control['epochIndices']})
    return result

def parameters(spec, protocol, cases):
    tts = [epoch(cases['instants'][i], protocol['clock']['deltaTSeconds'])[1] for i in spec['epochIndices']]
    return {**protocol['baseParameters'], 'COMMAND': spec['command'],
            'VEC_CORR': spec['correction'],
            'TLIST': "'" + ','.join(f'{jd:.10f}' for jd in tts) + "'"}

def header_field(header, label):
    found = re.findall(r'^' + re.escape(label) + r'\s*:\s*(.+)$', header, re.M)
    if len(found) != 1:
        raise ValueError(f'Expected one {label} header, got {found}')
    return found[0].strip()

def parse_raw(raw, spec, protocol, cases):
    payload = json.loads(raw)
    if payload.get('error'):
        raise ValueError('Horizons error: ' + str(payload['error']))
    result = payload.get('result', '')
    if result.count('$$SOE') != 1 or result.count('$$EOE') != 1:
        raise ValueError('Expected exactly one Horizons data table')
    header, tail = result.split('$$SOE')
    table, footer = tail.split('$$EOE')
    target = header_field(header, 'Target body name')
    center = header_field(header, 'Center body name')
    site = header_field(header, 'Center-site name')
    calendar = header_field(header, 'Calendar mode')
    frame = header_field(header, 'Reference frame')
    units = header_field(header, 'Output units')
    correction = header_field(header, 'Output type')
    if not re.search(r'\(' + re.escape(spec['command']) + r'\)', target):
        raise ValueError(f'Wrong target: {target}')
    if not re.search(r'Earth\s*\(399\)', center):
        raise ValueError(f'Wrong center: {center}')
    if site != 'BODY CENTER':
        raise ValueError(f'Expected BODY CENTER, got {site}')
    if calendar != 'Gregorian':
        raise ValueError(f'Expected Gregorian calendar, got {calendar}')
    if frame != 'ICRF' or units != 'AU-D':
        raise ValueError(f'Unexpected vector convention: {frame}, {units}')
    if spec['correction'] == 'NONE' and 'GEOMETRIC' not in correction.upper():
        raise ValueError(f'Expected geometric vectors, got {correction}')
    if spec['correction'] == 'LT+S' and 'LT+S' not in correction.upper():
        raise ValueError(f'Expected LT+S vectors, got {correction}')
    column_lines = [line for line in header.splitlines() if 'JDTT' in line and ',' in line]
    if len(column_lines) != 1:
        raise ValueError('Returned vector table is not explicitly JDTT; refusing timescale substitution')
    columns = [c.strip() for c in next(csv.reader(column_lines))]
    required = ['JDTT', 'X', 'Y', 'Z', 'VX', 'VY', 'VZ', 'LT', 'RG', 'RR']
    if any(columns.count(c) != 1 for c in required):
        raise ValueError(f'Unexpected CSV columns: {columns}')
    index = {c: columns.index(c) for c in required}
    records = [row for row in csv.reader(io.StringIO(table)) if row and row[0].strip()]
    if len(records) != len(spec['epochIndices']):
        raise ValueError(f'Expected {len(spec["epochIndices"])} rows, got {len(records)}')
    rows = []
    for row, epoch_index in zip(records, spec['epochIndices']):
        values = {c: float(row[index[c]]) for c in required}
        if not all(math.isfinite(x) for x in values.values()):
            raise ValueError('Nonfinite raw state value')
        instant = cases['instants'][epoch_index]
        seconds_tt, expected_tt = epoch(instant, protocol['clock']['deltaTSeconds'])
        offset_ms = (values['JDTT'] - expected_tt) * 86400000
        if abs(offset_ms) > protocol['clock']['maxReturnedEpochDifferenceMilliseconds']:
            raise ValueError(f'TT epoch mismatch {offset_ms} ms at index {epoch_index}')
        if values['RG'] <= 0 or values['LT'] <= 0:
            raise ValueError('Expected positive geocentric range and light time')
        position = [values[c] for c in ['X','Y','Z']]
        radius = math.sqrt(sum(x*x for x in position))
        # This validates output parsing/units, not physical model accuracy.
        if abs(radius - values['RG']) > max(1e-12, values['RG'] * 1e-12):
            raise ValueError('Position norm differs from recorded range')
        rows.append({'id': spec['id'] + '-' + str(epoch_index),
                     'tableId': spec['id'], 'group': spec['group'], 'body': spec['body'],
                     'command': spec['command'], 'referenceTarget': spec['referenceTarget'],
                     'correction': spec['correction'], 'epochIndex': epoch_index,
                     'syntheticUt1': instant, 'deltaTSeconds': protocol['clock']['deltaTSeconds'],
                     'ttJulianDay': values['JDTT'], 'ttJulianDayRequested': expected_tt,
                     'returnedEpochOffsetMilliseconds': offset_ms,
                     'ttCalendar': datetime.fromtimestamp(seconds_tt, UTC).isoformat(timespec='milliseconds').replace('+00:00',' TT'),
                     'positionAu': position, 'velocityAuPerDay': [values[c] for c in ['VX','VY','VZ']],
                     'lightTimeDays': values['LT'], 'rangeAu': values['RG'], 'rangeRateAuPerDay': values['RR'],
                     'rawFile': 'raw/' + spec['id'] + '.json', 'rawSha256': digest(raw)})
    return rows, {'apiSignature': payload.get('signature'), 'targetLine': target,
                  'centerLine': center, 'centerSite': site, 'calendar': calendar, 'frame': frame, 'units': units,
                  'outputType': correction, 'timeColumn': 'JDTT',
                  'tableColumns': columns, 'header': header, 'footer': footer}

def acquire_one(spec, params, destination):
    url = ENDPOINT + '?' + urllib.parse.urlencode(params)
    started = datetime.now(UTC).isoformat()
    status, raw = None, b''
    error = None
    try:
        request = urllib.request.Request(url, headers={'User-Agent': 'Zodiacs-independent-vector-audit/1.0'})
        with urllib.request.urlopen(request, timeout=90) as response:
            raw, status = response.read(), response.status
    except urllib.error.HTTPError as exc:
        raw, status, error = exc.read(), exc.code, str(exc)
    except Exception as exc:
        error = type(exc).__name__ + ': ' + str(exc)
    receipt = {'schemaVersion':1, 'requestId':spec['id'], 'method':'GET', 'url':url,
               'parameters':params, 'requestStartedAtUtc':started,
               'retrievedAtUtc':datetime.now(UTC).isoformat(), 'httpStatus':status,
               'rawFile':'raw/' + spec['id'] + '.json', 'rawSha256':digest(raw), 'transportError':error}
    (destination / receipt['rawFile']).write_bytes(raw)
    write_json(destination / 'raw' / (spec['id'] + '.receipt.json'), receipt)
    if error:
        raise ValueError(error)
    return raw, receipt

def archived_one(spec, params, destination):
    receipt = json.loads((destination / 'raw' / (spec['id'] + '.receipt.json')).read_bytes())
    raw = (destination / receipt['rawFile']).read_bytes()
    if receipt['parameters'] != params or receipt['rawSha256'] != digest(raw) or receipt['requestId'] != spec['id']:
        raise ValueError('Archived request/response identity mismatch')
    if receipt['transportError'] or receipt['httpStatus'] != 200:
        raise ValueError('Archived request failed: ' + str(receipt['transportError']))
    return raw, receipt

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['acquire','replay'], default='replay')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'snapshot')
    parser.add_argument('--resume', action='store_true', help='In acquire mode, reuse and verify existing successful requests rather than overwrite them')
    parser.add_argument('--manifest-output', type=Path, help='Explicit output manifest path; default is output-dir/vectors.json')
    args = parser.parse_args()
    dest = args.output_dir.resolve()
    (dest / 'raw').mkdir(parents=True, exist_ok=True)
    protocol_raw = (ROOT / 'protocol.json').read_bytes()
    cases_raw = (ROOT / 'cases.json').read_bytes()
    protocol, cases = json.loads(protocol_raw), json.loads(cases_raw)
    if digest(cases_raw) != protocol['casesSha256']:
        raise ValueError('Cases do not match frozen protocol')
    specs = table_specs(protocol)
    rows, sources, failures = [], [], []
    for spec in specs:
        params = parameters(spec, protocol, cases)
        receipt_exists = (dest / 'raw' / (spec['id'] + '.receipt.json')).exists()
        print(f'{args.mode} {spec["id"]}: {len(spec["epochIndices"])} TT epochs', flush=True)
        try:
            if args.mode == 'replay' or (args.resume and receipt_exists):
                raw, receipt = archived_one(spec, params, dest)
            else:
                if receipt_exists:
                    raise ValueError('Existing request would be overwritten; choose new output directory or --resume')
                raw, receipt = acquire_one(spec, params, dest)
            parsed, parsed_meta = parse_raw(raw, spec, protocol, cases)
            rows.extend(parsed)
            sources.append({'id':spec['id'], 'group':spec['group'], 'rows':len(parsed), **receipt,
                            **{k:v for k,v in parsed_meta.items() if k not in ('header','footer')}})
            # The whole response already preserves header/footer; this smaller
            # sidecar makes the independently checked conventions easy to read.
            if args.mode == 'acquire':
                write_json(dest / 'raw' / (spec['id'] + '.parsed.json'), parsed_meta)
        except Exception as exc:
            failure = {'id':spec['id'], 'group':spec['group'], 'error':str(exc)}
            failures.append(failure)
            print(json.dumps(failure), flush=True)
            if spec['group'] == 'primary':
                write_json(dest / 'acquisition-failure.json', {'failures':failures,'completedTableIds':[x['id'] for x in sources]})
                raise
    primary = [r for r in rows if r['group'] == 'primary']
    if len(primary) != protocol['expectedPrimaryRows'] or len({r['id'] for r in rows}) != len(rows):
        raise ValueError('Missing or duplicate primary reference rows')
    manifest = {'schemaVersion':1, 'protocolId':protocol['id'], 'protocolSha256':digest(protocol_raw),
                'casesSha256':digest(cases_raw), 'buildScriptSha256':digest(Path(__file__).read_bytes()),
                'builtAtUtc':datetime.now(UTC).isoformat(), 'buildMode':args.mode,
                'clock':protocol['clock'], 'frame':'ICRF equatorial; Earth geocenter',
                'positionUnits':'AU', 'velocityUnits':'AU/day',
                'primaryRowCount':len(primary), 'optionalRowCount':len(rows)-len(primary),
                'sources':sources, 'optionalFailures':failures, 'rows':rows,
                'limits':protocol['limits']}
    path = args.manifest_output.resolve() if args.manifest_output else dest / 'vectors.json'
    write_json(path, manifest)
    print(json.dumps({'output':str(path),'primaryRows':len(primary),'optionalRows':len(rows)-len(primary),
                      'successfulTables':len(sources),'optionalFailures':len(failures)},indent=2))

if __name__ == '__main__':
    main()
