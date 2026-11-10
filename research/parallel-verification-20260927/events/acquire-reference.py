#!/usr/bin/env python3
"""Acquire independent, bounded lunation references. Never imports target code."""
import argparse
import csv
import hashlib
import io
import json
import math
from pathlib import Path
from datetime import datetime, timedelta, timezone
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
UTC = timezone.utc
J2000_UNIX = 2440587.5
READ_RAW_ONLY = False

def sha(data):
    return hashlib.sha256(data).hexdigest()

def parse_iso(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))

def iso(seconds):
    return datetime.fromtimestamp(seconds, UTC).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

def signed(value):
    return (value + 180) % 360 - 180

def request_body(name, command, timestamps, protocol, outdir):
    # TLIST values explicitly denote TT Julian dates. No UTC/UT1 conversion by
    # Horizons is requested; the synthetic clock offset is applied here.
    delta = protocol['clock']['deltaTSeconds']
    jds = [J2000_UNIX + (t + delta) / 86400 for t in timestamps]
    params = {
        'format': 'json', 'COMMAND': f"'{command}'", 'OBJ_DATA': "'YES'",
        'EPHEM_TYPE': "'OBSERVER'", 'CENTER': "'500@399'", 'QUANTITIES': "'31'",
        'TIME_TYPE': "'TT'", 'CAL_TYPE': "'G'",
        'CAL_FORMAT': "'JD'", 'TIME_DIGITS': "'FRACSEC'",
        'ANG_FORMAT': "'DEG'", 'CSV_FORMAT': "'YES'", 'EXTRA_PREC': "'YES'"
    }
    if len(timestamps) > 10:
        spacing = timestamps[1] - timestamps[0]
        if spacing % 60 or any(abs(b - a - spacing) > 1e-6 for a, b in zip(timestamps, timestamps[1:])):
            raise RuntimeError('Large time grid must be uniform whole minutes')
        params['START_TIME'] = "'" + datetime.fromtimestamp(timestamps[0] + delta, UTC).strftime('%Y-%m-%d %H:%M:%S') + "'"
        params['STOP_TIME'] = "'" + datetime.fromtimestamp(timestamps[-1] + delta, UTC).strftime('%Y-%m-%d %H:%M:%S') + "'"
        params['STEP_SIZE'] = f"'{int(spacing / 60)}m'"
    else:
        params['TLIST'] = "'" + ','.join(f'{j:.10f}' for j in jds) + "'"
        params['TLIST_TYPE'] = "'JD'"
    url = protocol['reference']['endpoint'] + '?' + urllib.parse.urlencode(params)
    raw_file = outdir / 'raw' / f'{name}.json'
    request_file = outdir / 'raw' / f'{name}.request.json'
    if READ_RAW_ONLY:
        metadata = json.loads(request_file.read_bytes())
        raw = raw_file.read_bytes()
        if metadata['parameters'] != params or metadata['rawSha256'] != sha(raw):
            raise RuntimeError(f'Archived request or response mismatch for {name}')
        started, retrieved = metadata['requestStartedAtUtc'], metadata['retrievedAtUtc']
        http_status = metadata['httpStatus']
        print(f'Replaying raw {name}: {len(timestamps)} TT samples', flush=True)
    else:
        started = datetime.now(UTC).isoformat()
        print(f'Acquiring {name}: {len(timestamps)} TT samples', flush=True)
        req = urllib.request.Request(url, headers={'User-Agent': 'Zodiacs-independent-ephemeris-audit/1.0'})
        with urllib.request.urlopen(req, timeout=90) as response:
            raw = response.read()
            http_status = response.status
        retrieved = datetime.now(UTC).isoformat()
        raw_file.write_bytes(raw)
    payload = json.loads(raw)
    if 'error' in payload:
        raise RuntimeError(payload['error'])
    result = payload.get('result', '')
    if '$$SOE' not in result or '$$EOE' not in result:
        raise RuntimeError(f'No ephemeris table in {raw_file}')
    header_text, table = result.split('$$SOE', 1)
    table, footer_text = table.split('$$EOE', 1)
    headers = [line for line in header_text.splitlines() if 'ObsEcLon' in line]
    if len(headers) != 1:
        raise RuntimeError(f'Unexpected headers {headers}')
    columns = next(csv.reader([headers[0]]))
    index = [c.strip() for c in columns].index('ObsEcLon')
    rows = [r for r in csv.reader(io.StringIO(table)) if r and r[0].strip()]
    if len(rows) != len(timestamps):
        raise RuntimeError(f'{name}: expected {len(timestamps)} samples, got {len(rows)}')
    samples = []
    for requested, requested_jd, row in zip(timestamps, jds, rows):
        returned_jd = float(row[0].strip())
        if abs(returned_jd - requested_jd) * 86400 > .002:
            raise RuntimeError(f'Time mismatch: {returned_jd} versus {requested_jd}')
        samples.append({'syntheticUt1Seconds': (returned_jd - J2000_UNIX) * 86400 - delta,
                        'ttJulianDay': returned_jd, 'longitudeDegrees': float(row[index])})
    metadata = {
        'name': name, 'requestStartedAtUtc': started, 'retrievedAtUtc': retrieved,
        'method': 'GET', 'url': url, 'parameters': params, 'httpStatus': http_status,
        'rawFile': str(raw_file.relative_to(outdir)), 'rawSha256': sha(raw),
        'apiSignature': payload.get('signature'), 'rows': len(samples),
        'header': header_text, 'footer': footer_text
    }
    if not READ_RAW_ONLY:
        write_json(request_file, metadata)
    return samples, metadata

