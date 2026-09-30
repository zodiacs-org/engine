"""A small client for the JPL Horizons API: apparent geocentric ecliptic
longitudes of date (QUANTITIES 31, ObsEcLon) at the geocentre, times in UT.
Responses are cached under $HORIZONS_CACHE (default ./horizons-cache)."""
import hashlib
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
# DE441 targets: the Sun, Moon, Mercury and Venus as bodies, Mars to Pluto as
# system barycentres, as the conformance suite's L1 vectors take them.
TARGETS = {'Sun': '10', 'Moon': '301', 'Mercury': '199', 'Venus': '299', 'Mars': '4', 'Jupiter': '5',
           'Saturn': '6', 'Uranus': '7', 'Neptune': '8', 'Pluto': '9'}
CACHE = os.environ.get('HORIZONS_CACHE', 'horizons-cache')


def _stamp(dt):
    return dt.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]


def _parse_time(text):
    """Horizons prints HR:MN, HR:MN:SC or HR:MN:SC.fff, whichever the request's times need."""
    for pattern in ('%Y-%b-%d %H:%M:%S.%f', '%Y-%b-%d %H:%M:%S', '%Y-%b-%d %H:%M'):
        try:
            return datetime.strptime(text, pattern).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    raise ValueError(f'unreadable Horizons time {text!r}')


def query(body, start, stop, step):
    """[(datetime UTC, longitude)] from Horizons, start and stop inclusive."""
    params = {
        'format': 'json', 'COMMAND': f"'{TARGETS[body]}'", 'OBJ_DATA': "'NO'", 'MAKE_EPHEM': "'YES'",
        'EPHEM_TYPE': "'OBSERVER'", 'CENTER': "'500@399'", 'START_TIME': f"'{_stamp(start)}'",
        'STOP_TIME': f"'{_stamp(stop)}'", 'STEP_SIZE': f"'{step}'", 'QUANTITIES': "'31'", 'TIME_DIGITS': "'FRACSEC'",
        'EXTRA_PREC': "'YES'", 'CSV_FORMAT': "'YES'", 'CAL_FORMAT': "'CAL'", 'TIME_TYPE': "'UT'",
    }
    url = API + '?' + urllib.parse.urlencode(params)
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, hashlib.sha256(url.encode()).hexdigest()[:24] + '.json')
    if os.path.exists(path):
        payload = json.load(open(path))
    else:
        with urllib.request.urlopen(url, timeout=120) as response:
            payload = json.loads(response.read().decode())
        json.dump(payload, open(path, 'w'))
    text = payload['result']
    if '$$SOE' not in text:
        raise RuntimeError(text[:2000])
    header = text.split('$$SOE')[0]
    rows = []
    for line in text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines():
        cells = [cell.strip() for cell in line.split(',')]
        when = _parse_time(cells[0])
        rows.append((when, float(cells[3])))
    return rows, header, payload.get('signature', {})
