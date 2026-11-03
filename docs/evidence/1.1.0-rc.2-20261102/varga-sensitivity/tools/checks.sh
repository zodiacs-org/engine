#!/bin/zsh
# The formal runs of the varga sensitivity check (PREREGISTRATION.md, section
# 10, steps 3 to 6), one at a time, in this order, on the candidate's source
# commit, after npm ci and npm run build on Node 22.22.2:
#
#   zsh checks.sh WORK [WORKERS] [PYTHON]
#
# from the repository root of engine-rc2 or of a sparse clone made as the
# preregistration's scope limitation says. WORK is a directory outside the
# repository for scratch files; WORKERS the checker's worker threads (default
# 1); PYTHON an interpreter with pyerfa 2.0.1.5 and numpy 2.4.6 for G-V4
# (OQ6), which does not run without it. Outputs go to results/ and
# results-erfa/ beside this folder. An interrupted run is run again in full.
set -eu
work=${1:?WORK, a directory outside the repository}
workers=${2:-1}
python=${3:-}
here=docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity
results=$here/results
mkdir -p "$work" "$results"
step() { print -r -- "== $*" >&2; }

step "F1 still as committed, and boundaries.json still the texts' (G-V1)"
/usr/bin/python3 -I -B $here/tools/varga_changes.py --check > "$results/f1-check.json"
/usr/bin/python3 -I -B docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py --output "$work/boundaries.json" > /dev/null
cmp "$work/boundaries.json" src/vedic/fixtures/boundaries.json
shasum -a 256 src/vedic/fixtures/boundaries.json > "$results/boundaries-sha256.txt"

step "G-V1, G-V2 (a) and the named tests, then their controls"
npx vitest run src/vedic/boundaries.test.ts src/vedic/varga-time.test.ts src/sign-rulers.test.ts \
  --reporter=json --outputFile="$results/tests.json" > /dev/null
node $here/tools/test-controls.mjs --out "$results/test-controls.json"

step "G-V3 and G-V2 (b): the run on F2 and F3, the checker, then the controls"
node $here/tools/run.mjs --out "$results"
node $here/tools/checker.mjs --results "$results/results.jsonl" --workers "$workers"
node $here/tools/controls.mjs --work "$work/controls" --workers "$workers" > "$results/controls-summary.txt"
cp "$work/controls/controls.json" "$results/controls.json"

step "Section 7's table of the derived bounds, with its control at 66.6 degrees"
/usr/bin/python3 -I -B $here/tools/derived_bounds.py --out "$results/derived-bounds.json" --latitude 66.6 > /dev/null 2> "$results/derived-bounds-control.txt"

step "G-V5: the table for docs/vedic.md (put it there, then --check, then the control on a copy)"
node $here/tools/time_per_arcsecond.mjs --out "$results/time-per-arcsecond.json" --table > "$results/time-per-arcsecond.md"

if [[ -n "$python" ]]; then
  step "G-V4: the run on F4, the arbiter's comparison, then C4a and C4b"
  node $here/tools/run.mjs --births $here/births-erfa.json --seams none --out $here/results-erfa
  "$python" -I -B $here/tools/varga_ascendant.py --results $here/results-erfa/results.jsonl --out $here/results-erfa/compare.json
  "$python" -I -B $here/tools/varga_ascendant.py --results $here/results-erfa/results.jsonl --control c4a --out $here/results-erfa/control-c4a.json
  "$python" -I -B $here/tools/varga_ascendant.py --results $here/results-erfa/results.jsonl --control c4b --out $here/results-erfa/control-c4b.json
else
  step "G-V4 not run: no interpreter with pyerfa and numpy was given"
fi
