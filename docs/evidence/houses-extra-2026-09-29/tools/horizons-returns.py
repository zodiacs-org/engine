"""Builds src/timing/fixtures/planetary-returns-horizons.json, gate R's
fixtures (PREREGISTRATION.md): for invented natal charts, the instants JPL
Horizons (DE441) puts each body back on its natal longitude, in a window.

    HORIZONS_CACHE=/some/scratch python3 tools/horizons-returns.py > src/timing/fixtures/planetary-returns-horizons.json

Every natal chart is invented: an instant and a place made up for the
fixture. For Mercury to Pluto the instant was chosen from Horizons's own
longitudes (tools/horizons-select.py) as one at which the body stood near
the middle degree of a retrograde loop that falls in the window, so that the
window holds a pass of three returns whose number cannot change within the
ephemeris error.

The natal longitude is Horizons's at the natal instant. The window is scanned
at a coarse step for sign changes of the longitude less the natal longitude;
around each, Horizons tabulates the longitude every hour for two days either
side (every five minutes for two hours, for the Moon), and the crossing is
the root of the 4-point Lagrange interpolant of the unwrapped difference,
bisected to a millisecond. Its speed is the interpolant's derivative there.
The four rows used are kept beside each crossing.
"""
import json
import sys
from datetime import datetime, timedelta, timezone

import horizons

U = timezone.utc

FIXTURES = [
    # body, natal instant (UTC), invented place (latitude, longitude), window
    ('Sun', '1987-02-14T03:21:00Z', (-33.4, 151.6), '2020-01-01T00:00:00Z', '2023-01-01T00:00:00Z'),
    ('Moon', '1994-07-09T18:47:00Z', (12.3, -61.7), '2024-03-01T00:00:00Z', '2024-06-20T00:00:00Z'),
    ('Mercury', '1995-04-09T12:04:00Z', (44.1, 26.2), '2031-02-15T00:00:00Z', '2031-06-15T00:00:00Z'),
    ('Venus', '1988-02-09T21:57:00Z', (-12.6, -38.4), '2032-12-15T00:00:00Z', '2033-06-30T00:00:00Z'),
    ('Mars', '1994-04-05T21:34:00Z', (35.2, 136.4), '2035-06-01T00:00:00Z', '2035-12-31T00:00:00Z'),
    ('Jupiter', '2025-10-26T23:39:00Z', (51.9, -8.3), '2037-08-01T00:00:00Z', '2038-07-31T00:00:00Z'),
    ('Saturn', '2010-10-08T05:10:00Z', (-1.3, 36.9), '2039-09-01T00:00:00Z', '2040-10-31T00:00:00Z'),
    ('Uranus', '1956-09-26T04:20:00Z', (60.4, 5.3), '2040-06-01T00:00:00Z', '2041-09-30T00:00:00Z'),
    ('Neptune', '1876-06-11T11:17:00Z', (19.4, -99.1), '2040-03-01T00:00:00Z', '2041-06-30T00:00:00Z'),
    ('Pluto', '1804-05-20T02:25:00Z', (-22.9, -43.2), '2050-02-01T00:00:00Z', '2051-05-31T00:00:00Z'),
]


def parse(stamp):
    return datetime.strptime(stamp, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=U)


def iso(dt):
    return dt.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def seam(a, b):
    return (a - b + 180) % 360 - 180


def lagrange(ts, ys, t):
    total = 0.0
    for i, (ti, yi) in enumerate(zip(ts, ys)):
        term = yi
        for j, tj in enumerate(ts):
            if j != i:
                term *= (t - tj) / (ti - tj)
        total += term
    return total


def crossing(rows, natal):
    """The root in a fine table (days from its first row), its speed, and the rows used."""
    base = rows[0][0]
    days = [(when - base).total_seconds() / 86400 for when, _ in rows]
    offsets = []
    for _, lon in rows:
        offset = seam(lon, natal)
        if offsets:  # unwrap against the previous row
            offset += 360 * round((offsets[-1] - offset) / 360)
        offsets.append(offset)
    for i in range(len(rows) - 1):
        if offsets[i] == 0 or offsets[i] * offsets[i + 1] < 0:
            lo = max(0, min(i - 1, len(rows) - 4))
            ts, ys = days[lo:lo + 4], offsets[lo:lo + 4]
            a, b = days[i], days[i + 1]
            fa = lagrange(ts, ys, a)
            while (b - a) * 86400000 > 0.5:
                m = (a + b) / 2
                fm = lagrange(ts, ys, m)
                if (fm > 0) == (fa > 0):
                    a, fa = m, fm
                else:
                    b = m
            root = (a + b) / 2
            h = 1e-4
            speed = (lagrange(ts, ys, root + h) - lagrange(ts, ys, root - h)) / (2 * h)
            used = [[iso(rows[k][0]), rows[k][1]] for k in range(lo, lo + 4)]
            return base + timedelta(days=root), speed, used
    raise RuntimeError('no sign change in the fine table')


out = []
headers = {}
for body, natal_at, place, start, stop in FIXTURES:
    natal_time = parse(natal_at)
    natal_rows, header, signature = horizons.query(body, natal_time, natal_time + timedelta(minutes=1), '1 m')
    assert natal_rows[0][0] == natal_time
    natal = natal_rows[0][1]
    headers[body] = [line.strip() for line in header.splitlines()
                     if line.startswith(('Target body name', 'Center body name', 'Rel. light bend', 'EOP file'))]
    fine_step, fine_half, coarse = ('5 m', timedelta(hours=2), '2 h') if body == 'Moon' else ('1 h', timedelta(days=2), '1 d')
    scan, _, _ = horizons.query(body, parse(start), parse(stop), coarse)
    crossings = []
    for (t0, l0), (t1, l1) in zip(scan, scan[1:]):
        a, b = seam(l0, natal), seam(l1, natal)
        if (a < 0 < b or b < 0 < a or b == 0) and abs(a) < 90 and abs(b) < 90:
            middle = t0 + (t1 - t0) / 2
            fine, _, _ = horizons.query(body, middle - fine_half, middle + fine_half, fine_step)
            at, speed, used = crossing(fine, natal)
            crossings.append({'at': iso(at), 'retrograde': speed < 0, 'speed': speed, 'rows': used})
    out.append({
        'body': body,
        'natal': {'utc': natal_at, 'latitude': place[0], 'longitude': place[1], 'horizonsLongitude': natal},
        'window': {'from': start, 'to': stop},
        'crossings': crossings,
    })

print(json.dumps({
    'source': 'JPL Horizons API 1.2 (https://ssd.jpl.nasa.gov/api/horizons.api), fetched ' +
              datetime.now(U).strftime('%Y-%m-%d') + ': EPHEM_TYPE OBSERVER, CENTER 500@399, QUANTITIES 31 '
              '(ObsEcLon, the apparent geocentric ecliptic longitude of date), TIME_TYPE UT (UTC from 1962, '
              'UT1 before), EXTRA_PREC YES; targets DE441 bodies (Sun 10, Moon 301, Mercury 199, Venus 299) and '
              'system barycentres (Mars to Pluto, 4 to 9).',
    'method': 'docs/evidence/houses-extra-2026-09-29/tools/horizons-returns.py',
    'banners': headers,
    'fixtures': out,
}, indent=1))
