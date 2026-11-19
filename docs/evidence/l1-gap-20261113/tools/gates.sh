#!/usr/bin/env bash
# The engine job's commands (AGENTS.md, Commands), each with its exit status.
#
#   TMPDIR=/absolute/dir/outside/the/checkout bash docs/evidence/l1-gap-20261113/tools/gates.sh
#
# The archive-binding check refuses a TMPDIR that has a node_modules or a
# package.json above it. The machine results/gates.log was written on has a
# root-owned /node_modules, so there this script was run inside a mount
# namespace without that directory:
#
#   args=""; for d in /*; do case $d in /node_modules|/proc|/dev|/tmp) ;; *) args="$args --bind $d $d";; esac; done
#   bwrap $args --proc /proc --dev /dev --bind /tmp /tmp env TMPDIR=/tmp/job9/tmp bash docs/evidence/l1-gap-20261113/tools/gates.sh
set -u
cd "$(dirname "$0")/../../../.."
: "${TMPDIR:?set TMPDIR to an absolute directory outside the checkout}"
mkdir -p "$TMPDIR"
echo "node $(node -v); commit $(git rev-parse HEAD); $(git status --short --untracked-files=no | wc -l) modified tracked paths"
status=0
for command in "npm run typecheck" "npm test" "npm run build" "npm run exports:smoke" "npm run api:check" "npm run package:contents" "npm run pack:dry-run" "node scripts/verify-archive-binding.mjs"; do
  echo "=== $command"
  $command > "$TMPDIR/l1-gap-step.log" 2>&1
  code=$?
  tail -12 "$TMPDIR/l1-gap-step.log"
  echo "=== exit $code: $command"
  [ "$code" -eq 0 ] || status=1
done
exit "$status"
