#!/usr/bin/env python3
"""Offline reference-parser controls. Prints only unless --output is supplied."""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--snapshot', type=Path, default=ROOT / 'snapshot')
    cli.add_argument('--output', type=Path)
    args = cli.parse_args()
    module_spec = importlib.util.spec_from_file_location('vector_acquirer', ROOT / 'acquire-vectors.py')
    mod = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(mod)
    protocol = json.loads((ROOT / 'protocol.json').read_bytes())
    cases = json.loads((ROOT / 'cases.json').read_bytes())
    scenario = next(s for s in mod.table_specs(protocol) if s['id'] == 'sun-none')
    raw = (args.snapshot / 'raw' / 'sun-none.json').read_bytes()
    payload = json.loads(raw)
    clean, metadata = mod.parse_raw(raw, scenario, protocol, cases)
    if len(clean) != 21:
        raise AssertionError('Positive control must yield all21 fixed epochs')
    passed = [{'control':'valid raw Sun NONE','passed':True,'rows':21}]

    def expect(name, edit, substring):
        changed = json.loads(raw)
        changed['result'] = edit(changed['result'])
        try:
            mod.parse_raw(json.dumps(changed).encode(), scenario, protocol, cases)
        except ValueError as exc:
            if substring not in str(exc):
                raise AssertionError(f'{name}: unexpected rejection {exc}')
            passed.append({'control':name,'passed':True,'expectedRejection':substring})
        else:
            raise AssertionError(f'{name}: invalid raw source was accepted')

    expect('topocentric Earth header', lambda s:s.replace('Center-site name: BODY CENTER','Center-site name: TEST OBSERVATORY'), 'BODY CENTER')
    expect('calendar convention changed', lambda s:s.replace('Calendar mode   : Gregorian','Calendar mode   : Mixed'), 'Gregorian')
    expect('reference frame changed', lambda s:s.replace('Reference frame : ICRF','Reference frame : Ecliptic of J2000.0'), 'Unexpected vector convention')
    expect('units changed', lambda s:s.replace('Output units    : AU-D','Output units    : KM-S'), 'Unexpected vector convention')
    expect('correction changed', lambda s:s.replace('GEOMETRIC cartesian states','LT+S CORRECTED cartesian states'), 'Expected geometric')
    expect('TT labels replaced by TDB', lambda s:s.replace('JDTT','JDTDB'), 'explicitly JDTT')
    expect('wrong target', lambda s:s.replace('Target body name: Sun (10)','Target body name: Mercury (199)'), 'Wrong target')

    def alter_first_row(s, transform):
        head, tail = s.split('$$SOE')
        table, foot = tail.split('$$EOE')
        lines = table.splitlines()
        index = next(i for i,l in enumerate(lines) if l.strip())
        cols = lines[index].split(',')
        transform(cols)
        lines[index] = ','.join(cols)
        return head + '$$SOE' + '\n'.join(lines) + '$$EOE' + foot
    expect('epoch shifted one second', lambda s:alter_first_row(s, lambda c:c.__setitem__(0,str(float(c[0])+1/86400))), 'TT epoch mismatch')
    expect('nonfinite coordinate', lambda s:alter_first_row(s, lambda c:c.__setitem__(2,'nan')), 'Nonfinite')
    expect('coordinate range mismatch', lambda s:alter_first_row(s, lambda c:c.__setitem__(2,str(float(c[2])+1))), 'norm differs')
    report = {'schemaVersion':1, 'scope':'Offline independent-reference parser checks; no target engine exercised',
              'passed':len(passed),'total':len(passed),'controls':passed}
    if args.output:
        args.output.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))

if __name__ == '__main__':
    main()
