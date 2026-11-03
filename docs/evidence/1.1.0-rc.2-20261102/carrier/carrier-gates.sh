#!/bin/sh
# CI's jobs (.github/workflows/ci.yml, conformance.yml and atlas.yml) on a
# commit, each in a clean clone of the repository with full history under a
# work directory, with TMPDIR outside the clone and no package.json or
# node_modules at or above it, and without NODE_OPTIONS, which CI does not
# set. One job and one Node version per call; each writes
# <job>-<commit>-<node version>.log beside this file, with the clone, the work
# directory, TMPDIR and the directory of node and npm shortened to <clone>,
# <work>, <tmp> and <bin>. 1.0.0's script, for 1.1.0-rc.1's archive.
# 1.1.0-rc.2's copy, for 1.1.0-rc.2's archive: each clone is blobless and
# sparse (sparse_clone, below), and the jobs and the step that would write
# the excluded folder or download run only in CI (the cut's plan, correction
# K12).
#
#   TMPDIR=<tmp> sh carrier-gates.sh <job> <repository> <commit> <work directory> <directory of node and npm>
#
# <repository> is a local repository, such as the clone the cut is made in,
# or a URL whose server honours --filter, as GitHub's does.
#
# engine       npm ci, typecheck, npm test, build, export smoke, the public
#              API check, package contents, pack dry run; the archive check,
#              which on the carrier rebuilds HEAD, only in CI
# archives     CI only: the archive check with --rebuild-all
# pack         npm ci, build, npm pack --ignore-scripts into <work>/pack
# consumer     the packed-consumer check on the carried archive,
#              artifacts/zodiacs-engine-1.1.0-rc.2.tgz, nothing installed in
#              the clone
# conformance  npm ci, build, the self-test, the vectors, the verdicts and
#              RESULTS.md
# atlas        the atlas checks and self-test, nothing installed
# generators   CI only: the conformance vectors rebuilt from their sources
#              with pyerfa 2.0.1.5 and numpy 2.4.6, the L3 generator
#              downloading tzdata and tzcode 2025c from IANA, then
#              git diff --exit-code
set -u
unset NODE_OPTIONS
job=$1
repository=$2
commit=$3
work=$4
bin=$5
# The archive rebuilds and the generators run only in CI's own jobs, never
# here (the cut's plan, correction K12). verify-archive-binding.mjs with
# --rebuild-all, like its rebuild of HEAD on the carrier, writes every file
# of each rebuilt tree from git objects (materialize), the excluded folder
# included, and in a blobless clone would fetch its blobs; the generators
# need pyerfa and numpy installed and download tzdata from IANA. The gate
# record cites those jobs' CI run ids instead.
case "$job" in
  archives|generators)
    echo "carrier-gates.sh: the $job job runs only in CI; cite its CI run id" >&2
    exit 2 ;;
esac
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
# sparse_clone <repository> <directory> <commit>: a blobless clone
# (--filter=blob:none) whose sparse checkout leaves out
# docs/evidence/calc-sidereal-2026-10-05/, as the clone the cut is made in
# has, checked out at <commit>, with every commit and tree of the history.
# It replaces 1.1.0-rc.1's plain git clone --no-local, which wrote every
# file of that folder and, from a blobless repository, would fetch its blobs
# (K12); no job here reads the folder. A local repository's upload-pack is
# told to allow the filter, or git ignores the filter and asks for every
# blob, and the clone keeps that upload-pack for the blobs its checkout
# fetches. upload-pack does not fetch lazily, so a blob that a blobless local
# repository lacks fails the checkout; it is not fetched from that
# repository's own remote.
sparse_clone() {
  if [ -d "$1" ]; then
    set -- "$1" "$2" "$3" "git -c uploadpack.allowFilter=true upload-pack"
    git -c advice.detachedHead=false clone -q --no-local --no-checkout --filter=blob:none --upload-pack "$4" "$1" "$2" &&
      git -C "$2" config remote.origin.uploadpack "$4" || return 1
  else
    git -c advice.detachedHead=false clone -q --no-checkout --filter=blob:none "$1" "$2" || return 1
  fi
  git -C "$2" sparse-checkout set --no-cone '/*' '!/docs/evidence/calc-sidereal-2026-10-05/' &&
    [ "$(git -C "$2" sparse-checkout list)" = "$(printf '%s\n%s' '/*' '!/docs/evidence/calc-sidereal-2026-10-05/')" ] &&
    git -C "$2" -c advice.detachedHead=false checkout -q --detach "$3"
}
rm -rf "$clone" && mkdir -p "$work"
# Blobless and sparse, in place of a plain clone (sparse_clone, above).
sparse_clone "$repository" "$clone" "$commit" || exit 2
short=$(git -C "$clone" rev-parse --short=7 HEAD)
log="$out/$job-$short-$version.log"
# The clone is named as it is made: blobless and sparse (K12).
printf '# sh carrier-gates.sh %s at %s in a clean full-history clone, blobless, its sparse checkout leaving out docs/evidence/calc-sidereal-2026-10-05/, without NODE_OPTIONS; Node %s, npm %s, git %s, %s\n' \
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
    # No archive check here: on the carrier it rebuilds HEAD from git
    # objects, the excluded folder included, so it runs only in CI's engine
    # job (K12; above).
    ;;
  pack)
    rm -rf "$work/pack" && mkdir -p "$work/pack"
    step "npm ci" quiet npm ci --no-audit --no-fund
    step "npm run build" quiet npm run build
    step "npm pack --ignore-scripts" quiet npm pack --ignore-scripts --pack-destination "$work/pack"
    step "the packed archive against the carried one" all sh -c "shasum -a 256 '$work'/pack/*.tgz artifacts/zodiacs-engine-1.1.0-rc.2.tgz | sed 's#  .*/#  #'; cmp '$work'/pack/*.tgz artifacts/zodiacs-engine-1.1.0-rc.2.tgz" ;;
  consumer)
    step "the carried archive" all sh -c "shasum -a 256 artifacts/zodiacs-engine-1.1.0-rc.2.tgz"
    step "node scripts/verify-packed-consumer.mjs" all sh -c "node scripts/verify-packed-consumer.mjs \"\$PWD/artifacts/zodiacs-engine-1.1.0-rc.2.tgz\"" ;;
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
  *)
    echo "unknown job $job" >&2
    exit 2 ;;
esac
printf '\n' >> "$log"
exit $failed
