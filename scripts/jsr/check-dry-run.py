"""Require the actual Deno dry-run publication list to be the reviewed 103 files."""
import json, pathlib, re, sys, urllib.parse
root = pathlib.Path(sys.argv[1]).resolve()
text = pathlib.Path(sys.argv[2]).read_text()
text = re.sub(r'\x1b\[[0-9;]*m', '', text)
if 'Simulating publish of @zodiacs/engine@0.1.1-rc.16 with files:' not in text or 'Success Dry run complete' not in text:
    raise SystemExit('dry run did not report the intended complete package')
actual = []
for line in text.splitlines():
    match = re.fullmatch(r'\s+(file://.+) \([^()]+\)', line)
    if match:
        path = pathlib.Path(urllib.parse.unquote(urllib.parse.urlparse(match.group(1)).path)).resolve()
        actual.append(path.relative_to(root).as_posix())
expected = json.loads(pathlib.Path(__file__).with_name('expected-files.json').read_text())
if len(actual) != len(set(actual)) or sorted(actual) != sorted(expected):
    raise SystemExit('actual dry-run file list differs from the reviewed inventory')
print(json.dumps({'publishFiles': len(actual), 'dependencyFilesExcluded': True}, sort_keys=True))
