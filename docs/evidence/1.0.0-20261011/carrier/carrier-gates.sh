#!/bin/sh
# CI's jobs (.github/workflows/ci.yml, conformance.yml and atlas.yml) on a
# commit, each in a clean clone of the repository with full history under a
# work directory, with TMPDIR outside the clone and no package.json or
# node_modules at or above it, and without NODE_OPTIONS, which CI does not
# set. One job and one Node version per call; each writes
# <job>-<commit>-<node version>.log beside this file, with the clone, the work
# directory, TMPDIR and the directory of node and npm shortened to <clone>,
# <work>, <tmp> and <bin>. 1.0.0-rc.2's script, for 1.0.0's archive and with
# shasum in place of sha256sum, which macOS does not have.
#
#   TMPDIR=<tmp> sh carrier-gates.sh <job> <repository> <commit> <work directory> <directory of node and npm>
#
# engine       npm ci, typecheck, npm test, build, export smoke, the public
#              API check, package contents, pack dry run, the archive check
# archives     npm ci, the archive check with --rebuild-all
# pack         npm ci, build, npm pack --ignore-scripts into <work>/pack
# consumer     the packed-consumer check on the carried archive,
#              artifacts/zodiacs-engine-1.0.0.tgz, nothing installed in
#              the clone
# conformance  npm ci, build, the self-test, the vectors, the verdicts and
#              RESULTS.md
# atlas        the atlas checks and self-test, nothing installed
# generators   the conformance vectors rebuilt from their sources with the
#              Python in PYTHON (pyerfa 2.0.1.5 and numpy 2.4.6, as CI pins
#              them; the L3 generator downloads tzdata and tzcode 2025c from
#              IANA and checks their digests), then git diff --exit-code
set -u
unset NODE_OPTIONS
job=$1
repository=$2
commit=$3
work=$4
bin=$5
out=$(cd "$(dirname "$0")" && pwd)
version=$("$bin/node" --version)
clone="$work/$job-$version"
export PATH="$bin:/usr/bin:/bin"
failed=0
shorten() {
  sed -e "s#$clone#<clone>#g" -e "s#$bin#<bin>#g" -e "s#$work#<work>#g" -e "s#${TMPDIR:?}#<tmp>#g" -e "s#$(printf '\033')\[[0-9;]*m##g"
}
# step <label> <filter> <command...>: the command's output, filtered, and its exit status.
step() {
  label=$1
  filter=$2
  shift 2
  printf '## %s\n' "$label" >> "$log"
  (cd "$clone" && "$@") > "$clone.out" 2>&1
  status=$?
  case "$filter" in
    summary) grep -E 'Test Files|Tests ' "$clone.out" ;;
    quiet) grep -v -E '^(CLI|ESM|DTS) |^[[:space:]]*$|^> ' "$clone.out" ;;
    *) cat "$clone.out" ;;
  esac | shorten >> "$log"
  printf 'exit %s\n' "$status" >> "$log"
  [ "$status" -eq 0 ] || failed=1
}
rm -rf "$clone" && mkdir -p "$work"
git -c advice.detachedHead=false clone -q --no-local "$repository" "$clone" &&
  git -C "$clone" -c advice.detachedHead=false checkout -q --detach "$commit" || exit 2
short=$(git -C "$clone" rev-parse --short=7 HEAD)
log="$out/$job-$short-$version.log"
printf '# sh carrier-gates.sh %s at %s in a clean full-history clone, without NODE_OPTIONS; Node %s, npm %s, git %s, %s\n' \
  "$job" "$short" "$version" "$(npm --version)" "$(git --version | cut -d' ' -f3)" "$(date -u +%Y-%m-%d)" > "$log"
case "$job" in
  engine)
    step "npm ci" quiet npm ci --no-audit --no-fund
    step "npm run typecheck" quiet npm run typecheck
    step "npm test" summary npm test
    step "npm run build" quiet npm run build
    step "npm run exports:smoke" quiet npm run exports:smoke
    step "npm run api:check" quiet npm run api:check
    step "npm run package:contents" quiet npm run package:contents
    step "npm run pack:dry-run" quiet npm run pack:dry-run
    step "node scripts/verify-archive-binding.mjs" all node scripts/verify-archive-binding.mjs ;;
  archives)
    step "npm ci" quiet npm ci --no-audit --no-fund
    step "node scripts/verify-archive-binding.mjs --rebuild-all" all node scripts/verify-archive-binding.mjs --rebuild-all ;;
  pack)
    rm -rf "$work/pack" && mkdir -p "$work/pack"
    step "npm ci" quiet npm ci --no-audit --no-fund
    step "npm run build" quiet npm run build
    step "npm pack --ignore-scripts" quiet npm pack --ignore-scripts --pack-destination "$work/pack"
    step "the packed archive against the carried one" all sh -c "shasum -a 256 '$work'/pack/*.tgz artifacts/zodiacs-engine-1.0.0.tgz | sed 's#  .*/#  #'; cmp '$work'/pack/*.tgz artifacts/zodiacs-engine-1.0.0.tgz" ;;
  consumer)
    step "the carried archive" all sh -c "shasum -a 256 artifacts/zodiacs-engine-1.0.0.tgz"
    step "node scripts/verify-packed-consumer.mjs" all sh -c "node scripts/verify-packed-consumer.mjs \"\$PWD/artifacts/zodiacs-engine-1.0.0.tgz\"" ;;
  conformance)
    step "npm ci" quiet npm ci --no-audit --no-fund
    step "npm run build" quiet npm run build
    step "node --test conformance/harness/selftest.mjs" quiet node --test conformance/harness/selftest.mjs
    step "node conformance/harness/validate.mjs --expect-total 500" all node conformance/harness/validate.mjs --expect-total 500
    step "node conformance/harness/run.mjs --check" all node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --check conformance/results/zodiacs-engine.json
    step "node conformance/harness/report.mjs --check" all node conformance/harness/report.mjs --check ;;
  atlas)
    step "node atlas/tools/check.mjs" all node atlas/tools/check.mjs
    step "node --test atlas/tools/selftest.mjs" quiet node --test atlas/tools/selftest.mjs ;;
  generators)
    step "the Python and its libraries" all "${PYTHON:?}" -c "import sys, erfa, numpy; print(sys.version.split()[0], 'pyerfa', erfa.__version__, 'numpy', numpy.__version__)"
    step "L1 positions" all "$PYTHON" conformance/arbiters/l1/build.py
    step "L2 houses and angles" all "$PYTHON" conformance/arbiters/l2/build.py
    step "L3 time and calendars" all "$PYTHON" conformance/arbiters/l3/build.py
    step "git diff --exit-code -- conformance/vectors" all git diff --exit-code --stat -- conformance/vectors ;;
  *)
    echo "unknown job $job" >&2
    exit 2 ;;
esac
printf '\n' >> "$log"
exit $failed
