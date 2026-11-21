#!/usr/bin/env python3
"""Conformance adapter for PyEphem (../SPEC.md).

Answers L1 apparent geocentric ecliptic positions of date using PyEphem's
built-in VSOP87 planetary theory and lunar theory (XEphem / libastro).
Converts TT Julian dates to PyEphem UT dates with ephem.delta_t(), computes
geocentric apparent right ascension and declination at epoch of date
(body.g_ra, body.g_dec), and transforms to ecliptic of date with PyEphem's
own ephem.Equatorial and ephem.Ecliptic classes. Also answers L3 time.delta-t
via ephem.delta_t(). All other kinds are reported as unsupported.

    pip install -r conformance/adapters/requirements-pyephem.txt
    node conformance/harness/run.mjs \
      --adapter "python3 conformance/adapters/pyephem.py" \
      --out conformance/results/pyephem.json
"""
import json
import math
import sys

import ephem

EPHEM_JD_EPOCH = 2415020.0

BODY_FACTORIES = {
    'Sun': ephem.Sun,
    'Moon': ephem.Moon,
    'Mercury': ephem.Mercury,
    'Venus': ephem.Venus,
    'Mars': ephem.Mars,
    'Jupiter': ephem.Jupiter,
    'Saturn': ephem.Saturn,
    'Uranus': ephem.Uranus,
    'Neptune': ephem.Neptune,
    'Pluto': ephem.Pluto,
}


def tt_jd_to_ephem_ut(jd_tt):
    # One fixed-point refinement using PyEphem's own delta_t(date) so
    # d_ut + delta_t(d_ut) / 86400 matches jd_tt.
    d_ut = ephem.Date(jd_tt - EPHEM_JD_EPOCH)
    for _ in range(2):
        dt = ephem.delta_t(d_ut)
        d_ut = ephem.Date(jd_tt - EPHEM_JD_EPOCH - dt / 86400.0)
    return d_ut


def position(inp):
    factory = BODY_FACTORIES.get(inp['body'])
    if factory is None:
        return {'unsupported': f"PyEphem has no body {inp['body']}"}
    d_ut = tt_jd_to_ephem_ut(inp['jd_tt'])
    body = factory()
    body.compute(d_ut, epoch=d_ut)
    eq = ephem.Equatorial(body.g_ra, body.g_dec, epoch=d_ut)
    ecl = ephem.Ecliptic(eq, epoch=d_ut)
    return {
        'output': {
            'lon': math.degrees(float(ecl.lon)) % 360.0,
            'lat': math.degrees(float(ecl.lat)),
        }
    }


def delta_t(inp):
    d_ut = ephem.Date(inp['jd_ut1'] - EPHEM_JD_EPOCH)
    return {'output': {'delta_t_s': float(ephem.delta_t(d_ut))}}


HANDLERS = {
    'position.apparent.ecliptic-true-of-date': position,
    'angles.asc-mc': lambda _: {'unsupported': 'PyEphem has no astrology ascendant or midheaven function'},
    'angles.vertex-east-point': lambda _: {'unsupported': 'PyEphem has no vertex or east point function'},
    'houses.cusps': lambda _: {'unsupported': 'PyEphem has no house system functions'},
    'time.zone-offset': lambda _: {'unsupported': 'PyEphem has no time zone database'},
    'time.local-mean-time': lambda _: {'unsupported': 'PyEphem has no local mean time offset function'},
    'time.tt-minus-utc': lambda _: {'unsupported': 'PyEphem has no leap-second table for TT minus UTC'},
    'time.delta-t': delta_t,
    'calendar.to-jdn': lambda _: {'unsupported': 'PyEphem has no proleptic Gregorian/Julian JDN integer calendar function'},
    'calendar.from-jdn': lambda _: {'unsupported': 'PyEphem has no proleptic Gregorian/Julian JDN integer calendar function'},
    'event.ingress': lambda _: {'unsupported': 'PyEphem has no zodiac sign ingress search function'},
    'event.station': lambda _: {'unsupported': 'PyEphem has no planetary station search function'},
    'event.lunation': lambda _: {'unsupported': 'PyEphem next_new_moon / next_full_moon return UT dates rather than TT instants'},
}


def main():
    handshake = {
        'adapter': {
            'name': 'pyephem',
            'version': '0.1.0',
            'engine': 'PyEphem',
            'engineVersion': ephem.__version__,
            'configuration': {
                'licence': 'MIT',
                'theory': 'Built-in XEphem/libastro VSOP87 planetary theory and lunar theory',
                'conversion': 'body.compute(d_ut, epoch=d_ut) -> ephem.Ecliptic(ephem.Equatorial(body.g_ra, body.g_dec, epoch=d_ut), epoch=d_ut)',
            },
        }
    }
    sys.stdout.write(json.dumps(handshake) + '\n')
    sys.stdout.flush()

    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        handler = HANDLERS.get(request['kind'])
        try:
            response = handler(request['input']) if handler else {'unsupported': f"unknown kind {request['kind']}"}
        except Exception as error:  # noqa: BLE001 - report failures per SPEC.md
            response = {'error': f'{type(error).__name__}: {error}'}
        sys.stdout.write(json.dumps({'id': request['id'], **response}) + '\n')
    sys.stdout.flush()


if __name__ == '__main__':
    main()
