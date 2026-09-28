#!/usr/bin/env python3
"""Conformance adapter for Swiss Ephemeris through pyswisseph (../SPEC.md).

Swiss Ephemeris is measured here as an instrument, like any other engine; it
is never a vector's arbiter. Every response carries the flags Swiss returned,
so a reader can see which ephemeris actually answered (a missing .se1 file
makes Swiss fall back to its Moshier theory and say so in these flags).

    SE_EPHE_PATH=/path/to/ephe python3 conformance/adapters/pyswisseph.py

Requires pyswisseph (pip install pyswisseph) and, for SEFLG_SWIEPH, the
ephemeris files sepl_18.se1 and semo_18.se1 in SE_EPHE_PATH. Its results are
published as verdicts and statistics only (harness --values none).
"""
import hashlib
import json
import os
import re
import sys

import swisseph as swe

EPHE_PATH = os.environ.get('SE_EPHE_PATH', '')
swe.set_ephe_path(EPHE_PATH)

BODIES = {'Sun': swe.SUN, 'Moon': swe.MOON, 'Mercury': swe.MERCURY, 'Venus': swe.VENUS, 'Mars': swe.MARS,
          'Jupiter': swe.JUPITER, 'Saturn': swe.SATURN, 'Uranus': swe.URANUS, 'Neptune': swe.NEPTUNE, 'Pluto': swe.PLUTO}
SYSTEMS = {'placidus': b'P', 'koch': b'K', 'regiomontanus': b'R', 'campanus': b'C', 'porphyry': b'O',
           'alcabitius': b'B', 'equal': b'A', 'whole-sign': b'W', 'morinus': b'M', 'meridian': b'X',
           'topocentric': b'T', 'vehlow': b'V', 'equal-mc': b'D'}
CALENDARS = {'gregorian': swe.GREG_CAL, 'julian': swe.JUL_CAL}
FLAG_NAMES = [(1, 'JPLEPH'), (2, 'SWIEPH'), (4, 'MOSEPH'), (8, 'HELCTR'), (16, 'TRUEPOS'), (32, 'J2000'),
              (64, 'NONUT'), (256, 'SPEED'), (512, 'NOGDEFL'), (1024, 'NOABERR'), (2048, 'EQUATORIAL'),
              (16384, 'BARYCTR'), (32768, 'TOPOCTR'), (65536, 'SIDEREAL'), (131072, 'ICRS')]
FLAGS = swe.FLG_SWIEPH


def flag_names(value):
    return [name for bit, name in FLAG_NAMES if value & bit]


def position(inp):
    values, returned = swe.calc(inp['jd_tt'], BODIES[inp['body']], FLAGS)
    return {'output': {'lon': values[0], 'lat': values[1]}, 'meta': {'retflags': returned, 'flags': flag_names(returned)}}


def houses(inp, system):
    cusps, ascmc, _, _ = swe.houses_ex2(inp['jd_ut1'], inp['lat'], inp['lon'], system, FLAGS)
    return cusps, ascmc


def asc_mc(inp):
    _, ascmc = houses(inp, b'O')
    return {'output': {'asc': ascmc[0], 'mc': ascmc[1]}}


def vertex_east_point(inp):
    _, ascmc = houses(inp, b'O')
    return {'output': {'vertex': ascmc[3], 'east_point': ascmc[4]}}


def cusps(inp):
    try:
        values, _ = houses(inp, SYSTEMS[inp['system']])
    except swe.Error as error:
        if 'polar circle' in str(error):
            return {'output': {'status': 'undefined'}, 'meta': {'message': str(error)}}
        raise
    return {'output': {'cusps': list(values[:12])}}


UTC = re.compile(r'^(-?\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)Z$')


def tt_minus_utc(inp):
    match = UTC.match(inp['utc'])
    if not match:
        return {'error': 'unreadable utc'}
    y, m, d, hh, mm = (int(part) for part in match.groups()[:5])
    ss = float(match.group(6))
    jd_tt, _ = swe.utc_to_jd(y, m, d, hh, mm, ss, swe.GREG_CAL)
    civil = swe.julday(y, m, d, hh + mm / 60 + ss / 3600, swe.GREG_CAL)
    return {'output': {'tt_minus_utc_s': (jd_tt - civil) * 86400}, 'meta': {'note': 'utc_to_jd TT minus julday of the same civil reading'}}


def delta_t(inp):
    return {'output': {'delta_t_s': swe.deltat_ex(inp['jd_ut1'], FLAGS) * 86400}}


def to_jdn(inp):
    jd = swe.julday(inp['year'], inp['month'], inp['day'], 12.0, CALENDARS[inp['calendar']])
    return {'output': {'jdn': int(jd)}} if jd == int(jd) else {'error': f'julday at noon gave {jd}'}


def from_jdn(inp):
    year, month, day, _ = swe.revjul(float(inp['jdn']), CALENDARS[inp['calendar']])
    return {'output': {'year': year, 'month': month, 'day': day}}


HANDLERS = {
    'position.apparent.ecliptic-true-of-date': position,
    'angles.asc-mc': asc_mc,
    'angles.vertex-east-point': vertex_east_point,
    'houses.cusps': cusps,
    'time.zone-offset': lambda inp: {'unsupported': 'Swiss Ephemeris has no time zone database'},
    'time.local-mean-time': lambda inp: {'unsupported': 'Swiss Ephemeris takes a zone offset as input and has no local mean time function'},
    'time.tt-minus-utc': tt_minus_utc,
    'time.delta-t': delta_t,
    'calendar.to-jdn': to_jdn,
    'calendar.from-jdn': from_jdn,
}


def ephemeris_files():
    files = {}
    if EPHE_PATH and os.path.isdir(EPHE_PATH):
        for name in sorted(os.listdir(EPHE_PATH)):
            if name.endswith('.se1'):
                with open(os.path.join(EPHE_PATH, name), 'rb') as handle:
                    files[name] = hashlib.sha256(handle.read()).hexdigest()
    return files


def main():
    handshake = {'adapter': {
        'name': 'pyswisseph',
        'version': '0.1.0',
        'engine': 'Swiss Ephemeris',
        'engineVersion': swe.version,
        'configuration': {
            'binding': f'pyswisseph {getattr(swe, "__version__", "unknown")}',
            'flags': 'SEFLG_SWIEPH: apparent geocentric positions in the true ecliptic and equinox of date',
            'ephemerisFiles': ephemeris_files(),
            'houses': 'houses_ex2 at the UT1 Julian date; a polar-circle error is reported as status undefined',
        },
    }}
    sys.stdout.write(json.dumps(handshake) + '\n')
    sys.stdout.flush()
    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        handler = HANDLERS.get(request['kind'])
        try:
            response = handler(request['input']) if handler else {'unsupported': f"unknown kind {request['kind']}"}
        except Exception as error:  # noqa: BLE001 - every failure is reported, not raised
            response = {'error': f'{type(error).__name__}: {error}'}
        sys.stdout.write(json.dumps({'id': request['id'], **response}) + '\n')
    sys.stdout.flush()


if __name__ == '__main__':
    main()
