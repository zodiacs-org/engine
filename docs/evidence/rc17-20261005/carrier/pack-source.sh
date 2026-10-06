#!/bin/sh
# The archive packed from the source commit itself: for each Node version, a
# clean clone of the repository at that commit under TMPDIR, npm ci, npm run
# build, npm pack --ignore-scripts. Prints each tarball's SHA-256 and size;
# the tarball of the first run is left at <TMPDIR>/rc17-source-packs/first/.
#
#   TMPDIR=<tmp> sh pack-source.sh <repository> <commit> <node 22.22.2 bin> <node 20.19.0 bin> <node 24.21.0 bin>
set -u
repository=$1
commit=$2
work="${TMPDIR:?}/rc17-source-packs"
rm -rf "$work" && mkdir -p "$work"
printf '# Clean clones of %s, npm ci, npm run build, npm pack --ignore-scripts\n' "$commit"
failed=0
for pair in "first:$3" "node20:$4" "node24:$5"; do
  label=${pair%%:*}
  bin=${pair#*:}
  dir="$work/$label"
  git -c advice.detachedHead=false clone -q --no-local "$repository" "$dir/clone" && git -C "$dir/clone" -c advice.detachedHead=false checkout -q --detach "$commit" || { echo "$label: clone failed"; failed=1; continue; }
  mkdir -p "$dir/pack"
  (
    cd "$dir/clone" || exit 1
    export PATH="$bin:/usr/bin:/bin"
    npm ci --no-audit --no-fund > "$dir/ci.log" 2>&1 || { echo "$label: npm ci failed"; exit 1; }
    npm run build > "$dir/build.log" 2>&1 || { echo "$label: build failed"; exit 1; }
    npm pack --ignore-scripts --json --pack-destination "$dir/pack" > "$dir/pack.json" 2> "$dir/pack.err" || { echo "$label: pack failed"; exit 1; }
    echo "$label: $(git rev-parse --short HEAD), node $(node --version), npm $(npm --version): sha256 $(sha256sum "$dir"/pack/*.tgz | cut -d' ' -f1), $(stat -c %s "$dir"/pack/*.tgz) bytes, $(node -e "console.log(require('$dir/pack.json')[0].entryCount)") files"
  ) || failed=1
done
exit $failed
