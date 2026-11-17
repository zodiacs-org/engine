#!/usr/bin/env python3
"""Build the draft L4 vectors (event times) from NASA's DE440s kernel. Never imports or calls the engine.

    python3 conformance/arbiters/l4/build.py --kernel path/to/de440s.bsp            # write
    python3 conformance/arbiters/l4/build.py --kernel path/to/de440s.bsp --check    # rebuild in memory, compare
    python3 conformance/arbiters/l4/build.py --verify-sources                       # digests of sources/l4 only

Design: drafts/0.3.0/DESIGN.md (committed before this file). Writes drafts/0.3.0/L4-events.json and, under
sources/l4/, solutions.json (every solved event with the longitudes an hour either side), horizons-requests.txt
(the Horizons cross-check requests, one URL a line) and SHA256SUMS. Reads, without the network, any Horizons
responses saved as sources/l4/horizons/*.txt and cross-checks every event against them.

The longitude is the apparent geocentric longitude in the IAU 2006/2000A true ecliptic and equinox of date,
reduced from DE440s as arbiters/l1/validate.py reduces it (light time, solar deflection, annual aberration,
pnm06a, true obliquity), here on arrays of instants; at every solved instant it is checked against
validate.py's own apparent() to within 0.01 mas. Needs numpy, jplephem and pyerfa.
"""
import argparse
import datetime
import hashlib
import json
import math
import os
import platform
import re
import sys
import urllib.parse
import warnings

import erfa
import jplephem
import numpy as np
from jplephem.spk import SPK

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))  # conformance/
sys.path.insert(0, os.path.join(ROOT, 'arbiters', 'l1'))
import validate as l1  # noqa: E402  (the L1 check's reduction, reused unchanged for the scalar comparison)

DRAFT = os.path.join(ROOT, 'drafts', '0.3.0')
OUT = os.path.join(DRAFT, 'L4-events.json')
SOURCES = os.path.join(ROOT, 'sources', 'l4')
SOLUTIONS = os.path.join(SOURCES, 'solutions.json')
REQUESTS = os.path.join(SOURCES, 'horizons-requests.txt')
SUMS = os.path.join(SOURCES, 'SHA256SUMS')
RESPONSES = os.path.join(SOURCES, 'horizons')
INGRESS_REF = os.path.normpath(os.path.join(
    ROOT, '..', 'docs', 'evidence', '1.1.0-rc.11-20261115', 'breaker', 'results', 'ingress-ref.json'))

KERNEL_SHA256 = 'c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2'
KERNEL_URL = l1.KERNEL_URL
HORIZONS_API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
ARBITER = 'l4-de440s-events'

DAY = 86400.0
HOUR = 3600.0
MJD0 = 2400000.5
J2000_MJD = 51544.5
C, AU = l1.C, l1.AU
TT_MINUS_UTC = 69.184           # TAI - UTC = 37 s (from 2017-01-01) plus TT - TAI = 32.184 s
TOLERANCE_HORIZONS = 0.45       # arcsec
LIMIT_YEAR = 2150               # events after 2150-01-01 TT are dropped; windows end there at the latest

BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']
STATION_BODIES = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']
YEARS = [1860, 1925, 1990, 2026, 2060, 2140]
UTC_YEARS = [2028, 2035, 2050, 2100, 2140]
HORIZONS_ID = {'Sun': '10', 'Moon': '301', 'Mercury': '199', 'Venus': '299', 'Mars': '4', 'Jupiter': '5',
               'Saturn': '6', 'Uranus': '7', 'Neptune': '8', 'Pluto': '9'}
SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn',
         'Aquarius', 'Pisces']
# NASA Five Millennium Canons (Espenak and Meeus, NASA/TP-2006-214141 for solar, NASA/TP-2009-214172 for lunar):
# (date of greatest eclipse, kind, phase sought).
ECLIPSES = [
    ((1860, 7, 18), 'total solar eclipse', 0),
    ((1919, 5, 29), 'total solar eclipse', 0),
    ((2026, 8, 12), 'total solar eclipse', 0),
    ((2000, 1, 21), 'total lunar eclipse', 180),
    ((2018, 7, 27), 'total lunar eclipse', 180),
    ((2025, 3, 14), 'total lunar eclipse', 180),
]
ECLIPSE_CANON = {
    0: 'Espenak and Meeus, Five Millennium Canon of Solar Eclipses: -1999 to +3000, NASA/TP-2006-214141 (2006)',
    180: 'Espenak and Meeus, Five Millennium Canon of Lunar Eclipses: -1999 to +3000, NASA/TP-2009-214172 (2009)',
}
ECLIPSE_LATITUDE_LIMIT = 1.6    # degrees


def seconds(year, month, day):
    """Seconds from J2000.0 (2000-01-01T12:00:00) of 00:00:00 on a calendar date, on whatever scale it is read."""
    djm0, djm = erfa.cal2jd(year, month, day)
    return float((djm - J2000_MJD) * DAY)


LIMIT = seconds(LIMIT_YEAR, 1, 1)
TABLE_START = seconds(1859, 12, 1)
TABLE_END = seconds(2150, 1, 20)


def iso(tt_s, scale='TT'):
    """A seconds-from-J2000.0 value as a calendar string to the millisecond (for notes)."""
    jd = MJD0 + J2000_MJD + tt_s / DAY
    y, m, d, f = erfa.jd2cal(MJD0, jd - MJD0)
    ms = int(round(float(f) * DAY * 1000))
    base = datetime.datetime(int(y), int(m), int(d)) + datetime.timedelta(milliseconds=ms)
    return base.strftime('%Y-%m-%dT%H:%M:%S.') + f'{base.microsecond // 1000:03d} {scale}'


