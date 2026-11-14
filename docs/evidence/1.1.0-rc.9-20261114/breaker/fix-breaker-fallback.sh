#!/usr/bin/env bash
# Fix-round breaker: the fallback probes on the installed package: as
# installed, with atob removed, and on a second install whose pack text has
# one base64 character changed (so the bytes are no longer the sealed pack's).
#   TMPDIR=<outside the checkout> bash fix-breaker-fallback.sh <tarball>
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tarball=$(realpath "$1")
for name in $(env | sed -n 's/^\(ZODIACS[A-Za-z0-9_]*\)=.*/\1/Ip'); do unset "$name"; done
unset NODE_OPTIONS NODE_PATH
install() { mkdir "$1"; ( cd "$1"; printf '{"name":"fix-breaker-consumer","private":true,"type":"module"}\n' > package.json; npm install --no-audit --no-fund --ignore-scripts "$tarball" > install.log 2>&1; cp "$here"/fix-breaker-fallback.mjs "$here"/fix-breaker-probes.mjs . ); }
base=$(mktemp -d "$TMPDIR/fix-breaker-fallback.XXXXXX")
install "$base/good"; install "$base/bad"
chunk=$(ls -S "$base"/bad/node_modules/@zodiacs/engine/dist/*.js | head -1)
python3 -I - "$chunk" <<'PY'
import re, sys
path = sys.argv[1]; text = open(path, encoding='utf8').read()
m = re.search(r'"([A-Za-z0-9+/=]{100000,})"', text)
i = m.start(1) + 1_000_000
old = text[i]; new = 'A' if old != 'A' else 'B'
open(path, 'w', encoding='utf8').write(text[:i] + new + text[i+1:])
print(f"changed base64 character 1,000,000 of the pack text in {path.split('/')[-1]}: {old!r} to {new!r}")
PY
( cd "$base/good" && node fix-breaker-fallback.mjs as-installed && node fix-breaker-fallback.mjs no-atob no-atob && node fix-breaker-probes.mjs as-installed )
( cd "$base/bad" && node fix-breaker-fallback.mjs one-character-changed )
