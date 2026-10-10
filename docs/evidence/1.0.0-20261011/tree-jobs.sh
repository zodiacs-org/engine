#!/bin/sh
# The jobs of CI that gates.sh does not run, on the tree of the source commit
# before it was made, as CONTRIBUTING.md asks before an archive is packed: the
# pack, and the packed-consumer check on that pack with each Node version the
# consumer job uses; the conformance job's checks; and the atlas job; without
# NODE_OPTIONS, which CI does not set. Writes tree-jobs.log beside this file,
# with the checkout, the scratch directory, TMPDIR and the directory of node
# and npm shortened to <checkout>, <scratch>, <tmp> and <bin>.
#
#   TMPDIR=<tmp> sh tree-jobs.sh <checkout> <scratch directory> <node 22.22.2 bin> <node 20.19.0 bin> <node 22.7.0 bin> <node 24.21.0 bin>
set -u
unset NODE_OPTIONS
checkout=$1
scratch=$2
main=$3
out="$checkout/docs/evidence/1.0.0-20261011"
log="$out/tree-jobs.log"
cd "$checkout" || exit 2
shorten() {
  sed -e "s#$checkout#<checkout>#g" -e "s#$scratch#<scratch>#g" -e "s#$bin#<bin>#g" -e "s#${TMPDIR:?}#<tmp>#g" -e "s#$(printf '\033')\[[0-9;]*m##g"
}
failed=0
# step <label> <node bin> <command...>
step() {
  label=$1
  bin=$2
  shift 2
  printf '## %s (Node %s)\n' "$label" "$("$bin/node" --version)" >> "$log"
  PATH="$bin:/usr/bin:/bin" "$@" > "$scratch/step.out" 2>&1
  status=$?
  grep -v -E '^(CLI|ESM|DTS) |^[[:space:]]*$|^> ' "$scratch/step.out" | shorten >> "$log"
  printf 'exit %s\n' "$status" >> "$log"
  [ "$status" -eq 0 ] || failed=1
}
rm -rf "$scratch/pack" && mkdir -p "$scratch/pack"
printf '# sh tree-jobs.sh on the tree before the source commit, without NODE_OPTIONS, %s\n' "$(date -u +%Y-%m-%d)" > "$log"
step "npm run build" "$main" npm run build
step "npm pack --ignore-scripts" "$main" npm pack --ignore-scripts --pack-destination "$scratch/pack"
step "the pack" "$main" sh -c "cd '$scratch/pack' && shasum -a 256 *.tgz && wc -c *.tgz"
for bin in "$4" "$5" "$main" "$6"; do
  step "node scripts/verify-packed-consumer.mjs <the pack>" "$bin" sh -c "node scripts/verify-packed-consumer.mjs \"\$(ls '$scratch'/pack/*.tgz)\""
done
step "node --test conformance/harness/selftest.mjs" "$main" node --test conformance/harness/selftest.mjs
step "node conformance/harness/validate.mjs --expect-total 500" "$main" node conformance/harness/validate.mjs --expect-total 500
step "node conformance/harness/run.mjs --check" "$main" node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --check conformance/results/zodiacs-engine.json
step "node conformance/harness/report.mjs --check" "$main" node conformance/harness/report.mjs --check
step "node atlas/tools/check.mjs" "$main" node atlas/tools/check.mjs
step "node --test atlas/tools/selftest.mjs" "$main" node --test atlas/tools/selftest.mjs
printf '\n' >> "$log"
exit $failed
