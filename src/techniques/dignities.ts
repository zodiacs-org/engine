/*
 * Essential dignities of the seven classical planets, and mutual reception.
 * Tables and their sources (docs/techniques.md quotes each):
 *
 * - domiciles: Ptolemy, Tetrabiblos I.17 (tr. Robbins, Loeb, 1940);
 *   Dorotheus, Carmen Astrologicum I.1.8–9 (tr. Pingree, 1976, p. 162);
 * - exaltations and falls: Tetrabiblos I.19; Dorotheus I.2 (p. 162);
 * - detriments, the signs opposite the domiciles: al-Bīrūnī, Book of
 *   Instruction §442 (tr. Wright, 1934);
 * - triplicities, Dorothean, with day, night and participating lords:
 *   Dorotheus I.1.3 (pp. 161–162); al-Bīrūnī §445. Ptolemy's fourth triangle
 *   (Tetrabiblos I.18) differs;
 * - terms, Egyptian: Tetrabiblos I.20, "Terms according to the Egyptians";
 *   al-Bīrūnī §453;
 * - faces, Chaldean, the planets in descending order from Mars in the first
 *   ten degrees of Aries: al-Bīrūnī §449 and the table of §451;
 * - reception and peregrine: William Lilly, Christian Astrology (1647), p. 112.
 *
 * dignityFor, dignitiesFor and hasClassicalDignities are ported from the
 * Zodiacs.org site (src/lib/dignities.ts).
 */
import { SIGN_SLUGS, SIGNS, normalizeLongitude, signIndexForLongitude } from "../signs.js";
import type { BodyName, Element, Sect, ZodiacSign } from "../types.js";
import { bodyName, finiteDegrees, oneOf, readOptions } from "./shared.js";

export type ClassicalPlanet = "Sun" | "Moon" | "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn";

/** A planet's condition in a sign as `dignityFor` names it. */
export type SignDignity = "domicile" | "exaltation" | "detriment" | "fall";

/** The five essential dignities, in the order Lilly names them (p. 112). */
export type EssentialDignity = "domicile" | "exaltation" | "triplicity" | "term" | "face";

export type Debility = "detriment" | "fall";

export const CLASSICAL_PLANETS: readonly ClassicalPlanet[] = /*#__PURE__*/ Object.freeze([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"
]);

/**
 * Each sign's domicile ruler (Tetrabiblos I.17): the same rulers as
 * @zodiacs/engine/timing's TRADITIONAL_RULERS and @zodiacs/engine/vedic's
 * SIGN_LORDS. Each entry point carries its own copy, so that none imports
 * another; a test keeps the three equal.
 */
export const DOMICILE_RULERS: Readonly<Record<ZodiacSign, ClassicalPlanet>> = /*#__PURE__*/ Object.freeze({
  aries: "Mars", taurus: "Venus", gemini: "Mercury", cancer: "Moon", leo: "Sun", virgo: "Mercury",
  libra: "Venus", scorpio: "Mars", sagittarius: "Jupiter", capricorn: "Saturn", aquarius: "Saturn", pisces: "Jupiter"
});

/** Each planet's exaltation (Tetrabiblos I.19); its fall is the opposite sign. */
export const EXALTATIONS: Readonly<Record<ClassicalPlanet, ZodiacSign>> = /*#__PURE__*/ Object.freeze({
  Sun: "aries", Moon: "taurus", Mercury: "virgo", Venus: "pisces", Mars: "capricorn", Jupiter: "cancer", Saturn: "libra"
});

/** The Dorothean triplicity lords (Dorotheus I.1.3). */
export const TRIPLICITY_LORDS: Readonly<Record<Element, { readonly day: ClassicalPlanet; readonly night: ClassicalPlanet; readonly participating: ClassicalPlanet }>> =
  /*#__PURE__*/ Object.freeze({
    fire: Object.freeze({ day: "Sun", night: "Jupiter", participating: "Saturn" } as const),
    earth: Object.freeze({ day: "Venus", night: "Moon", participating: "Mars" } as const),
    air: Object.freeze({ day: "Saturn", night: "Mercury", participating: "Jupiter" } as const),
    water: Object.freeze({ day: "Venus", night: "Mars", participating: "Moon" } as const)
  });

