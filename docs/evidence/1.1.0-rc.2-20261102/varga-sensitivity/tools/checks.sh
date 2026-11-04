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
# written into docs/vedic.md here, and its control, a copy of docs/vedic.md
# with one figure changed, must fail --check. The script exits 1 if any check
# failed or any control passed.
#
# Changed after review 2 (PREREGISTRATION.md, section 13, 2026-11-04): the
# SHA-256 of boundaries.json and of the inputs is compared with the values
# recorded for them, not only written; section 7's control at 66.6 degrees is
# a step of its own, whose verdict is whether the script says the lower bound
# has no real value there; the named-test step runs the existing Vedic tests
# too (src/vedic/*.test.ts and src/sign-rulers.test.ts); and G-V5's --check
# against docs/vedic.md is no longer run here, straight after --write, where
# it could not fail: it is a step of ../../gates.sh, run on the source commit
# once the table is committed.
#
# Changed after G-V4's interruption (PREREGISTRATION.md, section 13,
# 2026-11-04): `zsh checks.sh --g-v4 WORK WORKERS PYTHON` runs section 10's
# step 5 alone, G-V4 with the same four commands as below, and records its
# steps in results-erfa/steps.tsv; so an interrupted G-V4 is run again in
# full without the steps before it.
set -u
only=
if [[ ${1:-} == --g-v4 ]]; then only=g-v4; shift; fi
work=${1:?WORK, a directory outside the repository}
workers=${2:-1}
python=${3:-}
here=docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity
results=$here/results
if [[ $only == g-v4 ]]; then results=$here/results-erfa; fi
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

# G-V4 (section 10, step 5), the last step of the full run: a function, so
# that --g-v4 can run it alone.
g_v4() {
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
}
if [[ $only == g-v4 ]]; then
  g_v4
  exit $outcome
fi

step "F1 still as committed, and boundaries.json still the texts' (G-V1)"
/usr/bin/python3 -I -B $here/tools/varga_changes.py --check > "$results/f1-check.json"
record "F1: varga_changes.py --check" check $?
/usr/bin/python3 -I -B docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py --output "$work/boundaries.json" > /dev/null
record "G-V1: boundary_fixtures.py --output" check $?
cmp "$work/boundaries.json" src/vedic/fixtures/boundaries.json
record "G-V1: the regenerated boundaries.json equals the committed one" check $?
shasum -a 256 src/vedic/fixtures/boundaries.json > "$results/boundaries-sha256.txt"
record "G-V1: boundaries.json's SHA-256 written" check $?
# The SHA-256 recorded for each, compared with the files (since review 2): boundaries.json's in section 6
# (docs/evidence/vedic-2026-09-28/README.md:581-583), the inputs' in INPUTS.md, section 1, and F3b's and its
# generator's in the amendment of 2026-11-03, "review 1: C3d and the seam input F3b".
print -r -- "3578be675ddb51bb80ab543431d654c9a6e7bcab4d70d9abcae381ea29dcd51f  src/vedic/fixtures/boundaries.json
c5fa637151d8407466ead69dad053eb39c04dcff863061ff508ff74501f2ef46  $here/tools/varga_changes.py
2207fbea5b7e02a14f387ab77e76dea4006088ba7baf27c52d29ee8312f82750  src/vedic/fixtures/varga-changes.json
349c69805fa8d823078d6cd44efbd85a6bd46b825a1ee57babf3ccf626bcbcfd  $here/tools/generate.mjs
e333a037563d94f1e5b9ed42269166a4024808284b510b7ce199ab6817aff5c7  $here/births.json
5c6ddf9d0a3f2325923538b8965bd3acc2a3b4975a96ce502b60c7b488cab6d9  $here/births-erfa.json
2c146c35389454182078d6cff8d7081ee4beec2e1b8c9fe6464ccdc88bbb7dac  $here/tools/seams.mjs
956a3ad8a9e3d29249b16c55a3f25372e6e42850510e9d31555e86bccb648d70  $here/seams.json
052c05131e33f63dd5b8693b08f4facd50421ce74583e62ad26cf1bea828469e  $here/seams-f3b.json
f8d4822b814b1db14ce7f972a9926a13d0c9c8889186416cc151de1f5e191360  $here/tools/seams_f3b.mjs" > "$results/inputs-sha256.recorded"
shasum -a 256 -c "$results/inputs-sha256.recorded" > "$results/inputs-sha256.txt" 2>&1
record "G-V1 and section 6: boundaries.json and the inputs against their recorded SHA-256" check $?

step "G-V1, G-V2 (a) and the named tests, then their controls"
# Section 8's named tests: G-V1 and G-V2 (a) in boundaries.test.ts and varga-time.test.ts, and, since review 2,
# the existing Vedic tests its table lists, every src/vedic/*.test.ts and src/sign-rulers.test.ts.
npx vitest run src/vedic/*.test.ts src/sign-rulers.test.ts \
  --reporter=json --outputFile="$results/tests.json" > /dev/null
record "G-V1, G-V2 (a), the named tests and the existing Vedic tests (vitest)" check $?
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
# The control (since review 2 a step of its own): at 66.6 degrees, beyond 90 - 23.5, the lower bound has no real
# value, and the script must say so for each of its three rates, in the table and on stderr. The check run on
# that latitude asks for a real lower bound there, so it must fail; it fails only where the script says there
# is none.
/usr/bin/python3 -I -B -c '
import json, sys
table = json.load(open(sys.argv[1], encoding="utf-8"))
note = "no real value: |phi| is beyond 90 - 23.5 = 66.5 degrees"
rows = [row for entry in table["rates"].values() for row in entry["rows"] if row["latitude"] == 66.6]
said = [row for row in rows if row["R_lo"] is None and row["note"] == note]
lines = [line for line in open(sys.argv[2], encoding="utf-8") if line.rstrip().endswith(", 66.6 degrees: the lower bound has " + note)]
print(f"66.6 degrees: {len(rows)} rows; {len(said)} with no real lower bound in the table, {len(lines)} said so on stderr")
sys.exit(1 if len(rows) == 3 and len(said) == 3 and len(lines) == 3 else 0)
' "$results/derived-bounds.json" "$results/derived-bounds-control.txt" > "$results/derived-bounds-control-verdict.txt" 2>&1
record "section 7 control: a real lower bound asked for at 66.6 degrees (must fail; the script says there is none)" control $?

step "G-V5: the table, written into docs/vedic.md, then its control on a copy"
node $here/tools/time_per_arcsecond.mjs --out "$results/time-per-arcsecond.json" --table > "$results/time-per-arcsecond.md"
record "G-V5: time_per_arcsecond.mjs --table" check $?
node $here/tools/time_per_arcsecond.mjs --write > "$results/time-per-arcsecond-write.txt" 2>&1
record "G-V5: the table written into docs/vedic.md (--write)" check $?
# No --check here (since review 2): straight after --write it could not fail. It is a step of ../../gates.sh,
# against the table once committed.
node $here/tools/time_per_arcsecond.mjs --control-copy "$work/vedic-g-v5-control.md" > "$results/time-per-arcsecond-control-copy.txt" 2>&1
record "G-V5: the control's copy of docs/vedic.md, one figure changed (--control-copy)" check $?
node $here/tools/time_per_arcsecond.mjs --check --docs "$work/vedic-g-v5-control.md" > "$results/time-per-arcsecond-control.txt" 2>&1
record "G-V5 control: --check against the copy must fail" control $?

g_v4
exit $outcome
