#!/usr/bin/env python3
"""Independent finite arithmetic check; no physical ephemeris accuracy claim."""
import argparse
from datetime import datetime, timezone
from decimal import Decimal, getcontext
import hashlib
import itertools
import json
import math
from pathlib import Path
import random
import subprocess
import tarfile

getcontext().prec = 70
HERE = Path(__file__).resolve().parent
NAMED = dict(conjunction=0, semisextile=30, semisquare=45, sextile=60,
             quintile=72, square=90, trine=120, sesquiquadrate=135,
             biquintile=144, quincunx=150, opposition=180)
VECTOR_TOL = 5e-13
DEGREE_TOL = 1e-10
POLE_TOL = 32 * 2**-52
D = lambda x: Decimal(str(x))


def vector(lon, lat, eps):
    """Construct spherical unit vector; apply Rodrigues rotation about +x."""
    lam, beta, tilt = map(math.radians, (lon % 360, lat, eps))
    v = (math.cos(beta)*math.cos(lam), math.cos(beta)*math.sin(lam), math.sin(beta))
    axis_cross_v = (0, -v[2], v[1])
    return tuple(v[i]*math.cos(tilt) + axis_cross_v[i]*math.sin(tilt)
                 + (v[0]*(1-math.cos(tilt)) if i == 0 else 0) for i in range(3))


def dec_of(v):
    return math.degrees(math.atan2(v[2], math.hypot(v[0], v[1])))


def separation(a, b):
    delta = abs(D(a)-D(b))
    return min(delta, D(360)-delta)


def motion(a, b, angle, threshold):
    relative = D(a['speed'])-D(b['speed'])
    if relative == 0 or abs(relative) < D(threshold):
        return 'stationary'
    old = abs(separation(a['lon'], b['lon'])-D(angle))
    # Small positive time, chosen not to overshoot a nonexact target.
    travel = min(D('0.000001'), old/10) if old else D('0.000001')
    next_lon = (D(a['lon']) + (travel if relative > 0 else -travel) + D(360)) % D(360)
    new = abs(separation(next_lon, b['lon'])-D(angle))
    assert new != old, 'Oracle displacement must resolve direction'
    return 'applying' if new < old else 'separating'


def cap(value, state):
    return D(value[state] if isinstance(value, dict) else value)


def expected_aspects(case):
    p = case['policy']
    rows = [row for row in case['positions'] if row['body'] in p['bodies']]
    out = []
    for a, b in itertools.combinations(rows, 2):
        best = None
        for rule in p['aspects']:
            angle = rule.get('angle', NAMED.get(rule['type']))
            state = motion(a, b, angle, p.get('stationaryRelativeSpeed', 1e-9))
            allowance = rule['luminaryOrb'] if ('luminaryOrb' in rule and
                {a['body'],b['body']} & {'Sun','Moon'}) else rule['orb']
            limits = [cap(allowance, state)]
            limits.extend(cap(p['bodyOrbs'][body], state) for body in (a['body'],b['body'])
                          if body in p.get('bodyOrbs', {}))
            maximum = min(limits)
            orb = abs(separation(a['lon'],b['lon'])-D(angle))
            if orb <= maximum and (best is None or orb < D(best['orb'])):
                best = dict(a=a['body'],b=b['body'],type=rule['type'],angle=angle,
                            orb=float(orb),maximumOrb=float(maximum),motion=state,
                            applying=state == 'applying')
        if best:
            out.append(best)
    return sorted(out, key=lambda row: row['orb'])


