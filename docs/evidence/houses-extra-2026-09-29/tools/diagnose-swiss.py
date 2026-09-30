"""Diagnostics, not preregistered gates: why gate P's comparison with Swiss
Ephemeris fails where it does. Each check restates a definition in Python and
sets Swiss's result against it; only counts and statistics are printed.

    python3 tools/diagnose-swiss.py "$WORK/engine.jsonl" > results/diagnostics.json

1. Koch. For a body and a midheaven with semi-arcs, whether Swiss's refusals
   are exactly the bodies whose rising (east of the meridian) or setting
   (west) sidereal time lies outside the midheaven's diurnal semi-arc of the
   RAMC; and whether, for bodies or midheavens that never rise or set, Swiss's
   positions are those of Ludwig's semi-arcs (180 or 0 degrees).
2. Topocentric. How closely each side's position satisfies the definition's
   equation (the body on the circle of its position), for bodies that rise
   and set; and the difference at the cusps and between them.
3. Porphyry. Whether Swiss's positions are the exact positions of the body's
   longitude increased by 0.001 arcsecond.
"""
import json
import math
import subprocess
import sys

import swisseph as swe

D = math.pi / 180
R = 180 / math.pi


def seam(a, b):
    return (a - b + 180) % 360 - 180


def asin_c(v):
    return math.asin(max(-1.0, min(1.0, v))) * R


def semi_arc(a):
    return 180.0 if a >= 1 else 0.0 if a <= -1 else 90 + math.asin(a) * R


def equatorial(lon, lat, eps):
    l, b, e = lon * D, lat * D, eps * D
    x = math.cos(b) * math.cos(l)
    y = math.cos(b) * math.sin(l) * math.cos(e) - math.sin(b) * math.sin(e)
    z = math.cos(b) * math.sin(l) * math.sin(e) + math.sin(b) * math.cos(e)
    return math.degrees(math.atan2(y, x)) % 360, math.degrees(math.atan2(z, math.hypot(x, y)))


def swiss_position(ramc, lat, eps, lon, blat, code):
    try:
        value = swe.house_pos(ramc, lat, eps, (lon, blat), code)
    except swe.Error:
        return None
    return value if 1 <= value < 13 else None


def stats(values):
    values = sorted(values)
    n = len(values)
    if not n:
        return {'n': 0}
    return {'n': n, 'median': float(f'{values[n // 2]:.3g}'), 'p95': float(f'{values[min(n - 1, int(0.95 * n))]:.3g}'),
            'max': float(f'{values[-1]:.3g}')}


def topocentric_residual(md, dec, tphi, position):
    """The defining equation's residual, degrees of ascension, at a mundane position, east of the meridian."""
    if md >= 180:
        md, dec = md - 180, -dec
        position = (position - 180) % 360
    a = tphi * math.tan(dec * D)
    if position >= 270:
        s = (position - 270) / 90
        return md - 90 * s - asin_c(s * a)
    s = position / 90
    return md - 90 - 90 * s - asin_c((1 - s) * a)


