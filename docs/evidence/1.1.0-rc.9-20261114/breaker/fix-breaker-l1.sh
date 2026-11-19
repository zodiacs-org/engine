#!/usr/bin/env bash
# Fix-round breaker: install the carried tarball into a new empty directory
# outside the checkout (npm install <tarball>, nothing else), then run
# fix-breaker-l1.mjs there, one process a mode, with every ZODIACS* variable,
# NODE_OPTIONS and NODE_PATH unset and the network unshared for the runs
# (the install itself needs the registry for astronomy-engine).
#   TMPDIR=<outside the checkout> bash fix-breaker-l1.sh <tarball> <vectors> <out dir>
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tarball=$(realpath "$1"); vectors=$(realpath "$2"); out=$(realpath "$3")
for name in $(env | sed -n 's/^\(ZODIACS[A-Za-z0-9_]*\)=.*/\1/Ip'); do unset "$name"; done
unset NODE_OPTIONS NODE_PATH
echo "node $(node -v), npm $(npm -v)"
echo "ZODIACS* variables in the environment: $(env | grep -ci '^ZODIACS' || true)"
echo "tarball $(basename "$tarball"): sha256 $(sha256sum "$tarball" | cut -d' ' -f1), $(wc -c < "$tarball") bytes"
echo "vectors $(basename "$vectors"): sha256 $(sha256sum "$vectors" | cut -d' ' -f1)"
consumer=$(mktemp -d "$TMPDIR/fix-breaker-consumer.XXXXXX")
cd "$consumer"
printf '{"name":"fix-breaker-consumer","private":true,"type":"module"}\n' > package.json
npm install --no-audit --no-fund --ignore-scripts "$tarball" > install.log 2>&1 || { cat install.log; exit 1; }
dist=node_modules/@zodiacs/engine/dist
echo "node_modules after install: $(cd node_modules && ls -d * @*/* | grep -v '^@zodiacs$' | tr '\n' ' ')"
echo "installed package: $(find node_modules/@zodiacs/engine -type f | wc -l) files, $(find node_modules/@zodiacs/engine -type f -printf '%s\n' | awk '{s+=$1} END {print s}') bytes"
echo "files of dist that mention process.env, ZODIACS_, fetch(, XMLHttpRequest, node:fs, node:http or require(: $(grep -lE 'process\.env|ZODIACS_|\bfetch\(|XMLHttpRequest|node:fs|node:http|require\(' $dist/*.js | wc -l)"
echo "files of dist that hold the pack's first 64 base64 characters: $(grep -lF "$(node -e "import('@zodiacs/engine/de440/pack').then(p=>process.stdout.write(Buffer.from(p.de440PackBytes()).toString('base64').slice(0,64)))")" $dist/*.js | tr '\n' ' ')"
python3 -I - "$dist" <<'PY'
import base64, hashlib, re, sys, glob, os
# The pack decoded with no code of the package: the longest base64 string literal in dist.
best = (0, None, None)
for path in glob.glob(os.path.join(sys.argv[1], '*.js')):
    text = open(path, encoding='utf8').read()
    for m in re.finditer(r'"([A-Za-z0-9+/=]{100000,})"', text):
        if len(m.group(1)) > best[0]: best = (len(m.group(1)), path, m.group(1))
raw = base64.b64decode(best[2])
print(f"pack decoded by python from {os.path.basename(best[1])}: {best[0]} base64 characters, {len(raw)} bytes, sha256 {hashlib.sha256(raw).hexdigest()}")
PY
cp "$here/fix-breaker-l1.mjs" fix-breaker-l1.mjs
if bwrap --dev-bind / / --unshare-net true 2>/dev/null; then net="bwrap --dev-bind / / --unshare-net"; echo "runs: network unshared"; else net=""; echo "runs: network NOT unshared (bwrap unavailable)"; fi
for mode in plain plain-utc positions caller-async caller-sync fallback no-atob; do
  $net node fix-breaker-l1.mjs "$mode" "$vectors" "$out"
done
echo "consumer directory: $consumer"