def pair_stage(name, timestamps, protocol, outdir):
    # Deliberately sequential: Horizons fair-use policy requires one request
    # at a time. Coordinate separate acquisition processes before running.
    sun, sm = request_body(f'{name}-sun', '10', timestamps, protocol, outdir)
    moon, mm = request_body(f'{name}-moon', '301', timestamps, protocol, outdir)
    samples = []
    for s, m in zip(sun, moon):
        if abs(s['ttJulianDay'] - m['ttJulianDay']) > 1e-10:
            raise RuntimeError('Sun and Moon sample clocks differ')
        samples.append({'syntheticUt1Seconds': s['syntheticUt1Seconds'],
                        'ttJulianDay': s['ttJulianDay'],
                        'sunLongitudeDegrees': s['longitudeDegrees'],
                        'moonLongitudeDegrees': m['longitudeDegrees'],
                        'elongationDegrees': (m['longitudeDegrees'] - s['longitudeDegrees']) % 360})
    return samples, [sm, mm]

def brackets(samples, target, lower, upper):
    roots = []
    for a, b in zip(samples, samples[1:]):
        if b['syntheticUt1Seconds'] <= lower or a['syntheticUt1Seconds'] > upper:
            continue
        y0, y1 = signed(a['elongationDegrees'] - target), signed(b['elongationDegrees'] - target)
        if abs(y0) < 90 and abs(y1) < 90 and y0 <= 0 < y1:
            if not y1 > y0:
                raise RuntimeError('Lunation motion must be increasing in this protocol')
            t0, t1 = a['syntheticUt1Seconds'], b['syntheticUt1Seconds']
            estimate = t0 - y0 * (t1 - t0) / (y1 - y0)
            roots.append({'lowerSeconds': t0, 'upperSeconds': t1,
                          'lowerResidualDegrees': y0, 'upperResidualDegrees': y1,
                          'linearEstimateSeconds': estimate,
                          'localRateDegreesPerSecond': (y1 - y0) / (t1 - t0)})
    return roots

def exactly_one(samples, case):
    found = brackets(samples, case['targetAngleDegrees'], parse_iso(case['from']).timestamp(), parse_iso(case['to']).timestamp())
    if len(found) != 1:
        raise RuntimeError(f"{case['id']}: expected one bounded reference crossing, got {len(found)}")
    return found[0]