def wrap(x):
    """Degrees reduced to (-180, 180]."""
    return -((-np.asarray(x, dtype=float) + 180.0) % 360.0 - 180.0)


def unwrap(x):
    x = np.asarray(x, dtype=float)
    if x.size < 2:
        return x.copy()
    return np.concatenate([x[:1], x[0] + np.cumsum(wrap(np.diff(x)))])


def ceil_s(x):
    """x rounded up to a whole second (with a guard of 1e-9 against representation error)."""
    return int(math.ceil(x - 1e-9))


# --------------------------------------------------------------------------------------------- the reduction


class Sky:
    """Apparent geocentric longitudes and latitudes from DE440s, on arrays of TT instants (seconds from J2000.0)."""

    def __init__(self, path):
        self.spk = SPK.open(path)
        self.kernel = l1.Kernel(path)   # the L1 check's own reader, for the scalar comparison

    def _pos(self, chain, t1, t2):
        return sum(self.spk[a, b].compute(t1, t2) for a, b in chain).T

    def _state(self, chain, t1, t2):
        pv = [self.spk[a, b].compute_and_differentiate(t1, t2) for a, b in chain]
        return sum(p for p, _ in pv).T, (sum(v for _, v in pv) / DAY).T

    def epoch(self, ts):
        ts = np.atleast_1d(np.asarray(ts, dtype=float))
        d1 = np.full(ts.shape, MJD0)
        d2 = J2000_MJD + ts / DAY
        t2 = d2 + erfa.dtdb(d1, d2, 0.0, 0.0, 0.0, 0.0) / DAY
        earth, earth_v = self._state(l1.EARTH, d1, t2)
        sun_now = self._pos(l1.SUN, d1, t2)
        eps = erfa.obl06(d1, d2) + erfa.nut06a(d1, d2)[1]
        rot = erfa.rxr(erfa.rx(eps, np.identity(3)), erfa.pnm06a(d1, d2))
        return {'d1': d1, 't2': t2, 'earth': earth, 'earth_v': earth_v, 'sun_now': sun_now, 'rot': rot}

    def apparent(self, body, ep):
        """(lon, lat) in degrees for each instant of an epoch()."""
        d1, t2, earth = ep['d1'], ep['t2'], ep['earth']
        chain = l1.TARGETS[body]
        tau = np.zeros(t2.shape)
        for _ in range(30):
            target = self._pos(chain, d1, t2 - tau)
            new_tau = np.linalg.norm(target - earth, axis=1) / C / DAY
            done = np.max(np.abs(new_tau - tau)) < 1e-14
            tau = new_tau
            if done:
                break
        else:
            raise SystemExit(f'{body}: light-time did not converge')
        target = self._pos(chain, d1, t2 - tau)
        geo = target - earth
        p = geo / np.linalg.norm(geo, axis=1)[:, None]
        sun_now = ep['sun_now']
        if body != 'Sun':
            back = np.clip(np.einsum('ij,ij->i', sun_now - earth, p) / C / DAY, 0.0, tau)
            sun = self._pos(l1.SUN, d1, t2 - back)
            q = target - sun
            q = q / np.linalg.norm(q, axis=1)[:, None]
            e = earth - sun
            em = np.linalg.norm(e, axis=1) / AU
            e = e / np.linalg.norm(e, axis=1)[:, None]
            p = erfa.ld(1.0, p, q, e, em, 1e-6 / np.maximum(em * em, 1.0))
        v = ep['earth_v'] / C
        p = erfa.ab(p, v, np.linalg.norm(earth - sun_now, axis=1) / AU, np.sqrt(1.0 - np.einsum('ij,ij->i', v, v)))
        lon, lat = erfa.c2s(erfa.rxp(ep['rot'], p))
        return np.degrees(erfa.anp(lon)), np.degrees(lat)

    def lon(self, body, ts):
        return self.apparent(body, self.epoch(ts))[0]

    def elongation(self, ts):
        ep = self.epoch(ts)
        return (self.apparent('Moon', ep)[0] - self.apparent('Sun', ep)[0]) % 360.0

    def check_scalar(self, body, tt_s):
        """Longitude difference from validate.py's apparent() at one instant, in mas.

        validate.py takes the instant as one Julian date, which holds it to about 40 microseconds; both sides
        are evaluated at the instant that Julian date represents."""
        jd = MJD0 + J2000_MJD + tt_s / DAY
        mine = float(self.lon(body, [(jd - MJD0 - J2000_MJD) * DAY])[0])
        theirs, _ = l1.apparent(self.kernel, body, jd)
        return float(wrap(mine - theirs)) * 3.6e6


# ------------------------------------------------------------------------------------------------ the search


class Quantity:
    """An angle that changes with time: a body's longitude, or the Moon's longitude minus the Sun's."""

    def __init__(self, sky, body=None):
        self.sky, self.body = sky, body
        self.name = body or 'Moon - Sun'

    def at(self, ts):
        ts = np.atleast_1d(np.asarray(ts, dtype=float))
        out = np.empty(ts.shape)
        for start in range(0, ts.size, 20000):
            chunk = ts[start:start + 20000]
            out[start:start + 20000] = self.sky.lon(self.body, chunk) if self.body else self.sky.elongation(chunk)
        return out


class Table:
    """A quantity sampled once a day from 1859-12-01 to 2150-01-20 TT, used only to find where to sample hourly."""

    def __init__(self, quantity):
        self.t = np.arange(TABLE_START, TABLE_END + 1.0, DAY)
        self.u = unwrap(quantity.at(self.t))
        d = np.diff(self.u)
        self.d = d

    def cells(self, a, b):
        i0 = max(int(np.searchsorted(self.t, a, side='right')) - 2, 1)
        i1 = min(int(np.searchsorted(self.t, b, side='left')) + 1, self.t.size - 2)
        return i0, i1