def fixtures():
    rotations = []
    for lon, lat, eps in itertools.product(
            [0,45,90,123.25,180,270,359.999, -45, 765],
            [-90,-70,-5,0,5,70,90], [0,23.439291111,45,90]):
        rotations.append(dict(id=f'rotation-{len(rotations)}',lon=lon,lat=lat,eps=eps))
    rng = random.Random(20260928)
    for _ in range(100):
        rotations.append(dict(id=f'rotation-{len(rotations)}',lon=rng.uniform(-720,720),
                              lat=rng.uniform(-90,90),eps=rng.uniform(0,90)))
    for eps in [0,23.439291111,45,90]:
        for offset in [0,-1e-8,1e-8,-1e-12,1e-12]:
            for sign in [-1,1]:
                lat = sign*(90-eps+offset)
                if -90 <= lat <= 90:
                    rotations.append(dict(id=f'pole-{len(rotations)}',lon=90 if sign>0 else 270,
                                          lat=lat,eps=eps))
    aspects = []
    def add_aspect(label, positions, rules, **policy):
        aspects.append(dict(id=f'{label}-{len(aspects)}',positions=positions,
                            policy=dict(bodies=[row['body'] for row in positions],aspects=rules,**policy)))
    for name, angle in [*NAMED.items(),('custom',22.5)]:
        rule = dict(type=name,orb=180,**({'angle':angle} if name=='custom' else {}))
        for distance, orientation, speed in itertools.product(
                sorted({0,angle,180,max(0,angle-.5),min(180,angle+.5)}),[-1,1],[-2,0,2,5e-10,1e-9]):
            positions = [dict(body='A',lon=(137.5+orientation*distance)%360,speed=speed),
                         dict(body='B',lon=137.5,speed=0)]
            add_aspect('motion',positions,[rule])
    # Threshold equality, zero threshold, extreme finite relative speeds.
    for threshold,s1,s2 in [(0,0,0),(0,1e-12,0),(1e-9,1e-9,0),(1e-9,5e-10,0),
                            (1e308,1e308,-1e308),(1e308,1e308,0)]:
        add_aspect('threshold',[dict(body='A',lon=59,speed=s1),dict(body='B',lon=0,speed=s2)],
                   [dict(type='sextile',orb=5)],stationaryRelativeSpeed=threshold)
    for name in ['Sun','Moon','Venus']:
        for distance,speed,cap_a,cap_b in itertools.product(
                [57,57.5,57.5001,59,59.5,59.5001,60,60.5,61,62,63],[-1,0,1],
                [0.5,dict(applying=2,separating=.5,stationary=1)],
                [1,dict(applying=.5,separating=3,stationary=2)]):
            rows = [dict(body=name,lon=distance,speed=speed),dict(body='B',lon=0,speed=0)]
            rule = dict(type='sextile',orb=dict(applying=3,separating=2,stationary=1),
                        luminaryOrb=dict(applying=4,separating=3,stationary=2))
            caps = {name:cap_a,'B':cap_b}
            add_aspect('orb-policy',rows,[rule],bodyOrbs=caps)
            add_aspect('reversed',rows[::-1],[rule],bodyOrbs=caps)
    # Isolate allowances without a tighter cap masking the luminary replacement.
    for name,speed,distance in itertools.product(['Sun','Moon','Venus'],[-1,0,1],[57,58,58.5,59,60]):
        rows = [dict(body=name,lon=distance,speed=speed),dict(body='B',lon=0,speed=0)]
        rule = dict(type='sextile',orb=dict(applying=2,separating=1,stationary=.5),
                    luminaryOrb=dict(applying=3,separating=2,stationary=1))
        add_aspect('uncapped-luminary',rows,[rule])
        add_aspect('loose-caps',rows,[rule],bodyOrbs={name:180,'B':180})
        add_aspect('zero-cap',rows,[rule],bodyOrbs={name:0})
    # Different per-motion limits can select the same angular pair differently.
    for speed in [-1,0,1]:
        add_aspect('motion-limit',[dict(body='A',lon=58.5,speed=speed),dict(body='B',lon=0,speed=0)],
                   [dict(type='sextile',orb=dict(applying=2,separating=0,stationary=1))])
    for rules in [[dict(type='semisextile',orb=10),dict(type='semisquare',orb=10)],
                  [dict(type='semisquare',orb=10),dict(type='semisextile',orb=10)],[]]:
        add_aspect('overlap-tie',[dict(body='A',lon=37.5,speed=1),dict(body='B',lon=0,speed=0)],rules)
    add_aspect('pair-order',[dict(body='A',lon=0,speed=0),dict(body='B',lon=1,speed=0),
                            dict(body='C',lon=359,speed=0)],[dict(type='conjunction',orb=5)])
    declinations = []
    # Zero obliquity makes exact dyadic declinations independent of any ephemeris.
    for da,db,label,orb in itertools.product([-90,-20,-1,0,1,20,90],
            [-90,-20,-1.125,-1,0,1,1.125,20,90],['Sun','A'],[0,.125,1,90]):
        declinations.append(dict(id=f'declination-{len(declinations)}',eps=0,
            bodies=[dict(body=label,lon=0,lat=da),dict(body='B',lon=180,lat=db)],
            policy=dict(orb=orb,luminaryOrb=min(90,orb+.125))))
    for eps in [23.439291111,45,90]:
        declinations.append(dict(id=f'declination-nonzero-{len(declinations)}',eps=eps,
            bodies=[dict(body='North Node',lon=90,lat=0),dict(body='South Node',lon=270,lat=0),
                    dict(body='Synthetic',lon=45,lat=20)],policy=dict(orb=1,luminaryOrb=1.5)))
    return dict(rotations=rotations,aspects=aspects,declinations=declinations)


