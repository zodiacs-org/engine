#!/usr/bin/env bash
# breaker's run of the engine job's commands (AGENTS.md), each with its exit status
set -u
cd /workspace/wt/fable-job9
export PATH=/tmp/job9/node2222/node-v22.22.2-linux-x64/bin:$PATH
export TMPDIR=/tmp/job9b/tmp
echo "node $(node -v); commit $(git rev-parse HEAD); $(git status --short --untracked-files=no | wc -l) modified tracked paths; $(date -u +%FT%TZ)"
status=0
for command in "npm run typecheck" "npm test" "npm run build" "npm run exports:smoke" "npm run api:check" "npm run package:contents" "npm run pack:dry-run" "node scripts/verify-archive-binding.mjs" "node scripts/verify-archive-binding.mjs --rebuild-all" "node --test conformance/harness/selftest.mjs" "node conformance/harness/validate.mjs --expect-total 500" "node conformance/harness/report.mjs --check" "node atlas/tools/check.mjs" "node --test atlas/tools/selftest.mjs"; do
  echo "=== $command"
  $command > /tmp/job9b/step.log 2>&1
  code=$?
  tail -14 /tmp/job9b/step.log
  echo "=== exit $code: $command"
  [ "$code" -eq 0 ] || status=1
done
echo "=== conformance run --check"
node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --check conformance/results/zodiacs-engine.json; code=$?; echo "=== exit $code: run.mjs --check"; [ "$code" -eq 0 ] || status=1
echo "overall $status"
exit $status
