#!/bin/sh
# The re-cut's measurements: each evidence script whose figures the CHANGELOG,
# the README or the evidence README give, rerun on the re-cut's tree, built,
# with Node 22.22.2. Outputs are written beside this file; each group's log
# records its commands and exit statuses. Local paths are shortened to
# <checkout>, <scratch>, <tmp> and the names of the arguments below.
#
#   sh analyses.sh <group> <checkout> <rc.14 package> <first cut package> <scratch> <tzdata2025c.tar.gz> <zic 2025c> <finals2000A.all> [eopc04.1962-now of today]
#
# <rc.14 package> and <first cut package> are the carried rc.14 archive and
# the first cut's archive (3651c525...), each installed with npm in a directory
# outside the checkout; the arguments name their node_modules/@zodiacs/engine.
# Groups: roundtrip-full, roundtrip-default, jdn, time-basis, replay,
# versions, compare, merge-sizes (with MERGE_TREE set), rc10 (with
# RC15_ARCHIVE and RC10_BASELINE set), tz, generators, controls,
# conformance, docs, and last shorten.
set -u
group=$1
checkout=$2
rc14=$3
first=$4
scratch=$5
tzdata=$6
zic=$7
finals=$8
c04today=${9:-}
out="$checkout/docs/evidence/rc15-20260929/recut"
evidence="$checkout/docs/evidence/rc15-20260929"
log="$out/$group.log"
cd "$checkout" || exit 2

shorten() {
  sed -e "s#$rc14#<rc.14 package>#g" -e "s#$first#<first cut package>#g" -e "s#$tzdata#<tzdata2025c.tar.gz>#g" \
    -e "s#$zic#<zic 2025c>#g" -e "s#$(dirname "$zic")#<zic 2025c directory>#g" -e "s#$finals#<finals2000A.all>#g" -e "s#${c04today:-/nonexistent}#<eopc04.1962-now of today>#g" \
    -e "s#${MERGE_TREE:-/nonexistent}#<e756f93 tree>#g" -e "s#${RC15_ARCHIVE:-/nonexistent}#<tmp>/zodiacs-engine-0.1.1-rc.15.tgz#g" -e "s#${RC10_BASELINE:-/nonexistent}#<tmp>/rc10-baseline#g" -e "s#$scratch#<scratch>#g" -e "s#$checkout#<checkout>#g" -e "s#${TMPDIR:-/tmp}#<tmp>#g" \
    -e "s#$(printf '\033')\[[0-9;]*m##g" -e "s#:$PATH#:\$PATH#g"
}
# run <label> <command...>: the command's output and exit status, into the log.
run() {
  label=$1
  shift
  printf '## %s\n$ %s\n' "$label" "$*" | shorten >> "$log"
  "$@" > "$scratch/$group.out" 2>&1
  status=$?
  shorten < "$scratch/$group.out" >> "$log"
  printf 'exit %s\n\n' "$status" >> "$log"
  printf '%s %s\n' "$status" "$label" >> "$scratch/$group.status"
}

mkdir -p "$out" "$scratch"
: > "$scratch/$group.status"
printf '# sh analyses.sh %s, Node %s, npm %s, %s\n\n' "$group" "$(node --version)" "$(npm --version)" "$(date -u +%Y-%m-%d)" > "$log"

