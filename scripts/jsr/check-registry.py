"""Read-only release preflight. Unknown state is a failure, never an upload retry."""
import json, subprocess
url = 'https://jsr.io/@zodiacs/engine/meta.json'
# Use the runner's ordinary HTTPS client; do not import browser credentials,
# change its identity headers, follow redirects, or load a user curl config.
try:
    response = subprocess.run([
        'curl', '--disable', '--proto', '=https', '--silent', '--show-error',
        '--fail', '--max-time', '30', '--write-out', '\n%{http_code}', url
    ], capture_output=True, text=True, timeout=35, check=False)
except (OSError, subprocess.TimeoutExpired):
    raise SystemExit('registry request failed; registry state is unknown')
if response.returncode != 0:
    raise SystemExit(f'registry request failed (curl exit {response.returncode}); registry state is unknown')
try:
    body, status = response.stdout.rsplit('\n', 1)
    if status != '200':
        raise ValueError('unexpected HTTP status')
    metadata = json.loads(body)
except ValueError:
    raise SystemExit('unexpected registry response; registry state is unknown')
if not isinstance(metadata, dict):
    raise SystemExit('unexpected registry metadata; registry state is unknown')
if metadata.get('scope') != 'zodiacs' or metadata.get('name') != 'engine':
    raise SystemExit('wrong registry package')
if metadata.get('githubRepository') != {'owner': 'zodiacs-org', 'name': 'engine'}:
    raise SystemExit('unexpected repository link; account setting must be checked separately')
versions = metadata.get('versions')
if not isinstance(versions, dict) or '0.1.1-rc.16' in versions:
    raise SystemExit('version exists or registry state is unknown')
print('rc.16 absent and public repository link matches; private scope policy is not established by this read')
