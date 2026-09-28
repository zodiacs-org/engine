#!/usr/bin/env bash
# Plain Node import of the packed engine on each given Node installation. The
# archive is installed once, by the npm on PATH, into a clean temporary
# consumer, which every runtime then imports.
# usage: node-support.sh <absolute archive> <node bin dir> ...
set -euo pipefail
archive=$1
shift
consumer=$(mktemp -d "${TMPDIR:-/tmp}/zodiacs-engine-node-support-XXXXXX")
trap 'rm -rf "$consumer"' EXIT
cd "$consumer"
echo '{"private":true,"type":"module"}' > package.json
npm install --ignore-scripts --no-audit --no-fund "$archive" > /dev/null 2>&1
cat > probe.mjs <<'EOF'
import { ENGINE_VERSION, natalChart } from "@zodiacs/engine";
console.log(`loaded ${ENGINE_VERSION}; natalChart returned ${natalChart({ utc: "2000-01-01T12:00:00Z" }).bodies.length} bodies`);
EOF
echo "archive sha256 $(sha256sum < "$archive" | cut -c1-64)"
for bin in "$@"; do
  version=$("$bin/node" --version)
  if output=$("$bin/node" probe.mjs 2>&1); then status=0; else status=$?; fi
  echo "node $version: exit $status"
  echo "$output" | grep -E "^loaded|Error|Warning" | head -2 | sed "s|$consumer|<consumer>|g; s|^|  |"
done
