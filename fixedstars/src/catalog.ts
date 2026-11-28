import { catalogData } from "./catalog-data.js";
import type { CatalogStar } from "./types.js";

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

/** Licensed catalog snapshot, sorted by stable id and deeply immutable. */
export const catalog: readonly CatalogStar[] = freeze(catalogData);

/** Case-insensitive exact id, name or alias lookup. No fuzzy identification. */
export function findStar(query: string): CatalogStar | undefined {
  if (typeof query !== "string" || query.trim() === "") {
    throw new RangeError("Star lookup requires a nonempty id, name or alias.");
  }
  const key = query.trim().toLowerCase();
  return catalog.find((star) => [star.id, star.name, ...star.aliases]
    .some((label) => label.toLowerCase() === key));
}
