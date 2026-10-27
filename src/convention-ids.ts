/**
 * The ids a natal envelope names, by the rule of the conventions set that
 * carries them (src/receipt.ts), and the id syntax they are written in. The
 * receipt codec and `./conventions` share this module; it imports none.
 */

const NAMESPACE = /^[A-Za-z][A-Za-z0-9-]*$/u;
const VALUE = /^[^\s\p{Cc}\p{Cf}\p{Cs}]+$/u;

/** The id of a namespace and a value, such as `zodiac:tropical`. Throws a RangeError for a malformed one. */
export function conventionId(namespace: string, value: string): string {
  if (typeof namespace !== "string" || !NAMESPACE.test(namespace))
    throw new RangeError("A convention namespace is a letter, then letters, digits or hyphens.");
  if (typeof value !== "string" || !VALUE.test(value))
    throw new RangeError("A convention value is not empty and has no white space, control character or lone surrogate.");
  return `${namespace}:${value}`;
}

/** The fields of a natal envelope (`./receipt`) that name conventions. */
export interface NatalConventionFields {
  receipt: {
    conventions: Readonly<Record<string, string>>;
    coverage: Readonly<Record<string, string>>;
    houses: { requested: string; actual: string | null; absenceReason: string | null };
    inputFlags: readonly string[];
    resultFlags: readonly string[];
    reference: string;
    timeScale?: string;
    engine: { ephemeris?: { name: string; version: string } };
  };
  result: {
    deltaT?: { model: string; segment: string };
    timeScale?: { input: string; basis: string; ut1MinusUtc: { source: string } | null };
  };
}

/**
 * The ids a natal envelope names, in code-unit order, each once. From the
 * receipt: each conventions and coverage field's key and value
 * (`zodiac:tropical`), the requested and actual house systems
 * (`house:placidus`), why there are no houses (`house-absence:unknown-time`),
 * each flag (`flag:no-time`), the reference (`reference:supplied-instant`),
 * the instant's scale (`time-scale:utc`) and the ephemeris
 * (`ephemeris:astronomy-engine@2.1.19`). From the result: the ΔT model and
 * segment (`deltat-model:iers-utc/1`), the time basis (`time-basis:iers`) and
 * the source of UT1 − UTC (`ut1-source:observed`). Receipts of the
 * conventions set from 1.1.0-rc.1 carry them as `conventionIds`. This is that
 * set's rule; another rule would come with another set.
 */
export function natalConventionIds(envelope: NatalConventionFields): string[] {
  const { receipt, result } = envelope;
  const ids = new Set<string>();
  for (const fields of [receipt.conventions, receipt.coverage])
    for (const [key, value] of Object.entries(fields)) ids.add(conventionId(key, value));
  const { requested, actual, absenceReason } = receipt.houses;
  for (const system of [requested, actual]) if (system !== null) ids.add(conventionId("house", system));
  if (absenceReason !== null) ids.add(conventionId("house-absence", absenceReason));
  for (const flag of [...receipt.inputFlags, ...receipt.resultFlags]) ids.add(conventionId("flag", flag));
  ids.add(conventionId("reference", receipt.reference));
  if (receipt.timeScale !== undefined) ids.add(conventionId("time-scale", receipt.timeScale));
  const ephemeris = receipt.engine.ephemeris;
  if (ephemeris !== undefined)
    ids.add(conventionId("ephemeris", `${ephemeris.name}@${ephemeris.version}`));
  if (result.deltaT !== undefined) {
    ids.add(conventionId("deltat-model", result.deltaT.model));
    ids.add(conventionId("deltat-segment", result.deltaT.segment));
  }
  if (result.timeScale !== undefined) {
    ids.add(conventionId("time-scale", result.timeScale.input));
    ids.add(conventionId("time-basis", result.timeScale.basis));
    if (result.timeScale.ut1MinusUtc !== null)
      ids.add(conventionId("ut1-source", result.timeScale.ut1MinusUtc.source));
  }
  return [...ids].sort();
}
