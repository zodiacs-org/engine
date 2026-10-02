"""Read-only release preflight. Unknown state is a failure, never an upload retry."""
import json, urllib.request
url = 'https://jsr.io/@zodiacs/engine/meta.json'
with urllib.request.urlopen(url, timeout=30) as response:
    if response.status != 200:
        raise SystemExit('unexpected registry response')
    metadata = json.load(response)
if metadata.get('scope') != 'zodiacs' or metadata.get('name') != 'engine':
    raise SystemExit('wrong registry package')
if metadata.get('githubRepository') != {'owner': 'zodiacs-org', 'name': 'engine'}:
    raise SystemExit('unexpected repository link; account setting must be checked separately')
versions = metadata.get('versions')
if not isinstance(versions, dict) or '0.1.1-rc.16' in versions:
    raise SystemExit('version exists or registry state is unknown')
print('rc.16 absent and public repository link matches; private scope policy is not established by this read')
