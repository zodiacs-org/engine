#!/usr/bin/env bash
# Breaker, item 1: the dense sweep's engine side (docs/evidence/de440-sweep-20261111/tools/engine_sweep.mjs,
# --ephemeris astronomy-engine) run on the dist of the INSTALLED 1.1.0-rc.11 tarball, all eight eras; the
# SHA-256 of each era's values is then compared with the committed sweep's (1.1.0-rc.3), which
# src/calc-bounds.ts was written from. Equal bytes mean the table's measurement holds for this build.
#   sweep-values.sh <repo> <installed dist> <work dir> <out.txt>
set -u
repo=$1; dist=$2; work=$3; out=$4
mkdir -p "$work"; : > "$out"
for Y in 1800 1850 1900 1950 2000 2050 2100 2150; do
  while [ "$(jobs -rp | wc -l)" -ge 4 ]; do sleep 3; done
  ( ZODIACS_ENGINE_DIST=$dist node "$repo/docs/evidence/de440-sweep-20261111/tools/engine_sweep.mjs" --ephemeris astronomy-engine --from-year $Y --to-year $((Y+50)) --out "$work/engine-$Y.bin" > "$work/engine-$Y.log" 2>&1
    code=$?
    got=$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(m.valuesSha256, m.engine.version, m.ephemeris, m.count)' "$work/engine-$Y.bin.json" 2>/dev/null)
    want=$(node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(m.engineValuesSha256, m.engine.version)' "$repo/docs/evidence/de440-sweep-20261111/results/eras/era-$Y.json")
    rm -f "$work/engine-$Y.bin"
    echo "era $Y: exit $code; installed tarball: $got; committed sweep: $want; $([ "${got%% *}" = "${want%% *}" ] && echo SAME || echo DIFFERENT)" >> "$out" ) &
done
wait
sort -o "$out" "$out"