def compare_dict(expected, actual):
    if not isinstance(actual,dict) or set(expected) != set(actual):
        return False
    return all((type(v) in (float,int) and type(actual[k]) in (float,int)
                and math.isfinite(actual[k]) and abs(v-actual[k]) <= DEGREE_TOL)
               if type(v) in (float,int) else actual[k] == v for k,v in expected.items())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--entry',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--archive',type=Path,help='Optional npm archive; require every dist JS byte to match the selected entry directory')
    args = parser.parse_args()
    entry = args.entry.resolve()
    digest=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
    inventory=lambda:{p.name:digest(p) for p in sorted(entry.parent.glob('*.js'))}
    before=inventory()
    data = fixtures()
    encoded = json.dumps(data,separators=(',',':'),allow_nan=False).encode()
    completed = subprocess.run(['node',str(HERE/'independent-bridge.mjs'),str(entry)],
                               input=encoded,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
    observed = json.loads(completed.stdout)
    failures = []
    archive_evidence=None
    if args.archive:
        archive=args.archive.resolve()
        with tarfile.open(archive,'r:gz') as bundle:
            members=[m for m in bundle.getmembers() if m.isfile() and
                     m.name.startswith('package/dist/') and m.name.endswith('.js')]
            archive_js={Path(m.name).name:hashlib.sha256(bundle.extractfile(m).read()).hexdigest()
                        for m in members}
        archive_evidence=dict(path=str(archive),sha256=digest(archive),
                              distJavaScript=archive_js,matchesInvokedDirectory=archive_js==before)
        if len(archive_js)!=len(members) or archive_js != before:
            failures.append(dict(family='artifact',reason='Archive JavaScript differs from selected consumer'))
    after=inventory()
    if before != after:
        failures.append(dict(family='artifact',reason='Built JavaScript changed during invocation'))
    max_vector = 0
    max_declination = 0
    def fail(family,case,reason,**detail):
        failures.append(dict(family=family,id=case['id'],reason=reason,**detail))
    if observed['namedAngles'] != NAMED:
        failures.append(dict(family='metadata',reason='Named aspect angles differ',actual=observed['namedAngles']))
    if observed['raPoleTolerance'] != POLE_TOL:
        failures.append(dict(family='metadata',reason='Pole convention differs',actual=observed['raPoleTolerance']))
    for case,item in zip(data['rotations'],observed['rotations'],strict=True):
        if 'error' in item:
            fail('rotation',case,'Unexpected error',actual=item); continue
        actual = item['value']['equatorial']; expected = vector(case['lon'],case['lat'],case['eps'])
        horizontal = math.hypot(expected[0],expected[1]); defined = horizontal > POLE_TOL
        if actual['raDefined'] != defined or (actual['ra'] is None) != (not defined):
            fail('rotation',case,'RA pole convention mismatch',actual=actual,horizontal=horizontal)
        if actual['ra'] is not None and not (0 <= actual['ra'] < 360):
            fail('rotation',case,'RA degree range invalid',actual=actual)
        ra = math.radians(actual['ra'] or 0); dec = math.radians(actual['dec'])
        reconstructed = (math.cos(dec)*math.cos(ra),math.cos(dec)*math.sin(ra),math.sin(dec))
        error = math.dist(expected,reconstructed); max_vector=max(max_vector,error)
        if not math.isfinite(error) or error > VECTOR_TOL:
            fail('rotation',case,'Unit vector discrepancy',error=error,actual=actual,expectedVector=expected)
        if item['value']['declination'] != actual['dec']:
            fail('rotation',case,'Scalar/vector declination disagree')
        row = item['value']['row']; dec_expected=dec_of(expected)
        if case['lat'] == 0:
            expected_oob=False
        elif abs(abs(dec_expected)-case['eps']) < DEGREE_TOL:
            expected_oob=None # Rounding-sensitive equality: no physical assertion.
        else:
            expected_oob=abs(dec_expected)>case['eps']
        if expected_oob is not None and row['outOfBounds'] != expected_oob:
            fail('rotation',case,'Out-of-bounds mismatch',actual=row,expected=expected_oob)
    for case,item in zip(data['aspects'],observed['aspects'],strict=True):
        expected=expected_aspects(case)
        if 'error' in item:
            fail('aspect',case,'Unexpected error',actual=item); continue
        actual=item['value']['aspects']
        if len(expected)!=len(actual) or not all(compare_dict(e,a) for e,a in zip(expected,actual)):
            fail('aspect',case,'Policy or motion mismatch',expected=expected,actual=actual,input=case)
    for case,item in zip(data['declinations'],observed['declinations'],strict=True):
        if 'error' in item:
            fail('declination',case,'Unexpected error',actual=item); continue
        values=[row['lat'] if case['eps']==0 else dec_of(vector(row['lon'],row['lat'],case['eps']))
                for row in case['bodies']]
        expected=[]
        for i,j in itertools.combinations(range(len(values)),2):
            a,b=case['bodies'][i],case['bodies'][j]; da,db=values[i],values[j]
            parallel=abs(da-db); contra=abs(da+db); orb=min(parallel,contra)
            maximum=case['policy']['luminaryOrb' if {a['body'],b['body']}&{'Sun','Moon'} else 'orb']
            if orb<=maximum:
                expected.append(dict(a=a['body'],b=b['body'],type='parallel' if parallel<=contra else 'contraparallel',
                    orb=orb,maximumOrb=maximum,decA=da,decB=db,separation=float(separation(a['lon'],b['lon']))))
        expected.sort(key=lambda row:row['orb']); actual=item['value']['aspects']
        for dec,row in zip(values,item['value']['rows'],strict=True):
            discrepancy=abs(dec-row['dec'])
            max_declination=max(max_declination,discrepancy)
            if not math.isfinite(discrepancy) or discrepancy>DEGREE_TOL:
                fail('declination',case,'Row declination mismatch',expected=dec,actual=row)
        if len(expected)!=len(actual) or not all(compare_dict(e,a) for e,a in zip(expected,actual)):
            fail('declination',case,'Declination aspect mismatch',expected=expected,actual=actual,input=case)
    report=dict(schema='zodiacs.independent-arithmetic.v1',timestamp=datetime.now(timezone.utc).isoformat(),
        engineVersion=observed['engineVersion'],entry=str(entry),entrySha256=digest(entry),
        builtJavaScript=before,builtJavaScriptAfterInvocation=after,
        archive=archive_evidence,
        scriptSha256=digest(Path(__file__)),bridgeSha256=digest(HERE/'independent-bridge.mjs'),
        fixturesSha256=hashlib.sha256(encoded).hexdigest(),counts={key:len(value) for key,value in data.items()},
        thresholds=dict(unitVectorEuclidean=VECTOR_TOL,degrees=DEGREE_TOL),
        maxUnitVectorDiscrepancy=max_vector,maxDeclinationDegreeDiscrepancy=max_declination,
        allPassed=not failures,failures=failures,
        limits=['Finite synthetic arithmetic fixtures only; not physical astronomical accuracy.',
                'No independent test of provider obliquity, time model, or Swiss agreement.',
                'Declination per-body orb caps are not offered by this API.',
                'RA is degrees; vector reconstruction detects a degree/hour mismatch.',
                'Out-of-bounds comparison skips nonzero-latitude rounding-sensitive equalities.'])
    args.output.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print(json.dumps({k:report[k] for k in ['allPassed','counts','maxUnitVectorDiscrepancy','maxDeclinationDegreeDiscrepancy']}))
    print(f'Failures: {len(failures)}; report: {args.output}')
    raise SystemExit(0 if report['allPassed'] else 1)


if __name__=='__main__':
    main()
