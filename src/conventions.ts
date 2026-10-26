/**
 * Ids of the Zodiacs conventions registry (zodiacs.org/developers/conventions,
 * CC0 1.0), which names each convention a receipt can carry. An id is a
 * namespace, a colon and a value; the value is everything after the first
 * colon. This entry imports no other module.
 */

/** The registry's page. An id's address is this URL with the id, through encodeURI, as its fragment. */
export const CONVENTIONS_REGISTRY = "https://zodiacs.org/developers/conventions/";

/** An id split at its first colon. */
export interface ConventionId {
  namespace: string;
  value: string;
}

const NAMESPACE = /^[A-Za-z][A-Za-z0-9-]*$/u;
const VALUE = /^[^\s\p{Cc}\p{Cf}]+$/u;

/** The id of a namespace and a value, such as `zodiac:tropical`. Throws a RangeError for a malformed one. */
export function conventionId(namespace: string, value: string): string {
  if (typeof namespace !== "string" || !NAMESPACE.test(namespace))
    throw new RangeError("A convention namespace is a letter, then letters, digits or hyphens.");
  if (typeof value !== "string" || !VALUE.test(value))
    throw new RangeError("A convention value has no white space or control character, and is not empty.");
  return `${namespace}:${value}`;
}

/** An id's namespace and value. Throws a RangeError for a malformed id. */
export function parseConventionId(id: string): ConventionId {
  const colon = typeof id === "string" ? id.indexOf(":") : -1;
  if (colon < 0) throw new RangeError("A convention id is a namespace, a colon and a value.");
  const namespace = id.slice(0, colon);
  const value = id.slice(colon + 1);
  conventionId(namespace, value);
  return { namespace, value };
}

/** An id's address: `CONVENTIONS_REGISTRY`, `#` and the id through encodeURI. */
export function conventionAddress(id: string): string {
  parseConventionId(id);
  return `${CONVENTIONS_REGISTRY}#${encodeURI(id)}`;
}

/** The fields of a natal receipt (`./receipt`) that name conventions. */
export interface NatalConventionFields {
  conventions: Readonly<Record<string, string>>;
  coverage: Readonly<Record<string, string>>;
  houses: { requested: string; actual: string | null; absenceReason: string | null };
  inputFlags: readonly string[];
  resultFlags: readonly string[];
  reference: string;
  timeScale?: string;
  engine: { ephemeris?: { name: string; version: string } };
}

/**
 * The ids a natal receipt names, sorted, each once: each conventions and
 * coverage field's key and value (`zodiac:tropical`), the requested and actual
 * house systems (`house:placidus`), why there are no houses
 * (`house-absence:unknown-time`), each flag (`flag:no-time`), the reference
 * (`reference:supplied-instant`), the instant's scale (`time-scale:utc`) and
 * the ephemeris (`ephemeris:astronomy-engine@2.1.19`). Receipts carry them as
 * `conventionIds` from 1.1.0-rc.1.
 */
export function natalConventionIds(receipt: NatalConventionFields): string[] {
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
  return [...ids].sort();
}
