/** Types for roundtrip-scan-lib.mjs, which the unit suite imports. */
export interface ScanScope {
  end: number;
  stepDays: number;
  deltas: readonly number[];
  dense: boolean;
}
export interface ScanGeo {
  prepareLocalTime(date: string, timeZone: string): Promise<void>;
  zoneOffsetAt(timeZone: string, utcMilliseconds: number): number;
  resolveLocalToUtc(date: string, time: string, timeZone: string): { utc: Date; flags: readonly string[] };
}
export declare const SCOPES: { default: ScanScope; full: ScanScope };
export declare function scanZones(
  geo: ScanGeo,
  loaders: readonly (() => Promise<{ default: Record<string, { n: string }> }>)[]
): Promise<string[]>;
export declare function scanZone(
  geo: ScanGeo,
  zone: string,
  scope: ScanScope
): {
  transitions: number;
  /** Each change of offset found, UTC ms. */
  changes: number[];
  tested: number;
  failures: string[];
};
