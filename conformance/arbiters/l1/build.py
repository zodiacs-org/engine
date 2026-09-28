#!/usr/bin/env python3
"""Build vectors/L1-positions.json: the L1 (positions) vectors of the conformance suite.

The arbiter is NASA JPL Horizons (DE441): apparent geocentric ecliptic longitude
and latitude of date (QUANTITIES=31, airless, TT) for ten bodies at 24 instants,
with Mars to Pluto as their system barycentres, so that every target is DE441's.
Horizons gives them in its own "IAU76/80 ecliptic-of-date" frame, so each
direction is carried out of the eopJpl model of that frame, into ICRF, and on into
the IAU 2006/2000A true ecliptic and true equinox of date:

    v = R1(obl06 + deps06a) pnm06a [R1(obl80 + deps80 + deps) N80(dpsi80 + dpsi, deps80 + deps) P76]^T u

where u is Horizons's direction and dpsi, deps are the celestial-pole offsets that
the horizons-frame study recorded for the instant (sources/horizons-24/frame-offsets.json).
Horizons's body-centre files for Mars to Pluto are converted the same way, but only to
measure body centre minus barycentre for the uncertainty text; no expected value comes
from them.

    python3 conformance/arbiters/l1/build.py

Reads only conformance/sources/horizons-24/ and writes the same bytes on every run.
Needs pyerfa and numpy. It uses no Swiss Ephemeris and no code of any engine under test.
"""
import hashlib
import json
import math
import os
import re

import erfa
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))  # conformance/
SOURCES = os.path.join(ROOT, 'sources', 'horizons-24')
OUT = os.path.join(ROOT, 'vectors', 'L1-positions.json')

ARBITER = 'horizons-de441-iau2006'
KIND = 'position.apparent.ecliptic-true-of-date'
MJD0 = 2400000.5
MAS = math.pi / (180 * 3600 * 1000)

# (body, Horizons file, NAIF id of the target, ephemeris the banner names for the target), in vector order.
# Mars to Pluto are the planets' system barycentres. These ten files are also the study's own set.
BODIES = (
    ('Sun', 'Sun.txt', 10, 'DE441'),
    ('Moon', 'Moon.txt', 301, 'DE441'),
    ('Mercury', 'Mercury.txt', 199, 'DE441'),
    ('Venus', 'Venus.txt', 299, 'DE441'),
    ('Mars', 'MarsBary.txt', 4, 'DE441'),
    ('Jupiter', 'JupiterBary.txt', 5, 'DE441'),
    ('Saturn', 'SaturnBary.txt', 6, 'DE441'),
    ('Uranus', 'UranusBary.txt', 7, 'DE441'),
    ('Neptune', 'NeptuneBary.txt', 8, 'DE441'),
    ('Pluto', 'PlutoBary.txt', 9, 'DE441'),
)
# Horizons's body centres of the same planets, from the satellite solutions their banners name. Read only to
# measure body centre minus barycentre for the uncertainty text.
BODY_CENTRES = (
    ('Mars', 'Mars.txt', 499, 'mar099'),
    ('Jupiter', 'Jupiter.txt', 599, 'jup365_merged'),
    ('Saturn', 'Saturn.txt', 699, 'sat441l'),
    ('Uranus', 'Uranus.txt', 799, 'ura184_merged'),
    ('Neptune', 'Neptune.txt', 899, 'nep098_merged'),
    ('Pluto', 'Pluto.txt', 999, 'plu060_merged'),
)
CORPUS = 'corpus-tt.json'
OFFSETS = 'frame-offsets.json'
SELF_CHECK_LIMIT_ARCSEC = 0.0005
EOP_SPAN = ('1962-01-20', '2026-12-18')  # the data and prediction span of Horizons's EOP file