def main():
    global READ_RAW_ONLY
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT)
    parser.add_argument('--from-raw', action='store_true', help='Rebuild references offline from hashed saved raw responses and matching request parameters; no network')
    args = parser.parse_args()
    READ_RAW_ONLY = args.from_raw
    outdir = args.output_dir.resolve()
    (outdir / 'raw').mkdir(parents=True, exist_ok=True)
    protocol_bytes = (ROOT / 'protocol.json').read_bytes()
    p = json.loads(protocol_bytes)
    lo = min(parse_iso(c['from']).timestamp() for c in p['cases'])
    hi = max(parse_iso(c['to']).timestamp() for c in p['cases'])
    step = p['reference']['coarseStepHours'] * 3600
    timestamps = [lo + i * step for i in range(int((hi - lo) / step) + 1)]
    coarse, requests = pair_stage('coarse', timestamps, p, outdir)
    results = []
    for case in p['cases']:
        initial = exactly_one(coarse, case)
        center = round(initial['linearEstimateSeconds'])
        half = p['reference']['refinementHalfWindowSeconds']
        fine_step = p['reference']['refinementStepSeconds']
        times = list(range(center - half, center + half + 1, fine_step))
        fine, meta = pair_stage(case['id'] + '-minute', times, p, outdir)
        requests += meta
        minute = exactly_one(fine, case)
        center = round(minute['linearEstimateSeconds'])
        times = [center + d for d in p['reference']['finalSampleOffsetsSeconds']]
        final, meta = pair_stage(case['id'] + '-second', times, p, outdir)
        requests += meta
        bracket = exactly_one(final, case)
        width = bracket['upperSeconds'] - bracket['lowerSeconds']
        if width > p['reference']['maximumAcceptedReferenceBracketSeconds']:
            raise RuntimeError(f'Reference bracket too wide: {width}')
        reference = bracket['linearEstimateSeconds']
        results.append({**case, 'referenceSyntheticUt1': iso(reference),
                        'referenceSyntheticUt1UnixSeconds': reference,
                        'referenceTt': iso(reference + p['clock']['deltaTSeconds']),
                        'referenceTtJulianDay': J2000_UNIX + (reference + p['clock']['deltaTSeconds']) / 86400,
                        'sampleBracket': {**bracket, 'lowerSyntheticUt1': iso(bracket['lowerSeconds']),
                                          'upperSyntheticUt1': iso(bracket['upperSeconds']), 'widthSeconds': width},
                        'samplingStatement': 'Linear interpolation inside an independently sampled <=1.01 second sign-change bracket. The bracket bounds the local increasing longitude root of this JPL observable subject to output rounding; it is not a bound on physical ephemeris/model uncertainty.',
                        'fineSamples': final, 'coarseBracket': initial, 'minuteBracket': minute})
    manifest = {
        'schemaVersion': 1, 'protocol': p['protocol'], 'protocolSha256': sha(protocol_bytes),
        'generatedAtUtc': datetime.now(UTC).isoformat(),
        'referenceBuildScriptSha256': sha(Path(__file__).read_bytes()),
        'referenceBuildMode': 'offline raw replay' if READ_RAW_ONLY else 'live acquisition', 'clock': p['clock'],
        'observable': p['reference']['observable'], 'references': results,
        'requests': [{k: v for k, v in r.items() if k not in ('header', 'footer', 'url', 'parameters')} for r in requests],
        'limits': [p['scope'], 'No target engine was imported or called to select or calculate expected roots.',
                   'A few local samples establish bounded ordinary crossings; they do not certify global root completeness.',
                   'The synthetic UT1 labels must not be published as UTC lunar phase times.']
    }
    write_json(outdir / 'references.json', manifest)
    print(json.dumps({'referenceFile': str(outdir / 'references.json'), 'cases': len(results), 'requests': len(requests)}, indent=2))

if __name__ == '__main__':
    main()
