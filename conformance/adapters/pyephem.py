#!/usr/bin/env python3
"""Conformance adapter for PyEphem (../SPEC.md).

Calls ephem.delta_t() for TT minus UT1. PyEphem's geocentric apparent
positions are equatorial. ephem.Ecliptic uses mean obliquity of date.

    pip install -r conformance/adapters/requirements-pyephem.txt
    node conformance/harness/run.mjs \
      --adapter "python3 conformance/adapters/pyephem.py" \
      --out conformance/results/pyephem.json
"""
import json
import sys

import ephem

EPHEM_JD_EPOCH = 2415020.0


def delta_t(inp):
    d_ut = ephem.Date(inp['jd_ut1'] - EPHEM_JD_EPOCH)
    return {'output': {'delta_t_s': float(ephem.delta_t(d_ut))}}


HANDLERS = {
    'position.apparent.ecliptic-true-of-date': lambda _: {
        'unsupported': 'ephem.Ecliptic uses mean obliquity. L1 requires true obliquity of date.'
    },
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
    'event.lunation': lambda _: {'unsupported': 'PyEphem computes lunar phases using the same mean-obliquity ecliptic conversion. L4 specifies true-of-date longitudes.'},
}


def main():
    handshake = {
        'adapter': {
            'name': 'pyephem',
            'version': '0.1.1',
            'engine': 'PyEphem',
            'engineVersion': ephem.__version__,
            'configuration': {
                'licence': 'MIT',
                'theory': 'Built-in XEphem/libastro VSOP87 planetary theory and lunar theory',
                'deltaT': 'ephem.delta_t at the input UT1 Julian date',
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
        print(json.dumps({'id': request['id'], **response}), flush=True)


if __name__ == '__main__':
    main()
