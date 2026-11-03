#!/bin/sh
# Check L4 (../PREREGISTRATION.md, section 3): in a Node process whose module
# resolution refuses astronomy-engine (scripts/refuse-ephemeris.mjs, loaded
# with --import), import("@zodiacs/engine/lite") succeeds and every export is
# defined, on each Node given. Control, which must fail: the root entry in
# the same process fails with the hook's error, although astronomy-engine is
# installed (without the hook the root loads, which shows it is).
#
# A scratch consumer holds the package (the packed tarball extracted, or a
# directory that holds an extracted package: its package.json, README,
# licences and dist/, and no src/, .git or node_modules) and astronomy-engine,
# copied from this checkout's node_modules/astronomy-engine.
#
#   sh no-ephemeris.sh <package.tgz | extracted package dir> <node> [<node> ...]
#
# The consumer is made under TMPDIR, which must have no node_modules above
# it, and removed at the end.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
checkout=$(cd "$here/../../../../.." && pwd)
package=$1
shift
work=$(mktemp -d "${TMPDIR:-/tmp}/lite-l4-XXXXXX")
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
cp -R "$checkout/node_modules/astronomy-engine" "$work/consumer/node_modules/astronomy-engine"
cp "$checkout/scripts/refuse-ephemeris.mjs" "$work/refuse-ephemeris.mjs"
cd "$work/consumer"
printf '{"private":true,"type":"module"}\n' > package.json
cat > lite.mjs <<'JS'
const lite = await import("@zodiacs/engine/lite");
const names = Object.keys(lite);
const undefinedNames = names.filter((name) => lite[name] === undefined);
const pass = names.length === 27 && undefinedNames.length === 0;
console.log(JSON.stringify({ exports: names.length, undefinedNames, pass }));
process.exitCode = pass ? 0 : 1;
JS
cat > root.mjs <<'JS'
try {
  const root = await import("@zodiacs/engine");
  console.log(JSON.stringify({ loaded: true, natalChart: typeof root.natalChart }));
} catch (error) {
  console.log(JSON.stringify({ loaded: false, refusedByHook: String(error.message).startsWith("refuse-ephemeris:"), message: String(error.message).slice(0, 120) }));
  process.exitCode = 1;
}
JS
hook=$(cd "$work" && pwd)/refuse-ephemeris.mjs
echo "installed: $(ls node_modules) $(ls node_modules/@zodiacs)"
status=0
for node in "$@"; do
  echo "node $("$node" --version)"
  out=$("$node" --import "$hook" lite.mjs) || status=1
  echo "  lite under the hook: $out"
  if out=$("$node" --import "$hook" root.mjs); then status=1; echo "  CONTROL DID NOT FAIL: $out"; else echo "  root under the hook (control): $out"; fi
  case "$out" in *'"refusedByHook":true'*) ;; *) status=1 ;; esac
  out=$("$node" root.mjs) || status=1
  echo "  root without the hook: $out"
done
exit $status
