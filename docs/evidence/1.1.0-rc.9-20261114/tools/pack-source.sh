#!/bin/sh
# The archive packed from a commit itself, on one Node version: a clean clone
# of the repository at that commit under TMPDIR, npm ci, npm run build,
# npm pack --ignore-scripts, without NODE_OPTIONS, which CI does not set.
# Prints the tarball's SHA-256, size and file count and leaves it at
# <TMPDIR>/source-packs/<label>/pack/; the clone is removed. The clone is
# blobless and sparse, as docs/evidence/de440-20261110/carrier/pack-source.sh
# makes it; this script runs one Node version at a call, because the machine
# it was written on had room for one clone at a time.
#
#   TMPDIR=<tmp> sh pack-source.sh <repository> <commit> <label> <node bin directory>
set -u
unset NODE_OPTIONS
repository=$1
commit=$2
label=$3
bin=$4
dir="${TMPDIR:?}/source-packs/$label"
rm -rf "$dir" && mkdir -p "$dir/pack"
upload="git -c uploadpack.allowFilter=true upload-pack"
git -c advice.detachedHead=false clone -q --no-local --no-checkout --filter=blob:none --upload-pack "$upload" "$repository" "$dir/clone" &&
  git -C "$dir/clone" config remote.origin.uploadpack "$upload" &&
  git -C "$dir/clone" sparse-checkout set --no-cone '/*' '!/docs/evidence/calc-sidereal-2026-10-05/' &&
  git -C "$dir/clone" -c advice.detachedHead=false checkout -q --detach "$commit" || { echo "$label: clone failed"; exit 1; }
(
  cd "$dir/clone" || exit 1
  export PATH="$bin:/usr/bin:/bin"
  npm ci --no-audit --no-fund > "$dir/ci.log" 2>&1 || { echo "$label: npm ci failed"; exit 1; }
  npm run build > "$dir/build.log" 2>&1 || { echo "$label: build failed"; exit 1; }
  npm pack --ignore-scripts --json --pack-destination "$dir/pack" > "$dir/pack.json" 2> "$dir/pack.err" || { echo "$label: pack failed"; exit 1; }
  echo "$label: $(git rev-parse --short HEAD), node $(node --version), npm $(npm --version): sha256 $(sha256sum "$dir"/pack/*.tgz | cut -d" " -f1), $(wc -c < "$(ls "$dir"/pack/*.tgz)") bytes, $(node -e "console.log(require('$dir/pack.json')[0].entryCount)") files, $(node -e "console.log(require('$dir/pack.json')[0].unpackedSize)") unpacked"
)
code=$?
rm -rf "$dir/clone"
exit $code
