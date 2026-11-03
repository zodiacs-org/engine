#!/bin/sh
# T12 (../PREREGISTRATION.md, section 6): compiles declarations.mts with the
# TypeScript given (5.9.3: --strict, --noEmit, NodeNext) against the site's
# time-basis.d.mts and the package's @zodiacs/engine/time. The site file is
# given by path, refused unless its SHA-256 is the pin (section 5), and
# copied, never compiled in place. With "control" last, the copy's TimeBasis
# gains a required `extra: number`, and the compile must fail in
# declarations.mts. Written on 2026-11-04, before any formal run, with the
# amendment of that day: section 12 named declarations.mts, which commit
# 3129ede did not hold.
#
#   sh declarations.sh <extracted package dir> <site time-basis.d.mts> <tsc> [control]
#
# The package directory holds an extracted package (package.json and dist/).
# The work directory is made under TMPDIR, which must have no node_modules
# above it, and removed at the end.
set -u
package=$1
site=$2
tsc=$3
mode=${4:-check}
pin=8cc3670eb2aae747a2e22e667633594b8d24f7f6982dfcee2c0ffc2a2cff6ff9
tools=$(cd "$(dirname "$0")" && pwd)
[ "$(shasum -a 256 "$site" | cut -d ' ' -f 1)" = "$pin" ] ||
  { echo "declarations.sh: $site is not the pinned time-basis.d.mts" >&2; exit 2; }
work=$(mktemp -d "${TMPDIR:-/tmp}/time-entry-t12-XXXXXX")
trap 'rm -rf "$work"' EXIT INT TERM
mkdir -p "$work/site" "$work/node_modules/@zodiacs"
cp "$tools/declarations.mts" "$work/declarations.mts"
if [ "$mode" = control ]; then
  awk '{ print } /^export interface TimeBasis \{$/ { print "  extra: number;" }' "$site" > "$work/site/time-basis.d.mts"
  grep -q '^  extra: number;$' "$work/site/time-basis.d.mts" ||
    { echo "declarations.sh: the control's change was not made" >&2; exit 2; }
else
  cp "$site" "$work/site/time-basis.d.mts"
fi
ln -s "$(cd "$package" && pwd)" "$work/node_modules/@zodiacs/engine"
cat > "$work/tsconfig.json" <<'JSON'
{ "compilerOptions": { "strict": true, "noEmit": true, "module": "NodeNext", "moduleResolution": "NodeNext", "target": "ES2022", "lib": ["ES2022"], "types": [] }, "files": ["declarations.mts"] }
JSON
printf 'TypeScript %s\n' "$(node "$tsc" --version)"
node "$tsc" -p "$work/tsconfig.json"
status=$?
printf 'T12 %s: exit %s\n' "$mode" "$status"
exit $status
