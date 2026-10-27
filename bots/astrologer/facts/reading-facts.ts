/**
 * Reading facts for the Astrologer bot: every number a reading may state,
 * computed by this engine's own code (positions, houses, sect, aspects,
 * crossings, civil time), so the bot never does degree arithmetic itself.
 *
 * Kept outside src/ on purpose: it is a bot tool, not part of the package,
 * and nothing here reaches dist/ or the carried archive.
 */
import { CONFIGURED_ASPECT_ANGLES, createAspectPolicy, findConfiguredAspects } from "../../../src/configured-aspects.js";
import type { AspectPosition, AspectPolicy } from "../../../src/configured-aspects.js";
import { natalChart } from "../../../src/api.js";
import { bodyLongitude, longitudeSpeed } from "../../../src/ephemeris.js";
import { prepareLocalTime, resolveLocalToUtc, zoneOffsetAt } from "../../../src/geo/timezone.js";
import { sectOf } from "../../../src/points.js";
import { searchLongitudeCrossings } from "../../../src/returns.js";
import { degreeInSign, normalizeLongitude, signForLongitude, signIndexForLongitude, SIGNS } from "../../../src/signs.js";
import { moonSignCandidates } from "../../../src/techniques/moon-sign.js";
import { CLASSICAL_PLANETS, dignityRulersAt, essentialDignities } from "../../../src/techniques/dignities.js";
import type { ClassicalPlanet } from "../../../src/techniques/dignities.js";
import { separation } from "../../../src/aspects.js";
import type { BodyName, Chart } from "../../../src/types.js";

// ------------------------------------------------------------------ input

export interface ReadingInput {
  /** Local civil date, YYYY-MM-DD (Gregorian). */
  date: string;
  /** Local wall time HH:MM, or null when unknown. */
  time: string | null;
  timeKnown: boolean;
  /** IANA zone of the birthplace. */
  zone: string;
  /** Degrees, north and east positive. */
  lat: number;
  lon: number;
}

export interface ReadingOptions {
  /** First local date of the transit window, YYYY-MM-DD. Default 2026-11-01. */
  windowStart?: string;
  /** Length of the window in days. Default 90. */
  days?: number;
}

// ------------------------------------------------------------------ settings (stated in the output)