const terms = (...rows: [ClassicalPlanet, number][][]) =>
  Object.freeze(Object.fromEntries(SIGN_SLUGS.map((sign, index) => [sign, Object.freeze(rows[index]!.map((row) => Object.freeze(row)))])));

/** The Egyptian terms (Tetrabiblos I.20): each sign's five lords, with the degree each term ends at. */
export const EGYPTIAN_TERMS = /*#__PURE__*/ terms(
  [["Jupiter", 6], ["Venus", 12], ["Mercury", 20], ["Mars", 25], ["Saturn", 30]],
  [["Venus", 8], ["Mercury", 14], ["Jupiter", 22], ["Saturn", 27], ["Mars", 30]],
  [["Mercury", 6], ["Jupiter", 12], ["Venus", 17], ["Mars", 24], ["Saturn", 30]],
  [["Mars", 7], ["Venus", 13], ["Mercury", 19], ["Jupiter", 26], ["Saturn", 30]],
  [["Jupiter", 6], ["Venus", 11], ["Saturn", 18], ["Mercury", 24], ["Mars", 30]],
  [["Mercury", 7], ["Venus", 17], ["Jupiter", 21], ["Mars", 28], ["Saturn", 30]],
  [["Saturn", 6], ["Mercury", 14], ["Jupiter", 21], ["Venus", 28], ["Mars", 30]],
  [["Mars", 7], ["Venus", 11], ["Mercury", 19], ["Jupiter", 24], ["Saturn", 30]],
  [["Jupiter", 12], ["Venus", 17], ["Mercury", 21], ["Saturn", 26], ["Mars", 30]],
  [["Mercury", 7], ["Jupiter", 14], ["Venus", 22], ["Saturn", 26], ["Mars", 30]],
  [["Mercury", 7], ["Venus", 13], ["Jupiter", 20], ["Mars", 25], ["Saturn", 30]],
  [["Venus", 12], ["Jupiter", 16], ["Mercury", 19], ["Mars", 28], ["Saturn", 30]]
) as Readonly<Record<ZodiacSign, readonly (readonly [ClassicalPlanet, number])[]>>;

/** The Chaldean faces: the lord of each ten degrees from 0° Aries, 36 in all (al-Bīrūnī §451). */
export const CHALDEAN_FACES: readonly ClassicalPlanet[] = /*#__PURE__*/ Object.freeze(
  Array.from({ length: 36 }, (_, index) => (["Mars", "Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter"] as const)[index % 7]!)
);

const opposite = (sign: ZodiacSign): ZodiacSign => SIGN_SLUGS[(SIGN_SLUGS.indexOf(sign) + 6) % 12]!;
const isClassical = (body: BodyName): body is ClassicalPlanet => (CLASSICAL_PLANETS as readonly string[]).includes(body);

function signName(value: unknown): ZodiacSign {
  if (typeof value === "string" && (SIGN_SLUGS as readonly string[]).includes(value)) return value as ZodiacSign;
  throw new RangeError("sign must be a lowercase zodiac sign name.");
}

/** True for the seven classical planets. */
export function hasClassicalDignities(planet: BodyName): boolean {
  return isClassical(bodyName(planet, "planet"));
}

/** A planet's conditions in a sign, in the order domicile, exaltation, detriment, fall; none for the outer planets and nodes. */
export function dignitiesFor(planet: BodyName, sign: ZodiacSign): readonly SignDignity[] {
  const body = bodyName(planet, "planet");
  const where = signName(sign);
  const out: SignDignity[] = [];
  if (isClassical(body)) {
    if (DOMICILE_RULERS[where] === body) out.push("domicile");
    if (EXALTATIONS[body] === where) out.push("exaltation");
    if (DOMICILE_RULERS[opposite(where)] === body) out.push("detriment");
    if (opposite(EXALTATIONS[body]) === where) out.push("fall");
  }
  return Object.freeze(out);
}

