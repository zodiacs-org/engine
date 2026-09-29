/*
 * SemVer 2.0.0 versions and their precedence, as section 11 of the
 * specification defines it (https://semver.org/spec/v2.0.0.html), for the
 * receipt codec's version gates. Written here, so the package takes no
 * dependency for it. Not exported by any entry point.
 */

/** The regular expression semver.org gives for a SemVer 2.0.0 version, with capture groups. */
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const DIGITS = /^\d+$/;

/** Whether `value` is a SemVer 2.0.0 version: no `v` prefix, no leading zeros in numbers, no empty identifier. */
export function isVersion(value: string): boolean {
  return SEMVER.test(value);
}

/** Two numbers written without leading zeros, compared as integers of any size: -1, 0 or 1. */
function compareNumbers(a: string, b: string): number {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * SemVer 2.0.0 precedence: -1 when `a` comes before `b`, 1 when it comes
 * after, 0 when neither does. Major, minor and patch compare as integers; a
 * pre-release comes before its release; pre-release identifiers compare from
 * the left, numeric ones as integers, others in ASCII order, a numeric one
 * before any other, and a shorter list first when the rest are equal. Build
 * metadata is ignored. Throws RangeError unless both are SemVer 2.0.0 versions.
 */
export function compareVersions(a: string, b: string): number {
  const x = SEMVER.exec(a);
  const y = SEMVER.exec(b);
  if (!x || !y) throw new RangeError("compareVersions takes SemVer 2.0.0 versions.");
  for (let part = 1; part <= 3; part += 1) {
    const order = compareNumbers(x[part]!, y[part]!);
    if (order !== 0) return order;
  }
  if (x[4] === undefined || y[4] === undefined) return x[4] === y[4] ? 0 : x[4] === undefined ? 1 : -1;
  const p = x[4].split(".");
  const q = y[4].split(".");
  for (let k = 0; k < p.length && k < q.length; k += 1) {
    const numeric = DIGITS.test(p[k]!);
    if (numeric !== DIGITS.test(q[k]!)) return numeric ? -1 : 1;
    const order = numeric ? compareNumbers(p[k]!, q[k]!) : p[k]! < q[k]! ? -1 : p[k]! > q[k]! ? 1 : 0;
    if (order !== 0) return order;
  }
  return p.length === q.length ? 0 : p.length < q.length ? -1 : 1;
}
