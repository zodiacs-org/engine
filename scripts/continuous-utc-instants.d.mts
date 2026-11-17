export type InstantCase = [ms: number, scale: "utc" | "ut1" | "tt", pin: number | null, fields: "all" | "days"];
export function random(seed: number): () => number;
export function instantsBetween(seed: number, count: number, from: number, to: number): number[];
export const GROUPS: Record<string, InstantCase[]>;
export const DAY: number;
export const TABLE_END: number;
