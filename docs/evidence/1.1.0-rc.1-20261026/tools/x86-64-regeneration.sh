#!/bin/sh
# The two files this candidate regenerates because arm64 rounds some of their
# values differently (the 1.0.0 record): src/fixtures/calc-roundtrip.json and
# conformance/results/zodiacs-engine.json, rebuilt with the official Node
# 22.22.2 linux-x64 build on Linux x86-64 (here an x86-64 virtual machine on
# a Mac, under emulation), from a checkout whose dist/ is this tree's build.
# Then report.mjs and git status: the committed files must come back byte for
# byte. Prints the platform, the commands and their output, with the checkout
# shortened to <checkout>.
#
#   sh x86-64-regeneration.sh <checkout> <directory of the linux-x64 node>
set -u
unset NODE_OPTIONS
checkout=$1
bin=$2
cd "$checkout" || exit 2
export PATH="$bin:$PATH"
shorten() { sed -e "s#$checkout#<checkout>#g" -e "s#$bin#<bin>#g"; }
printf '# sh x86-64-regeneration.sh; %s %s, Node %s, %s\n' "$(uname -s)" "$(uname -m)" "$(node --version)" "$(date -u +%Y-%m-%d)"
node -p '"node " + process.version + " " + process.platform + "-" + process.arch'
for step in "node scripts/build-calc-roundtrip.mjs" "node conformance/harness/run.mjs --adapter \"node conformance/adapters/zodiacs-engine.mjs\" --out conformance/results/zodiacs-engine.json" "node conformance/harness/report.mjs"; do
  printf '## %s\n' "$step"
  sh -c "$step" > "${TMPDIR:-/tmp}/x86-64-step.out" 2>&1
  status=$?
  shorten < "${TMPDIR:-/tmp}/x86-64-step.out"
  printf 'exit %s\n' "$status"
done
printf '## git status --porcelain -- src/fixtures conformance\n'
git status --porcelain -- src/fixtures conformance
printf '(end of status)\n'
