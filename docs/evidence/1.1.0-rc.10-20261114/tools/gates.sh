#!/usr/bin/env bash
# Every gate command of AGENTS.md (Commands) that needs no second Node
# version, each with its exit status: the engine job, the conformance
# workflow (with its second run, on the fallback), the atlas workflow, and
# the offline CLI's consumer check, which holds the carried 1.0.0-rc.2 archive
# to the fallback's committed verdicts (the breaker's should-fix 2).
#
#   TMPDIR=/absolute/dir/outside/the/checkout bash docs/evidence/1.1.0-rc.10-20261114/tools/gates.sh
#
# The archive-binding check refuses a TMPDIR that has a node_modules or a
# package.json above it. The machine the logs were written on has a
# root-owned /node_modules, so there this script was run inside a mount
# namespace without that directory, as docs/evidence/l1-gap-20261113/tools/gates.sh
# describes:
#
#   args=""; for d in /*; do case $d in /node_modules|/proc|/dev|/tmp) ;; *) args="$args --bind $d $d";; esac; done
#   bwrap $args --proc /proc --dev /dev --bind /tmp /tmp env TMPDIR=/tmp/job9rc/tmp PATH=<node 22.22.2>/bin:/usr/bin:/bin bash docs/evidence/1.1.0-rc.10-20261114/tools/gates.sh
set -u
cd "$(dirname "$0")/../../../.."
: "${TMPDIR:?set TMPDIR to an absolute directory outside the checkout}"
mkdir -p "$TMPDIR"
echo "node $(node -v), npm $(npm -v); commit $(git rev-parse HEAD); $(git status --short --untracked-files=no | wc -l) modified tracked paths"
status=0
run() {
  echo "=== $*"
  "$@" > "$TMPDIR/rc10-step.log" 2>&1
  code=$?
  tail -12 "$TMPDIR/rc10-step.log" | cut -c1-2000
  echo "=== exit $code: $*"
  [ "$code" -eq 0 ] || status=1
}
run npm run typecheck
run npm test
run npm run build
run npm run exports:smoke
run npm run api:check
run npm run package:contents
run npm run pack:dry-run
run node scripts/build-de440-pack.mjs --check
run node scripts/verify-archive-binding.mjs
run node --test conformance/harness/selftest.mjs
run node conformance/harness/validate.mjs --expect-total 500
run node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --check conformance/results/zodiacs-engine.json
run node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs --ephemeris astronomy-engine" --check conformance/results/zodiacs-engine-astronomy-engine.json
run node conformance/harness/report.mjs --check
run node atlas/tools/check.mjs
run node --test atlas/tools/selftest.mjs
# The offline CLI workflow's two steps (.github/workflows/offline-cli.yml). They
# write two reports at the repository root, which are removed afterwards.
run node tools/cli/scripts/preserve-checkout-bytes.mjs
run node tools/cli/scripts/prepare-consumer.mjs
rm -f cli-checkout-byte-receipt.json cli-consumer-report.json
exit "$status"