/** One condition: exaltation or fall where either holds (Mercury in Virgo is exalted), else domicile or detriment, else null. */
export function dignityFor(planet: BodyName, sign: ZodiacSign): SignDignity | null {
  const all = dignitiesFor(planet, sign);
  return (["exaltation", "fall", "domicile", "detriment"] as const).find((condition) => all.includes(condition)) ?? null;
}

/** A term or face: its lord, and its degrees within the sign, `from` inclusive, `to` exclusive. */
export interface DignitySpan {
  readonly planet: ClassicalPlanet;
  readonly from: number;
  readonly to: number;
}

export interface DignityRulers {
  readonly lon: number;
  readonly sign: ZodiacSign;
  readonly domicile: ClassicalPlanet;
  readonly exaltation: ClassicalPlanet | null;
  readonly triplicity: { readonly element: Element; readonly day: ClassicalPlanet; readonly night: ClassicalPlanet; readonly participating: ClassicalPlanet };
  readonly term: DignitySpan;
  readonly face: DignitySpan;
  /** The planet in detriment, and the one in fall, here. */
  readonly detriment: ClassicalPlanet;
  readonly fall: ClassicalPlanet | null;
}

/** Who holds each essential dignity and debility at an ecliptic longitude, degrees. */
export function dignityRulersAt(longitude: number): DignityRulers {
  const lon = normalizeLongitude(finiteDegrees(longitude, "longitude"));
  const index = signIndexForLongitude(lon);
  const sign = SIGN_SLUGS[index]!;
  // Never below 0 where a longitude just under a sign's end divides to its index.
  const degree = Math.max(0, lon - index * 30);
  const row = EGYPTIAN_TERMS[sign];
  const at = Math.max(0, row.findIndex(([, end]) => degree < end));
  const face = Math.min(2, Math.floor(degree / 10));
  const element = SIGNS[index]!.element;
  return Object.freeze({
    lon,
    sign,
    domicile: DOMICILE_RULERS[sign],
    exaltation: CLASSICAL_PLANETS.find((planet) => EXALTATIONS[planet] === sign) ?? null,
    triplicity: Object.freeze({ element, ...TRIPLICITY_LORDS[element] }),
    term: Object.freeze({ planet: row[at]![0], from: at === 0 ? 0 : row[at - 1]![1], to: row[at]![1] }),
    face: Object.freeze({ planet: CHALDEAN_FACES[index * 3 + face]!, from: face * 10, to: face * 10 + 10 }),
    detriment: DOMICILE_RULERS[opposite(sign)],
    fall: CLASSICAL_PLANETS.find((planet) => opposite(EXALTATIONS[planet]) === sign) ?? null
  });
}

export interface PlanetDignities {
  readonly planet: ClassicalPlanet;
  readonly lon: number;
  readonly sign: ZodiacSign;
  readonly sect: Sect;
  /** In the order domicile, exaltation, triplicity, term, face. */
  readonly dignities: readonly EssentialDignity[];
  readonly debilities: readonly Debility[];
  /** No essential dignity (Lilly, p. 112). */
  readonly peregrine: boolean;
}

/**
 * A classical planet's essential dignities at a longitude in a day or night
 * chart. Triplicity counts the lord of the chart's sect, as Lilly's reception
 * by triplicity does ("if the Question or Nativity be by day", p. 112), not
 * the participating lord.
 */