koch = {}
koch_ludwig = {'matched': 0, 'unmatched': 0}
topo_residual = {'engine': [], 'swiss': []}
porphyry_nudged = []
porphyry_failing_quadrant = []
for line in open(sys.argv[1]):
    case = json.loads(line)
    ramc, lat, eps = case['ramc'], case['lat'], case['eps']
    tphi = math.tan(lat * D)
    a_mc = tphi * math.tan(eps * D) * math.sin(ramc * D)
    day = semi_arc(a_mc)
    ra_mc = ramc
    upper = lower = None
    for index, (lon, blat) in enumerate(case['bodies']):
        ra, dec = equatorial(lon, blat, eps)
        md = (ra - ramc) % 360
        a = tphi * math.tan(dec * D)
        # 1. Koch
        east = md < 180
        time = seam(ra - semi_arc(a) if east else ra + semi_arc(a), ramc)
        inside = day > 0 and abs(time) <= day
        swiss = swiss_position(ramc, lat, eps, lon, blat, b'K')
        circumpolar = abs(a) >= 1 or abs(a_mc) >= 1
        key = ('circumpolar body or midheaven' if circumpolar else 'body and midheaven rise and set',
               'inside the house circles' if inside else 'outside', 'Swiss defined' if swiss is not None else 'Swiss undefined')
        koch[key] = koch.get(key, 0) + 1
        if circumpolar and swiss is not None and inside:
            ludwig = ((0 if east else 180) + 90 * time / day) % 360
            koch_ludwig['matched' if abs(seam(ludwig, (swiss - 1) * 30)) * 3600 < 0.01 else 'unmatched'] += 1
        # 2. Topocentric, bodies that rise and set
        if abs(a) < 1:
            engine = case['positions']['topocentric'][index]
            swiss_t = swiss_position(ramc, lat, eps, lon, blat, b'T')
            if engine is not None and swiss_t is not None:
                topo_residual['engine'].append(abs(topocentric_residual(md, dec, tphi, (engine - 1) * 30)) * 3600)
                topo_residual['swiss'].append(abs(topocentric_residual(md, dec, tphi, (swiss_t - 1) * 30)) * 3600)
        # 3. Porphyry, from the same ascendant and midheaven as the engine
        if upper is None:
            e = eps * D
            r = ramc * D
            mc = math.atan2(math.sin(r), math.cos(r) * math.cos(e)) * R % 360
            asc = math.atan2(math.cos(r), -(math.sin(r) * math.cos(e) + tphi * math.sin(e))) * R % 360
            if (asc - mc) % 360 >= 180:
                asc = (asc + 180) % 360
            upper, lower = (asc - mc) % 360, ((mc + 180) % 360 - asc) % 360
        o = (lon + 0.001 / 3600 - mc) % 360
        if o < upper:
            p = 270 + 90 * o / upper
        elif o < 180:
            p = 90 * (o - upper) / lower
        elif o < 180 + upper:
            p = 90 + 90 * (o - 180) / upper
        else:
            p = 180 + 90 * (o - 180 - upper) / lower
        swiss_o = swe.house_pos(ramc, lat, eps, (lon, blat), b'O')
        porphyry_nudged.append(abs(seam(p, (swiss_o - 1) * 30)) * 3600)
        engine_o = case['positions']['porphyry'][index]
        if abs(seam((engine_o - 1) * 30, (swiss_o - 1) * 30)) * 3600 > 0.01:
            porphyry_failing_quadrant.append(min(upper, lower))

# Topocentric at the cusps and between them: ecliptic points at fractions of
# each house, from the engine's own cusps (dist/index.js), at 17 latitudes
# from -60 to 60 degrees and 22 sidereal times.
script = """
import { computeAngles, computeHouses } from '../../../../dist/index.js';
import { housePosition } from '../../../../dist/houses-extra.js';
const rows = [];
for (let lat = -60; lat <= 60; lat += 7.5) for (let ramc = 5; ramc < 360; ramc += 17) {
  const input = { gastHours: ramc / 15, longitude: 0, latitude: lat, obliquity: 23.4392911 };
  const cusps = computeHouses('topocentric', input, computeAngles(input)).houses.cusps;
  for (let k = 0; k < 12; k++) {
    const span = (((cusps[(k + 1) % 12] - cusps[k]) % 360) + 360) % 360;
    for (const f of [0, 0.125, 0.25, 0.5, 0.75]) {
      const lon = (cusps[k] + f * span) % 360;
      rows.push([ramc, lat, lon, f, housePosition('topocentric', input, { lon, lat: 0 })]);
    }
  }
}
console.log(JSON.stringify(rows));
"""
rows = json.loads(subprocess.run(['node', '--input-type=module', '-e', script], cwd=sys.path[0], capture_output=True,
                                 text=True, check=True).stdout)
by_fraction = {}
for ramc, lat, lon, fraction, engine in rows:
    swiss = swe.house_pos(ramc, lat, 23.4392911, (lon, 0.0), b'T')
    by_fraction.setdefault(str(fraction), []).append(abs(seam((engine - 1) * 30, (swiss - 1) * 30)) * 3600)

print(json.dumps({
    'swisseph': swe.version,
    'koch': {
        'counts': [{'case': list(key), 'count': count} for key, count in sorted(koch.items())],
        'swissPositionsWithLudwigSemiArcs': koch_ludwig,
    },
    'topocentric': {
        'unit': 'arcseconds of ascension: the equation of the circle of the position, at each side\'s position',
        'residualEngine': stats(topo_residual['engine']),
        'residualSwiss': stats(topo_residual['swiss']),
        'differenceByFractionOfHouse': {fraction: stats(values) for fraction, values in sorted(by_fraction.items())},
    },
    'porphyry': {
        'unit': 'arcseconds of mundane position',
        'exactPositionOfLongitudePlus0.001arcsecVsSwiss': stats(porphyry_nudged),
        'casesOver0.01arcsec': len(porphyry_failing_quadrant),
        'theirSmallerQuadrantDegrees': {'min': round(min(porphyry_failing_quadrant), 2),
                                        'max': round(max(porphyry_failing_quadrant), 2)} if porphyry_failing_quadrant else None,
    },
}, indent=1))
