export interface WheelBody { body: string; lon: number; retrograde: boolean }
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
export interface NatalChartDisplay {
  bodies: readonly WheelBody[];
  angles: WheelData['angles'];
  houses: WheelData['houses'];
  aspects: readonly WheelAspect[];
  flags: readonly string[];
  engineVersion: string;
}
export interface WheelDescription {
  model: WheelData;
  zodiac: string;
  bodies: (WheelBody & { description: string })[];
  angles: { name: string; lon: number; description: string }[];
  houses: { house: number; lon: number; description: string }[];
  aspects: (WheelAspect & { description: string })[];
  summary: string;
}
export function fromNatalChart(chart: NatalChartDisplay): WheelData;
export function validateWheelData(data: WheelData): WheelData;
export function describeWheel(data: WheelData): WheelDescription;
export function renderWheelSvg(data: WheelData, options: { idPrefix: string; title?: string }): string;
