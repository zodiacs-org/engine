"""Acquire a bounded, independently selected Horizons station/ingress sample."""
import argparse
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.parse
import urllib.request

from horizons import API, FRAME, LIMIT, ROOT, TERMS, arc, parameters

DAY = 86400000
HOUR = 3600000
PLAN = ROOT / 'references/horizons-sample-plan.json'
SOURCE = 'NASA/JPL Horizons observer tables'
SELECTION = ('First daily-table station and first tropical ingress in each available '
             'direction per body-year; refine their padded windows with hourly tables.')
COMMANDS = dict(Mercury='199', Venus='299', Mars='499', Jupiter='599', Saturn='699', Neptune='899')
REDACTION = 'Response through $$EOE, excluding EOP file/coverage lines; contact footer omitted.'


def digest(value):
    return hashlib.sha256(value).hexdigest()


def epoch(date):
    return round(dt.datetime.fromisoformat(date).replace(tzinfo=dt.timezone.utc).timestamp() * 1000)


def timestamp(value):
    parsed = dt.datetime.fromisoformat(value)
    if parsed.utcoffset() != dt.timedelta(0):
        raise ValueError('Retrieval timestamp must have a UTC offset')


def load_plan():
    plan = json.loads(PLAN.read_text())
    if plan['selection'] != SELECTION or plan['toleranceMs'] != dict(ingress=600000, station=1200000):
        raise ValueError('Unexpected selection policy or declared thresholds')
    seen = set()
    if not 1 <= len(plan['surveys']) <= 8:
        raise ValueError('Expected a bounded survey list')
    for survey in plan['surveys']:
        body, year = survey['body'], survey['year']
        key = (body, year)
        if COMMANDS.get(body) != survey['command'] or type(year) is not int or not 1900 <= year <= 2100 or key in seen:
            raise ValueError('Invalid or duplicate body-year survey')
        seen.add(key)
    return plan


def survey_case(survey):
    return dict(body=survey['body'], command=survey['command'],
                start=f"{survey['year']}-01-01", end=f"{survey['year'] + 1}-01-01")


def request(case, daily=False):
    params = parameters(case, case['command'])
    if daily:
        params['STEP_SIZE'] = "'1 d'"
    return params, API + '?' + urllib.parse.urlencode(params)


def excerpt(raw):
    text = json.loads(raw)['result']
    if text.count('$$EOE') != 1:
        raise ValueError('Missing or duplicate ephemeris end')
    # Keep numerical source text verbatim, except for the explicitly recorded
    # omissions. Full response digests bind acquisition, not offline replay.
    kept = text[:text.index('$$EOE') + len('$$EOE')]
    return '\n'.join(line for line in kept.splitlines()
                     if not line.startswith(('EOP file', 'EOP coverage'))) + '\n'


def rows_from(text, case, step):
    target = re.search(r'Target body name:\s*(.*?)\s+\((\d+)\)\s+\{source:\s*([^}]+)\}', text)
    center = re.search(r'Center body name:\s*Earth \(399\)\s+\{source:\s*([^}]+)\}', text)
    if not target or target[1] != case['body'] or target[2] != case['command'] or not center:
        raise ValueError('Unexpected target or Earth-center ephemeris identity')
    for required in ['Center-site name: GEOCENTRIC', 'Date_________JDTT', 'ObsEcLon', 'NO (AIRLESS)']:
        if required not in text:
            raise ValueError('Missing required Horizons convention: ' + required)
    if text.count('$$SOE') != 1 or text.count('$$EOE') != 1:
        raise ValueError('Missing or duplicate ephemeris delimiters')
    rows = []
    for row in csv.reader(text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()):
        jd, lon = float(row[0]), float(row[3])
        if not math.isfinite(jd) or not math.isfinite(lon) or not 0 <= lon < 360:
            raise ValueError('Invalid longitude row')
        at = round((jd - 2440587.5) * DAY)
        if rows and at - rows[-1][0] != step:
            raise ValueError('Unexpected row cadence')
        rows.append([at, lon])
    if len(rows) < 3 or rows[0][0] != epoch(case['start']) or rows[-1][0] != epoch(case['end']):
        raise ValueError('Response does not cover the requested TT window')
    return rows


def zero_crossings(values, angular=False):
    """Strict crossings plus observed zero runs bounded by opposite signs.

    A zero run with equal neighboring signs is a touch. An edge zero is
    unconfirmed. No claim is made about hidden crossings between these rows.
    """
    events, left, zeros = [], None, []
    for t, value in values:
        if value == 0:
            if left is not None:
                zeros.append(t)
            continue
        if left is not None and left[1] * value < 0 and (not angular or abs(value - left[1]) < 180):
            at = ((zeros[0] + zeros[-1]) / 2 if zeros else
                  left[0] - left[1] * (t - left[0]) / (value - left[1]))
            events.append(dict(atMs=round(at), direction='direct' if value > left[1] else 'retrograde',
                               bracketMs=[left[0], t]))
        left, zeros = [t, value], []
    return events


def station_dates(rows):
    # Secant longitude speeds assigned to their cell midpoints. Isolated
    # rounded-zero secants retain the surrounding nonzero bracket.
    speeds = [[(a[0] + b[0]) / 2, arc(b[1] - a[1])] for a, b in zip(rows, rows[1:])]
    return zero_crossings(speeds)


def ingress_dates(rows):
    events = []
    for target in range(0, 360, 30):
        for event in zero_crossings([[t, arc(lon - target)] for t, lon in rows], angular=True):
            events.append(dict(**event, targetDegrees=target))
    return sorted(events, key=lambda e: (e['atMs'], e['targetDegrees']))