def candidate_intervals(table, a, b, level=None, station=False):
    """Intervals inside [a, b] that may hold a crossing of the level or a station, from the daily table.

    A daily cell is a candidate when the level's index changes across it, or when the daily motion changes
    direction in it or next to it (a station, near which a body can cross a level twice within a day). Each
    candidate is widened by two days either side; overlapping ones are merged."""
    i0, i1 = table.cells(a, b)
    idx = np.arange(i0, i1)
    sign = np.sign(table.d)
    turn = np.zeros(table.d.size, dtype=bool)
    turn[:-1] |= sign[:-1] != sign[1:]          # direction changes between cell j and cell j + 1
    hit = turn[idx] | turn[np.maximum(idx - 1, 0)]
    if level is not None:
        period, offset = level
        k = np.floor((table.u - offset) / period)
        hit |= k[idx] != k[idx + 1]
    out = []
    for i in idx[hit]:
        lo, hi = max(a, table.t[i] - 2 * DAY), min(b, table.t[i + 1] + 2 * DAY)
        if lo < hi:
            if out and lo <= out[-1][1]:
                out[-1][1] = max(out[-1][1], hi)
            else:
                out.append([lo, hi])
    return out


def grid(anchor, lo, hi, step):
    """Instants anchor + k step inside [lo, hi], with lo and hi themselves added."""
    k0, k1 = math.ceil((lo - anchor) / step), math.floor((hi - anchor) / step)
    ts = [anchor + k * step for k in range(k0, k1 + 1)]
    return np.array(sorted({lo, hi, *ts}))


def level_brackets(quantity, table, a, b, period, offset, step=HOUR, shift=0.0):
    """Every bracket (t0, t1, target) in (a, b] where the quantity crosses offset + n period, sampled at step
    (on a grid anchored shift seconds after a)."""
    found = []
    for lo, hi in candidate_intervals(table, a, b, level=(period, offset)):
        ts = grid(a + shift, lo, hi, step)
        u = unwrap(quantity.at(ts))
        idx = np.floor((u - offset) / period)
        for k in np.nonzero(idx[1:] != idx[:-1])[0]:
            target = (offset + period * max(idx[k], idx[k + 1])) % 360.0
            found.append((float(ts[k]), float(ts[k + 1]), float(target)))
    return [x for x in found if x[1] > a]


def rate(quantity, ts):
    """Central-difference rate over an hour either side, in degrees per second."""
    ts = np.atleast_1d(np.asarray(ts, dtype=float))
    return wrap(quantity.at(ts + HOUR) - quantity.at(ts - HOUR)) / (2 * HOUR)


def station_brackets(quantity, table, a, b, step=HOUR, shift=0.0):
    found = []
    for lo, hi in candidate_intervals(table, a, b, station=True):
        ts = grid(a + shift, lo, hi, step)
        r = rate(quantity, ts)
        for k in np.nonzero(np.sign(r[1:]) != np.sign(r[:-1]))[0]:
            found.append((float(ts[k]), float(ts[k + 1]), 'retrograde' if r[k] > 0 else 'direct'))
    return [x for x in found if x[1] > a]


def first(finder, start, end=TABLE_END):
    """The earliest bracket after start, searching forward in growing spans."""
    span = 40 * DAY
    lo = start
    while lo < end:
        hi = min(start + span, end)
        brackets = finder(start, hi)
        if brackets:
            return min(brackets, key=lambda x: x[0])
        lo, span = hi, span * 2
    return None


def bisect(f, t0, t1):
    """The root of f in [t0, t1], f changing sign there, to 1 ms; rounded to 1 ms."""
    f0 = f(t0)
    while t1 - t0 > 0.001:
        mid = 0.5 * (t0 + t1)
        fm = f(mid)
        if (fm > 0) == (f0 > 0):
            t0, f0 = mid, fm
        else:
            t1 = mid
    return round(0.5 * (t0 + t1), 3)


def solve_level(quantity, bracket):
    t0, t1, target = bracket
    return bisect(lambda t: float(wrap(quantity.at([t])[0] - target)), t0, t1)


def solve_station(quantity, bracket):
    t0, t1, _ = bracket
    return bisect(lambda t: float(rate(quantity, [t])[0]), t0, t1)


# --------------------------------------------------------------------------------------------------- events


