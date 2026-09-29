#!/bin/sh
# recut/pack-matrix.sh, writing here: clean builds and packs of the tree of the
# rebuilt history's source commit before it was made: its tracked and new
# files copied to a directory under TMPDIR, npm ci, npm run build, npm pack
# --ignore-scripts, on Node 22.22.2 twice, 20.19.0 and 24.21.0. Each
# tarball's SHA-256 and size go to pack-determinism.log beside this file, and
# the first pack's report to pack.json.
#
#   TMPDIR=<tmp> sh pack-matrix.sh <checkout> <node 22.22.2 bin> <node 20.19.0 bin> <node 24.21.0 bin>
set -u
checkout=$1
out="$checkout/docs/evidence/rc15-20260929/rebuilt"
work="${TMPDIR:?}/rc15-rebuilt-packs"
rm -rf "$work" && mkdir -p "$work"
log="$out/pack-determinism.log"
printf '# Clean builds and packs of the tree before the source commit (tracked and new files copied to a directory\n# outside the checkout, npm ci, npm run build, npm pack --ignore-scripts); the first is pack.json.\n' > "$log"
failed=0
for pair in "first:$2" "second:$2" "node20:$3" "node24:$4"; do
  label=${pair%%:*}
  bin=${pair#*:}
  dir="$work/$label"
  mkdir -p "$dir/tree" "$dir/pack"
  (cd "$checkout" && git ls-files -z -co --exclude-standard | tar --null -T - -cf -) | (cd "$dir/tree" && tar -xf -)
  (
    cd "$dir/tree" || exit 1
    export PATH="$bin:/usr/bin:/bin"
    npm ci --no-audit --no-fund > "$dir/ci.log" 2>&1 || { echo "$label: npm ci failed"; exit 1; }
    npm run build > "$dir/build.log" 2>&1 || { echo "$label: build failed"; exit 1; }
    npm pack --ignore-scripts --json --pack-destination "$dir/pack" > "$dir/pack.json" 2> "$dir/pack.err" || { echo "$label: pack failed"; exit 1; }
    echo "$label: node $(node --version), npm $(npm --version): sha256 $(sha256sum "$dir"/pack/*.tgz | cut -d' ' -f1), $(stat -c %s "$dir"/pack/*.tgz) bytes"
  ) >> "$log" 2>&1 || failed=1
done
cp "$work/first/pack.json" "$out/pack.json"
[ "$(grep -c ': sha256 ' "$log")" -eq 4 ] || failed=1
[ "$(grep ': sha256 ' "$log" | sed 's/.*sha256 //' | sort -u | wc -l)" -eq 1 ] || { echo "the packs differ" >> "$log"; failed=1; }
exit $failed
