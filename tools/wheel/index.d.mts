/** `retrograde` null: no motion is given, as for a point the angles fix (the Vertex, the East Point, the lots). */
export interface WheelBody { body: string; lon: number; retrograde: boolean | null }
export interface WheelAspect { a: string; b: string; type: 'conjunction' | 'sextile' | 'square' | 'trine' | 'opposition'; orb: number; applying: boolean }
export interface WheelData {
  zodiac: 'tropical' | { sidereal: string };
  bodies: readonly WheelBody[];
  angles?: { asc: number; mc: number; dsc: number; ic: number } | null;
  houses?: { system: string; cusps: readonly number[] } | null;
  aspects?: readonly WheelAspect[];
  flags?: readonly string[];
  engineVersion?: string | null;
}
/** The fields `fromNatalChart` reads from `natalChart()` of `@zodiacs/engine`. */
export interface NatalChartDisplay {
  bodies: readonly WheelBody[];
  angles: WheelData['angles'];
  houses: WheelData['houses'];
  aspects: readonly WheelAspect[];
  flags: readonly string[];
  engineVersion: string;
}
/** A row of `minorBodyPositions()` from `@zodiacs/engine/minor-bodies`; `flags` names an ephemeris fallback. */
export interface ExtraBodyDisplay { body: string; lon: number; retrograde: boolean; flags?: readonly string[] }
/** A row of `chartPoints().points` from `@zodiacs/engine`; `speed` null shows no motion, `fallback` names an ephemeris fallback. */
export interface PointDisplay { point: string; lon: number; speed: number | null; fallback?: string }
/** Bodies and points drawn after the chart's own bodies. */
export interface NatalChartExtras { extraBodies?: readonly ExtraBodyDisplay[]; points?: readonly PointDisplay[] }
export interface WheelDescription {
  model: WheelData;
  zodiac: string;
  /** `label` is the marker's short label in the SVG, which `description` also gives. */
  bodies: (WheelBody & { label: string; description: string })[];
  angles: { name: string; lon: number; description: string }[];
  houses: { house: number; lon: number; description: string }[];
  aspects: (WheelAspect & { description: string })[];
  summary: string;
}
export function fromNatalChart(chart: NatalChartDisplay, extras?: NatalChartExtras | null): WheelData;
export function validateWheelData(data: WheelData): WheelData;
export function describeWheel(data: WheelData): WheelDescription;
export function renderWheelSvg(data: WheelData, options: { idPrefix: string; title?: string }): string;
