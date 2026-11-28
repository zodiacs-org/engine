/** Detached JSON metadata supplied by an eclipse source, not authenticated evidence. */
export type EclipseMetadata = null | boolean | number | string |
  readonly EclipseMetadata[] | { readonly [key: string]: EclipseMetadata };

export interface EclipseWindow {
  readonly startMs: number;
  readonly endMs: number;
  readonly clock: "utc";
}

export interface SuppliedEclipseInstant {
  readonly eclipseKind: "solar" | "lunar";
  /** Preserve the source definition, including minima that are not limb contacts. */
  readonly contactKind: string;
  readonly atMs: number;
  readonly clock: "utc";
  readonly provenance: EclipseMetadata;
}

interface EclipseSearchMetadata {
  readonly evaluations: number;
  /** Source assumptions and limitations, without upgrading completion to proof. */
  readonly completeness: string;
  readonly provenance: EclipseMetadata;
}

export type SuppliedEclipseSearch = EclipseSearchMetadata & (
  | { readonly status: "complete"; readonly events: readonly SuppliedEclipseInstant[] }
  | { readonly status: "refused"; readonly reason: "evaluation-budget" | "cancelled";
      readonly events: readonly [] }
);

export type EclipseAdapter =
  | { readonly status: "available"; search(window: EclipseWindow): SuppliedEclipseSearch }
  | { readonly status: "unavailable"; readonly reason: "not-installed" | "unsupported-api" };

/** Capture adapter selection before component searches run trusted callbacks. */
export function captureEclipseAdapter(input: unknown): EclipseAdapter {
  if (!input || typeof input !== "object") throw new RangeError("invalid eclipse adapter.");
  const adapter = input as EclipseAdapter;
  const status = adapter.status;
  if (status === "unavailable") {
    const reason = adapter.reason;
    if (reason !== "not-installed" && reason !== "unsupported-api") {
      throw new RangeError("invalid unavailable eclipse adapter reason.");
    }
    return Object.freeze({ status, reason });
  }
  if (status !== "available") throw new RangeError("invalid eclipse adapter.");
  const search = adapter.search;
  if (typeof search !== "function") throw new RangeError("invalid eclipse adapter.");
  return Object.freeze({ status, search: (window: EclipseWindow) => search.call(adapter, window) });
}

/** Copy JSON data without freezing caller objects or invoking accessor slots. */
export function snapshotMetadata(value: unknown, ancestors = new Set<object>()): EclipseMetadata {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || ancestors.has(value) || ancestors.size >= 32) {
    throw new RangeError("eclipse metadata must be finite acyclic JSON data.");
  }
  const array = Array.isArray(value);
  const prototype: unknown = Object.getPrototypeOf(value);
  if (!array && prototype !== Object.prototype && prototype !== null) {
    throw new RangeError("eclipse metadata must use plain JSON objects.");
  }
  const path = new Set(ancestors).add(value);
  const entries: Array<[string, EclipseMetadata]> = [];
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === "length") continue;
    const slot = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !slot || !("value" in slot) || !slot.enumerable ||
      (array && key !== String(entries.length))) {
      throw new RangeError("eclipse metadata requires plain JSON data slots.");
    }
    entries.push([key, snapshotMetadata(slot.value, path)]);
  }
  if (array) {
    if (entries.length !== (value as unknown[]).length) throw new RangeError("sparse eclipse metadata.");
    return Object.freeze(entries.map(([, item]) => item));
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function eclipseLabel(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)) throw new RangeError("invalid eclipse source label.");
}