class Builder:
    def __init__(self, sky):
        self.sky = sky
        self.quantities = {body: Quantity(sky, body) for body in BODIES}
        self.quantities['lunation'] = Quantity(sky, None)
        self.tables = {}

    def table(self, name):
        if name not in self.tables:
            self.tables[name] = Table(self.quantities[name])
        return self.tables[name]

    def finder(self, kind, name, target=None, step=HOUR, shift=0.0):
        q, tab = self.quantities[name], self.table(name)
        if kind == 'station':
            return lambda a, b: station_brackets(q, tab, a, b, step, shift)
        period, offset = (30.0, 0.0) if target is None else (360.0, target)
        return lambda a, b: level_brackets(q, tab, a, b, period, offset, step, shift)

    def solve(self, kind, name, bracket):
        q = self.quantities[name]
        return solve_station(q, bracket) if kind == 'station' else solve_level(q, bracket)

    def event(self, kind, name, after, target=None, before=None):
        """Solve the first event after `after`; set the window; run check (a); return a record."""
        hit = first(self.finder(kind, name, target), after, before or TABLE_END)
        if hit is None:
            return {'dropped': f'coverage: no event between {iso(after)} and {iso(TABLE_END)}, the end of the '
                               'search inside the kernel (which ends 2150-01-22)'}
        t = self.solve(kind, name, hit)
        if t > LIMIT:
            return {'dropped': f'coverage: the event falls at {iso(t)}, after {LIMIT_YEAR}-01-01 TT, near the end '
                               'of the kernel (2150-01-22)'}
        target_value = None if kind == 'station' else hit[2]
        direction = hit[2] if kind == 'station' else None
        # Check (a): the same event bracketed at half hour steps, on a grid a quarter hour off the hourly one,
        # so that its brackets are not halves of the hourly brackets.
        half = first(self.finder(kind, name, target, step=HOUR / 2, shift=HOUR / 4), after, before or TABLE_END)
        t_half = self.solve(kind, name, half)
        # The window's end: midway to the next time the same thing happens, or 2150-01-01 TT.
        if before is None:
            if kind == 'station':
                nxt = first(self.finder('station', name), t + HOUR)
            else:
                nxt = first(self.finder(kind, name, target_value), t + (DAY if name == 'lunation' else 60.0))
            t_next = self.solve(kind, name, nxt) if nxt else None
            before = LIMIT if t_next is None or t_next > LIMIT else float(round(0.5 * (t + t_next)))
        else:
            t_next = None
        # Exactly one event in the window.
        if kind == 'station':
            count = len(station_brackets(self.quantities[name], self.table(name), after, before))
        else:
            count = len(level_brackets(self.quantities[name], self.table(name), after, before, 360.0, target_value))
        if count != 1:
            raise SystemExit(f'{kind} {name} {iso(t)}: {count} events in the window')
        return {'t': t, 't_half': t_half, 'after': after, 'before': before, 'target': target_value,
                'direction': direction, 'next': t_next}

    def samples(self, name, t):
        """The quantity an hour before, at and an hour after t (degrees), and the body latitudes for notes."""
        ts = np.array([t - HOUR, t, t + HOUR])
        if name == 'lunation':
            ep = self.sky.epoch(ts)
            moon, moon_lat = self.sky.apparent('Moon', ep)
            sun, _ = self.sky.apparent('Sun', ep)
            return {'moon': [round(float(x), 10) for x in moon], 'sun': [round(float(x), 10) for x in sun],
                    'moonLatitude': round(float(moon_lat[1]), 6)}
        return {'lon': [round(float(x), 10) for x in self.quantities[name].at(ts)]}


def tolerance(kind, name, smp):
    """The tolerance rule of DESIGN.md, in whole seconds, from the recorded samples."""
    if name == 'lunation':
        l = [(m - s) for m, s in zip(smp['moon'], smp['sun'])]
    else:
        l = smp['lon']
    minus, zero, plus = (float(x) for x in l)
    if kind == 'event.station':
        acc = float(wrap(plus - zero) - wrap(zero - minus)) * 3600.0 / HOUR ** 2       # arcsec / s^2
        return max(60, ceil_s(math.sqrt(2.0 / abs(acc)))), acc
    r = float(wrap(plus - minus)) * 3600.0 / (2 * HOUR)                                # arcsec / s
    return max(1, ceil_s(1.0 / abs(r))), r


# ------------------------------------------------------------------------------------------------- Horizons


def horizons_url(command, jds):
    params = [
        ('format', 'text'), ('COMMAND', f"'{command}'"), ('OBJ_DATA', "'NO'"), ('MAKE_EPHEM', "'YES'"),
        ('EPHEM_TYPE', "'OBSERVER'"), ('CENTER', "'500@399'"), ('QUANTITIES', "'31'"), ('TIME_TYPE', "'TT'"),
        ('TLIST_TYPE', "'JD'"), ('TLIST', "'" + ' '.join(jds) + "'"), ('ANG_FORMAT', "'DEG'"),
        ('EXTRA_PREC', "'YES'"), ('APPARENT', "'AIRLESS'"), ('CSV_FORMAT', "'YES'"),
    ]
    return HORIZONS_API + '?' + '&'.join(f'{k}={urllib.parse.quote(v, safe="@")}' for k, v in params)


def jd_text(tt_s):
    return f'{MJD0 + J2000_MJD + tt_s / DAY:.9f}'


def horizons_needs(record):
    """(Horizons id, instant) pairs an event's cross-check needs."""
    t = record['tt_s']
    names = ['Moon', 'Sun'] if record['name'] == 'lunation' else [record['name']]
    return [(HORIZONS_ID[n], x) for n in names for x in (t - HOUR, t, t + HOUR)]


def horizons_requests(records, chunk=90):
    by_id = {}
    for record in records:
        for hid, t in horizons_needs(record):
            by_id.setdefault(hid, set()).add(jd_text(t))
    urls = []
    for hid in sorted(by_id, key=lambda x: int(x)):
        jds = sorted(by_id[hid], key=float)
        for i in range(0, len(jds), chunk):
            urls.append(horizons_url(hid, jds[i:i + chunk]))
    return urls


MONTHS = {m: i + 1 for i, m in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct',
                                          'Nov', 'Dec'])}
ROW = re.compile(r'^\s*(\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}\.\d+),[^,]*,[^,]*,\s*([-\d.]+),\s*([-\d.]+),')


def parse_horizons(text):
    """(Horizons id, [(tt_s, lon_deg, lat_deg)]) from one saved OBSERVER response, after checking its banner."""
    target = re.search(r'Target body name: .*?\((-?\d+)\)', text)
    if not target:
        raise ValueError('no target in the banner')
    for need in ('Center body name: Earth (399)', 'Atmos refraction: NO (AIRLESS)', 'Date__(TT)__'):
        if need not in text:
            raise ValueError(f'the banner lacks "{need}"')
    body = text.split('$$SOE', 1)[1].split('$$EOE', 1)[0]
    rows = []
    for line in body.splitlines():
        if not line.strip():
            continue
        m = ROW.match(line)
        if not m:
            raise ValueError(f'unreadable row: {line.strip()[:80]}')
        y, mon, d, hh, mm, ss, lon, lat = m.groups()
        tt_s = seconds(int(y), MONTHS[mon], int(d)) + int(hh) * HOUR + int(mm) * 60 + float(ss)
        rows.append((tt_s, float(lon), float(lat)))
    return target.group(1), rows


