#!/usr/bin/env bash
# The rc.14 review's blocker, replayed on real history with this checkout's
# archive check. In a throwaway clone: carry the first local rc.14 build on its
# source commit 74a4471 (as the dropped carrier cca9f44 did), merge main
# (8c4946b, which changes the packed LICENSING.md), and run the check in both
# modes. Both must fail, the default and --rebuild-all alike, while every
# recorded archive still rebuilds from its source commit.
#
# usage: b1-replay.sh <engine checkout> <the first rc.14 build's .tgz>
set -u
ENGINE=$(cd "$1" && pwd)
FIRST=$2
CLONE=$(mktemp -d "${TMPDIR:-/tmp}/zodiacs-b1-replay-XXXXXX")
trap 'rm -rf "$CLONE"' EXIT
g() { git -C "$CLONE" -c user.name=Replay -c user.email=replay@example.invalid -c commit.gpgsign=false "$@"; }
git clone -q --no-local "$ENGINE" "$CLONE"
g checkout -q --detach 74a4471
cp "$FIRST" "$CLONE/artifacts/zodiacs-engine-0.1.1-rc.14.tgz"
DIGEST=$(sha256sum < "$FIRST" | cut -c1-64)
echo "$DIGEST  zodiacs-engine-0.1.1-rc.14.tgz" > "$CLONE/artifacts/zodiacs-engine-0.1.1-rc.14.sha256"
node -e '
const fs = require("fs");
const [path, digest, bytes] = process.argv.slice(1);
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
manifest.archives.push({ version: "0.1.1-rc.14", file: "zodiacs-engine-0.1.1-rc.14.tgz", sha256: digest,
  bytes: Number(bytes), files: 30, sourceCommit: "74a4471d5fdcb8e63d13097e61a9dc3ca1033322", status: "carried" });
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");' "$CLONE/artifacts/archives.json" "$DIGEST" "$(wc -c < "$FIRST")"
echo "| 0.1.1-rc.14 | \`$DIGEST\` | replayed carrier |" >> "$CLONE/artifacts/README.md"
g add -A artifacts
g commit -q -m "Carry the first rc.14 build (replay of cca9f44)"
echo "replayed carrier: $(g log --oneline -1)"
g merge -q --no-ff --no-edit 8c4946b
echo "merged main:      $(g log --oneline -1)"
echo "LICENSING.md changed by the merge: $(g diff --stat HEAD^1 HEAD -- LICENSING.md | tail -1)"
echo
echo "== default: node scripts/verify-archive-binding.mjs"
node "$ENGINE/scripts/verify-archive-binding.mjs" --root "$CLONE" 2>&1
echo "exit=$?"
echo
echo "== node scripts/verify-archive-binding.mjs --rebuild-all"
node "$ENGINE/scripts/verify-archive-binding.mjs" --root "$CLONE" --rebuild-all 2>&1
echo "exit=$?"
