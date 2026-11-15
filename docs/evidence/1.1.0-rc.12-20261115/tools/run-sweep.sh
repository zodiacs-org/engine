#!/bin/bash
# The dense DE440 sweep of .github/workflows/de440-sweep.yml run on one
# machine: the self-checks, the eight eras (four at a time) and the merge,
# with the same tools (docs/evidence/de440-sweep-20261111/tools/).
#
#   KERNEL=/abs/de440.bsp PYTHON=/abs/venv/bin/python [KEEP=1] \
#     bash run-sweep.sh astronomy-engine|de440 /abs/OUT
#
# OUT/dist must hold the build to sweep (a copy of dist/), with a
# node_modules beside it that resolves astronomy-engine. PYTHON has the
# workflow's pyerfa 2.0.1.5, numpy 2.4.6 and jplephem 2.24. KEEP=1 keeps
# each era's engine values (OUT/engine-<year>.bin), which pack_near_sun.py
# reads. The results are in OUT/results, as the workflow's.
set -e
EPH=$1; OUT=$2
SW=$(cd "$(dirname "$0")/../../de440-sweep-20261111/tools" && pwd)
: "${KERNEL:?set KERNEL to the kernel's path}" "${PYTHON:?set PYTHON to the arbiter's Python}"
export ZODIACS_ENGINE_DIST=$OUT/dist
mkdir -p "$OUT/results/eras"
"$PYTHON" "$SW/sweep.py" selfcheck "$KERNEL" "$OUT/results/selfcheck.json" > "$OUT/selfcheck.log" 2>&1
rm -f "$OUT/eras.done"
for Y in 1800 1850 1900 1950 2000 2050 2100 2150; do
  while [ "$(jobs -rp | wc -l)" -ge 4 ]; do sleep 5; done
  ( node "$SW/engine_sweep.mjs" --ephemeris "$EPH" --from-year $Y --to-year $((Y+50)) --out "$OUT/engine-$Y.bin" > "$OUT/engine-$Y.log" 2>&1 &&
    "$PYTHON" "$SW/sweep.py" shard "$KERNEL" "$OUT/engine-$Y.bin" "$OUT/results/eras/era-$Y.json" > "$OUT/shard-$Y.log" 2>&1 &&
    { [ -n "$KEEP" ] || rm -f "$OUT/engine-$Y.bin"; }; echo "era $Y exit $?" >> "$OUT/eras.done" ) &
done
wait
"$PYTHON" "$SW/sweep.py" merge "$OUT/results" "$OUT/results/selfcheck.json" "$OUT"/results/eras/era-*.json > "$OUT/merge.log" 2>&1
echo merged >> "$OUT/eras.done"
