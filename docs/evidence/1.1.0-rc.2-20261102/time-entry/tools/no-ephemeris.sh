#!/bin/sh
# T3 (../PREREGISTRATION.md, section 6): @zodiacs/engine/time loads and
# computes in a Node that has no astronomy-engine, with module-syntax
# detection off. A scratch consumer holds only the package: the packed
# tarball extracted, or a directory that holds an extracted package (its
# package.json, README, licences and dist/, and no src/, .git or
# node_modules), and no dependency. On each Node given, with
# --no-experimental-detect-module (on 20.19.0 only if it accepts the flag,
# recorded), it imports the entry: timeBasis(Date.UTC(2017, 0, 1)) must give
# timeScale.leapSeconds.taiMinusUtc 37 and deltaT.model "iers-utc/1", and
# eclipticOfDate(1, 0, 0, 0) finite numbers. Control, which must fail: in the
# same consumer, import("@zodiacs/engine") rejects with ERR_MODULE_NOT_FOUND
# naming astronomy-engine.
#
#   sh no-ephemeris.sh <package.tgz | extracted package dir> <node 22.22.2> <node 20.19.0>
#
# The consumer is made under TMPDIR, which must have no node_modules above
# it, and removed at the end.
set -eu
package=$1
node22=$2
node20=$3
work=$(mktemp -d "${TMPDIR:-/tmp}/time-entry-t3-XXXXXX")
trap 'rm -rf "$work"' EXIT INT TERM
parent=$(dirname "$work")
while :; do
  if [ -e "$parent/node_modules" ]; then echo "a node_modules lies above the consumer: $parent/node_modules" >&2; exit 2; fi
  [ "$parent" = "/" ] && break
  parent=$(dirname "$parent")
done
mkdir -p "$work/consumer/node_modules/@zodiacs"
if [ -f "$package" ]; then
  mkdir "$work/extract"
  tar -xzf "$package" -C "$work/extract"
  mv "$work/extract/package" "$work/consumer/node_modules/@zodiacs/engine"
else
  for name in src .git node_modules; do
    if [ -e "$package/$name" ]; then echo "$package holds $name: not an extracted package" >&2; exit 2; fi
  done
  cp -R "$package" "$work/consumer/node_modules/@zodiacs/engine"
fi
cd "$work/consumer"
printf '{"private":true,"type":"module"}\n' > package.json
cat > check.mjs <<'EOF'
import { eclipticOfDate, timeBasis } from "@zodiacs/engine/time";
const basis = timeBasis(Date.UTC(2017, 0, 1));
const place = eclipticOfDate(1, 0, 0, 0);
const out = { taiMinusUtc: basis.timeScale.leapSeconds.taiMinusUtc, model: basis.deltaT.model, lon: place.lon, lat: place.lat };
const pass = out.taiMinusUtc === 37 && out.model === "iers-utc/1" && Number.isFinite(out.lon) && Number.isFinite(out.lat);
console.log(JSON.stringify({ ...out, pass }));
process.exitCode = pass ? 0 : 1;
EOF
cat > control.mjs <<'EOF'
try {
  await import("@zodiacs/engine");
  console.log(JSON.stringify({ rejected: false, controlBehaved: false }));
  process.exitCode = 1;
} catch (error) {
  const names = String(error.message).includes("astronomy-engine");
  const behaved = error.code === "ERR_MODULE_NOT_FOUND" && names;
  console.log(JSON.stringify({ rejected: true, code: error.code, namesAstronomyEngine: names, controlBehaved: behaved }));
  process.exitCode = behaved ? 0 : 1;
}
EOF
echo "installed: $(ls node_modules) $(ls node_modules/@zodiacs)"
status=0
for node in "$node22" "$node20"; do
  version=$("$node" --version)
  if "$node" --no-experimental-detect-module -e 0 >/dev/null 2>&1; then flag=--no-experimental-detect-module; else flag=; fi
  echo "node $version, flag: ${flag:-none (not accepted)}"
  echo "  check: $("$node" $flag check.mjs || echo FAILED)"
  "$node" $flag check.mjs >/dev/null 2>&1 || status=1
  echo "  control: $("$node" $flag control.mjs || echo 'CONTROL DID NOT BEHAVE')"
  "$node" $flag control.mjs >/dev/null 2>&1 || status=1
done
exit $status