def read_responses():
    table = {}
    if not os.path.isdir(RESPONSES):
        return table
    for name in sorted(os.listdir(RESPONSES)):
        with open(os.path.join(RESPONSES, name), encoding='utf-8') as f:
            hid, rows = parse_horizons(f.read())
        for t, lon, lat in rows:
            table.setdefault(hid, []).append((t, lon, lat))
    return table


def horizons_lookup(table, hid, t):
    for tt, lon, _ in table.get(hid, []):
        if abs(tt - t) <= 0.0006:   # printed to the millisecond; TLIST sent to 1e-9 day
            return lon
    return None


def cross_check(record, table):
    """'pending' while any sample is missing, otherwise (passed, measure, text)."""
    names = ['Moon', 'Sun'] if record['name'] == 'lunation' else [record['name']]
    t = record['tt_s']
    got = {n: [horizons_lookup(table, HORIZONS_ID[n], x) for x in (t - HOUR, t, t + HOUR)] for n in names}
    if any(v is None for vs in got.values() for v in vs):
        return None
    if record['kind'] == 'event.station':
        minus, zero, plus = got[record['name']]
        r = float(wrap(plus - minus)) / (2 * HOUR)
        a = float(wrap(plus - zero) - wrap(zero - minus)) / HOUR ** 2
        shift = -r / a
        return abs(shift) <= record['tolerance'], shift, f'Horizons station {shift:+.0f} s from the solved instant'
    if record['name'] == 'lunation':
        dev = float(wrap(got['Moon'][1] - got['Sun'][1] - record['target'])) * 3600.0
    else:
        dev = float(wrap(got[record['name']][1] - record['target'])) * 3600.0
    return abs(dev) <= TOLERANCE_HORIZONS, dev, f'Horizons {dev:+.3f} arcsec from the target at the solved instant'


# ------------------------------------------------------------------------------------------------- the build


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    with open(path, 'rb') as f:
        return sha256_bytes(f.read())


def verify_sources():
    """Every file listed in SHA256SUMS matches its digest, and nothing in sources/l4 is unlisted."""
    problems = []
    if not os.path.exists(SUMS):
        return [f'{os.path.relpath(SUMS, ROOT)} is missing']
    listed = {}
    with open(SUMS, encoding='ascii') as f:
        for line in f:
            digest, name = line.rstrip('\n').split('  ', 1)
            listed[name] = digest
    for name, digest in listed.items():
        path = os.path.join(SOURCES, name)
        if not os.path.exists(path):
            problems.append(f'{name}: listed in SHA256SUMS but missing')
        elif sha256_file(path) != digest:
            problems.append(f'{name}: does not match its SHA-256 in SHA256SUMS')
    for name in source_files():
        if name not in listed:
            problems.append(f'{name}: not listed in SHA256SUMS')
    return problems


def source_files():
    out = []
    for dirpath, _, files in os.walk(SOURCES):
        for name in files:
            rel = os.path.relpath(os.path.join(dirpath, name), SOURCES).replace(os.sep, '/')
            if rel != 'SHA256SUMS':
                out.append(rel)
    return sorted(out)


def plan():
    """The events of DESIGN.md, in vector order: (id prefix, kind, name, after, target, before, extra)."""
    items = []
    for body in BODIES:
        for y in YEARS:
            items.append(('ING', 'event.ingress', body, seconds(y, 1, 1), None, None, {'year': y, 'scale': 'tt'}))
    for body in STATION_BODIES:
        for y in YEARS:
            items.append(('STA', 'event.station', body, seconds(y, 7, 1), None, None, {'year': y, 'scale': 'tt'}))
    for y in YEARS:
        for month in (3, 9):
            for phase in (0.0, 180.0):
                items.append(('LUN', 'event.lunation', 'lunation', seconds(y, month, 1), phase, None,
                              {'year': y, 'month': month, 'scale': 'tt'}))
    for date, what, phase in ECLIPSES:
        items.append(('LUN', 'event.lunation', 'lunation', seconds(*date) - 3 * DAY, float(phase), None,
                      {'eclipse': (date, what), 'scale': 'tt'}))
    for y in UTC_YEARS:
        start = seconds(y, 1, 1) + TT_MINUS_UTC
        items.append(('UTC', 'event.ingress', 'Sun', start, None, None, {'year': y, 'scale': 'utc'}))
        items.append(('UTC', 'event.ingress', 'Moon', start, None, None, {'year': y, 'scale': 'utc'}))
        items.append(('UTC', 'event.lunation', 'lunation', start, 0.0, None, {'year': y, 'month': 1, 'scale': 'utc'}))
        items.append(('UTC', 'event.lunation', 'lunation', start, 180.0, None,
                      {'year': y, 'month': 1, 'scale': 'utc'}))
    items.append(('ING', 'event.ingress', 'Sun', seconds(2026, 11, 1), 240.0, seconds(2026, 12, 1),
                  {'crossCheck': 'ingress-ref', 'scale': 'tt'}))
    return items