def selected_cases(survey, rows, plan):
    selected, absent = [], []
    for kind, events in [('station', station_dates(rows)), ('ingress', ingress_dates(rows))]:
        for direction in ['direct', 'retrograde']:
            matches = [event for event in events if event['direction'] == direction]
            if not matches:
                absent.append(dict(kind=kind, direction=direction))
                continue
            first = matches[0]
            # Pad the entire daily bracket by a day at both ends, rounding
            # outward to date labels and clipping to the surveyed year.
            start = max(rows[0][0], math.floor(first['bracketMs'][0] / DAY) * DAY - DAY)
            end = min(rows[-1][0], math.ceil(first['bracketMs'][1] / DAY) * DAY + DAY)
            date = lambda t: dt.datetime.fromtimestamp(t / 1000, dt.timezone.utc).date().isoformat()
            case = dict(id=f"{survey['body'].lower()}-{survey['year']}-{kind}-{direction}",
                        kind=kind, body=survey['body'], command=survey['command'],
                        start=date(start), end=date(end), direction=direction,
                        toleranceMs=plan['toleranceMs'][kind])
            if kind == 'ingress':
                case['targetDegrees'] = first['targetDegrees']
            selected.append(case)
    return selected, absent


def reduce_case(case, rows):
    events = station_dates(rows) if case['kind'] == 'station' else ingress_dates(rows)
    matches = [e for e in events if e['direction'] == case['direction'] and
               (case['kind'] == 'station' or e['targetDegrees'] == case['targetDegrees'])]
    if len(matches) != 1:
        raise ValueError(case['id'] + ': expected one hourly reference crossing')
    return matches[0]


def check_response(response, case, daily=False):
    params, url = request(case, daily)
    if response['parameters'] != params or response['url'] != url or response['extraction'] != REDACTION:
        raise ValueError('Request or extraction provenance mismatch')
    timestamp(response['retrievedAt'])
    text = response['excerpt']
    if digest(text.encode()) != response['excerptSha256']:
        raise ValueError('Excerpt digest mismatch')
    if not re.fullmatch('[0-9a-f]{64}', response['sourceSha256']) or not 0 < response['sourceBytes'] <= LIMIT:
        raise ValueError('Invalid full-response digest or size record')
    if re.search(r'[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}', text):
        raise ValueError('Contact footer must be omitted')
    return rows_from(text, case, DAY if daily else HOUR)


def verify(fixture):
    plan = load_plan()
    if any(fixture[k] != v for k, v in dict(source=SOURCE, clock='tt', frame=FRAME, redistribution=TERMS,
            samplePlan='references/horizons-sample-plan.json', samplePlanSha256=digest(PLAN.read_bytes())).items()):
        raise ValueError('Sample source or plan provenance mismatch')
    if [s['survey'] for s in fixture['surveys']] != plan['surveys']:
        raise ValueError('Survey list differs from the declared plan')
    cases = []
    for survey in fixture['surveys']:
        rows = check_response(survey['response'], survey_case(survey['survey']), daily=True)
        selected, absent = selected_cases(survey['survey'], rows, plan)
        if survey['absentFromDailySelection'] != absent:
            raise ValueError('Absent-direction record does not reproduce')
        cases.extend(selected)
    if [entry['case'] for entry in fixture['events']] != cases:
        raise ValueError('Hourly case selection does not reproduce from daily tables')
    for entry in fixture['events']:
        rows = check_response(entry['response'], entry['case'])
        if entry['reference'] != reduce_case(entry['case'], rows):
            raise ValueError('Hourly reference date or bracket does not reproduce')
    return fixture


def fetch(case, daily=False):
    params, url = request(case, daily)
    with urllib.request.urlopen(url, timeout=45) as response:
        raw = response.read(LIMIT + 1)
    if len(raw) > LIMIT:
        raise ValueError('Response exceeds size cap')
    text = excerpt(raw)
    result = dict(parameters=params, url=url, retrievedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                  sourceSha256=digest(raw), sourceBytes=len(raw), extraction=REDACTION,
                  excerpt=text, excerptSha256=digest(text.encode()))
    check_response(result, case, daily)
    return result


def acquire():
    plan, surveys, events = load_plan(), [], []
    for survey in plan['surveys']:
        case = survey_case(survey)
        response = fetch(case, daily=True)
        rows = check_response(response, case, daily=True)
        cases, absent = selected_cases(survey, rows, plan)
        surveys.append(dict(survey=survey, response=response, absentFromDailySelection=absent))
        for case in cases:
            response = fetch(case)
            reference = reduce_case(case, check_response(response, case))
            events.append(dict(case=case, response=response, reference=reference))
            print(case['id'], 'TT milliseconds', reference['atMs'], flush=True)
    fixture = dict(source=SOURCE, clock='tt', frame=FRAME, redistribution=TERMS,
                   samplePlan='references/horizons-sample-plan.json', samplePlanSha256=digest(PLAN.read_bytes()),
                   surveys=surveys, events=events)
    verify(fixture)
    output = json.dumps(fixture, indent=2) + '\n'
    if len(output.encode()) >= 2_000_000:
        raise ValueError('Sample fixture exceeds file cap')
    destination = ROOT / 'generated/horizons-sample.json'
    destination.parent.mkdir(exist_ok=True)
    destination.write_text(output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', type=Path)
    args = parser.parse_args()
    if args.verify:
        verify(json.loads(args.verify.read_text()))
        print('Horizons sample requests, excerpt digests, selection and dates verified')
    else:
        acquire()
