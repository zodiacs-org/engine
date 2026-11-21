#!/usr/bin/env python3
"""Conformance adapter for Skyfield with NAIF de440s.bsp (../SPEC.md).

Answers L1 apparent geocentric ecliptic positions of date using Skyfield's
public earth.at(t).observe(target).apparent().frame_latlon(ecliptic_frame).
Mars through Pluto use planetary system barycentres as the vectors specify.
All other levels and kinds are reported as unsupported.

    pip install -r conformance/adapters/requirements-skyfield.txt
    SKYFIELD_BSP=/path/to/de440s.bsp node conformance/harness/run.mjs \
      --adapter "python3 conformance/adapters/skyfield.py" \
      --out conformance/results/skyfield.json
"""
import hashlib
import json
import os
import sys

# Avoid shadowing the installed skyfield package with this script's filename.
_HERE = os.path.abspath(os.path.dirname(__file__))
sys.path = [p for p in sys.path if os.path.abspath(p or '.') != _HERE]

import skyfield
from skyfield.api import Loader, load_file
from skyfield.errors import EphemerisRangeError
from skyfield.framelib import ecliptic_frame

BSP_PATH = os.environ.get('SKYFIELD_BSP', 'de440s.bsp')
EXPECTED_DE440S_SHA256 = 'c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2'

BODIES = {
    'Sun': 'sun',
    'Moon': 'moon',
    'Mercury': 'mercury',
    'Venus': 'venus',
    'Mars': 'mars barycenter',
    'Jupiter': 'jupiter barycenter',
    'Saturn': 'saturn barycenter',
    'Uranus': 'uranus barycenter',
    'Neptune': 'neptune barycenter',
    'Pluto': 'pluto barycenter',
}


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    bsp_abs = os.path.abspath(BSP_PATH)
    if not os.path.isfile(bsp_abs):
        sys.stderr.write(f'skyfield adapter: BSP file not found at {bsp_abs}\n')
        sys.exit(2)
    bsp_digest = file_sha256(bsp_abs)
    if bsp_digest != EXPECTED_DE440S_SHA256:
        sys.exit(f'skyfield adapter: de440s.bsp SHA-256 mismatch (got {bsp_digest})')
    loader = Loader(os.path.dirname(bsp_abs), verbose=False)
    eph = load_file(bsp_abs)
    ts = loader.timescale(builtin=True)
    earth = eph['earth']
    targets = {name: eph[key] for name, key in BODIES.items()}

    def position(inp):
        if inp['body'] not in targets:
            return {'unsupported': f"no DE440s target for {inp['body']}"}
        t = ts.tt_jd(inp['jd_tt'])
        try:
            apparent = earth.at(t).observe(targets[inp['body']]).apparent()
        except EphemerisRangeError as error:
            return {'unsupported': str(error)}
        lat, lon, _ = apparent.frame_latlon(ecliptic_frame)
        return {'output': {'lon': lon.degrees % 360.0, 'lat': lat.degrees}}

    handlers = {
        'position.apparent.ecliptic-true-of-date': position,
        'angles.asc-mc': lambda _: {'unsupported': 'Skyfield has no astrology ascendant or midheaven function'},
        'angles.vertex-east-point': lambda _: {'unsupported': 'Skyfield has no vertex or east point function'},
        'houses.cusps': lambda _: {'unsupported': 'Skyfield has no house system functions'},
        'time.zone-offset': lambda _: {'unsupported': 'Skyfield has no time zone database'},
        'time.local-mean-time': lambda _: {'unsupported': 'Skyfield has no local mean time offset function'},
        'time.tt-minus-utc': lambda _: {'unsupported': 'Skyfield adapter is scoped to L1 positions'},
        'time.delta-t': lambda _: {'unsupported': 'Skyfield adapter is scoped to L1 positions'},
        'calendar.to-jdn': lambda _: {'unsupported': 'Skyfield adapter is scoped to L1 positions'},
        'calendar.from-jdn': lambda _: {'unsupported': 'Skyfield adapter is scoped to L1 positions'},
        'event.ingress': lambda _: {'unsupported': 'Skyfield adapter is scoped to L1 positions'},
        'event.station': lambda _: {'unsupported': 'Skyfield adapter is scoped to L1 positions'},
        'event.lunation': lambda _: {'unsupported': 'Skyfield adapter is scoped to L1 positions'},
    }

    handshake = {
        'adapter': {
            'name': 'skyfield',
            'version': '0.1.1',
            'engine': 'Skyfield',
            'engineVersion': skyfield.__version__,
            'configuration': {
                'licence': 'MIT',
                'ephemeris': os.path.basename(bsp_abs),
                'ephemerisSha256': bsp_digest,
                'frame': 'skyfield.framelib.ecliptic_frame (apparent geocentric true ecliptic and equinox of date)',
                'bodies': 'Sun, Moon, Mercury and Venus centres, Mars to Pluto system barycentres',
            },
        }
    }
    sys.stdout.write(json.dumps(handshake) + '\n')
    sys.stdout.flush()

    for line in sys.stdin:
        if not line.strip():
            continue
        request = json.loads(line)
        handler = handlers.get(request['kind'])
        try:
            response = handler(request['input']) if handler else {'unsupported': f"unknown kind {request['kind']}"}
        except Exception as error:  # noqa: BLE001 - report failures per SPEC.md
            response = {'error': f'{type(error).__name__}: {error}'}
        print(json.dumps({'id': request['id'], **response}), flush=True)


if __name__ == '__main__':
    main()
