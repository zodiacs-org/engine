#!/bin/sh
# The steps of CI's engine job on the tree of the source commit before it
# was made, on one Node version: typecheck, the full suite, build, export
# smoke, the API check, package contents and the pack dry run (1.0.0-rc.2's
# gates.sh, writing here, without NODE_OPTIONS, which CI does not set, and
# with the directory of node and npm shortened to <bin>). 1.0.0's script,
# writing here; it names each log for the platform as well as the Node
# version. 1.1.0-rc.1's script, writing here, and run only in a checkout
# that leaves docs/evidence/calc-sidereal-2026-10-05/ out (below).
# The suite's output goes to full-tests-<version>-<platform>.log beside this
# file, the rest to gates.log. The archive check reads commits, so it runs on the
# commits themselves (carrier/); on the carrier, where it rebuilds HEAD, only in
# CI.
#
# Since review 2 (varga-sensitivity/PREREGISTRATION.md, section 13, 2026-11-04)
# it also runs G-V5's --check, after the build: the table of
# docs/vedic.md, as committed, against the table recomputed from this build.
# The varga sensitivity's formal run writes that table and the source commit
# commits it, so this script is run again on the source commit for that step.
# Before the table is written docs/vedic.md holds its placeholder, and the
# step says so and does not count; once written, the file must be HEAD's blob
# and --check must pass.
#
#   TMPDIR=<tmp> sh gates.sh <checkout> <directory of the node and npm to use> <scratch directory>
set -u
unset NODE_OPTIONS
checkout=$1
bin=$2
scratch=$3
out="$checkout/docs/evidence/1.1.0-rc.2-20261102"
cd "$checkout" || exit 2
# Only in a checkout whose sparse checkout leaves out
# docs/evidence/calc-sidereal-2026-10-05/, as the clone the cut is made in
# does, never in a plain clone, which holds that folder (the cut's plan,
# corrections K6 and K12). None of the steps reads it.
# The folder must not exist either, whatever the pattern says (an untracked
# copy would pass the pattern, and the suite's default glob would walk it):
# review 1 of 1.1.0-rc.2. Only the path is tested; nothing in it is read.
[ "$(git sparse-checkout list 2>/dev/null)" = "$(printf '%s\n%s' '/*' '!/docs/evidence/calc-sidereal-2026-10-05/')" ] ||
  { echo "gates.sh: the checkout must leave out docs/evidence/calc-sidereal-2026-10-05/ (git sparse-checkout list)" >&2; exit 2; }
[ ! -e docs/evidence/calc-sidereal-2026-10-05 ] ||
  { echo "gates.sh: docs/evidence/calc-sidereal-2026-10-05 must not exist in the checkout" >&2; exit 2; }
export PATH="$bin:$PATH"
version=$(node --version)
platform=$(node -p 'process.platform + "-" + process.arch')
shorten() {
  sed -e "s#$checkout#<checkout>#g" -e "s#$scratch#<scratch>#g" -e "s#$bin#<bin>#g" -e "s#${TMPDIR:-/tmp}#<tmp>#g" -e "s#$(printf '\033')\[[0-9;]*m##g"
}
mkdir -p "$scratch"
printf '# sh gates.sh on the tree before the source commit, without NODE_OPTIONS; Node %s, npm %s, %s, %s\n' "$version" "$(npm --version)" "$platform" "$(date -u +%Y-%m-%d)" >> "$out/gates.log"
failed=0
for step in "npm run typecheck" "npm test" "npm run build" "npm run exports:smoke" "npm run api:check" "npm run package:contents" "npm run pack:dry-run"; do
  sh -c "$step" > "$scratch/step.out" 2>&1
  status=$?
  [ "$status" -eq 0 ] || failed=1
  printf '## %s\n' "$step" >> "$out/gates.log"
  if [ "$step" = "npm test" ]; then
    { printf '# TMPDIR=<tmp> npm test, Node %s\n' "$version"; shorten < "$scratch/step.out"; printf 'exit %s\n' "$status"; } > "$out/full-tests-$version-$platform.log"
    grep -E 'Test Files|Tests ' "$scratch/step.out" | shorten >> "$out/gates.log"
  else
    grep -v -E '^(CLI|ESM|DTS) |^[[:space:]]*$' "$scratch/step.out" | shorten >> "$out/gates.log"
  fi
  printf 'exit %s\n' "$status" >> "$out/gates.log"
done
# G-V5 of the varga sensitivity (above): the committed table, checked. git reads one blob by name here.
printf '## %s\n' "G-V5: docs/vedic.md's committed table, time_per_arcsecond.mjs --check" >> "$out/gates.log"
if grep -q '^\*Not written yet: the formal run of the varga sensitivity check writes this$' docs/vedic.md; then
  printf 'not run: docs/vedic.md holds the placeholder; the formal run has not written the table\n' >> "$out/gates.log"
elif [ "$(git hash-object docs/vedic.md)" != "$(git rev-parse HEAD:docs/vedic.md)" ]; then
  printf 'docs/vedic.md differs from HEAD'"'"'s: its table must be committed before it is checked\nexit 1\n' >> "$out/gates.log"
  failed=1
else
  node docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/time_per_arcsecond.mjs --check > "$scratch/step.out" 2>&1
  status=$?
  shorten < "$scratch/step.out" >> "$out/gates.log"
  printf 'exit %s\n' "$status" >> "$out/gates.log"
  [ "$status" -eq 0 ] || failed=1
fi
printf '\n' >> "$out/gates.log"
exit $failed