def build(sky):
    builder = Builder(sky)
    counters = {}
    records, dropped = [], []
    for prefix, kind, name, after, target, before, extra in plan():
        counters[prefix] = counters.get(prefix, 0) + 1
        vid = f'L4-{prefix}-{counters[prefix]:04d}'
        if kind == 'event.station':
            ev = builder.event('station', name, after, before=before)
        else:
            ev = builder.event('level', name, after, target=target, before=before)
        what = describe(kind, name, extra, target)
        if 'dropped' in ev:
            dropped.append({'id': vid, 'what': what, 'reason': ev['dropped']})
            continue
        smp = builder.samples(name, ev['t'])
        tol, motion = tolerance(kind, name, smp)
        record = {'id': vid, 'kind': kind, 'name': name, 'what': what, 'tt_s': ev['t'], 'after': ev['after'],
                  'before': ev['before'], 'target': ev['target'], 'direction': ev['direction'], 'samples': smp,
                  'tolerance': tol, 'motion': motion, 't_half': ev['t_half'], 'next': ev['next'], 'extra': extra}
        if abs(ev['t_half'] - ev['t']) > tol / 10:
            dropped.append({'id': vid, 'what': what, 'reason': f'check (a): the half hour bracket solves '
                                                              f'{ev["t_half"] - ev["t"]:+.3f} s away, over a tenth of '
                                                              f'the tolerance {tol} s'})
            continue
        if 'eclipse' in extra:
            (y, m, d), _ = extra['eclipse']
            days = (ev['t'] - seconds(y, m, d)) / DAY
            lat = smp['moonLatitude']
            if not (-3.0 <= math.floor(days) <= 3.0) or abs(lat) >= ECLIPSE_LATITUDE_LIMIT:
                dropped.append({'id': vid, 'what': what, 'reason': f'eclipse check: {days:+.2f} days from the listed '
                                                                  f'date, Moon latitude {lat:+.4f} deg'})
                continue
        records.append(record)
    return builder, records, dropped


def describe(kind, name, extra, target):
    scale = 'UTC' if extra.get('scale') == 'utc' else 'TT'
    if 'crossCheck' in extra:
        return 'the Sun\'s ingress into Sagittarius in November 2026 (cross-check with ingress-ref.json)'
    if 'eclipse' in extra:
        (y, m, d), what = extra['eclipse']
        phase = 'new Moon' if target == 0 else 'full Moon'
        return f'the {phase} of the {what} of {y:04d}-{m:02d}-{d:02d} ({ECLIPSE_CANON[int(target)]})'
    y = extra['year']
    if kind == 'event.ingress':
        return f'the first ingress of {name} after {y}-01-01 {scale}'
    if kind == 'event.station':
        return f'the first station of {name} after {y}-07-01 TT'
    return f'the first {"new" if target == 0 else "full"} Moon after {y}-{extra["month"]:02d}-01 {scale}'


