"""Reduce paired crossings from existing Horizons rows, without engine values."""
import argparse
import hashlib
import json
import math
from pathlib import Path

from horizons import ROOT, arc, parse_response, verify as verify_horizons

REDUCTION = ('Sign-changing longitude crossings from linear interpolation of the '
             'committed hourly Horizons rows; invented fixed target longitudes.')


def crossings(rows, target):
    """Interpolate each strict sign change on the near side of the circle."""
    if not isinstance(target, (int, float)) or isinstance(target, bool) or not math.isfinite(target) or not 0 <= target < 360:
        raise ValueError('A finite target longitude in [0, 360) is required')
    events = []
    for a, b in zip(rows, rows[1:]):
        left, right = arc(a[1] - target), arc(b[1] - target)
        if left * right < 0 and abs(right - left) < 180:
            at = round(a[0] - left * (b[0] - a[0]) / (right - left))
            events.append(dict(atMs=at, direction='direct' if right > left else 'retrograde'))
    return events


def verify(fixture):
    if fixture['sourceFixture'] != 'references/horizons.json':
        raise ValueError('Unexpected source fixture path')
    source_bytes = (ROOT / fixture['sourceFixture']).read_bytes()
    if hashlib.sha256(source_bytes).hexdigest() != fixture['sourceFixtureSha256']:
        raise ValueError('Source fixture digest mismatch')
    source = json.loads(source_bytes)
    verify_horizons(source)
    if fixture['source'] != source['source'] or fixture['clock'] != source['clock'] or fixture['sourceRetrievedAt'] != source['retrievedAt']:
        raise ValueError('Source provenance differs from the original acquisition')
    if fixture['reduction'] != REDUCTION or fixture['toleranceMs'] != 600000:
        raise ValueError('Unexpected reduction or declared timing tolerance')
    if not isinstance(fixture['cases'], list) or not fixture['cases']:
        raise ValueError('A nonempty loop case list is required')
    ids = set()
    for case in fixture['cases']:
        if case['id'] in ids:
            raise ValueError('Duplicate loop case id')
        ids.add(case['id'])
        matches = [entry for entry in source['events'] if entry['case']['id'] == case['sourceCase']]
        if len(matches) != 1:
            raise ValueError('Missing or ambiguous source case')
        entry = matches[0]
        original = entry['case']
        if original['kind'] != 'station' or any(case[key] != original[key] for key in ('body', 'start', 'end')):
            raise ValueError('Loop body or window differs from the original station request')
        if len(entry['responses']) != 1 or case['sourceResponseSha256'] != entry['responses'][0]['sha256']:
            raise ValueError('Source response digest mismatch')
        rows = parse_response(entry['responses'][0]['raw'])
        target = case['targetDegrees']
        expected = crossings(rows, target)
        if len(expected) != 2 or expected[0]['direction'] == expected[1]['direction']:
            raise ValueError('Expected two opposite-direction crossings around one turning point')
        # Both endpoint residuals have the same sign: endpoint-only discovery
        # cannot see either crossing in the declared single scan cell.
        if arc(rows[0][1] - target) * arc(rows[-1][1] - target) <= 0:
            raise ValueError('Loop endpoints must hide the paired crossings')
        if expected != case['events']:
            raise ValueError('Committed loop dates do not reproduce from Horizons rows')
    return fixture


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', type=Path, default=ROOT / 'references/loop-cases.json')
    parser.add_argument('--json', action='store_true', help='Print the verified independent reference cases')
    parser.add_argument('--rows', action='store_true', help='Include original hourly rows in JSON output')
    args = parser.parse_args()
    result = verify(json.loads(args.verify.read_text()))
    if args.rows:
        source = json.loads((ROOT / result['sourceFixture']).read_text())
        for case in result['cases']:
            entry = next(e for e in source['events'] if e['case']['id'] == case['sourceCase'])
            case['rows'] = parse_response(entry['responses'][0]['raw'])
    if args.json:
        print(json.dumps(result))
    else:
        print('Loop fixture source digests, provenance and paired crossing dates verified')
