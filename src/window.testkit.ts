/**
 * What the birth-window tests share: natalChart's features at an instant, a
 * cell's, and the two comparisons of a partition with natalChart itself
 * (every cell at every whole second, and every switch at its millisecond).
 * The comparison is the same on either ephemeris: both sides are the engine's
 * own, on whichever source the test file has chosen.
 */
import { expect } from "vitest";

import { natalChart } from "./api.js";
import { houseOf } from "./houses.js";
import { signForLongitude } from "./signs.js";
import type { HouseSystem } from "./types.js";
import { birthWindow } from "./window.js";
import type { BirthWindow, BirthWindowCell } from "./window.js";

const PHYSICAL = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

export interface Place {
  latitude: number;
  longitude: number;
  houseSystem: HouseSystem;
}

export type Features = Record<string, string | number | null>;

/** natalChart's features at an instant. */
export function chartFeatures(time: number, place: Place): Features {
  const chart = natalChart({ utc: new Date(time), ...place });
  const features: Features = {};
  for (const body of chart.bodies) {
    features[`sign:${body.body}`] = body.sign;
    features[`house:${body.body}`] = houseOf(body.lon, chart.houses!.cusps);
  }
  features.ascendant = signForLongitude(chart.angles!.asc).slug;
  features.midheaven = signForLongitude(chart.angles!.mc).slug;
  const aspects = new Map(chart.aspects.map((aspect) => [`${aspect.a}|${aspect.b}`, aspect.type]));
  for (let i = 0; i < PHYSICAL.length; i += 1) {
    for (let j = i + 1; j < PHYSICAL.length; j += 1) {
      features[`aspect:${PHYSICAL[i]}|${PHYSICAL[j]}`] = aspects.get(`${PHYSICAL[i]}|${PHYSICAL[j]}`) ?? null;
    }
  }
  features["house-system"] = chart.houses!.system;
  return features;
}

export function cellFeatures(cell: BirthWindowCell): Features {
  const features: Features = {};
  for (const [body, sign] of Object.entries(cell.features.signs)) features[`sign:${body}`] = sign;
  for (const [body, house] of Object.entries(cell.features.houses)) features[`house:${body}`] = house;
  features.ascendant = cell.features.ascendant;
  features.midheaven = cell.features.midheaven;
  const aspects = new Map(cell.features.aspects.map((aspect) => [`${aspect.a}|${aspect.b}`, aspect.type]));
  for (let i = 0; i < PHYSICAL.length; i += 1) {
    for (let j = i + 1; j < PHYSICAL.length; j += 1) {
      features[`aspect:${PHYSICAL[i]}|${PHYSICAL[j]}`] = aspects.get(`${PHYSICAL[i]}|${PHYSICAL[j]}`) ?? null;
    }
  }
  features["house-system"] = cell.features.houseSystem;
  return features;
}

export function componentOf(change: BirthWindow["switches"][number]["changes"][number]): string {
  if (change.feature === "sign" || change.feature === "house") return `${change.feature}:${change.body}`;
  if (change.feature === "aspect") return `aspect:${change.a}|${change.b}`;
  return change.feature;
}

export function cellAt(window: BirthWindow, time: number): BirthWindowCell {
  const cell = window.cells.find((candidate) => candidate.start.getTime() <= time && time < candidate.end.getTime());
  if (!cell) throw new Error(`no cell holds ${new Date(time).toISOString()}`);
  return cell;
}

/** Disagreements between the partition and natalChart at every whole second from the start, and at end − 1 ms. */
export function disagreementsEverySecond(window: BirthWindow, place: Place, step = 1000): string[] {
  const start = window.start.getTime();
  const end = window.end.getTime();
  const times: number[] = [];
  for (let time = start; time < end; time += step) times.push(time);
  if (times.at(-1) !== end - 1) times.push(end - 1);
  const found: string[] = [];
  for (const time of times) {
    const expected = chartFeatures(time, place);
    const actual = cellFeatures(cellAt(window, time));
    for (const key of Object.keys(expected)) {
      if (expected[key] !== actual[key]) found.push(`${new Date(time).toISOString()} ${key}: ${String(expected[key])} ≠ ${String(actual[key])}`);
    }
  }
  return found;
}

/** Switches whose millisecond natalChart does not confirm: exactly the listed changes, from and to. */
export function unconfirmedSwitches(window: BirthWindow, place: Place): string[] {
  const found: string[] = [];
  for (const entry of window.switches) {
    const at = entry.at.getTime();
    const before = chartFeatures(at - 1, place);
    const after = chartFeatures(at, place);
    const listed = new Map(entry.changes.map((change) => [componentOf(change), change]));
    for (const key of Object.keys(before)) {
      const change = listed.get(key);
      const ok = change ? before[key] === change.from && after[key] === change.to : before[key] === after[key];
      if (!ok) found.push(`${entry.at.toISOString()} ${key}: ${String(before[key])} → ${String(after[key])}`);
    }
  }
  return found;
}

export function partition(start: number, milliseconds: number, place: Place): BirthWindow {
  return birthWindow({ start: new Date(start), end: new Date(start + milliseconds), ...place });
}

export function expectExact(window: BirthWindow, place: Place, step = 1000): void {
  expect(window.flags).not.toContain("bound-exceeded");
  expect(disagreementsEverySecond(window, place, step)).toEqual([]);
  expect(unconfirmedSwitches(window, place)).toEqual([]);
}

