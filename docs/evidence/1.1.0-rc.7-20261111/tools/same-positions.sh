#!/bin/bash
# Whether two builds give the same geocentric positions: the DE440 sweep's
# engine side (docs/evidence/de440-sweep-20261111/tools/engine_sweep.mjs) run
# on each, on the first LIMIT days of each of the sweep's eight eras, and the
# SHA-256 of the values each writes compared era by era. Four at a time.
#
#   tools/same-positions.sh A_DIST B_DIST OUT_DIR [LIMIT]
#
# A_DIST and B_DIST are dist/ directories (an unpacked archive's
# package/dist works, with astronomy-engine 2.1.19 resolvable from it).
set -euo pipefail
A=$(cd "$1" && pwd); B=$(cd "$2" && pwd); OUT=$3; LIMIT=${4:-1500}
TOOL=$(cd "$(dirname "$0")/../../de440-sweep-20261111/tools" && pwd)/engine_sweep.mjs
mkdir -p "$OUT"
for y in 1800 1850 1900 1950 2000 2050 2100 2150; do
  for side in a b; do
    dist=$A; [ "$side" = b ] && dist=$B
    echo "ZODIACS_ENGINE_DIST=$dist node $TOOL --from-year $y --to-year $((y + 50)) --limit $LIMIT --out $OUT/$side-$y.bin"
  done
done | xargs -P 4 -I{} sh -c "env {} > /dev/null"
same=0
for y in 1800 1850 1900 1950 2000 2050 2100 2150; do
  a=$(node -p "const j=require('$OUT/a-$y.bin.json'); j.engine.version + ' ' + j.count + ' ' + j.valuesSha256")
  b=$(node -p "const j=require('$OUT/b-$y.bin.json'); j.engine.version + ' ' + j.count + ' ' + j.valuesSha256")
  verdict=differ; [ "${a##* }" = "${b##* }" ] && { verdict=same; same=$((same + 1)); }
  echo "$y: $a | $b | $verdict"
done
echo "$same of 8 eras give the same values, node $(node -v)"