export function essentialDignities(planet: ClassicalPlanet, longitude: number, sect: Sect): PlanetDignities {
  const body = bodyName(planet, "planet");
  if (!isClassical(body)) throw new RangeError("Essential dignities are defined for the seven classical planets only.");
  if (sect !== "day" && sect !== "night") throw new RangeError('sect must be "day" or "night".');
  const rulers = dignityRulersAt(longitude);
  const held: [boolean, EssentialDignity][] = [
    [rulers.domicile === body, "domicile"],
    [rulers.exaltation === body, "exaltation"],
    [rulers.triplicity[sect] === body, "triplicity"],
    [rulers.term.planet === body, "term"],
    [rulers.face.planet === body, "face"]
  ];
  const dignities = held.filter(([has]) => has).map(([, name]) => name);
  const debilities = ([[rulers.detriment === body, "detriment"], [rulers.fall === body, "fall"]] as [boolean, Debility][])
    .filter(([has]) => has)
    .map(([, name]) => name);
  return Object.freeze({
    planet: body,
    lon: rulers.lon,
    sign: rulers.sign,
    sect,
    dignities: Object.freeze(dignities),
    debilities: Object.freeze(debilities),
    peregrine: dignities.length === 0
  });
}

export interface ReceptionOptions {
  /** `["domicile", "exaltation"]` by default. */
  dignities?: readonly EssentialDignity[] | undefined;
  /** Required for reception by triplicity. */
  sect?: Sect | undefined;
}

/** Two planets each in the other's dignity. */
export interface MutualReception {
  readonly a: ClassicalPlanet;
  readonly b: ClassicalPlanet;
  /** The dignities `a` has where `b` is. */
  readonly aReceivesB: readonly EssentialDignity[];
  /** The dignities `b` has where `a` is. */
  readonly bReceivesA: readonly EssentialDignity[];
}

const ALL_DIGNITIES: readonly EssentialDignity[] = ["domicile", "exaltation", "triplicity", "term", "face"];

/**
 * Every pair of classical planets "in each others dignity" (Lilly, p. 112),
 * by the dignities named. Other bodies are ignored.
 */
export function mutualReceptions(
  positions: readonly { readonly body: BodyName; readonly lon: number }[],
  options?: ReceptionOptions
): readonly MutualReception[] {
  const read = readOptions(options, ["dignities", "sect"], "mutualReceptions options");
  const wanted = read.dignities ?? ["domicile", "exaltation"];
  if (!Array.isArray(wanted) || !wanted.length || wanted.some((name) => !ALL_DIGNITIES.includes(name))) {
    throw new RangeError(`dignities must be a nonempty list of ${ALL_DIGNITIES.join(", ")}.`);
  }
  const sect = read.sect === undefined ? undefined : oneOf(read.sect, ["day", "night"] as const, "day", "sect");
  if (wanted.includes("triplicity") && sect === undefined) throw new RangeError("Reception by triplicity needs the chart's sect.");
  if (!Array.isArray(positions)) throw new RangeError("positions must be an array of { body, lon }.");
  const seen = new Set<string>();
  const planets: { planet: ClassicalPlanet; lon: number }[] = [];
  for (const row of positions) {
    const body = bodyName(row?.body, "position");
    if (seen.has(body)) throw new RangeError(`positions name ${body} twice.`);
    seen.add(body);
    const lon = finiteDegrees(row.lon, `${body}'s longitude`);
    if (isClassical(body)) planets.push({ planet: body, lon });
  }
  planets.sort((x, y) => CLASSICAL_PLANETS.indexOf(x.planet) - CLASSICAL_PLANETS.indexOf(y.planet));
  const receives = (host: ClassicalPlanet, guestLon: number): readonly EssentialDignity[] =>
    Object.freeze(essentialDignities(host, guestLon, sect ?? "day").dignities.filter((name) => wanted.includes(name)));
  const out: MutualReception[] = [];
  planets.forEach((a, i) => {
    for (const b of planets.slice(i + 1)) {
      const aReceivesB = receives(a.planet, b.lon);
      const bReceivesA = receives(b.planet, a.lon);
      if (aReceivesB.length && bReceivesA.length) out.push(Object.freeze({ a: a.planet, b: b.planet, aReceivesB, bReceivesA }));
    }
  });
  return Object.freeze(out);
}
