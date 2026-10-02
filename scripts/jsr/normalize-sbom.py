"""Normalize npm's runtime SBOM metadata, retaining the generated dependency graph.
The raw input is preserved. Optional BOM creation timestamp is omitted for deterministic normalization.
Source commit time is a separate provenance property, never a backdated BOM time.
"""
import datetime, hashlib, json, pathlib, sys, uuid
raw, archive, output = map(pathlib.Path, sys.argv[1:4])
source_commit, source_epoch = sys.argv[4:6]
sha = hashlib.sha256(archive.read_bytes()).hexdigest()
assert sha == '43a72d30e483d8ff22024e403c4bd0d86d81bb6e1d0ad138f857cd001ab015d8'
assert source_commit == '6807f632fc5aad08999d97f61e50793c6ca9a0b4'
s = json.loads(raw.read_text()); root = s['metadata']['component']
assert root['bom-ref'] == '@zodiacs/engine@0.1.1-rc.16'
assert [(x['name'], x['version']) for x in s['components']] == [('astronomy-engine', '2.1.19')]
assert root['licenses'] == [{'expression': 'MIT AND CC-BY-4.0'}]
root['name'] = 'engine'; root['group'] = '@zodiacs'
root['hashes'] = [{'alg': 'SHA-256', 'content': sha}]
s['serialNumber'] = 'urn:uuid:' + str(uuid.uuid5(uuid.NAMESPACE_URL, 'https://registry.npmjs.org/@zodiacs/engine/-/engine-0.1.1-rc.16.tgz#sha256=' + sha))
s['metadata'].pop('timestamp', None)
source_time = datetime.datetime.fromtimestamp(int(source_epoch), datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
s['metadata']['properties'] = [
 {'name': 'zodiacs:publication-workflow-commit-time', 'value': source_time},
 {'name': 'zodiacs:publication-workflow-commit', 'value': source_commit},
 {'name': 'zodiacs:archive-source-commit', 'value': 'ddbbaa0b1d21e16834722f81e8708816849c6726'},
 {'name': 'zodiacs:archive-source-commit-time', 'value': datetime.datetime.fromtimestamp(1790777783, datetime.timezone.utc).isoformat().replace('+00:00', 'Z')}
]
output.write_text(json.dumps(s, indent=2) + '\n')
