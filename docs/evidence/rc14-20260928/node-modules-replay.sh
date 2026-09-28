#!/usr/bin/env bash
# The final rc.14 review's working-tree demonstration, replayed on real
# history. In a throwaway clone, the second local rc.14 build is carried on its
# source commit 90d6cdb, as the dropped carrier a4ee426 did, and npm ci
# installs the clone's node_modules. Then, in that ignored directory only:
#
#   A. node_modules/.bin/tsup is replaced by one that fails;
#   B. a commit changes engine code under 0.1.1-rc.14, and tsup is replaced by
#      one that copies dist from the carried archive, so a build that used it
#      would give back the recorded bytes.
#
# The check as it stood at 90d6cdb reused the clone's node_modules, so it failed
# A and passed B. This checkout's check installs each rebuild's worktree afresh
# with npm ci, and must pass A and fail B, whether run directly or with the
# clone's node_modules/.bin first on PATH, as npm run puts it.
#
# usage: node-modules-replay.sh <engine checkout> <the second rc.14 build's .tgz>
set -u
ENGINE=$(cd "$1" && pwd)
SECOND=$2
CLONE=$(mktemp -d "${TMPDIR:-/tmp}/zodiacs-node-modules-replay-XXXXXX")
OLD=$(mktemp -d "${TMPDIR:-/tmp}/zodiacs-node-modules-old-XXXXXX")
trap 'rm -rf "$CLONE" "$OLD"' EXIT
g() { git -C "$CLONE" -c user.name=Replay -c user.email=replay@example.invalid -c commit.gpgsign=false "$@"; }
git clone -q --no-local "$ENGINE" "$CLONE"
git -C "$CLONE" show 90d6cdba89253d14449e2ab4de05aa58f736e121:scripts/verify-archive-binding.mjs > "$OLD/verify-archive-binding.mjs"
g checkout -q --detach 90d6cdba89253d14449e2ab4de05aa58f736e121
cp "$SECOND" "$CLONE/artifacts/zodiacs-engine-0.1.1-rc.14.tgz"
DIGEST=$(sha256sum < "$SECOND" | cut -c1-64)
echo "$DIGEST  zodiacs-engine-0.1.1-rc.14.tgz" > "$CLONE/artifacts/zodiacs-engine-0.1.1-rc.14.sha256"
node -e '
const fs = require("fs");
const [path, digest, bytes] = process.argv.slice(1);
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
manifest.archives.push({ version: "0.1.1-rc.14", file: "zodiacs-engine-0.1.1-rc.14.tgz", sha256: digest,
  bytes: Number(bytes), files: 30, sourceCommit: "90d6cdba89253d14449e2ab4de05aa58f736e121", status: "carried" });
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");' "$CLONE/artifacts/archives.json" "$DIGEST" "$(wc -c < "$SECOND")"
echo "| 0.1.1-rc.14 | \`$DIGEST\` | replayed carrier |" >> "$CLONE/artifacts/README.md"
g add -A artifacts
g commit -q -m "Carry the second rc.14 build (replay of a4ee426)"
echo "replayed carrier: $(g log --oneline -1)"
(cd "$CLONE" && npm ci --ignore-scripts --no-audit --no-fund > /dev/null 2>&1) || { echo "npm ci failed"; exit 1; }
TSUP="$CLONE/node_modules/.bin/tsup"
checks() {
  echo "git status: $(g status --porcelain | wc -l) changed paths"
  echo "== the check at 90d6cdb"
  node "$OLD/verify-archive-binding.mjs" --root "$CLONE" 2>&1 | cut -c1-240; echo "exit=${PIPESTATUS[0]}"
  echo "== this checkout's check"
  node "$ENGINE/scripts/verify-archive-binding.mjs" --root "$CLONE" 2>&1 | cut -c1-240; echo "exit=${PIPESTATUS[0]}"
  echo "== this checkout's check, with the clone's node_modules/.bin first on PATH"
  PATH="$CLONE/node_modules/.bin:$PATH" node "$ENGINE/scripts/verify-archive-binding.mjs" --root "$CLONE" 2>&1 | cut -c1-240
  echo "exit=${PIPESTATUS[0]}"
}
echo
echo "#### Baseline: node_modules as npm ci left it"
checks
echo
echo "#### A. node_modules/.bin/tsup replaced by one that fails"
mv "$TSUP" "$TSUP.real"
printf '#!/bin/sh\necho "tsup replaced in the checkout" >&2\nexit 1\n' > "$TSUP"
chmod +x "$TSUP"
checks
echo
echo "#### B. Engine code changed under 0.1.1-rc.14, and a tsup that copies dist from the carried archive"
sed -i 's/return "New Moon";/return "Full Moon";/' "$CLONE/src/api.ts"
g commit -q -am "Change the engine under 0.1.1-rc.14"
printf '#!/bin/sh\nrm -rf dist && mkdir -p dist && git show HEAD:artifacts/zodiacs-engine-0.1.1-rc.14.tgz | tar -xzf - -C dist --strip-components=2 package/dist\n' > "$TSUP"
checks
echo "== this checkout's check, --rebuild-all"
node "$ENGINE/scripts/verify-archive-binding.mjs" --root "$CLONE" --rebuild-all 2>&1 | cut -c1-240; echo "exit=${PIPESTATUS[0]}"
