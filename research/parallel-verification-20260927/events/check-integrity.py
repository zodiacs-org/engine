#!/usr/bin/env python3
"""Offline negative controls for fixture integrity and target shape guards."""
import hashlib
import json
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent

def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')

def check(name, expected_message, mutate=None, chart=None):
    with tempfile.TemporaryDirectory(prefix='zodiacs-events-control-') as tmp:
        d = Path(tmp)
        for name_file in ['compare-events.mjs', 'protocol.json', 'references.json']:
            shutil.copyfile(ROOT / name_file, d / name_file)
        (d / 'raw').symlink_to(ROOT / 'raw', target_is_directory=True)
        if mutate:
            mutate(d)
        target = d / 'target.mjs'
        if chart is not None:
            target.write_text("export const ENGINE_VERSION='shape-control';\n"
                              "export const EPHEMERIS={name:'control',version:'0'};\n"
                              f"export function natalChart(){{return {json.dumps(chart)};}}\n"
                              "export function findLongitudeCrossingsWith(f,b,a,from,to,step){f(b,from);return [];}\n")
        result = subprocess.run(['node', str(d / 'compare-events.mjs'), '--engine', str(target)],
                                text=True, capture_output=True)
        if result.returncode == 0 or expected_message not in result.stderr:
            raise AssertionError(f'{name}: expected rejection {expected_message!r}; got {result.returncode}: {result.stderr}')
        return {'control': name, 'passed': True, 'expectedRejection': expected_message}

def edit_reference(fn):
    def mutate(d):
        p = d / 'references.json'
        value = json.loads(p.read_text())
        fn(value)
        write_json(p, value)
    return mutate

def edited_gate(d):
    p = d / 'protocol.json'
    value = json.loads(p.read_text())
    value['diagnosticGateSeconds'] = 20
    write_json(p, value)
    r = d / 'references.json'
    refs = json.loads(r.read_text())
    refs['protocolSha256'] = hashlib.sha256(p.read_bytes()).hexdigest()
    write_json(r, refs)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Optionally write the report to this path; default prints only')
    args = parser.parse_args()
    controls = []
    controls.append(check('edited expected root', 'Processed expected time was edited',
                          edit_reference(lambda x: x['references'][0].update(referenceSyntheticUt1UnixSeconds=x['references'][0]['referenceSyntheticUt1UnixSeconds'] + 20))))
    controls.append(check('missing numeric expected root', 'Processed expected time was edited',
                          edit_reference(lambda x: x['references'][0].pop('referenceSyntheticUt1UnixSeconds'))))
    controls.append(check('missing numeric bracket', 'Processed reference bracket was edited',
                          edit_reference(lambda x: x['references'][0]['sampleBracket'].pop('widthSeconds'))))
    controls.append(check('duplicate case', 'Duplicate reference case ID',
                          edit_reference(lambda x: x['references'].__setitem__(1, x['references'][0]))))
    controls.append(check('edited ISO label', 'Processed expected time was edited',
                          edit_reference(lambda x: x['references'][0].update(referenceTt='2026-10-11T00:00:00Z'))))
    controls.append(check('relaxed gate with updated protocol digest', 'Protocol changed', edited_gate))
    base = {'deltaT': {'model': 'pinned', 'seconds': 69},
            'bodies': [{'body': 'Sun', 'lon': 10}, {'body': 'Moon', 'lon': 20}]}
    wrong_delta = {**base, 'deltaT': {'model': 'pinned', 'seconds': 68}}
    controls.append(check('wrong numerical deltaT pin', 'Target did not honor pinned deltaT', chart=wrong_delta))
    bad_longitude = {**base, 'bodies': [{'body': 'Sun', 'lon': 360}, {'body': 'Moon', 'lon': 20}]}
    controls.append(check('out-of-range longitude', 'exactly one Sun and Moon', chart=bad_longitude))
    duplicate = {**base, 'bodies': base['bodies'] + [{'body': 'Moon', 'lon': 20}]}
    controls.append(check('duplicate Moon', 'exactly one Sun and Moon', chart=duplicate))
    report = {'schemaVersion': 1, 'scope': 'Offline harness integrity controls; not additional astronomical validation',
              'passed': len(controls), 'total': len(controls), 'controls': controls}
    if args.output:
        write_json(args.output, report)
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
