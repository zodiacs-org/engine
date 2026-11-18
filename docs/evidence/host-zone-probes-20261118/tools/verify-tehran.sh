#!/usr/bin/env bash
set -euo pipefail

# Run from the repository root with the same tarball variables as the generator.
evidence=docs/evidence/host-zone-probes-20261118
work=$(mktemp -d)
trap 'rm -r "$work"' EXIT
files=(africa antarctica asia australasia europe northamerica southamerica etcetera backward)

zic --version
zdump --version
for version in 2026f 2021a 2025c; do
  variable="TZDATA_${version^^}_TARBALL"
  archive=${!variable:?}
  digest=$(awk -F '\t' -v v="$version" '$2 ~ "-tzdata" v "[.]tar[.]gz$" { print $4 }' "$evidence/results/tzdata-sources.tsv")
  printf '%s  %s\n' "$digest" "$archive" | sha256sum --check --status
  source="$work/$version"
  mkdir "$source"
  tar --extract --gzip --file "$archive" --directory "$source" --no-same-owner --no-same-permissions "${files[@]}"
  zic -b fat -d "$work/zi-$version" "${files[@]/#/$source/}"
  for zone in Asia/Tehran Iran; do
    tzif="$work/zi-$version/$zone"
    printf '\n%s %s\n' "$version" "$zone"
    LC_ALL=C zdump -V -c 1979,1980 "$tzif" | awk '/May (25|26)/ { sub(/^[^ ]+ +/, ""); print }'
    for instant in 1979-05-25T20:29:59Z 1979-05-25T20:30:00Z 1979-05-26T08:30:00Z 1979-05-26T20:29:59Z 1979-05-26T20:30:00Z; do
      printf '%s %s\n' "$instant" "$(TZ=":$tzif" date --date="$instant" +%z)"
    done
  done
done

node --input-type=module - "${1:?Pass the origin/main commit used for E3}" <<'JS'
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.argv[2];
const path = "src/geo/host-probes-intervals.json";
const before = JSON.parse(execFileSync("git", ["show", `${base}:${path}`], { encoding: "utf8" }));
const after = JSON.parse(readFileSync(path, "utf8"));
const row = ["1979-05-25T20:30:00Z", "1979-05-26T20:30:00Z", "1979-05-26T08:30:00Z", 16200, 12600];
for (const name of ["Asia/Tehran", "Iran"]) {
  const previous = before.byName[name];
  const next = after.byName[name];
  const added = next.findIndex(([from]) => from === row[0]);
  assert.equal(next.length, previous.length + 1);
  assert.deepEqual(next.splice(added, 1), [row]);
  console.log(`${name}: ${JSON.stringify(row)}`);
}
assert.deepEqual(before.byName, after.byName);
console.log(`${base}: ${before.intervals} intervals in ${before.names} names`);
console.log(`E3: ${after.intervals} intervals in ${after.names} names, with every previous interval preserved`);
JS
