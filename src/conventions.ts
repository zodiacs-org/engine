/**
 * Ids of the Zodiacs conventions registry (zodiacs.org/developers/conventions,
 * CC0 1.0), which names each convention a receipt can carry. An id is a
 * namespace, a colon and a value; the value is everything after the first
 * colon. This entry imports no module of another entry.
 */
import { conventionId } from "./convention-ids.js";

export { conventionId, natalConventionIds } from "./convention-ids.js";
export type { NatalConventionFields } from "./convention-ids.js";

/** The registry's page. An id's address is this URL with the id, through encodeURI, as its fragment. */
export const CONVENTIONS_REGISTRY: string = "https://zodiacs.org/developers/conventions/";

/** An id split at its first colon. */
export interface ConventionId {
  namespace: string;
  value: string;
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

/** An id's address: `CONVENTIONS_REGISTRY`, `#` and the id through encodeURI. Throws a RangeError for a malformed id. */
export function conventionAddress(id: string): string {
  parseConventionId(id);
  return `${CONVENTIONS_REGISTRY}#${encodeURI(id)}`;
}
