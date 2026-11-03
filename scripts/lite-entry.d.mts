/** Types for lite-entry.mjs, which the unit suite imports. */
export type LitePart = "declinations" | "sect" | "composite" | "dignities";
export interface LiteNameLists {
  values: string[];
  types: string[];
}
export declare const LITE_PARTS: readonly LitePart[];
export declare const LITE_SOURCES: Readonly<Record<string, readonly string[]>>;
export declare const LITE_NAMES: Readonly<Record<LitePart, { readonly values: readonly string[]; readonly types: readonly string[] }>>;
export declare const EPHEMERIS_FINGERPRINTS: readonly string[];
export declare function liteNames(): LiteNameLists;
export declare function declaredNames(file: string): LiteNameLists;
export declare function checkLiteNames(readings: {
  runtime?: readonly string[];
  parts?: Record<LitePart, readonly string[]>;
  declared?: LiteNameLists;
  source?: LiteNameLists;
}): void;
