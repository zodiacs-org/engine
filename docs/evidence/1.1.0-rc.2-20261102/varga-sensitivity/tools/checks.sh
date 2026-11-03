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
#
# Changed after review 1 (PREREGISTRATION.md, section 13, 2026-11-03): no step
# stops the procedure. "A FAIL stays recorded" (section 10), so each step runs
# whatever the steps before it gave, and its name, its kind and its exit
# status go to results/steps.tsv: a "check" must exit 0, and a "control" is a
# check run on a broken input, which must exit non-zero. The tools that run
# several controls (test-controls.mjs, controls.mjs, varga_ascendant.py's C4a
# and C4b) record each control's outcome in their own outputs. G-V3 runs F3b
# (seams-f3b.json) beside F2 and F3, and C3d runs on F3b. G-V5's table is
# written into docs/vedic.md here, then checked there with --check, and its
# control, a copy of docs/vedic.md with one figure changed, must fail that
# check. The script exits 1 if any check failed or any control passed.
set -u
work=${1:?WORK, a directory outside the repository}
workers=${2:-1}
python=${3:-}
here=docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity
results=$here/results
mkdir -p "$work" "$results"
steps=$results/steps.tsv
print -r -- $'step\tkind\texit\tas required' > "$steps"
outcome=0
step() { print -r -- "== $*" >&2; }
# record NAME KIND STATUS: one line of steps.tsv for the command just run.
record() {
  local required=yes
  if [[ $2 == check && $3 -ne 0 ]] || [[ $2 == control && $3 -eq 0 ]]; then required=NO; outcome=1; fi
  print -r -- "$1	$2	$3	$required" >> "$steps"
}

step "F1 still as committed, and boundaries.json still the texts' (G-V1)"
/usr/bin/python3 -I -B $here/tools/varga_changes.py --check > "$results/f1-check.json"
record "F1: varga_changes.py --check" check $?
/usr/bin/python3 -I -B docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py --output "$work/boundaries.json" > /dev/null
record "G-V1: boundary_fixtures.py --output" check $?
cmp "$work/boundaries.json" src/vedic/fixtures/boundaries.json
record "G-V1: the regenerated boundaries.json equals the committed one" check $?
shasum -a 256 src/vedic/fixtures/boundaries.json > "$results/boundaries-sha256.txt"
record "G-V1: boundaries.json's SHA-256" check $?

step "G-V1, G-V2 (a) and the named tests, then their controls"
npx vitest run src/vedic/boundaries.test.ts src/vedic/varga-time.test.ts src/sign-rulers.test.ts \
  --reporter=json --outputFile="$results/tests.json" > /dev/null
record "G-V1, G-V2 (a) and the named tests (vitest)" check $?
node $here/tools/test-controls.mjs --out "$results/test-controls.json"
record "their controls: test-controls.mjs (each control's outcome in test-controls.json)" check $?

step "G-V3 and G-V2 (b): the run on F2, F3 and F3b, the checker, then the controls"
node $here/tools/run.mjs --out "$results"
record "G-V3: run.mjs on F2, F3 and F3b" check $?
node $here/tools/checker.mjs --results "$results/results.jsonl" --workers "$workers"
record "G-V3 and G-V2 (b): checker.mjs" check $?
node $here/tools/controls.mjs --work "$work/controls" --workers "$workers" > "$results/controls-summary.txt"
record "their controls: controls.mjs (each control's outcome in controls.json)" check $?
cp "$work/controls/controls.json" "$results/controls.json"
record "controls.json copied" check $?

step "Section 7's table of the derived bounds, with its control at 66.6 degrees"
/usr/bin/python3 -I -B $here/tools/derived_bounds.py --out "$results/derived-bounds.json" --latitude 66.6 > /dev/null 2> "$results/derived-bounds-control.txt"
record "section 7: derived_bounds.py (its control's note in derived-bounds-control.txt)" check $?

step "G-V5: the table, written into docs/vedic.md, checked there, then its control on a copy"
node $here/tools/time_per_arcsecond.mjs --out "$results/time-per-arcsecond.json" --table > "$results/time-per-arcsecond.md"
record "G-V5: time_per_arcsecond.mjs --table" check $?
node $here/tools/time_per_arcsecond.mjs --write > "$results/time-per-arcsecond-write.txt" 2>&1
record "G-V5: the table written into docs/vedic.md (--write)" check $?
node $here/tools/time_per_arcsecond.mjs --check > "$results/time-per-arcsecond-check.txt" 2>&1
record "G-V5: --check against docs/vedic.md" check $?
node $here/tools/time_per_arcsecond.mjs --control-copy "$work/vedic-g-v5-control.md" > "$results/time-per-arcsecond-control-copy.txt" 2>&1
record "G-V5: the control's copy of docs/vedic.md, one figure changed (--control-copy)" check $?
node $here/tools/time_per_arcsecond.mjs --check --docs "$work/vedic-g-v5-control.md" > "$results/time-per-arcsecond-control.txt" 2>&1
record "G-V5 control: --check against the copy must fail" control $?

if [[ -n "$python" ]]; then
  step "G-V4: the run on F4, the arbiter's comparison, then C4a and C4b"
  node $here/tools/run.mjs --births $here/births-erfa.json --seams none --f3b none --out $here/results-erfa
  record "G-V4: run.mjs on F4" check $?
  "$python" -I -B $here/tools/varga_ascendant.py --results $here/results-erfa/results.jsonl --out $here/results-erfa/compare.json
  record "G-V4: varga_ascendant.py" check $?
  "$python" -I -B $here/tools/varga_ascendant.py --results $here/results-erfa/results.jsonl --control c4a --out $here/results-erfa/control-c4a.json
  record "G-V4 control C4a: varga_ascendant.py --control c4a (its verdict in control-c4a.json)" check $?
  "$python" -I -B $here/tools/varga_ascendant.py --results $here/results-erfa/results.jsonl --control c4b --out $here/results-erfa/control-c4b.json
  record "G-V4 control C4b: varga_ascendant.py --control c4b (its verdict in control-c4b.json)" check $?
else
  step "G-V4 not run: no interpreter with pyerfa and numpy was given"
  print -r -- $'G-V4: not run, no interpreter with pyerfa and numpy was given\tcheck\t-\tNO' >> "$steps"
  outcome=1
fi
exit $outcome
