#!/bin/sh
# The time bands' checks, one at a time, as ../PREREGISTRATION.md (sections 6
# and 8) orders them: the dumps, C1, C1b, C2, C3, C4, C5, C7 and the named
# tests' controls; C6 only after the cut's commit X has regenerated the calc
# round-trip fixture. Run on a build (npm run build), with Node 22.22.2 first
# on PATH and Python 3.9.6 as python3.
#
#   sh checks.sh <checkout> <work dir> <site clone> trial    # T0 and its event window E0 only
#   sh checks.sh <checkout> <work dir> <site clone> formal   # T1, T2, T3 and E, on the source commit's build
#
# The work directory must be outside the checkout; it is emptied first. The
# site clone gives the ΔT model's Python twin and its table from site main's
# git objects (9a67f761, read by name with lazy fetching off). Every git
# command here names its object; none walks a tree. Outputs: <work>/results/.
set -u
repo=$(cd "$1" && pwd)
work=$2
site=$3
mode=$4
tools=$(cd "$(dirname "$0")" && pwd)
SITE_MAIN=9a67f761bc231741c6571af2dfae65b798954e11
# The commit before the band commits (Add the time bands), for C7.
BEFORE_BANDS=3129edec9195a2e1949d907c9f74cf16dfc2c7ef
case "$work" in "$repo"|"$repo"/*) echo "the work directory must be outside the checkout"; exit 2;; esac
rm -rf "$work"
mkdir -p "$work/results" "$work/site"
GIT_NO_LAZY_FETCH=1 git -C "$site" cat-file -p "$SITE_MAIN:docs/platform/evidence/deltat-2026-09-25/tools/lib.py" > "$work/site/lib.py" || exit 2
GIT_NO_LAZY_FETCH=1 git -C "$site" cat-file -p "$SITE_MAIN:docs/platform/evidence/deltat-2026-09-25/table.json" > "$work/site/table.json" || exit 2
if [ "$mode" = trial ]; then instants="T0"; events="E0"; else instants="T1 T2 T3"; events="E"; fi
status=0
step() { # name, command...
  name=$1; shift
  echo "=== $name $(date '+%Y-%m-%d %H:%M:%S %Z')"
  "$@" || status=1
}
for corpus in $instants $events; do
  step "dump $corpus" node "$tools/dump.mjs" --package "$repo" --corpus "$corpus" --out "$work/dump-$corpus.json"
done
dumps=""
for corpus in $instants $events; do dumps="$dumps --dump $work/dump-$corpus.json"; done
sources="--site-lib $work/site/lib.py --site-table $work/site/table.json --sources $repo/scripts/time-scale-sources"
step C1 python3 -I "$tools/bands.py" c1 $dumps --out "$work/results/c1.json"
step C1b python3 -I "$tools/bands.py" c1b $dumps $sources --out "$work/results/c1b.json"
if [ "$mode" = trial ]; then
  step "C2 inventory" python3 -I "$tools/horizons.py" --horizons "$repo/docs/evidence/calc-api/horizons" --inventory
  step "C2 selftest" python3 -I "$tools/horizons.py" --horizons "$repo/docs/evidence/calc-api/horizons" --selftest
  step C3 python3 -I "$tools/angles.py" --dump "$work/dump-T0.json" --arbiter "$repo/conformance/arbiters/l2/build.py" --out "$work/results/c3.json"
  step C4 node "$tools/pinned.mjs" --package "$repo" --corpus T0 --out "$work/results/c4.json"
  step C5 python3 -I "$tools/bands.py" c5 --dump "$work/dump-E0.json" $sources --out "$work/results/c5.json"
else
  step C2 python3 -I "$tools/horizons.py" --dump "$work/dump-T1.json" --horizons "$repo/docs/evidence/calc-api/horizons" --out "$work/results/c2.json"
  step C3 python3 -I "$tools/angles.py" --dump "$work/dump-T2.json" --dump "$work/dump-T3.json" --arbiter "$repo/conformance/arbiters/l2/build.py" --out "$work/results/c3.json"
  step C4 node "$tools/pinned.mjs" --package "$repo" --corpus T2 --out "$work/results/c4.json"
  step C5 python3 -I "$tools/bands.py" c5 --dump "$work/dump-E.json" $sources --out "$work/results/c5.json"
fi
step C7 node "$tools/api-grows.mjs" --repo "$repo" --base a253973 --base "$BEFORE_BANDS" --controls "$work/c7-controls" --out "$work/results/c7.json"
step "named tests' controls" node "$tools/named-controls.mjs" --repo "$repo" --work "$work/named" --out "$work/results/named-controls.json"
GIT_NO_LAZY_FETCH=1 git -C "$repo" cat-file -p a253973:src/fixtures/calc-roundtrip.json > "$work/base-calc-roundtrip.json" || status=1
if cmp -s "$work/base-calc-roundtrip.json" "$repo/src/fixtures/calc-roundtrip.json"; then
  echo "=== C6: not run; the fixture is a253973's, so commit X has not regenerated it"
  step "C6 selftest" node "$tools/fixture-diff.mjs" --base "$work/base-calc-roundtrip.json" --selftest
else
  step C6 node "$tools/fixture-diff.mjs" --base "$work/base-calc-roundtrip.json" --fixture "$repo/src/fixtures/calc-roundtrip.json" --control --out "$work/results/c6.json"
fi
echo "=== dumps"
for corpus in $instants $events; do shasum -a 256 "$work/dump-$corpus.json" | sed "s|$work/||"; done
echo "=== $(node --version), $(python3 --version), $(git -C "$repo" rev-parse HEAD)"
exit $status
