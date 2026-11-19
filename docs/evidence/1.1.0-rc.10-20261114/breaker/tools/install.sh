#!/usr/bin/env bash
# Install the carried tarball into a new, empty directory. Usage: install.sh <tarball> <dir>
set -euo pipefail
tarball=$1
dir=$2
mkdir -p "$dir"
[ -z "$(ls -A "$dir")" ] || { echo "not empty: $dir"; exit 1; }
for name in $(env | sed -n 's/^\(ZODIACS_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$name"; done
echo "ZODIACS_* set: $(env | grep -c '^ZODIACS_' || true)"
echo "node $(node -v) npm $(npm -v)"
echo "tarball sha256 $(sha256sum "$tarball" | cut -d' ' -f1) bytes $(wc -c < "$tarball")"
cd "$dir"
printf '{"name":"brk-consumer","private":true,"type":"module"}\n' > package.json
npm install --no-audit --no-fund --ignore-scripts "$tarball" 2>&1 | tail -3
echo "installed: $(ls node_modules) / $(ls node_modules/@zodiacs)"
node -p "require('./node_modules/@zodiacs/engine/package.json').version"
du -sb node_modules/@zodiacs/engine
ls -laS node_modules/@zodiacs/engine/dist | head -6
find node_modules/@zodiacs/engine -type f | wc -l