def vector(record):
    utc = record['extra'].get('scale') == 'utc'
    shift = -TT_MINUS_UTC if utc else 0.0
    key = 'utc' if utc else 'tt'
    after = round(record['after'] + shift, 3)
    before = round(record['before'] + shift, 3)
    t = round(record['tt_s'] + shift, 3)
    if record['kind'] == 'event.ingress':
        inp = {'body': record['name'], 'longitude_deg': int(round(record['target']))}
    elif record['kind'] == 'event.station':
        inp = {'body': record['name']}
    else:
        inp = {'phase_deg': int(round(record['target']))}
    inp[f'after_{key}_s'] = after
    inp[f'before_{key}_s'] = before
    expected = {f'{key}_s': t}
    tol = {f'{key}_s': {'abs': record['tolerance'], 'unit': 's'}}
    if record['kind'] == 'event.station':
        expected['direction'] = record['direction']
        tol['direction'] = {'exact': True}
    when = iso(record['tt_s'] + shift, 'UTC' if utc else 'TT')
    if record['kind'] == 'event.ingress':
        lon = int(round(record['target'])) % 360
        moving = 'retrograde' if record['motion'] < 0 else 'direct'
        sign = SIGNS[lon // 30] if record['motion'] > 0 else SIGNS[(lon // 30 - 1) % 12]
        note = f'{record["what"]}: {record["name"]} enters {sign} ({lon} deg, {moving}) at {when}.'
    elif record['kind'] == 'event.station':
        note = f'{record["what"]}: {record["name"]} stations {record["direction"]} at {when}.'
    else:
        note = f'{record["what"]}: at {when}.'
    out = {'id': record['id'], 'kind': record['kind'], 'input': inp, 'expected': expected, 'tolerance': tol,
           'arbiter': ARBITER, 'note': note}
    tags = []
    if utc:
        tags.append('utc-input')
    if 'eclipse' in record['extra']:
        tags.append('eclipse')
    if 'crossCheck' in record['extra']:
        tags.append('cross-check')
    if tags:
        out['tags'] = tags
    return out


def solutions_doc(records, dropped):
    return {
        'what': 'Every event of the draft L4 vectors as the generator solved it from DE440s: the instant (seconds of '
                'TT from J2000.0, to 1 ms), the same solve bracketed at half hour steps (check a), the window, and '
                'the apparent geocentric longitudes of date (degrees, IAU 2006/2000A true ecliptic) an hour before, '
                'at and an hour after the instant, from which the tolerance is computed',
        'kernel': {'file': 'de440s.bsp', 'url': KERNEL_URL, 'sha256': KERNEL_SHA256},
        'events': [{
            'id': r['id'], 'kind': r['kind'], 'quantity': r['name'] if r['name'] != 'lunation' else 'Moon - Sun',
            'tt_s': r['tt_s'], 'tt': iso(r['tt_s']), 'halfHourBracket_tt_s': r['t_half'],
            'after_tt_s': r['after'], 'before_tt_s': r['before'], 'nextOccurrence_tt_s': r['next'],
            'target_deg': r['target'], 'direction': r['direction'], 'samples': r['samples'],
            'motion': {'value': round(r['motion'], 12),
                       'unit': 'arcsec/s^2 (acceleration)' if r['kind'] == 'event.station' else 'arcsec/s (rate)'},
            'tolerance_s': r['tolerance'],
        } for r in records],
        'dropped': dropped,
    }


def property_check(sky, records):
    """For every ingress, the kernel's longitude at t - tol and t + tol lies on opposite sides of the target,
    each within 1.5 arcsec of it. Returns the largest offset in arcsec."""
    worst = 0.0
    for r in records:
        if r['kind'] != 'event.ingress':
            continue
        lo, hi = sky.lon(r['name'], [r['tt_s'] - r['tolerance'], r['tt_s'] + r['tolerance']])
        a, b = float(wrap(lo - r['target'])) * 3600, float(wrap(hi - r['target'])) * 3600
        if not (a * b < 0 and abs(a) <= 1.5 and abs(b) <= 1.5):
            raise SystemExit(f'{r["id"]}: property check fails ({a:+.3f}, {b:+.3f} arcsec)')
        worst = max(worst, abs(a), abs(b))
    return worst


def scalar_check(sky, records):
    worst = 0.0
    for r in records:
        bodies = ['Moon', 'Sun'] if r['name'] == 'lunation' else [r['name']]
        for body in bodies:
            worst = max(worst, abs(sky.check_scalar(body, r['tt_s'])))
    if worst > 0.01:
        raise SystemExit(f'the array reduction differs from validate.py\'s apparent() by {worst:.4f} mas')
    return worst


def document(records, dropped, checks, inputs):
    by_kind = {}
    for r in records:
        by_kind.setdefault(r['kind'], []).append(r['tolerance'])
    tol_text = '; '.join(f'{k}: {min(v)} s to {max(v)} s' for k, v in sorted(by_kind.items()))
    xc = checks['horizons']
    if xc['checked'] == 0:
        horizons_text = (
            f'Check (b), JPL Horizons (DE441), is pending: none of the {xc["needed"]} events has its Horizons '
            f'answers yet. The {xc["requests"]} requests are listed in sources/l4/horizons-requests.txt; until their '
            'responses are committed under sources/l4/horizons/ with their SHA-256 in sources/l4/SHA256SUMS, no '
            'vector is confirmed by Horizons.')
    else:
        horizons_text = (
            f'Check (b), JPL Horizons (DE441): {xc["checked"]} of {xc["needed"]} events checked against the saved '
            f'responses, {xc["failed"]} failed and were dropped; the largest longitude difference at an ingress or '
            f'lunation was {xc["worstArcsec"]:.3f} arcsec (limit {TOLERANCE_HORIZONS}), the largest station shift '
            f'{xc["worstStationS"]:.0f} s; {xc["needed"] - xc["checked"]} events are still pending.')
    return {
        'suite': 'zodiacs-conformance',
        'suiteVersion': '0.3.0-draft',
        'level': 'L4',
        'title': 'Event times (draft)',
        'draft': 'A draft level, not part of any released suite version: the harness does not run it, and releasing '
                 'it is the owner\'s decision. Design: drafts/0.3.0/DESIGN.md. Instants are seconds from J2000.0 '
                 '(tt_s: of TT from JD 2451545.0 TT; utc_s: of UTC from 2000-01-01T12:00:00 UTC, counted on the UTC '
                 'calendar). In the UTC set, UTC is TT - 69.184 s (TAI - UTC = 37 s, as from 2017-01-01, plus 32.184 s).',
        'arbiters': {
            ARBITER: {
                'name': 'NASA JPL DE440s reduced to apparent geocentric longitudes in the IAU 2006/2000A true '
                        'ecliptic and equinox of date, with event instants solved by bisection',
                'source': f'The NAIF kernel de440s.bsp ({KERNEL_URL}, SHA-256 {KERNEL_SHA256}), not committed; ERFA '
                          'through pyerfa; jplephem. The reduction is that of arbiters/l1/validate.py (light time, '
                          'deflection by the Sun, annual aberration, pnm06a, true obliquity), with Mars to Pluto as '
                          'their system barycentres (NAIF 4 to 9). Cross-check: JPL Horizons (DE441), observer '
                          'quantity 31, requests in sources/l4/horizons-requests.txt.',
                'inputs': inputs,
                'method': (
                    'For each event of DESIGN.md the generator samples the quantity (a body\'s longitude, the Moon\'s '
                    'longitude minus the Sun\'s, or the longitude\'s rate as a central difference over an hour either '
                    'side) at 1 hour steps from the window\'s start, after a daily table has shown where to look, and '
                    'solves the first crossing by bisection to 1 ms. The window ends midway to the next time the same '
                    'thing happens (or at 2150-01-01 TT), and holds exactly one event. Tolerance: for an ingress or a '
                    'lunation, max(1 s, 1 arcsec / |rate|) rounded up to a whole second, the rate from the longitudes '
                    'an hour either side; for a station, max(60 s, sqrt(2 x 1 arcsec / |acceleration|)) rounded up, '
                    'the acceleration from the longitudes an hour before, at and an hour after. Every solved instant, '
                    'its window and those longitudes are in sources/l4/solutions.json.'),
                'generator': 'arbiters/l4/build.py',
                'uncertainty': (
                    f'Tolerances by kind: {tol_text}. Check (a): every solve repeated with half hour brackets agrees '
                    f'within {checks["halfHourWorstS"]:.3f} s, at most {checks["halfHourWorstRatio"]:.4f} of its '
                    f'tolerance (limit 0.1). The array reduction agrees with validate.py\'s apparent() at every '
                    f'solved instant within {checks["scalarWorstMas"]:.6f} mas. Property: at t - tolerance and t + '
                    f'tolerance every ingress lies on opposite sides of its target, at most '
                    f'{checks["propertyWorstArcsec"]:.3f} arcsec from it (limit 1.5). Vector '
                    f'{checks["ingressRef"]["id"]} solves {checks["ingressRef"]["differenceS"]:+.4f} s from the '
                    'independent de440.bsp reduction in docs/evidence/1.1.0-rc.11-20261115/breaker/results/'
                    'ingress-ref.json (limit 1 s). ' + horizons_text),
            },
        },
        'dropped': dropped,
        'vectors': [vector(r) for r in records],
    }


def run(kernel_path):
    digest = sha256_file(kernel_path)
    if digest != KERNEL_SHA256:
        raise SystemExit(f'{kernel_path}: sha256 {digest}, expected {KERNEL_SHA256}')
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', erfa.ErfaWarning)
        for y in UTC_YEARS:
            if erfa.dat(y, 1, 1, 0.0) != 37.0:
                raise SystemExit(f'ERFA dat gives TAI - UTC {erfa.dat(y, 1, 1, 0.0)} s for {y}, not 37 s')
    sky = Sky(kernel_path)
    builder, records, dropped = build(sky)
    # Vector 141 against the independent de440.bsp reduction.
    with open(INGRESS_REF, encoding='utf-8') as f:
        ref = json.load(f)
    ref_t = (ref['jdTt'] - MJD0 - J2000_MJD) * DAY
    vref = next(r for r in records if r['extra'].get('crossCheck') == 'ingress-ref')
    ref_diff = vref['tt_s'] - ref_t
    if abs(ref_diff) > 1.0:
        raise SystemExit(f'{vref["id"]} solves {ref_diff:+.3f} s from ingress-ref.json')
    # Horizons cross-check from saved responses, if any.
    responses = read_responses()
    xc = {'needed': len(records), 'checked': 0, 'failed': 0, 'worstArcsec': 0.0, 'worstStationS': 0.0}
    kept = []
    for r in records:
        result = cross_check(r, responses)
        if result is None:
            kept.append(r)
            continue
        ok, measure, text = result
        xc['checked'] += 1
        if r['kind'] == 'event.station':
            xc['worstStationS'] = max(xc['worstStationS'], abs(measure))
        else:
            xc['worstArcsec'] = max(xc['worstArcsec'], abs(measure))
        if ok:
            kept.append(r)
        else:
            xc['failed'] += 1
            dropped.append({'id': r['id'], 'what': r['what'], 'reason': f'check (b): {text}'})
    records = kept
    dropped.sort(key=lambda d: d['id'])
    urls = horizons_requests(records)
    xc['requests'] = len(urls)
    checks = {
        'halfHourWorstS': max(abs(r['t_half'] - r['tt_s']) for r in records),
        'halfHourWorstRatio': max(abs(r['t_half'] - r['tt_s']) / r['tolerance'] for r in records),
        'scalarWorstMas': scalar_check(sky, records),
        'propertyWorstArcsec': property_check(sky, records),
        'ingressRef': {'id': vref['id'], 'differenceS': ref_diff},
        'horizons': xc,
    }
    files = {}
    files['solutions.json'] = (json.dumps(solutions_doc(records, dropped), indent=2, ensure_ascii=True) + '\n').encode()
    files['horizons-requests.txt'] = ('\n'.join(urls) + '\n').encode()
    inputs = [{'path': f'sources/l4/{name}', 'sha256': sha256_bytes(data)} for name, data in sorted(files.items())]
    inputs += [{'path': f'sources/l4/horizons/{name}', 'sha256': sha256_file(os.path.join(RESPONSES, name))}
               for name in (sorted(os.listdir(RESPONSES)) if os.path.isdir(RESPONSES) else [])]
    inputs.append({'url': KERNEL_URL, 'sha256': KERNEL_SHA256})
    doc = document(records, dropped, checks, inputs)
    out = (json.dumps(doc, indent=2, ensure_ascii=True) + '\n').encode()
    sums = dict(files)
    for name in source_files():
        if name.startswith('horizons/'):
            with open(os.path.join(SOURCES, name), 'rb') as f:
                sums[name] = f.read()
    sums_text = ''.join(f'{sha256_bytes(data)}  {name}\n' for name, data in sorted(sums.items())).encode()
    summary = {
        'vectors': len(records), 'dropped': len(dropped), 'checks': checks,
        'software': {'python': platform.python_version(), 'numpy': np.__version__, 'pyerfa': erfa.__version__,
                     'erfa': erfa.version.erfa_version, 'jplephem': jplephem.__version__},
    }
    return {OUT: out, os.path.join(SOURCES, 'solutions.json'): files['solutions.json'],
            REQUESTS: files['horizons-requests.txt'], SUMS: sums_text}, summary


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--kernel', help='path to de440s.bsp')
    parser.add_argument('--check', action='store_true', help='rebuild in memory and compare with the committed files')
    parser.add_argument('--verify-sources', action='store_true', help='check sources/l4 against SHA256SUMS only')
    args = parser.parse_args()
    if args.verify_sources:
        problems = verify_sources()
        for p in problems:
            print(p, file=sys.stderr)
        sys.exit(1 if problems else 0)
    if not args.kernel:
        parser.error('--kernel is required')
    if args.check:
        problems = verify_sources()
        if problems:
            for p in problems:
                print(p, file=sys.stderr)
            sys.exit(1)
    outputs, summary = run(args.kernel)
    if args.check:
        differ = []
        for path, data in outputs.items():
            if not os.path.exists(path):
                differ.append(f'{os.path.relpath(path, ROOT)} is missing')
                continue
            with open(path, 'rb') as f:
                if f.read() != data:
                    differ.append(f'{os.path.relpath(path, ROOT)} differs from its rebuild')
        if differ:
            for d in differ:
                print(d, file=sys.stderr)
            sys.exit(1)
        print(f'rebuilt byte for byte: {", ".join(os.path.relpath(p, ROOT) for p in outputs)}')
    else:
        os.makedirs(SOURCES, exist_ok=True)
        for path, data in outputs.items():
            with open(path, 'wb') as f:
                f.write(data)
            print(f'wrote {os.path.relpath(path, ROOT)}, sha256 {sha256_bytes(data)}')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