# FRAME_ACCEPTANCE and VALIDATION are copied from the output of arbiters/l1/validate.py (it needs the DE440s
# kernel, which is not a source); validate.py exits with status 1 if either no longer matches what it measures.
FRAME_ACCEPTANCE = (
    'In this suite the model\'s acceptance rests on validate.py\'s independent reduction from DE440s, not on '
    'Swiss: for the nine bodies other than the Moon it differs from the expected values by at most 2.82 mas in '
    'longitude and 0.22 mas in latitude, and at each instant their longitude differences agree to within 0.37 mas, '
    'so what the model leaves is a rotation common to all bodies.'
)
VALIDATION = (
    'Independent check: an apparent-place reduction from DE440s (arbiters/l1/validate.py with jplephem and '
    'pyerfa: light-time iteration, deflection by the Sun, annual aberration, pnm06a and the true obliquity; '
    'kernel de440s.bsp, sha256 c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2), with Mars to '
    'Pluto as the system barycentres 4 to 9 as in the vectors, differs from the 240 expected values by a median of '
    '1.27 mas in longitude and at most 0.95 mas in latitude. For the nine bodies other than the Moon the longitude '
    'differences agree at each instant to within 0.37 mas, so what is left is a rotation common to all of them, the '
    'frame model\'s remainder, at most 2.82 mas (1969-07-20); the Moon differs by up to 12.63 mas (1851-03-14). '
    'Evaluating at the TLIST value Horizons was sent (jd_tt to 8 decimals of a day) instead of at jd_tt moves no '
    'position by more than 0.28 mas. Per-body statistics are in arbiters/l1/validation.json.'
)
# Cited from the horizons-frame study's frame-free comparison (horizons-frame/vectors/results.json).
MOON = (
    'The Moon\'s larger difference comes from the ephemerides, not the arbiter: once the common rotation is taken '
    'out it follows, instant by instant, the horizons-frame study\'s frame-free comparison of geometric positions '
    '(horizons-frame/vectors/results.json), which puts DE440s\'s Moon 10.24 mas from DE441\'s at 1851-03-14 and '
    '8.60 mas at 2148-12-30.'
)


# --- Copied unchanged from decompose.py of the horizons-frame study (ZodiacsOfficial/site,
# docs/platform/evidence/engine-beyond-swiss/horizons-frame/decompose.py, commit 3f31ba17,
# sha256 cb22fedfcba6901508471ae3d77ed5088c40b77a4a99d52c8479e832d896e57b), so that the model of
# Horizons's frame is the one the study measured.

def to_ecliptic(eps):
    """Equatorial to ecliptic coordinates: R1(eps)."""
    return erfa.rx(eps, np.identity(3))


def old_equatorial(d1, d2, dpsi, deps, bias):
    """The 1976/1980 GCRS-to-true-equator matrix with nutation offsets (radians), and its true obliquity."""
    dpsi80, deps80 = erfa.nut80(d1, d2)
    epsa = erfa.obl80(d1, d2)
    matrix = erfa.numat(epsa, dpsi80 + dpsi, deps80 + deps) @ erfa.pmat76(d1, d2)
    if bias:
        matrix = matrix @ erfa.bp06(d1, d2)[0]
    return matrix, epsa + deps80 + deps


def old_ecliptic(d1, d2, dpsi=0.0, deps=0.0, bias=False):
    matrix, eps = old_equatorial(d1, d2, dpsi, deps, bias)
    return to_ecliptic(eps) @ matrix


def new_ecliptic(d1, d2):
    return to_ecliptic(erfa.obl06(d1, d2) + erfa.nut06a(d1, d2)[1]) @ erfa.pnm06a(d1, d2)


def unit(lon, lat):
    lon, lat = math.radians(lon), math.radians(lat)
    return np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])


def lonlat(v):
    return math.degrees(math.atan2(v[1], v[0])) % 360.0, math.degrees(math.asin(v[2] / np.linalg.norm(v)))


def wrap_arcsec(a, b):
    return ((a - b + 540.0) % 360.0 - 180.0) * 3600.0

# --- End of the copied functions.


def carry(jd_tt, offsets):
    """Out of the eopJpl model of Horizons's frame and into the IAU 2006/2000A true ecliptic of date.

    As decompose.py builds it for the eopJpl model: the offsets (milliarcseconds) are applied at the
    instant's own date, including where they are values held from 1962-01-20 or 2026-12-18.
    """
    d1, d2 = MJD0, jd_tt - MJD0
    old = old_ecliptic(d1, d2, offsets['dpsi'] * MAS, offsets['deps'] * MAS, False)
    return new_ecliptic(d1, d2) @ old.T


