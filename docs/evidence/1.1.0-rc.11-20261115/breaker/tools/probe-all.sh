#!/usr/bin/env bash
# Breaker, item 2: the probe on the clean install (inside the pack's span, outside it, across its ends, and
# after the caller's choice of astronomy-engine) and on a copy of the install for each kind of damage.
#   probe-all.sh <clean install dir> <work dir> <results dir>      (node on PATH; no ZODIACS_* set)
set -u
clean=$1; work=$2; out=$3; tools=$(cd "$(dirname "$0")" && pwd)
for name in $(env | sed -n 's/^\(ZODIACS_[A-Za-z0-9_]*\)=.*/\1/p'); do unset "$name"; done
mkdir -p "$work" "$out"
cp "$tools/probe.mjs" "$clean/probe.mjs"
( cd "$clean" || exit 1
  for year in 1991 1750 2230 1785 2195; do node probe.mjs $year "$out/probe-healthy-$year.json"; done
  node probe.mjs 1991 "$out/probe-chose-astronomy-engine-1991.json" ae )
for mode in empty one-char-middle one-char-first one-char-three-quarters last-record every-5000th-char first-third-only one-quad-short reversed all-A not-base64 doubled expected-digest-changed; do
  dir=$work/damaged-$mode
  rm -rf "$dir"; cp -r "$clean" "$dir"
  node "$tools/damage.mjs" "$dir" "$mode"
  ( cd "$dir" && node probe.mjs 1991 "$out/probe-damaged-$mode-1991.json" ) 2>&1 | tail -3
done
