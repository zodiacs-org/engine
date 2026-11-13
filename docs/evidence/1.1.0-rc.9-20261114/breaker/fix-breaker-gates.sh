#!/usr/bin/env bash
# Fix-round breaker: the gate commands of AGENTS.md on the head, after a new
# npm ci, each with its exit status; then the conformance workflow's second
# run, the pack generator check, the Offline CLI consumer's two steps, the
# packed-consumer check on the carried tarball, and --rebuild-all.
#   NODE_BIN=<node 22.22.2>/bin NS_TMPDIR=/tmp/<dir> bash fix-breaker-ns.sh bash fix-breaker-gates.sh
set -u
cd "$(dirname "$0")/../../../.."
for name in $(env | sed -n 's/^\(ZODIACS[A-Za-z0-9_]*\)=.*/\1/Ip'); do unset "$name"; done
mkdir -p "$TMPDIR"
echo "node $(node -v), npm $(npm -v); commit $(git rev-parse HEAD); $(git status --short --untracked-files=no | wc -l) modified tracked paths"
status=0
run() {
  echo "=== $*"
  "$@" > "$TMPDIR/fix-breaker-step.log" 2>&1
  code=$?
  tail -${TAIL:-8} "$TMPDIR/fix-breaker-step.log" | cut -c1-1500
  echo "=== exit $code: $*"
  [ "$code" -eq 0 ] || status=1
}
run npm ci
run npm run typecheck
TAIL=14 run npm test
run npm run build
run npm run exports:smoke
run npm run api:check
TAIL=30 run npm run package:contents
run npm run pack:dry-run
run node scripts/build-de440-pack.mjs --check
TAIL=20 run node scripts/verify-archive-binding.mjs
run node --test conformance/harness/selftest.mjs
run node conformance/harness/validate.mjs --expect-total 500
run node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --check conformance/results/zodiacs-engine.json
run node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs --ephemeris astronomy-engine" --check conformance/results/zodiacs-engine-astronomy-engine.json
run node conformance/harness/report.mjs --check
run node atlas/tools/check.mjs
run node --test atlas/tools/selftest.mjs
run node tools/cli/scripts/preserve-checkout-bytes.mjs
TAIL=25 run node tools/cli/scripts/prepare-consumer.mjs
rm -f cli-checkout-byte-receipt.json cli-consumer-report.json
TAIL=25 run node scripts/verify-packed-consumer.mjs "$PWD/artifacts/zodiacs-engine-1.1.0-rc.9.tgz"
TAIL=30 run node scripts/verify-archive-binding.mjs --rebuild-all
echo "tracked paths modified after the gates: $(git status --short --untracked-files=no | wc -l)"
echo "overall status $status"
exit "$status"