def convert(matrix, lon, lat):
    return lonlat(matrix @ unit(lon, lat))


def sha256(path):
    with open(path, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def read(name):
    with open(os.path.join(SOURCES, name), encoding='utf-8') as f:
        return f.read()


MONTHS = {m: i + 1 for i, m in enumerate(('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'))}


def banner(text, key):
    """The value of one 'key : value' line of a Horizons banner, without any {source: ...} note."""
    match = re.search(r'^' + re.escape(key) + r'\s*:\s*(.*?)\s*$', text, re.M)
    if not match:
        raise SystemExit(f'no "{key}" line in the banner')
    value, _, note = match.group(1).partition('{')
    return value.strip(), note.rstrip('}').strip()


def horizons(name, naif, ephemeris):
    """Check one Horizons file's banner; return its rows as (printed TT as a two-part JD, lon, lat)."""
    text = read(name)
    checks = {
        'API VERSION': ('1.2', ''),
        'Center body name': ('Earth (399)', None),
        'Center-site name': ('GEOCENTRIC', ''),
        'Atmos refraction': ('NO (AIRLESS)', ''),
        'Rel. light bend': ('Sun', None),
        'EOP file': ('eop.260922.p261219', ''),
    }
    for key, (value, note) in checks.items():
        got = banner(text, key)
        if got[0] != value or (note is not None and got[1] != note):
            raise SystemExit(f'{name}: banner "{key}" is {got}, expected {value}')
    target, source = banner(text, 'Target body name')
    if not target.endswith(f'({naif})') or source != f'source: {ephemeris}':
        raise SystemExit(f'{name}: target {target} {{{source}}}, expected NAIF {naif} from {ephemeris}')
    if not re.search(r'^Ephemeris / API_USER \w{3} Sep 22 [0-9:]{8} 2026 ', text, re.M):
        raise SystemExit(f'{name}: not the 2026-09-22 fetch')
    if ' Date__(TT)__HR:MN:SC.fff, , ,    ObsEcLon,   ObsEcLat,' not in text:
        raise SystemExit(f'{name}: not a TT QUANTITIES=31 table')
    rows = []
    block = text.split('$$SOE', 1)[1].split('$$EOE', 1)[0]
    for line in block.strip().splitlines():
        cells = [c.strip() for c in line.split(',')]
        when = re.fullmatch(r'(\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}\.\d{3})', cells[0])
        if not when or len(cells) != 6 or cells[5] != '':
            raise SystemExit(f'{name}: unexpected row {line!r}')
        y, mon, d, h, mi, s = when.groups()
        jd = erfa.dtf2d('TT', int(y), MONTHS[mon], int(d), int(h), int(mi), float(s))
        rows.append(((float(jd[0]), float(jd[1])), float(cells[3]), float(cells[4])))
    return rows


def load():
    """The corpus, the offsets and every Horizons file, cross-checked against each other."""
    raw = read(CORPUS)
    cases = json.loads(raw)['cases']
    # jd_tt goes into the vectors exactly as corpus-tt.json writes it.
    literals = re.findall(r'"jdTt":\s*([-+0-9.eE]+)', raw)
    if literals != [json.dumps(case['jdTt']) for case in cases]:
        raise SystemExit('corpus-tt.json: a jdTt does not survive a JSON round trip unchanged')
    offsets = json.loads(read(OFFSETS))['instants']
    if [(o['id'], o['utc']) for o in offsets] != [(c['id'], c['utc']) for c in cases]:
        raise SystemExit('frame-offsets.json and corpus-tt.json name different instants')
    files = {}
    worst_time = 0.0
    for _, name, naif, ephemeris in BODIES + BODY_CENTRES:
        rows = horizons(name, naif, ephemeris)
        if len(rows) != len(cases):
            raise SystemExit(f'{name}: {len(rows)} rows for {len(cases)} instants')
        for (jd, _, _), case in zip(rows, cases):
            # Horizons was sent the TLIST value jd_tt to 8 decimals and prints TT to the millisecond.
            tlist = float(f"{case['jdTt']:.8f}")
            off = ((jd[0] - MJD0) + jd[1] - (tlist - MJD0)) * 86400.0
            if abs(off) > 0.0006:
                raise SystemExit(f"{name} {case['id']}: printed TT is {off:.4f} s from the TLIST value")
            worst_time = max(worst_time, abs(off))
        files[name] = rows
    return cases, offsets, files, worst_time


def solve():
    """Every converted position, the self-check against results.json, and body centre minus barycentre."""
    cases, offsets, files, worst_time = load()
    converted = {}  # file name -> [(lon, lat)] in the IAU 2006/2000A true ecliptic of date
    misses = []
    for i, case in enumerate(cases):
        matrix = carry(case['jdTt'], offsets[i]['offsetsMas'])
        for name, rows in files.items():
            converted.setdefault(name, []).append(convert(matrix, rows[i][1], rows[i][2]))
        # The frame term, Horizons minus converted longitude, averaged over the vectors' ten files.
        terms = [wrap_arcsec(files[name][i][1], converted[name][i][0]) for _, name, _, _ in BODIES]
        misses.append((case['id'], sum(terms) / len(terms) - offsets[i]['frameTermMeanArcsec']))
    worst = max(misses, key=lambda row: abs(row[1]))
    if abs(worst[1]) >= SELF_CHECK_LIMIT_ARCSEC:
        raise SystemExit(f'frame-term self-check misses results.json by {worst[1]:+.6f} arcsec at {worst[0]}')
    self_check = {'worstId': worst[0], 'disagreementArcsec': abs(worst[1])}
    # Horizons's body centre minus its barycentre, arcsec, per instant.
    barycentre = {body: name for body, name, _, _ in BODIES}
    centre_offsets = {}
    for body, name, _, _ in BODY_CENTRES:
        pairs = list(zip(converted[name], converted[barycentre[body]]))
        dlon = [wrap_arcsec(c[0], b[0]) for c, b in pairs]
        dlat = [(c[1] - b[1]) * 3600.0 for c, b in pairs]
        at = max(range(len(cases)), key=lambda k: abs(dlon[k]))
        inside = [abs(d) for d, case in zip(dlon, cases) if EOP_SPAN[0] <= case['utc'][:10] <= EOP_SPAN[1]]
        centre_offsets[body] = {
            'lon': abs(dlon[at]), 'lonAt': cases[at]['utc'][:10], 'lat': max(abs(d) for d in dlat),
            'insideEopSpan': max(inside),
        }
    return cases, converted, self_check, centre_offsets, worst_time


def lon_out(lon):
    """A longitude rounded to 1e-10 degree, in [0, 360)."""
    lon = round(lon % 360.0, 10)
    return (lon - 360.0 if lon >= 360.0 else lon) + 0.0


def lat_out(lat):
    return round(lat, 10) + 0.0  # + 0.0 turns a rounded -0.0 into 0.0


def document(cases, converted, self_check, centre_offsets):
    c = centre_offsets
    u, n = c['Uranus'], c['Neptune']
    measured = ', '.join(f"{body} {c[body]['lon']:.4f}/{c[body]['lat']:.4f}" for body in ('Mars', 'Jupiter', 'Saturn', 'Pluto'))
    largest = max(max(c[body]['lon'], c[body]['lat']) for body in ('Mars', 'Jupiter', 'Saturn', 'Pluto'))
    barycentres = (
        'Barycentres: Mars to Pluto are the planets\' system barycentres from DE441 (NAIF 4 to 9), as every other '
        'target is DE441\'s. A planet\'s body centre differs from its barycentre by what its satellites do to it. '
        'Measured here as Horizons\'s body-centre files minus its barycentre files, both converted as above, that is at '
        f'most (longitude/latitude, arcsec) {measured} over these 24 instants, varying from instant to instant as '
        'the satellites move; for Uranus and Neptune the satellites\' pull is at most about 45 km and 74 km, under '
        '4 mas from the Earth. So an engine that returns body centres consistent with DE441 instead of barycentres '
        f'differs from these vectors by no more than {largest:.4f} arcsec. Horizons\'s body-centre files for Uranus '
        'and Neptune, which come from the satellite solutions ura184_merged and nep098_merged, depart from DE441\'s '
        f"barycentres by far more, up to {u['lon']:.4f}/{u['lat']:.4f} (Uranus) and {n['lon']:.4f}/{n['lat']:.4f} "
        f"(Neptune); the departure drifts with time, from at most {u['insideEopSpan']:.4f} and "
        f"{n['insideEopSpan']:.4f} arcsec between {EOP_SPAN[0][:4]} and {EOP_SPAN[1][:4]} to {u['lon']:.4f} arcsec "
        f"at {u['lonAt']} and {n['lon']:.4f} arcsec at {n['lonAt']}, and it is why the suite does not use them. "
        'DE440\'s barycentres agree with DE441\'s to within 3 mas (the check below).'
    )
    inputs = [CORPUS, OFFSETS] + [name for _, name, _, _ in BODIES + BODY_CENTRES]
    arbiter = {
        'name': 'NASA JPL Horizons (DE441) apparent geocentric ecliptic positions, carried into the '
                'IAU 2006/2000A true ecliptic and equinox of date',
        'source': (
            'NASA JPL Horizons API 1.2 (https://ssd.jpl.nasa.gov/api/horizons.api), fetched 2026-09-22: ephemeris '
            'DE441 for every target, with Mars to Pluto as their system barycentres (NAIF 4 to 9); EOP file '
            'eop.260922.p261219 (data 1962-01-20 to 2026-09-22, predictions to 2026-12-18). One request per target: '
            'EPHEM_TYPE OBSERVER, CENTER 500@399 (the geocentre), QUANTITIES 31 (observer ecliptic longitude and '
            'latitude of date of the apparent position: light-time, gravitational deflection by the Sun, stellar '
            'aberration), APPARENT AIRLESS, TIME_TYPE TT, TLIST_TYPE JD with the 24 jd_tt values to 8 decimals, '
            'ANG_FORMAT DEG, EXTRA_PREC YES, CSV_FORMAT YES. The responses are kept verbatim in '
            'sources/horizons-24/, byte for byte as committed in the zodiacs.org site repository '
            '(ZodiacsOfficial/site, docs/platform/evidence/engine-beyond-swiss/corpora/horizons-24/, commit '
            '3f31ba17), together with Horizons\'s body-centre files for Mars to Pluto (NAIF 499 to 999, from the '
            'satellite solutions mar099, jup365_merged, sat441l, ura184_merged, nep098_merged, plu060_merged), '
            'fetched the same way and used only for the body-centre measurement in the uncertainty. Plus the frame '
            'conversion: Horizons labels this frame IAU76/80 ecliptic-of-date, and the eopJpl model of it, with its '
            'per-instant celestial-pole offsets, is the horizons-frame study in the same repository '
            '(docs/platform/evidence/engine-beyond-swiss/horizons-frame/: decompose.py, results.json), the offsets '
            'copied into sources/horizons-24/frame-offsets.json.'
        ),
        'inputs': [{'path': f'sources/horizons-24/{name}', 'sha256': sha256(os.path.join(SOURCES, name))}
                   for name in inputs],
        'method': (
            'The instants are the 24 TT Julian dates of corpus-tt.json, from the engine audit\'s corpus preregistered '
            'on 2026-09-22 (instants stratified by epoch from 1851 to 2148, at non-round minutes). Those TT instants '
            'were originally chosen as UT plus Swiss Ephemeris\'s Delta T, which is why corpus-tt.json carries '
            'Swiss\'s Delta T (deltaTSeconds) as a label beside each instant. The vectors\' input is the TT itself '
            '(jd_tt, exactly corpus-tt.json\'s jdTt), so no expected value depends on that Delta T. Every target is '
            'DE441\'s: the Sun, Moon, '
            'Mercury and Venus as bodies (NAIF 10, 301, 199, 299) and Mars to Pluto as system barycentres (NAIF 4 to '
            '9). build.py checks every file\'s banner (target, geocentre, airless, EOP file, the 2026-09-22 fetch) '
            'and that every row\'s printed TT lies within 0.6 ms of the TLIST value sent for that instant. Each '
            'Horizons longitude and latitude is made a unit vector and carried out of the eopJpl model of Horizons\'s '
            'frame into ICRF by the transpose of R1(eps80 + deps80 + deps) N80(dpsi80 + dpsi, deps80 + deps) P76 '
            '(erfa.obl80, erfa.nut80, erfa.numat, erfa.pmat76; no frame bias; dpsi and deps the instant\'s offsets in '
            'frame-offsets.json), then into the IAU 2006/2000A true ecliptic and equinox of date by R1(obl06 + '
            'deps06a) pnm06a (erfa.obl06, erfa.nut06a, erfa.pnm06a), all at the vector\'s jd_tt, with the frame '
            'functions copied unchanged from the study\'s decompose.py. The longitude is reduced to [0, 360) and '
            'both angles are rounded to 1e-10 deg. Horizons\'s body-centre files for Mars to Pluto (NAIF 499 to 999) '
            'are converted the same way only to measure body centre minus barycentre for the uncertainty; no '
            'expected value comes from them. Self-check: over the same ten files the study used, the frame term '
            '(Horizons longitude minus converted longitude, averaged over the ten bodies) reproduces results.json\'s '
            'eopJpl.frameTermMeanArcsec, printed there to 4 decimals, at all 24 instants, the largest disagreement '
            f"being {self_check['disagreementArcsec']:.6f} arcsec; build.py stops at 0.0005 arcsec."
        ),
        'generator': 'arbiters/l1/build.py',
        'uncertainty': (
            'Frame model: the eopJpl model of Horizons\'s frame was first identified in the horizons-frame study, '
            'which compared four candidate models (bare, bias, eopJpl, eopIers) against Swiss Ephemeris 2.10.03\'s '
            'IAU 2006/2000A positions for these same 240 Horizons directions; there eopJpl left at most 5.45 mas in '
            'longitude (median 1.40 mas) and 1.86 mas in latitude (results.json summary.eopJpl). ' + FRAME_ACCEPTANCE
            + ' Print precision: Horizons prints 1e-7 deg (0.36 mas), so each angle it gives carries up to 0.18 mas '
            'of rounding; the 0.001 mas rounding of the recorded offsets is negligible. ' + barycentres + ' '
            + VALIDATION + ' ' + MOON
        ),
    }
    vectors = []
    planets = {body for body, _, _, _ in BODY_CENTRES}
    for i, case in enumerate(cases):
        for body, name, naif, _ in BODIES:
            lon, lat = converted[name][i]
            what = f' ({body} system barycentre)' if body in planets else ''
            vectors.append({
                'id': f'L1-POS-{len(vectors) + 1:04d}',
                'kind': KIND,
                'input': {'body': body, 'jd_tt': case['jdTt']},
                'expected': {'lon': lon_out(lon), 'lat': lat_out(lat)},
                'tolerance': {
                    'lon': {'abs': 1, 'unit': 'arcsec', 'wrap': 360},
                    'lat': {'abs': 1, 'unit': 'arcsec'},
                },
                'arbiter': ARBITER,
                'note': f"Horizons target {naif}{what}, corpus instant {case['id']}.",
            })
    return {
        'suite': 'zodiacs-conformance',
        'suiteVersion': '0.1.0',
        'level': 'L1',
        'title': 'Positions',
        'arbiters': {ARBITER: arbiter},
        'vectors': vectors,
    }


def main():
    cases, converted, self_check, centre_offsets, worst_time = solve()
    doc = document(cases, converted, self_check, centre_offsets)
    text = json.dumps(doc, indent=2, ensure_ascii=True) + '\n'
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='ascii', newline='\n') as f:
        f.write(text)
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {len(doc['vectors'])} vectors, "
          f"sha256 {hashlib.sha256(text.encode('ascii')).hexdigest()}")
    print(f'printed TT against the TLIST value: at most {worst_time * 1000:.3f} ms')
    print(f"frame-term self-check: largest disagreement {self_check['disagreementArcsec']:.6f} arcsec "
          f"at {self_check['worstId']}")
    for body, value in centre_offsets.items():
        print(f"{body}: body centre minus barycentre at most {value['lon']:.4f} arcsec in longitude "
              f"({value['lonAt']}), {value['lat']:.4f} arcsec in latitude; "
              f"{value['insideEopSpan']:.4f} arcsec in longitude within {EOP_SPAN[0]}..{EOP_SPAN[1]}")


if __name__ == '__main__':
    main()
