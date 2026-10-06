#!/bin/sh
# The steps of CI's engine job on the tree of the source commit before it
# was made, on one Node version: typecheck, the full suite, build, export
# smoke, package contents and the pack dry run (rc.15's rebuilt/gates.sh,
# writing here). The suite's output goes to full-tests-<version>.log beside
# this file, the rest to gates.log. The archive check reads commits, so it
# runs on the commits themselves (carrier/).
#
#   TMPDIR=<tmp> sh gates.sh <checkout> <directory of the node and npm to use> <scratch directory>
set -u
checkout=$1
bin=$2
scratch=$3
out="$checkout/docs/evidence/rc17-20261005"
cd "$checkout" || exit 2
export PATH="$bin:$PATH"
version=$(node --version)
shorten() {
  sed -e "s#$checkout#<checkout>#g" -e "s#$scratch#<scratch>#g" -e "s#${TMPDIR:-/tmp}#<tmp>#g" -e "s#$(printf '\033')\[[0-9;]*m##g"
}
mkdir -p "$scratch"
printf '# sh gates.sh on the tree before the source commit; Node %s, npm %s, %s\n' "$version" "$(npm --version)" "$(date -u +%Y-%m-%d)" >> "$out/gates.log"
failed=0
for step in "npm run typecheck" "npm test" "npm run build" "npm run exports:smoke" "npm run package:contents" "npm run pack:dry-run"; do
  sh -c "$step" > "$scratch/step.out" 2>&1
  status=$?
  [ "$status" -eq 0 ] || failed=1
  printf '## %s\n' "$step" >> "$out/gates.log"
  if [ "$step" = "npm test" ]; then
    { printf '# TMPDIR=<tmp> npm test, Node %s\n' "$version"; shorten < "$scratch/step.out"; printf 'exit %s\n' "$status"; } > "$out/full-tests-$version.log"
    grep -E 'Test Files|Tests ' "$scratch/step.out" | shorten >> "$out/gates.log"
  else
    grep -v -E '^(CLI|ESM|DTS) |^[[:space:]]*$' "$scratch/step.out" | shorten >> "$out/gates.log"
  fi
  printf 'exit %s\n' "$status" >> "$out/gates.log"
done
printf '\n' >> "$out/gates.log"
exit $failed
