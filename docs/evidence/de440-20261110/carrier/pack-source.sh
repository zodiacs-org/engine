#!/bin/sh
# The archive packed from the source commit itself: for each Node version, a
# clean clone of the repository at that commit under TMPDIR, npm ci, npm run
# build, npm pack --ignore-scripts, without NODE_OPTIONS, which CI does not
# set. Prints each tarball's SHA-256 and size; the tarball of the first run is
# left at <TMPDIR>/source-packs/first/. 1.0.0's script, unchanged but for
# this line. 1.1.0-rc.1's script, with each clone blobless and sparse
# (sparse_clone, below). 1.1.0-rc.3's copy, unchanged.
#
#   TMPDIR=<tmp> sh pack-source.sh <repository> <commit> <node 22.22.2 bin> <node 20.19.0 bin> <node 24.21.0 bin>
#
# <repository> is a local repository, such as the clone the cut is made in,
# or a URL whose server honours --filter, as GitHub's does.
set -u
unset NODE_OPTIONS
repository=$1
commit=$2
work="${TMPDIR:?}/source-packs"
# sparse_clone <repository> <directory> <commit>: a blobless clone
# (--filter=blob:none) whose sparse checkout leaves out
# docs/evidence/calc-sidereal-2026-10-05/, as the clone the cut is made in
# has, checked out at <commit>. It replaces 1.1.0-rc.1's plain
# git clone --no-local, which wrote every file of that folder and, from a
# blobless repository, would fetch its blobs (the cut's plan, correction
# K12). docs/ is not packed, so the archive's bytes do not depend on it. A
# local repository's upload-pack is told to allow the filter, or git ignores
# the filter and asks for every blob, and the clone keeps that upload-pack
# for the blobs its checkout fetches. upload-pack does not fetch lazily, so
# a blob that a blobless local repository lacks fails the checkout; it is
# not fetched from that repository's own remote.
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
rm -rf "$work" && mkdir -p "$work"
printf '# Clean clones of %s, npm ci, npm run build, npm pack --ignore-scripts\n' "$commit"
failed=0
for pair in "first:$3" "node20:$4" "node24:$5"; do
  label=${pair%%:*}
  bin=${pair#*:}
  dir="$work/$label"
  # Blobless and sparse, in place of a plain clone (sparse_clone, above).
  sparse_clone "$repository" "$dir/clone" "$commit" || { echo "$label: clone failed"; failed=1; continue; }
  mkdir -p "$dir/pack"
  (
    cd "$dir/clone" || exit 1
    export PATH="$bin:/usr/bin:/bin"
    npm ci --no-audit --no-fund > "$dir/ci.log" 2>&1 || { echo "$label: npm ci failed"; exit 1; }
    npm run build > "$dir/build.log" 2>&1 || { echo "$label: build failed"; exit 1; }
    npm pack --ignore-scripts --json --pack-destination "$dir/pack" > "$dir/pack.json" 2> "$dir/pack.err" || { echo "$label: pack failed"; exit 1; }
    echo "$label: $(git rev-parse --short HEAD), node $(node --version), npm $(npm --version): sha256 $(shasum -a 256 "$dir"/pack/*.tgz | cut -d" " -f1), $(wc -c "$dir"/pack/*.tgz | awk '{print $1}') bytes, $(node -e "console.log(require('$dir/pack.json')[0].entryCount)") files"
  ) || failed=1
done
exit $failed
