#!/usr/bin/env bash
# For each damage mode: copy the clean consumer, damage its pack, run the probe in a new process.
set -u
base=/tmp/job9rc-brk
out=$base/out
mkdir -p "$out"
for mode in missing flip-one flip-first flip-last-data flip-many truncate-half truncate-4 swap-halves not-base64 zeros wrong-sha file-truncated file-empty; do
  dir=$base/dmg-$mode
  rm -rf "$dir"
  cp -r "$base/consumer" "$dir"
  node "$base/scripts/damage.mjs" "$dir" "$mode" > "$out/probe-$mode.log" 2>&1
  (cd "$dir" && node probe.mjs "$mode" 1990) >> "$out/probe-$mode.log" 2>&1
  echo "exit $?" >> "$out/probe-$mode.log"
  echo "== $mode: $(grep -c 'de440-unavailable' "$out/probe-$mode.log") lines flagged, $(grep -c '^SAYS NOTHING' "$out/probe-$mode.log") say nothing, $(grep -c 'names-DE440' "$out/probe-$mode.log") name DE440, $(grep -c '^THREW' "$out/probe-$mode.log") threw; $(tail -1 "$out/probe-$mode.log")"
done
