#!/usr/bin/env bash
# Breaker's rerun of the gate commands of AGENTS.md (Commands) on the head of
# audit/fable-job9-de440-rc, each with its exit status. Run from the checkout
# root inside a mount namespace without the machine's root-owned
# /node_modules, Node 22.22.2 first on PATH, TMPDIR outside the checkout.
set -u
: "${TMPDIR:?}"
echo "node $(node -v), npm $(npm -v); commit $(git rev-parse HEAD); $(git status --short --untracked-files=no | wc -l) modified tracked paths"
status=0
run() {
  echo "=== $*"
  "$@" > "$TMPDIR/step.log" 2>&1
  code=$?
  tail -14 "$TMPDIR/step.log" | cut -c1-1500
  echo "=== exit $code: $*"
  [ "$code" -eq 0 ] || status=1
}
run npm ci --no-audit --no-fund
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
run node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs --ephemeris astronomy-engine" --levels L1 --check conformance/results/zodiacs-engine-astronomy-engine.json
run node conformance/harness/report.mjs --check
run node atlas/tools/check.mjs
run node --test atlas/tools/selftest.mjs
echo "overall $status"
exit "$status"