case "$group" in
  roundtrip-full)
    run "every offset change 1850-2100, daily step" node scripts/roundtrip-scan.mjs --full --out "$out/roundtrip-full.json" ;;
  roundtrip-default)
    run "every offset change 1850-2037, three-day step" node scripts/roundtrip-scan.mjs --out "$out/roundtrip-default.json" ;;
  jdn)
    run "Julian and Gregorian against Richards's algorithm" python3 scripts/verify-jdn.py --json "$out/jdn-richards.json" ;;
  time-basis)
    run "the time-basis fixes against the first cut" node "$evidence/time-basis-fixes.mjs" "$first" . "$out/time-basis-fixes.json" ;;
  replay)
    run "16,218 rc.14 receipts replayed" node "$evidence/receipt-replay.mjs" "$rc14" . "$out/receipt-replay.json"
    run "five receipts a review chose, and the rc.14 fixture" node "$evidence/receipt-replay-review.mjs" "$rc14" . ;;
  compare)
    run "rc.14 against this build, 9,697 charts" node "$evidence/rc14-comparison.mjs" "$rc14" . "$out/rc14-comparison.json"
    run "rc.14 against this build, the review's sample" node "$evidence/review-sample.mjs" "$rc14" . "$out/review-sample.json"
    run "sizes of rc.14, the first cut and this tree" sh -c "node '$evidence/sizes.mjs' rc14='$rc14' rc15='$first' recut=. > '$out/sizes.json'"
    run "leap seconds against Bulletin C 72" node "$evidence/leap-seconds.mjs" "$out/leap-seconds.json"
    run "the true node's numerical noise" node "$evidence/node-velocity.mjs" "$out/node-velocity.json"
    run "the engine's side of the Swiss ayanamsa comparison, first cut against this build" node "$out/ayanamsa-engine.mjs" "$first" . "$out/ayanamsa-engine.json" ;;
  merge-sizes)
    # The second merge commit, e756f93, before the version gates: its tree
    # (git archive e756f93) built in the directory MERGE_TREE names. e756f93
    # is a local commit that was never pushed (README.md, *The published
    # history*).
    run "sizes of the merge commit e756f93, built" sh -c "node '$evidence/sizes.mjs' merge='$MERGE_TREE' > '$out/sizes-merge.json'" ;;
  rc10)
    # The rc.10 comparison on the archive packed from this tree (RC15_ARCHIVE),
    # against the carried rc.10 archive's package with its dependency
    # (RC10_BASELINE). It fails by design, as on the first cut; the reduced
    # report is compared with the first cut's.
    run "the rc.10 compatibility script (its full report goes to <scratch>/rc10-full.json)" sh -c "node scripts/verify-rc10-compatibility.mjs --candidate '$RC15_ARCHIVE' --baseline '$RC10_BASELINE' --output '$scratch/rc10-full.json' > /dev/null"
    run "its report, reduced" sh -c "node '$out/rc10-reduce.mjs' '$scratch/rc10-full.json' '<tmp>/rc10-baseline' '<tmp>/zodiacs-engine-0.1.1-rc.15.tgz' > '$out/rc10-compatibility.json'"
    run "the reduced report against the first cut's" node -e "
      const read = (f) => JSON.parse(require('fs').readFileSync(f, 'utf8'));
      const [a, b] = [read('$evidence/rc10-compatibility.json'), read('$out/rc10-compatibility.json')];
      const verdicts = (r) => JSON.stringify(r.checks);
      console.log('summary', JSON.stringify({ checks: b.summary.checks, passed: b.summary.passed, failed: b.summary.failed }));
      console.log('checks, with their first three mismatches, as the first cut:', verdicts(a) === verdicts(b));
      console.log('candidate archive', b.metadata.candidate.artifactSha256);" ;;
  versions)
    run "engine versions no release wrote, rc.14 against this build" node "$out/version-probe.mjs" "$rc14" . ;;
  tz)
    run "wall-clock zone-line ends against zic 2025c" env TZDATA_TARBALL="$tzdata" ZIC="$zic" node "$evidence/tz-line-ends.mjs" "$out/tz-line-ends.json"
    run "backzone against the default build" env TZDATA_TARBALL="$tzdata" ZIC="$zic" node "$evidence/backzone-divergence.mjs" "$out/backzone-divergence.json" ;;
  generators)
    run "zone histories, the system's zic" env TZDATA_TARBALL="$tzdata" node scripts/build-tz-shards.mjs --check
    run "zone histories, zic 2025c first on PATH" env TZDATA_TARBALL="$tzdata" PATH="$(dirname "$zic"):$PATH" node scripts/build-tz-shards.mjs --check
    run "time scales from the committed sources" node scripts/build-time-scales.mjs --check
    run "time scales, and the finals2000A.all rows against the whole file" env IERS_FINALS="$finals" node scripts/build-time-scales.mjs --check
    if [ -n "$c04today" ]; then
      run "the committed C04 extract against eopc04.1962-now as IERS serves it today" node "$out/c04-today.mjs" "$c04today"
    fi ;;
  controls)
    run "root isolation, negative controls" sh "$evidence/root-isolation-control.sh" "$checkout" "$scratch/root-isolation"
    run "invented charts against the defects the replaced tests caught" sh "$evidence/birth-data-mutations.sh" "$checkout" "$scratch/mutations" ;;
  conformance)
    run "harness self-test" node --test conformance/harness/selftest.mjs
    run "vectors" node conformance/harness/validate.mjs --expect-total 500
    run "verdicts against the committed results" node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --check conformance/results/zodiacs-engine.json
    run "RESULTS.md and summary.json" node conformance/harness/report.mjs --check
    git show b0ddb88:conformance/results/zodiacs-engine.json > "$scratch/rc14-results.json"
    run "verdicts and residuals against rc.14's results (main at b0ddb88)" node "$evidence/conformance-changes.mjs" "$scratch/rc14-results.json" conformance/results/zodiacs-engine.json "$out/conformance-changes.json" ;;
  docs)
    run "API reference" npm run docs
    run "atlas data checks" node atlas/tools/check.mjs
    run "atlas tools self-test" node --test atlas/tools/selftest.mjs ;;
  shorten)
    # Last, once every other group has finished: local paths out of the outputs.
    for file in "$out"/*.json "$out"/*.log; do
      [ "$file" = "$log" ] && continue
      shorten < "$file" > "$scratch/shorten.out" && cat "$scratch/shorten.out" > "$file"
    done
    printf 'shortened the paths in the JSON files and logs\n' >> "$log" ;;
  *)
    echo "unknown group $group" >&2
    exit 2 ;;
esac
# The steps' own statuses (a step's output may print exit lines of its own).
grep -c '^0 ' "$scratch/$group.status" | sed 's/^/passed steps: /'
grep -v '^0 ' "$scratch/$group.status" && exit 1
exit 0