/** Bodies whose transits are listed, and the aspects and natal points they are checked against. */
export const TRANSITING: readonly BodyName[] = ["Sun", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
export const SLOW: readonly BodyName[] = ["Uranus", "Neptune", "Pluto"];
export const TRANSIT_ASPECTS = ["conjunction", "square", "trine", "opposition"] as const;
/** Orb, degrees, that defines an in-orb date range. */
export const RANGE_ORB = 1;
/** Below this speed (degrees a day) at an exact hit, a range is given, never a single day. */
export const STATIONARY_SPEED = 0.01;
/** Orb, degrees, for a station's contact with a natal point. */
export const STATION_ORB = 2;
/** Distance, degrees, from a sign edge that is reported. */
export const EDGE_DEGREES = 2;
export const STATION_BODIES: readonly BodyName[] = ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const PLANETS: readonly BodyName[] = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
const MAJOR = ["conjunction", "sextile", "square", "trine", "opposition"] as const;

const DAY = 86_400_000;
const MINUTE = 60_000;

// ------------------------------------------------------------------ output types

export interface Placement {
  point: string;
  lon: number;
  sign: string;
  /** Degree in sign, truncated to the arcminute, e.g. 14°30'. */
  degree: string;
  /** Whole sign house, null without a birth time. */
  house: number | null;
  retrograde: boolean;
}

export interface NatalAspect {
  rank: number;
  a: string;
  b: string;
  type: string;
  orb: number;
}

export interface EdgePoint {
  point: string;
  sign: string;
  degree: string;
  /** "start" when within EDGE_DEGREES after the sign begins, "end" when within it before the sign ends. */
  edge: "start" | "end";
  /** Degrees to the edge. */
  distance: number;
  /** The neighbouring sign across that edge. */
  neighbour: string;
  /** For the Ascendant, Midheaven and Moon: the birth-time shift, minutes, that moves the point into the neighbour; null when none within the search. */
  shiftMinutes: number | null;
}

export interface Transit {
  body: BodyName;
  aspect: string;
  natal: string;
  /** Exact hits, local dates YYYY-MM-DD. */
  exact: string[];
  /** In-orb date range (within RANGE_ORB), local dates, for slow bodies and hits near a station; otherwise null. */
  range: { from: string; to: string; openStart: boolean; openEnd: boolean } | null;
  /** True when a hit has |speed| below STATIONARY_SPEED. */
  nearStation: boolean;
  /** Sort key: first relevant instant, ms. */
  sortMs: number;
}

export interface Station {
  body: BodyName;
  kind: "retrograde" | "direct";
  utc: string;
  localDate: string;
  lon: number;
}

export interface StationContact {
  station: Station;
  /** Natal points within STATION_ORB of a major aspect, tightest first. */
  contacts: { natal: string; type: string; orb: number }[];
  /** Natal points that were checked. */
  checked: string[];
}

/** Calendar age of the native on the first day of the window, from the local birth date. */
export interface Age {
  /** The local date the age is taken on (the window start). */
  at: string;
  years: number;
  months: number;
  /** True when the birth date is after the window start; years and months are then 0. */
  bornAfterStart: boolean;
  /** Days from the window start to the birth date when born after it, else 0. */
  daysAfterStart: number;
  stage: "infant" | "child" | "adolescent" | "adult";
}

/** The planets of each sect, after Ptolemy, Tetrabiblos I.7. */
export interface SectTeam {
  sect: "day" | "night";
  light: ClassicalPlanet;
  beneficOfSect: ClassicalPlanet;
  maleficOfSect: ClassicalPlanet;
  beneficContrary: ClassicalPlanet;
  /** The out-of-sect malefic. */
  maleficContrary: ClassicalPlanet;
}

export const SECT_TEAMS: Readonly<Record<"day" | "night", SectTeam>> = Object.freeze({
  day: { sect: "day", light: "Sun", beneficOfSect: "Jupiter", maleficOfSect: "Saturn", beneficContrary: "Venus", maleficContrary: "Mars" },
  night: { sect: "night", light: "Moon", beneficOfSect: "Venus", maleficOfSect: "Mars", beneficContrary: "Jupiter", maleficContrary: "Saturn" }
});

export interface PlanetDignity {
  planet: ClassicalPlanet;
  sign: string;
  degree: string;
  /** Held by this planet here, in the order domicile, exaltation, triplicity, term, face. Without sect, triplicity is left out (see triplicityIf). */
  dignities: string[];
  debilities: string[];
  /** No essential dignity (Lilly); null when it turns on the unknown sect. */
  peregrine: boolean | null;
  /** Unknown sect only: the sects in which this planet would hold triplicity here. */
  triplicityIf: ("day" | "night")[];
  /** Who holds each dignity at this degree. */
  lords: {
    domicile: ClassicalPlanet;
    exaltation: ClassicalPlanet | null;
    element: string;
    triplicity: { day: ClassicalPlanet; night: ClassicalPlanet; participating: ClassicalPlanet };
    term: { planet: ClassicalPlanet; from: number; to: number };
    face: { planet: ClassicalPlanet; from: number; to: number };
    detriment: ClassicalPlanet;
    fall: ClassicalPlanet | null;
  };
}

export interface ChartVersion {
  label: string;
  utc: string;
  localTime: string;
  timeKnown: boolean;
  placements: Placement[];
  ascendant: Placement | null;
  midheaven: Placement | null;
  sect: "day" | "night" | null;
  /** The sect team of this chart; null without a birth time. */
  sectTeam: SectTeam | null;
  /** Mercury's phase: morning star when it is west of the Sun in longitude (rises before it), evening star when east. */
  mercuryPhase: "morning" | "evening";
  dignities: PlanetDignity[];
  placidusUndefined: boolean;
  aspects: NatalAspect[];
  edges: EdgePoint[];
  transits: Transit[];
  transitPoints: string[];
  stationContacts: StationContact[];
  /** Unknown time only: the Moon's possible signs over the local date. */
  moonSigns: string[] | null;
  /** Unknown time only: other bodies whose sign changes during the local date, with the signs in order. */
  daySignChanges: { point: string; signs: string[] }[];
}

export interface ReadingFacts {
  input: ReadingInput;
  status: "resolved" | "gap" | "fold" | "time-unknown";
  lmt: boolean;
  /** Gap and fold: the zone's offsets either side of the change, minutes east. */
  offsets: { before: number; after: number } | null;
  window: { from: string; toInclusive: string; days: number; zone: string };
  age: Age;
  stations: Station[];
  versions: ChartVersion[];
}

// ------------------------------------------------------------------ helpers

function truncatedMinutes(lon: number): number {
  return Math.floor(degreeInSign(lon) * 60 + 1e-9);
}

/** Degree in sign, truncated to the arcminute: never shows 30°00'. */
export function degreeText(lon: number): string {
  const minutes = truncatedMinutes(lon);
  return `${Math.floor(minutes / 60)}°${String(minutes % 60).padStart(2, "0")}'`;
}

/** An orb or distance in degrees, rounded to the arcminute. */
export function orbText(degrees: number): string {
  const minutes = Math.round(degrees * 60);
  return `${Math.floor(minutes / 60)}°${String(minutes % 60).padStart(2, "0")}'`;
}

function localParts(zone: string, ms: number): { date: string; time: string } {
  const shifted = new Date(ms + zoneOffsetAt(zone, ms) * MINUTE).toISOString();
  return { date: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

function localDate(zone: string, ms: number): string {
  return localParts(zone, ms).date;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function offsetText(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const m = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function signName(lon: number): string {
  return signForLongitude(lon).name;
}

function placement(point: string, lon: number, ascendant: number | null, retrograde: boolean): Placement {
  return {
    point,
    lon,
    sign: signName(lon),
    degree: degreeText(lon),
    house: ascendant === null ? null : ((signIndexForLongitude(lon) - signIndexForLongitude(ascendant) + 12) % 12) + 1,
    retrograde
  };
}

/** |offset| of `lon` from `target`, degrees in [0, 180]. */
function offsetFrom(lon: number, target: number): number {
  return separation(lon, target);
}

// ------------------------------------------------------------------ age

/** Calendar age on local date `at` of someone born on local date `birth` (both YYYY-MM-DD). */
export function ageAt(birth: string, at: string): Age {
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [ay, am, ad] = at.split("-").map(Number) as [number, number, number];
  if (birth > at) {
    const days = Math.round((Date.parse(`${birth}T00:00:00Z`) - Date.parse(`${at}T00:00:00Z`)) / DAY);
    return { at, years: 0, months: 0, bornAfterStart: true, daysAfterStart: days, stage: "infant" };
  }
  let months = (ay - by) * 12 + (am - bm);
  if (ad < bd) months -= 1;
  const years = Math.floor(months / 12);
  const stage = years < 2 ? "infant" : years < 13 ? "child" : years < 18 ? "adolescent" : "adult";
  return { at, years, months: months % 12, bornAfterStart: false, daysAfterStart: 0, stage };
}

// ------------------------------------------------------------------ dignities

function planetDignity(planet: ClassicalPlanet, lon: number, sect: "day" | "night" | null): PlanetDignity {
  const r = dignityRulersAt(lon);
  const lords: PlanetDignity["lords"] = {
    domicile: r.domicile,
    exaltation: r.exaltation,
    element: r.triplicity.element,
    triplicity: { day: r.triplicity.day, night: r.triplicity.night, participating: r.triplicity.participating },
    term: { ...r.term },
    face: { ...r.face },
    detriment: r.detriment,
    fall: r.fall
  };
  const base = { planet, sign: signName(lon), degree: degreeText(lon), lords };
  if (sect) {
    const d = essentialDignities(planet, lon, sect);
    return { ...base, dignities: [...d.dignities], debilities: [...d.debilities], peregrine: d.peregrine, triplicityIf: [] };
  }
  const day = essentialDignities(planet, lon, "day");
  const night = essentialDignities(planet, lon, "night");
  const triplicityIf = (["day", "night"] as const).filter((s) => (s === "day" ? day : night).dignities.includes("triplicity"));
  const dignities = day.dignities.filter((x) => x !== "triplicity");
  return {
    ...base,
    dignities: [...dignities],
    debilities: [...day.debilities],
    peregrine: dignities.length > 0 ? false : triplicityIf.length === 0 ? true : triplicityIf.length === 2 ? false : null,
    triplicityIf: [...triplicityIf]
  };
}

// ------------------------------------------------------------------ civil time

interface Instant {
  label: string;
  ms: number;
}

function resolveCivil(input: ReadingInput): { status: ReadingFacts["status"]; lmt: boolean; offsets: ReadingFacts["offsets"]; instants: Instant[] } {
  if (!input.timeKnown || input.time === null) {
    const noon = resolveLocalToUtc(input.date, "12:00", input.zone, { longitude: input.lon });
    return {
      status: "time-unknown",
      lmt: noon.flags.includes("lmt"),
      offsets: null,
      instants: [{ label: "reference chart at local noon (birth time unknown): planets only", ms: noon.utc.getTime() }]
    };
  }
  const r = resolveLocalToUtc(input.date, input.time, input.zone, { longitude: input.lon });
  const lmt = r.flags.includes("lmt");
  if (!r.jump) return { status: "resolved", lmt, offsets: null, instants: [{ label: "chart", ms: r.utc.getTime() }] };
  const t = r.transition;
  if (!t) throw new Error("A gap or fold without a transition.");
  const wall = Date.parse(`${r.date}T${input.time}:00Z`);
  const onBefore = wall - t.offsetBeforeMinutes * MINUTE;
  const onAfter = wall - t.offsetAfterMinutes * MINUTE;
  const offsets = { before: t.offsetBeforeMinutes, after: t.offsetAfterMinutes };
  if (r.jump.kind === "fold") {
    return {
      status: "fold",
      lmt,
      offsets,
      instants: [
        { label: `earlier occurrence (clock on ${offsetText(t.offsetBeforeMinutes)})`, ms: onBefore },
        { label: `later occurrence (clock on ${offsetText(t.offsetAfterMinutes)})`, ms: onAfter }
      ]
    };
  }
  // A gap: the wall time read on either offset; listed in time order.
  const readings = [
    { label: `candidate read on the offset before the change (${offsetText(t.offsetBeforeMinutes)})`, ms: onBefore },
    { label: `candidate read on the offset after the change (${offsetText(t.offsetAfterMinutes)})`, ms: onAfter }
  ].sort((a, b) => a.ms - b.ms);
  return { status: "gap", lmt, offsets, instants: readings.map((x, i) => ({ ...x, label: `${i === 0 ? "A" : "B"}: ${x.label}` })) };
}

// ------------------------------------------------------------------ stations

export function findStations(fromMs: number, toMs: number, zone: string): Station[] {
  const out: Station[] = [];
  for (const body of STATION_BODIES) {
    let t0 = fromMs;
    let s0 = longitudeSpeed(body, new Date(t0));
    for (let t1 = fromMs + DAY / 2; t0 < toMs; t1 += DAY / 2) {
      const end = Math.min(t1, toMs);
      const s1 = longitudeSpeed(body, new Date(end));
      if (s0 !== 0 && Math.sign(s1) !== Math.sign(s0)) {
        let lo = t0;
        let hi = end;
        const sLo = s0;
        while (hi - lo > MINUTE) {
          const mid = (lo + hi) / 2;
          if (Math.sign(longitudeSpeed(body, new Date(mid))) === Math.sign(sLo)) lo = mid;
          else hi = mid;
        }
        const at = Math.round((lo + hi) / 2);
        out.push({
          body,
          kind: s0 > 0 ? "retrograde" : "direct",
          utc: new Date(at).toISOString().slice(0, 16) + "Z",
          localDate: localDate(zone, at),
          lon: bodyLongitude(body, new Date(at))
        });
      }
      t0 = end;
      s0 = s1;
    }
  }
  return out.sort((a, b) => a.utc.localeCompare(b.utc));
}

function stationContacts(stations: Station[], natal: AspectPosition[]): StationContact[] {
  const label = "Station point";
  const policy = createAspectPolicy({
    aspects: MAJOR.map((type) => ({ type, orb: STATION_ORB, luminaryOrb: STATION_ORB })),
    bodies: [label, ...natal.map((p) => p.body)]
  });
  return stations.map((station) => {
    const found = findConfiguredAspects([{ body: label, lon: station.lon, speed: 0 }, ...natal], policy).aspects
      .filter((a) => a.a === label || a.b === label)
      .map((a) => ({ natal: a.a === label ? a.b : a.a, type: a.type, orb: a.orb }));
    return { station, contacts: found, checked: natal.map((p) => p.body) };
  });
}

// ------------------------------------------------------------------ transits

interface Samples {
  start: number;
  lons: number[];
}

const SAMPLE_MARGIN_DAYS = 800;

function sampleBody(body: BodyName, fromMs: number, toMs: number): Samples {
  const start = fromMs - SAMPLE_MARGIN_DAYS * DAY;
  const count = Math.ceil((toMs - fromMs) / DAY) + 2 * SAMPLE_MARGIN_DAYS + 1;
  const lons: number[] = [];
  for (let i = 0; i < count; i += 1) lons.push(bodyLongitude(body, new Date(start + i * DAY)));
  return { start, lons };
}

/** Bisect the instant where the body's offset from `target` crosses RANGE_ORB between an in-orb and an out-of-orb instant. */
function orbEdge(body: BodyName, target: number, inside: number, outside: number): number {
  let a = inside;
  let b = outside;
  while (Math.abs(b - a) > 10 * MINUTE) {
    const mid = (a + b) / 2;
    if (offsetFrom(bodyLongitude(body, new Date(mid)), target) <= RANGE_ORB) a = mid;
    else b = mid;
  }
  return a;
}

/** The in-orb run around instant `at` (which must be in orb), from the daily samples, refined at both ends. */
function runAround(body: BodyName, target: number, samples: Samples, at: number): { from: number; to: number; openStart: boolean; openEnd: boolean } {
  const n = samples.lons.length;
  const inOrb = (i: number) => offsetFrom(samples.lons[i]!, target) <= RANGE_ORB;
  let i = Math.min(n - 1, Math.max(0, Math.floor((at - samples.start) / DAY)));
  let j = i + 1;
  // Walk outward from the sample at or before `at`.
  while (i >= 0 && inOrb(i)) i -= 1;
  while (j < n && inOrb(j)) j += 1;
  const openStart = i < 0;
  const openEnd = j >= n;
  const from = openStart ? samples.start : orbEdge(body, target, samples.start + (i + 1) * DAY, samples.start + i * DAY);
  const to = openEnd ? samples.start + (n - 1) * DAY : orbEdge(body, target, samples.start + (j - 1) * DAY, samples.start + j * DAY);
  return { from: Math.min(from, at), to: Math.max(to, at), openStart, openEnd };
}

function findTransits(points: { name: string; lon: number }[], fromMs: number, toMs: number, zone: string): Transit[] {
  const out: Transit[] = [];
  for (const body of TRANSITING) {
    const slow = SLOW.includes(body);
    const samples = body === "Sun" ? null : sampleBody(body, fromMs, toMs);
    for (const point of points) {
      for (const aspect of TRANSIT_ASPECTS) {
        const angle = CONFIGURED_ASPECT_ANGLES[aspect];
        const targets = [...new Set([normalizeLongitude(point.lon + angle), normalizeLongitude(point.lon - angle)].map((x) => Number(x.toFixed(9))))];
        for (const target of targets) {
          const found = searchLongitudeCrossings(body, target, new Date(fromMs), new Date(toMs), { stepDays: 1 });
          if (found.status !== "complete") throw new Error("crossing search refused");
          const hits = found.crossings.map((c) => c.at.getTime());
          if (!slow) {
            if (hits.length === 0) continue;
            const nearStation = hits.some((h) => Math.abs(longitudeSpeed(body, new Date(h))) < STATIONARY_SPEED);
            let range: Transit["range"] = null;
            if (nearStation && samples) {
              const r = runAround(body, target, samples, hits[0]!);
              range = { from: localDate(zone, r.from), to: localDate(zone, r.to), openStart: r.openStart, openEnd: r.openEnd };
            }
            out.push({ body, aspect, natal: point.name, exact: hits.map((h) => localDate(zone, h)), range, nearStation, sortMs: hits[0]! });
            continue;
          }
          // Slow bodies: every in-orb run that overlaps the window, with its exact hits (searched over the whole run).
          const s = samples!;
          const windowIdx = [Math.floor((fromMs - s.start) / DAY), Math.ceil((toMs - s.start) / DAY)] as const;
          const seen = new Set<number>();
          const candidates: number[] = [...hits];
          // Any in-orb sample inside the window, or an in-orb window edge, seeds a run.
          for (let i = windowIdx[0]; i <= windowIdx[1]; i += 1) {
            if (offsetFrom(s.lons[i]!, target) <= RANGE_ORB) candidates.push(s.start + i * DAY);
          }
          for (const edge of [fromMs, toMs]) {
            if (offsetFrom(bodyLongitude(body, new Date(edge)), target) <= RANGE_ORB) candidates.push(edge);
          }
          for (const seed of candidates.sort((a, b) => a - b)) {
            const r = runAround(body, target, s, seed);
            const key = Math.round(r.from / DAY);
            if (seen.has(key)) continue;
            seen.add(key);
            if (r.to < fromMs || r.from > toMs) continue;
            const inRun = searchLongitudeCrossings(body, target, new Date(r.from - DAY), new Date(r.to + DAY), { stepDays: 1 });
            if (inRun.status !== "complete") throw new Error("crossing search refused");
            const exact = inRun.crossings.map((c) => c.at.getTime());
            out.push({
              body,
              aspect,
              natal: point.name,
              exact: exact.map((h) => localDate(zone, h)),
              range: { from: localDate(zone, r.from), to: localDate(zone, r.to), openStart: r.openStart, openEnd: r.openEnd },
              nearStation: exact.some((h) => Math.abs(longitudeSpeed(body, new Date(h))) < STATIONARY_SPEED),
              sortMs: Math.max(r.from, fromMs)
            });
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.sortMs - b.sortMs || a.body.localeCompare(b.body));
}

// ------------------------------------------------------------------ edges

/** Minutes of birth-time shift (searching both ways up to `limit`) after which `lonAt` falls in `neighbourIndex`. */
function shiftToSign(lonAt: (ms: number) => number, ms: number, neighbourIndex: number, direction: 1 | -1, step: number, limit: number): number | null {
  for (let m = step; m <= limit; m += step) {
    if (signIndexForLongitude(lonAt(ms + direction * m * MINUTE)) === neighbourIndex) {
      // Refine to the minute.
      for (let k = m - step + 1; k <= m; k += 1) {
        if (signIndexForLongitude(lonAt(ms + direction * k * MINUTE)) === neighbourIndex) return k;
      }
      return m;
    }
  }
  return null;
}

function edgePoints(points: { name: string; lon: number }[], ms: number, input: ReadingInput, timeKnown: boolean): EdgePoint[] {
  const out: EdgePoint[] = [];
  const angleAt = (which: "asc" | "mc") => (t: number) => {
    const c = natalChart({ utc: new Date(t), latitude: input.lat, longitude: input.lon, houseSystem: "whole", timeKnown: true });
    return c.angles![which];
  };
  for (const p of points) {
    const d = degreeInSign(p.lon);
    const index = signIndexForLongitude(p.lon);
    let edge: "start" | "end" | null = null;
    if (d < EDGE_DEGREES) edge = "start";
    else if (30 - d < EDGE_DEGREES) edge = "end";
    if (!edge) continue;
    const neighbourIndex = (index + (edge === "start" ? 11 : 1)) % 12;
    let shiftMinutes: number | null = null;
    if (timeKnown) {
      const direction = edge === "start" ? -1 : 1;
      if (p.name === "Ascendant") shiftMinutes = shiftToSign(angleAt("asc"), ms, neighbourIndex, direction, 1, 240);
      else if (p.name === "Midheaven") shiftMinutes = shiftToSign(angleAt("mc"), ms, neighbourIndex, direction, 1, 240);
      else if (p.name === "Moon") shiftMinutes = shiftToSign((t) => bodyLongitude("Moon", new Date(t)), ms, neighbourIndex, direction, 5, 480);
    }
    out.push({
      point: p.name,
      sign: SIGNS[index]!.name,
      degree: degreeText(p.lon),
      edge,
      // From the arcminute-truncated degree shown, so the two numbers agree.
      distance: edge === "start" ? truncatedMinutes(p.lon) / 60 : (1800 - truncatedMinutes(p.lon)) / 60,
      neighbour: SIGNS[neighbourIndex]!.name,
      shiftMinutes
    });
  }
  return out;
}

// ------------------------------------------------------------------ one chart version

let natalPolicy: AspectPolicy | null = null;
function natalAspectPolicy(): AspectPolicy {
  natalPolicy ??= createAspectPolicy({
    bodies: [...PLANETS, "North Node", "Ascendant", "Midheaven"]
  });
  return natalPolicy;
}

function chartVersion(input: ReadingInput, instant: Instant, timeKnown: boolean, window: { fromMs: number; toMs: number }, stations: Station[]): ChartVersion {
  const utc = new Date(instant.ms);
  const chart: Chart = natalChart({ utc, latitude: input.lat, longitude: input.lon, houseSystem: "whole", timeKnown });
  const asc = chart.angles?.asc ?? null;
  const mc = chart.angles?.mc ?? null;
  const shown = chart.bodies.filter((b) => b.body !== "South Node" && (timeKnown || b.body !== "Moon"));
  const placements = shown.map((b) => placement(b.body, b.lon, asc, b.retrograde && b.body !== "North Node"));
  let placidusUndefined = false;
  if (timeKnown) {
    const placidus = natalChart({ utc, latitude: input.lat, longitude: input.lon, houseSystem: "placidus", timeKnown: true });
    placidusUndefined = placidus.flags.includes("polar-fallback");
  }

  const positions: AspectPosition[] = shown.map((b) => ({ body: b.body, lon: b.lon, speed: b.speed }));
  if (asc !== null && mc !== null) positions.push({ body: "Ascendant", lon: asc, speed: 0 }, { body: "Midheaven", lon: mc, speed: 0 });
  const aspects = findConfiguredAspects(positions, natalAspectPolicy()).aspects
    .filter((a) => !(a.a === "Ascendant" && a.b === "Midheaven") && !(a.a === "Midheaven" && a.b === "Ascendant"))
    .map((a, i) => ({ rank: i + 1, a: a.a, b: a.b, type: a.type, orb: a.orb }));

  const edgeInput = shown.map((b) => ({ name: b.body as string, lon: b.lon }));
  if (asc !== null && mc !== null) edgeInput.push({ name: "Ascendant", lon: asc }, { name: "Midheaven", lon: mc });
  const edges = edgePoints(edgeInput, instant.ms, input, timeKnown);

  const transitNames = timeKnown ? ["Sun", "Moon", "Mercury", "Venus", "Mars"] : ["Sun", "Mercury", "Venus", "Mars"];
  const transitPoints = shown.filter((b) => transitNames.includes(b.body)).map((b) => ({ name: b.body as string, lon: b.lon }));
  if (asc !== null && mc !== null) transitPoints.push({ name: "Ascendant", lon: asc }, { name: "Midheaven", lon: mc });
  const transits = findTransits(transitPoints, window.fromMs, window.toMs, input.zone);

  const sect = asc === null ? null : sectOf(asc, chart.bodies.find((b) => b.body === "Sun")!.lon);
  const lonOf = (body: BodyName) => chart.bodies.find((b) => b.body === body)!.lon;
  // Mercury west of the Sun (the Sun ahead of it by under 180 degrees) rises before the Sun: a morning star.
  const mercuryPhase = normalizeLongitude(lonOf("Sun") - lonOf("Mercury")) < 180 ? "morning" : "evening";
  const dignities = CLASSICAL_PLANETS.filter((p) => timeKnown || p !== "Moon").map((p) => planetDignity(p, lonOf(p), sect));

  const local = localParts(input.zone, instant.ms);
  let moonSigns: string[] | null = null;
  const daySignChanges: ChartVersion["daySignChanges"] = [];
  if (!timeKnown) {
    const m = moonSignCandidates(input.date, { timeZone: input.zone, longitude: input.lon });
    moonSigns = m.signs.map((slug) => SIGNS.find((s) => s.slug === slug)!.name);
    for (const b of shown) {
      if (b.body === "North Node") continue;
      const first = signIndexForLongitude(bodyLongitude(b.body, m.from));
      const last = signIndexForLongitude(bodyLongitude(b.body, m.to));
      if (first !== last) daySignChanges.push({ point: b.body, signs: [SIGNS[first]!.name, SIGNS[last]!.name] });
    }
  }
  return {
    label: instant.label,
    utc: utc.toISOString().slice(0, 16) + "Z",
    localTime: `${local.date} ${local.time}`,
    timeKnown,
    placements,
    ascendant: asc === null ? null : placement("Ascendant", asc, asc, false),
    midheaven: mc === null ? null : placement("Midheaven", mc, asc, false),
    sect,
    sectTeam: sect === null ? null : SECT_TEAMS[sect],
    mercuryPhase,
    dignities,
    placidusUndefined,
    aspects,
    edges,
    transits,
    transitPoints: transitPoints.map((p) => p.name),
    stationContacts: stationContacts(stations, positions),
    moonSigns,
    daySignChanges
  };
}

// ------------------------------------------------------------------ entry

export async function buildReadingFacts(input: ReadingInput, options: ReadingOptions = {}): Promise<ReadingFacts> {
  const windowStart = options.windowStart ?? "2026-11-01";
  const days = options.days ?? 90;
  await prepareLocalTime(input.date, input.zone);
  const civil = resolveCivil(input);
  const fromMs = resolveLocalToUtc(windowStart, "00:00", input.zone).utc.getTime();
  const toMs = resolveLocalToUtc(addDays(windowStart, days), "00:00", input.zone).utc.getTime();
  const stations = findStations(fromMs, toMs, input.zone);
  const timeKnown = civil.status !== "time-unknown";
  return {
    input,
    status: civil.status,
    lmt: civil.lmt,
    offsets: civil.offsets,
    window: { from: windowStart, toInclusive: addDays(windowStart, days - 1), days, zone: input.zone },
    age: ageAt(input.date, windowStart),
    stations,
    versions: civil.instants.map((instant) => chartVersion(input, instant, timeKnown, { fromMs, toMs }, stations))
  };
}

// ------------------------------------------------------------------ text sheet

/**
 * Every fact line of the sheet starts with a stable short ID in square
 * brackets, unique within the sheet and numbered in sheet order: N age, P
 * placements, K sect, D dignities, A natal aspects, E sign edges, T transits,
 * S stations, and S1a, S1b, ... each contact of station S1. The same input and
 * options give the same IDs. `check-reading.ts` parses these lines.
 */
class Ids {
  private readonly counts = new Map<string, number>();
  next(prefix: string): string {
    const n = (this.counts.get(prefix) ?? 0) + 1;
    this.counts.set(prefix, n);
    return `[${prefix}${n}]`;
  }
}

function placementLine(p: Placement): string {
  const house = p.house === null ? "" : `, whole sign house ${p.house}`;
  return `${p.point} ${p.degree} ${p.sign}${house}${p.retrograde ? ", retrograde" : ""}`;
}

function transitLine(t: Transit): string {
  const head = `transiting ${t.body} ${t.aspect} natal ${t.natal}`;
  if (t.range) {
    const from = t.range.openStart ? `before ${t.range.from}` : t.range.from;
    const to = t.range.openEnd ? `after ${t.range.to}` : t.range.to;
    const exact = t.exact.length ? `; exact ${t.exact.join(", ")} (each plus or minus 1 day)` : "; no exact hit in this range";
    const why = t.nearStation ? " (near a station: give the range, not a single day)" : "";
    return `${head}: in orb (within ${RANGE_ORB}°) from ${from} to ${to} (each end plus or minus 1 day)${exact}${why}`;
  }
  return `${head}: exact ${t.exact.join(", ")}`;
}

function ageLine(a: Age): string {
  if (a.bornAfterStart) return `Age at the window start (${a.at}): not yet born; the birth date is ${a.daysAfterStart} days into the window. Stage: infant.`;
  const unit = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return `Age at the window start (${a.at}): ${unit(a.years, "year")} ${unit(a.months, "month")} (calendar age from the local birth date). Stage: ${a.stage}${a.stage === "adult" ? "" : " (under 18)"}.`;
}

function teamLine(t: SectTeam): string {
  return `${t.sect} chart: sect light ${t.light}; benefic of sect ${t.beneficOfSect}; malefic of sect ${t.maleficOfSect}; benefic contrary to sect ${t.beneficContrary}; malefic contrary to sect (the out-of-sect malefic) ${t.maleficContrary}`;
}

function spanText(s: { planet: string; from: number; to: number }): string {
  return `${s.planet} (${s.from}° to ${s.to}°)`;
}

function dignityLine(d: PlanetDignity, sect: "day" | "night" | null): string {
  const held = d.dignities.length ? d.dignities.join(", ") : "none";
  const ifSect = d.triplicityIf.length ? `; triplicity only if a ${d.triplicityIf.join(" or ")} chart` : "";
  const peregrine = d.peregrine === null ? "peregrine unless it holds triplicity (depends on sect)" : d.peregrine ? "peregrine (no essential dignity)" : "not peregrine";
  const l = d.lords;
  const counted = sect ? `, counted for this ${sect} chart: ${l.triplicity[sect]}` : ", sect unknown so none is counted";
  return `${d.planet} ${d.degree} ${d.sign}: dignities ${held}${ifSect}; debilities ${d.debilities.length ? d.debilities.join(", ") : "none"}; ${peregrine}. Lords here: domicile ${l.domicile}; exaltation ${l.exaltation ?? "none"}; triplicity (${l.element}) day ${l.triplicity.day}, night ${l.triplicity.night}, participating ${l.triplicity.participating}${counted}; term ${spanText(l.term)}; face ${spanText(l.face)}; detriment ${l.detriment}; fall ${l.fall ?? "none"}.`;
}

export function formatReadingFacts(f: ReadingFacts): string {
  const L: string[] = [];
  const ids = new Ids();
  const z = f.input.zone;
  L.push("ENGINE FACTS (computed by @zodiacs/engine; every number below is final. Quote them; never recompute, compare, re-rank or round them.)");
  L.push("Each fact line starts with an ID in square brackets: a letter and a number, such as T3. Name an aspect, transit, station or contact only by quoting its line with that ID, exactly as written: the same planets, the same aspect word, the same order.");
  L.push(`resolve_civil_time status: ${f.status}`);
  L.push(`${ids.next("N")} ${ageLine(f.age)}`);
  if (f.lmt) L.push("Zone note: the birthplace kept local mean time on this date; the engine used the birthplace's local mean time.");
  if (f.status === "fold") {
    L.push(`The local time ${f.input.time} happened twice in ${z} (clock went from ${offsetText(f.offsets!.before)} to ${offsetText(f.offsets!.after)}). Both charts follow. Ask the person which occurrence, or read only what both share.`);
  } else if (f.status === "gap") {
    L.push(`The local time ${f.input.time} did not exist in ${z} (clock jumped from ${offsetText(f.offsets!.before)} to ${offsetText(f.offsets!.after)}). Both candidate charts follow. Do not pick one; ask the person, and read only what both share.`);
  } else if (f.status === "time-unknown") {
    L.push("Birth time unknown: the chart below is a reference at local noon with planets only. No houses, no Ascendant, no Midheaven, no sect, no Moon degree. Moon: sign range for the day only.");
  }
  for (const v of f.versions) {
    L.push("");
    L.push(`=== Chart: ${v.label} ===`);
    L.push(`Instant: ${v.utc} (local ${v.localTime}, ${z}). Tropical zodiac, ${v.timeKnown ? "whole sign houses, " : "no houses, "}true node.`);
    if (v.ascendant && v.midheaven) {
      L.push(`${ids.next("P")} Ascendant ${v.ascendant.degree} ${v.ascendant.sign}; Midheaven ${v.midheaven.degree} ${v.midheaven.sign} (whole sign house ${v.midheaven.house})`);
    }
    for (const p of v.placements) L.push(`${ids.next("P")} ${placementLine(p)}`);
    if (v.moonSigns) {
      L.push(`${ids.next("P")} ${v.moonSigns.length === 1
        ? `Moon: in ${v.moonSigns[0]} for the whole local date (degree unknown without a birth time).`
        : `Moon: changes sign during the local date: ${v.moonSigns.join(" then ")}. Its sign depends on the unknown birth time.`}`);
    }
    for (const c of v.daySignChanges) {
      L.push(`${ids.next("P")} ${c.point}: changes sign during the local date (${c.signs.join(" then ")}); its sign depends on the unknown birth time. The degree above is at the noon reference only.`);
    }
    if (!v.timeKnown) L.push("Degrees and orbs below are at the noon reference instant; with no birth time they are approximate for the day.");

    L.push(`${ids.next("K")} ${v.sect === null
      ? "Sect: unavailable (needs a birth time)."
      : `Sect (engine): ${v.sect} chart (${v.sect === "day" ? "Sun above the horizon" : "Sun below the horizon"}).`}`);
    if (v.sectTeam) {
      L.push(`${ids.next("K")} Sect team (Ptolemy, Tetrabiblos I.7), ${teamLine(v.sectTeam)}. Use this team; do not apply the other sect's.`);
    } else {
      L.push(`${ids.next("K")} Sect teams (Ptolemy, Tetrabiblos I.7), for reference only because sect is unavailable: if a ${teamLine(SECT_TEAMS.day)}. If a ${teamLine(SECT_TEAMS.night)}. Do not name a sect light, a benefic or malefic of sect, or an out-of-sect malefic for this chart.`);
    }
    L.push(`${ids.next("K")} Mercury: ${v.mercuryPhase} star (${v.mercuryPhase === "morning" ? "west of the Sun, rises before it" : "east of the Sun, sets after it"}), so it joins the ${v.mercuryPhase === "morning" ? "day" : "night"} sect (Tetrabiblos I.7).`);
    if (v.placidusUndefined) L.push("Placidus houses: undefined at this latitude (polar); the whole sign houses above are unaffected.");

    L.push("Essential dignities (engine, @zodiacs/engine/techniques): domiciles Tetrabiblos I.17; exaltations and falls Tetrabiblos I.19; detriments the signs opposite the domiciles; Dorothean triplicities (Dorotheus I.1.3), the lord of the chart's sect counted, not the participating lord; Egyptian terms (Tetrabiblos I.20); Chaldean faces; peregrine means no essential dignity (Lilly, Christian Astrology, p. 112). Seven classical planets only; Uranus, Neptune, Pluto and the node have none in this scheme. Quote these; never decide a dignity yourself:");
    for (const d of v.dignities) L.push(`${ids.next("D")} ${dignityLine(d, v.sect)}`);

    L.push(`Natal aspects, ENGINE RANKING by orb, tightest first (orbs to the arcminute; ${v.aspects.length} aspects; quote this order, do not re-rank):`);
    if (v.aspects.length) {
      const aspectIds = v.aspects.map(() => ids.next("A"));
      L.push(`Tightest aspect: ${aspectIds[0]} ${v.aspects[0]!.a} ${v.aspects[0]!.type} ${v.aspects[0]!.b}, orb ${orbText(v.aspects[0]!.orb)}`);
      v.aspects.forEach((a, i) => L.push(`${aspectIds[i]} ${a.rank}. ${a.a} ${a.type} ${a.b}, orb ${orbText(a.orb)}`));
    } else L.push("none within the engine's default orbs");

    L.push(`Points within ${EDGE_DEGREES}° of a sign edge (engine check over every point listed above):`);
    if (v.edges.length === 0) L.push(`${ids.next("E")} none: no listed point is within ${EDGE_DEGREES}° of a sign edge.`);
    for (const e of v.edges) {
      const where = e.edge === "start" ? `${orbText(e.distance)} after the start of ${e.sign} (${e.neighbour} before it)` : `${orbText(e.distance)} before the end of ${e.sign} (${e.neighbour} next)`;
      const shift = e.shiftMinutes === null
        ? ""
        : `; it would be in ${e.neighbour} if the birth time were ${e.shiftMinutes} minutes ${e.edge === "start" ? "earlier" : "later"} or more`;
      L.push(`- ${ids.next("E")} ${e.point} ${e.degree} ${e.sign}: ${where}${shift}`);
    }

    L.push(`Transits ${f.window.from} to ${f.window.toInclusive} inclusive (${f.window.days} days), dates in the person's zone (${z}). Bodies: ${TRANSITING.join(", ")}. Aspects: ${TRANSIT_ASPECTS.join(", ")}. Natal points: ${v.transitPoints.join(", ")}. Uranus, Neptune and Pluto are given as in-orb date ranges, never as a single day:`);
    if (v.transits.length === 0) L.push("- none in the window for these bodies, aspects and points.");
    for (const t of v.transits) L.push(`- ${ids.next("T")} ${transitLine(t)}`);

    L.push(`Stations in the window and their contacts with natal points (major aspects within ${STATION_ORB}°; checked against ${v.stationContacts[0]?.checked.join(", ") ?? "the natal points"}):`);
    if (v.stationContacts.length === 0) L.push("- no station in the window.");
    for (const s of v.stationContacts) {
      const sid = ids.next("S");
      const head = `${s.station.body} stations ${s.station.kind} ${s.station.localDate} (plus or minus 1 day) at ${degreeText(s.station.lon)} ${signName(s.station.lon)}`;
      if (s.contacts.length === 0) {
        L.push(`- ${sid} ${head}: no natal point within ${STATION_ORB}° of a major aspect (computed).`);
        continue;
      }
      L.push(`- ${sid} ${head}. Contacts:`);
      s.contacts.forEach((c, i) => L.push(`  - ${sid.slice(0, -1)}${String.fromCharCode(97 + i)}] stationing ${s.station.body} ${c.type} natal ${c.natal}, orb ${orbText(c.orb)}`));
    }
  }
  return L.join("\n");
}
