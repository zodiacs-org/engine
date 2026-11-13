#!/usr/bin/env bash
# Rerun everything in this folder. Needs: a clone of this repository with
# `npm ci` done, Node 22.22.2 on PATH, a checkout of zodiacs-org/site at
# 210622bfe41b9d204064dac211942909569c2176 (its pack compiler 2.0.0), and
# network access to naif.jpl.nasa.gov for the kernel (about 120 MB).
#
#   WORK=/absolute/dir/outside/the/checkout SITE=/path/to/site \
#     bash docs/evidence/l1-gap-20261113/tools/rerun.sh
#
# The kernel and the pack are written under $WORK and never into the checkout.
# Do not commit, publish or pass on either file (docs/de440.md).
set -euo pipefail
: "${WORK:?set WORK to an absolute directory outside the checkout}"
: "${SITE:?set SITE to a checkout of zodiacs-org/site}"
KERNEL_URL=https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp
KERNEL_SHA256=a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5
PACK_SHA256=51428874d9a47213abc0ff42cbcec65f338624eaa2d8831f0e6ddc3654bf1fa7
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
mkdir -p "$WORK"

# 1. The kernel, checked by digest.
[ -f "$WORK/de440.bsp" ] || curl -sS --fail --retry 4 --retry-delay 15 -o "$WORK/de440.bsp" "$KERNEL_URL"
echo "$KERNEL_SHA256  $WORK/de440.bsp" | sha256sum -c -

# 2. The pack: compile, seal, check by digest.
ALPHA="$SITE/examples/precision-alpha"
node "$ALPHA/tools/compiler/compile.mjs" "--kernel=$WORK/de440.bsp" --fromYear=1790 --toYear=2210 "--out=$WORK/de440-1790-2210.zeph" > "$WORK/compile.log"
node "$ALPHA/tools/seal.mjs" "$WORK/de440-1790-2210.zeph" "$WORK/de440-1790-2210.v2.zeph"
echo "$PACK_SHA256  $WORK/de440-1790-2210.v2.zeph" | sha256sum -c -

# 3. The build, then the 240 cases: the conformance harness, and the scorer.
cd "$ROOT"
npm run build
node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" \
  --check conformance/results/zodiacs-engine.json
ZODIACS_ENGINE_DE440_PACK="$WORK/de440-1790-2210.v2.zeph" ZODIACS_ENGINE_DE440_SHA256="$PACK_SHA256" \
  node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" \
  --levels L1 --check conformance/results/zodiacs-engine-de440.json
node "$HERE/tools/score.mjs" --pack "$WORK/de440-1790-2210.v2.zeph" --sha256 "$PACK_SHA256" --out "$WORK/results"
for name in cases.json summary.json cases.md; do cmp "$WORK/results/$name" "$HERE/results/$name"; done
echo "l1-gap: the committed results are reproduced"
