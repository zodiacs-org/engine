#!/usr/bin/env bash
# Breaker: install the carried tarball into a new empty directory outside the
# checkout (npm install <tarball>, nothing else), then run breaker-l1.mjs
# there with every ZODIACS* variable unset and the network unshared for the
# run itself (the install needs the registry for astronomy-engine).
#   TMPDIR=<outside the checkout> bash breaker-l1.sh <tarball> <vectors> <out dir>
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tarball=$(realpath "$1"); vectors=$(realpath "$2"); out=$(realpath "$3")
for name in $(env | sed -n 's/^\(ZODIACS[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$name"; done
unset NODE_OPTIONS NODE_PATH
consumer=$(mktemp -d "$TMPDIR/breaker-consumer.XXXXXX")
echo "tarball $(basename "$tarball"): sha256 $(sha256sum "$tarball" | cut -d' ' -f1), $(wc -c < "$tarball") bytes"
cd "$consumer"
printf '{"name":"breaker-consumer","private":true,"type":"module"}\n' > package.json
npm install --no-audit --no-fund --ignore-scripts "$tarball" > install.log 2>&1 || { cat install.log; exit 1; }
echo "node_modules after install: $(cd node_modules && ls -d * @*/* | grep -v '^@zodiacs$' | tr '\n' ' ')"
echo "installed package: $(find node_modules/@zodiacs/engine -type f | wc -l) files, $(find node_modules/@zodiacs/engine -type f -printf '%s\n' | awk '{s+=$1} END {print s}') bytes"
echo "process.env or ZODIACS mentions in installed dist: $(grep -lE 'process\.env|ZODIACS_' node_modules/@zodiacs/engine/dist/*.js | wc -l) files"
echo "fetch( / XMLHttpRequest / node:fs / node:http mentions in installed dist: $(grep -lE '\bfetch\(|XMLHttpRequest|node:fs|node:http|require\(' node_modules/@zodiacs/engine/dist/*.js | wc -l) files"
cp "$here/breaker-l1.mjs" breaker-l1.mjs
if bwrap --dev-bind / / --unshare-net true 2>/dev/null; then
  echo "run: network unshared"
  bwrap --dev-bind / / --unshare-net node breaker-l1.mjs "$vectors" "$out"
else
  echo "run: network NOT unshared (bwrap --unshare-net unavailable)"
  node breaker-l1.mjs "$vectors" "$out"
fi
echo "consumer directory kept: $consumer"
