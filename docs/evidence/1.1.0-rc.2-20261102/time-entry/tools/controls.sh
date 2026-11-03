#!/bin/sh
# Every control of the time entry's checks (../PREREGISTRATION.md, section 6).
# A control is a run that must fail. Each is run here with the change its row
# names, on copies made in the work directory (files copied by name, never
# the checkout as a whole), and reported as having failed as the
# preregistration says, or not. The checks' own passing runs are the tools
# and scripts alone, outside this file.
#
#   sh controls.sh <checkout, built> <extracted package dir> <site time-basis.mjs> <node 22.22.2> <node 20.19.0> <work dir> [package-contents script]
#
# The extracted package must sit where it resolves astronomy-engine (a
# consumer's node_modules/@zodiacs/engine). The work directory must be
# outside the checkout, with no node_modules above it; it is emptied first.
# The last argument, if given, replaces scripts/verify-package-contents.mjs
# for T9, for a run made before the owner's ceilings are committed.
set -u
repo=$1
pkg=$2
site=$3
node22=$4
node20=$5
work=$6
contents=${7:-$repo/scripts/verify-package-contents.mjs}
tools=$(cd "$(dirname "$0")" && pwd)
PATH=$(dirname "$node22"):$repo/node_modules/.bin:$PATH
export PATH
rm -rf "$work"
mkdir -p "$work"
behaved=0
broken=0
# name, exit code, and "true" when the run failed in the way the preregistration says
note() {
  if [ "$2" -ne 0 ] && [ "$3" = true ]; then
    behaved=$((behaved + 1)); echo "control $1: failed as required"
  else
    broken=$((broken + 1)); echo "control $1: DID NOT BEHAVE (exit $2, as required: $3)"
  fi
}
field() { "$node22" -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(r.controlBehaved === true)' "$1"; }
tool() { # control name, tool, its arguments
  name=$1; script=$2; shift 2
  "$node22" "$tools/$script" "$@" --out "$work/$name.json" > /dev/null 2> "$work/$name.err"
  code=$?
  if [ -s "$work/$name.json" ]; then note "$name" "$code" "$(field "$work/$name.json")"; else note "$name" "$code" false; fi
}
copy_build() { # dir: the manifest, dist/ and the named scripts, node_modules linked
  # The export smoke test imports lite-entry.mjs and starts Node with refuse-ephemeris.mjs; both were added
  # to the copy by the amendment of 2026-11-03 (review 1), before any formal run.
  mkdir -p "$1/scripts"
  cp "$repo/package.json" "$1/"
  cp -R "$repo/dist" "$1/dist"
  for name in module-resolution-smoke.mjs root-isolation.mjs pure-tables.mjs api-report.mjs lite-entry.mjs refuse-ephemeris.mjs; do cp "$repo/scripts/$name" "$1/scripts/"; done
  ln -s "$repo/node_modules" "$1/node_modules"
}

# T1: the export list against R1 less elapsedDays; api:check with one character changed.
cat > "$work/t1a.mjs" <<'EOF'
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const [tools, pkg] = process.argv.slice(2);
const { entry } = await import(pathToFileURL(join(tools, "load.mjs")).href);
// R1's runtime names with P1.M3c's timeBands, which the entry exports (added by the amendment of 2026-11-03, review 1).
const R1 = ["DELTA_T_IERS_MODEL", "EPHEMERIS_SPAN", "TIME_SCALE_NAMES", "eclipticFrame", "eclipticOfDate", "elapsedDays", "meanEcliptic", "tilt", "timeBands", "timeBasis"];
const less = R1.filter((name) => name !== "elapsedDays");
const keys = Object.keys(await entry(pkg, "./time")).sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
console.log(JSON.stringify({ keys, equalsR1: same(keys, R1), equalsControlList: same(keys, less) }));
process.exitCode = same(keys, less) ? 0 : 1;
if (!same(keys, R1)) process.exitCode = 2;
EOF
"$node22" "$work/t1a.mjs" "$tools" "$pkg" > "$work/T1-list.out" 2>&1
code=$?; note T1-list-less-elapsedDays "$code" "$([ "$code" -eq 1 ] && echo true || echo false)"
copy_build "$work/t1b"
cp -R "$repo/api" "$work/t1b/api"
sed -i.bak '1s/engine\/time/engine\/tame/' "$work/t1b/api/time.api.md" && rm "$work/t1b/api/time.api.md.bak"
(cd "$work/t1b" && "$node22" scripts/api-report.mjs --check) > "$work/T1-api.out" 2>&1
code=$?; note T1-api-check-one-character "$code" "$(grep -q 'api/time.api.md differs' "$work/T1-api.out" && echo true || echo false)"

# T2: the core graph with no external allowed; dist/time.js importing astronomy-engine.
copy_build "$work/t2a"
sed 's|checkSelfContained("index", \["astronomy-engine"\]);|checkSelfContained("index");|' "$repo/scripts/module-resolution-smoke.mjs" > "$work/t2a/scripts/module-resolution-smoke.mjs"
(cd "$work/t2a" && "$node22" scripts/module-resolution-smoke.mjs) > "$work/T2-index.out" 2>&1
code=$?; note T2-index-no-external "$code" "$(grep -q 'external dependency in index build: astronomy-engine' "$work/T2-index.out" && echo true || echo false)"
copy_build "$work/t2b"
{ printf 'import "astronomy-engine";\n'; cat "$repo/dist/time.js"; } > "$work/t2b/dist/time.js"
(cd "$work/t2b" && "$node22" scripts/module-resolution-smoke.mjs) > "$work/T2-time.out" 2>&1
code=$?; note T2-time-imports-astronomy-engine "$code" "$(grep -q 'external dependency in time build: astronomy-engine' "$work/T2-time.out" && echo true || echo false)"

# T3: its control runs inside no-ephemeris.sh, which fails unless it behaved.
sh "$tools/no-ephemeris.sh" "$pkg" "$node22" "$node20" > "$work/T3.out" 2>&1
code=$?; echo "T3 with its control: exit $code (0 means both runtimes passed and both controls rejected as required)"; grep 'control:' "$work/T3.out"

# T4 to T7: the tools' own controls.
fixture=$repo/src/fixtures/nutation-erfa.json
for control in a b c; do tool "T4-$control" site-module.mjs --package "$pkg" --site "$site" --fixture "$fixture" --control "$control"; done
for control in a b; do tool "T5-$control" natal-parity.mjs --package "$pkg" --control "$control"; done
for control in types frame-byte; do tool "T6-$control" source-pins.mjs --repo "$repo" --commit "${COMMIT:-HEAD}" --control "$control"; done
for control in leap ut1 tilt; do tool "T7-$control" independent.mjs --package "$pkg" --repo "$repo" --control "$control"; done

# T8: dist/time.js as an esbuild bundle of src/time.ts without splitting.
mkdir -p "$work/t8/node_modules/@zodiacs"
cp -R "$pkg" "$work/t8/node_modules/@zodiacs/engine"
ln -s "$repo/node_modules/astronomy-engine" "$work/t8/node_modules/astronomy-engine"
esbuild "$repo/src/time.ts" --bundle --format=esm --platform=neutral --outfile="$work/t8/node_modules/@zodiacs/engine/dist/time.js" --log-level=warning
"$node22" "$tools/one-copy.mjs" --package "$work/t8/node_modules/@zodiacs/engine" --out "$work/T8.json" > /dev/null 2>&1
code=$?; note T8-unsplit-time-js "$code" "$("$node22" -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(r.controlSignature.twoHolders && r.controlSignature.spanIdentityFalse)' "$work/T8.json")"

# T9: the ./time budget set to the measured graph less one byte.
mkdir -p "$work/t9/scripts"
for name in package.json README.md CHANGELOG.md LICENSE LICENSING.md NOTICE; do cp "$repo/$name" "$work/t9/"; done
cp -R "$repo/dist" "$work/t9/dist"
cp "$contents" "$work/t9/scripts/verify-package-contents.mjs"
(cd "$work/t9" && "$node22" scripts/verify-package-contents.mjs) > "$work/T9-measure.out" 2>&1
measured=$(grep -o '\./time [0-9]* of' "$work/T9-measure.out" | awk '{print $2}')
if [ -n "$measured" ]; then
  sed -i.bak "s/\"\.\/time\": [0-9_]*,/\".\/time\": $((measured - 1)),/" "$work/t9/scripts/verify-package-contents.mjs" && rm "$work/t9/scripts/verify-package-contents.mjs.bak"
  (cd "$work/t9" && "$node22" scripts/verify-package-contents.mjs) > "$work/T9.out" 2>&1
  code=$?; note T9-budget-measured-less-one "$code" "$(grep -q "over its budget of $((measured - 1))" "$work/T9.out" && echo true || echo false)"
else
  note T9-budget-measured-less-one 0 false
fi

# T10: the same calls on the site's raw functions. T11: a module-level Map.
tool T10-site-module behaviour.mjs --package "$pkg" --site "$site"
tool T11-let-cache state-scan.mjs --repo "$repo" --control

# T13: a tree whose src/index.ts re-exports timeBasis from ./time.js, built.
mkdir -p "$work/t13"
cp -R "$repo/src" "$work/t13/src"
cp -R "$repo/scripts" "$work/t13/scripts"
for name in package.json tsconfig.json tsconfig.base.json tsconfig.build.json; do cp "$repo/$name" "$work/t13/"; done
ln -s "$repo/node_modules" "$work/t13/node_modules"
printf '\nexport { timeBasis } from "./time.js";\n' >> "$work/t13/src/index.ts"
(cd "$work/t13" && npm run build > "$work/T13-build.out" 2>&1 && "$node22" scripts/module-resolution-smoke.mjs) > "$work/T13.out" 2>&1
code=$?; note T13-root-reexports-timeBasis "$code" "$(grep -q 'time leaked into root: timeBasis\|the root entry reaches src/time.ts' "$work/T13.out" && echo true || echo false)"

echo "controls that failed as required: $behaved; controls that did not: $broken"
[ "$broken" -eq 0 ]
