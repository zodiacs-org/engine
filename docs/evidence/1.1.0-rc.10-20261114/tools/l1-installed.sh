#!/usr/bin/env bash
# Install the packed candidate into a new, empty directory outside the
# checkout and run the 240 L1 vectors there, as a consumer would: nothing but
# `npm install <tarball>`, no ZODIACS_* environment variable, no pack given,
# and a plain natalChart call.
#
#   TMPDIR=/absolute/dir/outside/the/checkout bash l1-installed.sh /absolute/path/zodiacs-engine-<version>.tgz [out directory]
#
# TMPDIR must have no node_modules and no package.json at or above it, or
# Node could resolve the imports from there.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../../.." && pwd)
tarball=$1
out=${2:-$here/../results}
: "${TMPDIR:?set TMPDIR to an absolute directory outside the checkout}"
consumer=$(mktemp -d "$TMPDIR/l1-installed.XXXXXX")
trap 'rm -rf "$consumer"' EXIT
for name in $(env | sed -n 's/^\(ZODIACS_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$name"; done
echo "tarball $(basename "$tarball"): $(sha256sum "$tarball" | cut -d' ' -f1), $(wc -c < "$tarball") bytes"
cd "$consumer"
printf '{"name":"l1-consumer","private":true,"type":"module"}\n' > package.json
npm install --no-audit --no-fund --ignore-scripts "$tarball" > install.log 2>&1 || { cat install.log; exit 1; }
echo "installed: $(node -p "require('./node_modules/@zodiacs/engine/package.json').version"), with $(ls node_modules | tr '\n' ' ')"
cp "$here/l1-installed.mjs" consumer-l1.mjs
node consumer-l1.mjs --vectors "$root/conformance/vectors/L1-positions.json" --bounds "$root/src/calc-bounds.ts" --out "$out"
