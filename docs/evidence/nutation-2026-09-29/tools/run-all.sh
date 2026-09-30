#!/bin/bash
# Reruns every measurement behind ../README.md from the checkout root on
# Node 22.22.2. Needs:
#   ERFA_PYTHON    a Python with numpy and pyerfa 2.0.1.5
#   DE440S_PYTHON  a Python with numpy, pyerfa and jplephem, and DE440S, the path of JPL's de440s.bsp
#   SWISS_PYTHON   a Python with pyswisseph 2.10.03 (default python3), and
#   SE_EPHE_PATH   a directory with Swiss's sepl_18.se1 and semo_18.se1
#   TMPDIR         outside the checkout
# Writes results/ and a scratch directory only; nothing Swiss computes is
# written anywhere but that scratch directory, and only statistics reach
# results/.
set -euo pipefail
cd "$(dirname "$0")/../../../.."
HERE=docs/evidence/nutation-2026-09-29
OUT=$HERE/results
WORK=${WORK:-$(mktemp -d)}
: "${ERFA_PYTHON:?set ERFA_PYTHON}" "${DE440S_PYTHON:?set DE440S_PYTHON}" "${DE440S:?set DE440S}" "${SE_EPHE_PATH:?set SE_EPHE_PATH}"
SWISS_PYTHON=${SWISS_PYTHON:-python3}
export PYTHONDONTWRITEBYTECODE=1 SE_EPHE_PATH

# The ERFA fixture and its tolerances (src/fixtures/nutation-erfa.json): must be unchanged.
"$ERFA_PYTHON" "$HERE/tools/erfa_fixtures.py" --check

npm run build

# The module against the ERFA fixture and NOVAS's own loop.
node "$HERE/tools/module-against-erfa.mjs" > "$OUT/module-against-erfa.json"

# The plumbing proof, and the equation of the equinoxes.
node "$HERE/tools/plumbing.mjs" "$OUT/plumbing.json"
"$ERFA_PYTHON" "$HERE/tools/ee-choice.py" > "$OUT/ee-choice.json"
node "$HERE/tools/nutation-change.mjs" > "$OUT/nutation-change.json"

# Longitudes and angles against ERFA, before and after.
node "$HERE/tools/erfa-dump.mjs" > "$WORK/erfa-dump.jsonl"
"$ERFA_PYTHON" "$HERE/tools/erfa-compare.py" "$WORK/erfa-dump.jsonl" > "$OUT/erfa-frame.json"

# The pinned test values beside ERFA.
node "$HERE/tools/test-expectations.mjs" > "$WORK/test-expectations.json"
"$ERFA_PYTHON" "$HERE/tools/test-expectations.py" "$WORK/test-expectations.json" > "$OUT/test-expectations.json"

# Swiss Ephemeris as an instrument: positions, nutation, mean points, angles.
node "$HERE/tools/swiss-dump.mjs" > "$WORK/swiss-dump.json"
"$SWISS_PYTHON" "$HERE/tools/swiss-compare.py" "$WORK/swiss-dump.json" > "$OUT/swiss.json"

# The rc.9 house ladder end to end, and its worst Koch case.
node "$HERE/tools/ladder-dump.mjs" > "$WORK/ladder.json"
"$SWISS_PYTHON" "$HERE/tools/ladder-compare.py" "$WORK/ladder.json" > "$OUT/ladder.json" 2> "$WORK/worst-koch-inputs.json"
node "$HERE/tools/worst-koch.mjs" "$WORK/worst-koch-inputs.json" > "$OUT/worst-koch.json"

# Declinations and the solstices against DE440s, both engines.
RC15=$(mktemp -d)
mkdir -p "$RC15/rc14" "$RC15/rc15" "$RC15/node_modules"
tar -xzf artifacts/zodiacs-engine-0.1.1-rc.14.tgz -C "$RC15/rc14"
tar -xzf artifacts/zodiacs-engine-0.1.1-rc.15.tgz -C "$RC15/rc15"
ln -s "$(pwd)/node_modules/astronomy-engine" "$RC15/node_modules/astronomy-engine"
"$DE440S_PYTHON" "$HERE/tools/declination-truth.py" dist/index.js "$DE440S" "$OUT/declination-truth.json"
"$DE440S_PYTHON" "$HERE/tools/declination-truth.py" "$RC15/rc15/package/dist/index.js" "$DE440S" "$OUT/declination-truth-rc15.json"
"$DE440S_PYTHON" "$HERE/tools/sun-solstices.py" dist/index.js "$DE440S" "$OUT/sun-solstices.json"

# Receipts of rc.14 replayed, and ordinary charts against rc.14 and rc.15
# (the rc.15 candidate's own tools).
node docs/evidence/rc15-20260929/receipt-replay.mjs "$RC15/rc14/package" "$(pwd)" "$OUT/receipt-replay.json" > /dev/null
node docs/evidence/rc15-20260929/rc14-comparison.mjs "$RC15/rc14/package" "$(pwd)" "$OUT/rc14-comparison.json" > /dev/null
node docs/evidence/rc15-20260929/rc14-comparison.mjs "$RC15/rc15/package" "$(pwd)" "$OUT/rc15-comparison.json" > /dev/null
rm -rf "$RC15"

# Size and time.
node "$HERE/tools/sizes.mjs" > "$OUT/sizes.json"
node "$HERE/tools/performance.mjs" > "$OUT/performance.json"
echo "done: $OUT (scratch: $WORK)"
