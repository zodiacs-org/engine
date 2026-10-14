import { ASPECTS, bodyLongitude, createAspectPolicy, dateFrom, exactSign, exactSum,
  findConfiguredAspects, roundedValue, searchLongitudeCrossingsWith } from "./engine.js";
import type { AspectMotion, AspectType, BodyLongitudeAt, ClassicalPlanet } from "./engine.js";
import { ASPECT_MOTION_SOURCE, ASPECT_SEARCH_METHOD, createAspectSearchPolicy, validateAspectSearchPolicy } from "./aspect-policy.js";
import type { HoraryAspectPolicy } from "./aspect-policy.js";
import { selectSignificators } from "./significators.js";
import type { HoraryCast, HorarySignificators, PlanetRoles } from "./types.js";

const DAY_MS = 86_400_000;
export type AspectLongitudeAt = BodyLongitudeAt<ClassicalPlanet>;
export interface AspectContact {
  readonly at: string;
  /** Elapsed UTC days from the question, not a symbolic timing hint. */
  readonly elapsedDays: number;
  /** Directed a-minus-b longitude in [0,360). */
  readonly directedLongitude: number;
  /** Direction of relative motion, never either planet's retrograde flag. */
  readonly relativeDirection: "increasing" | "decreasing";
}
export interface AspectPerfectionCandidate {
  readonly kind: "exact-now" | "candidate";
  readonly at: string;
  readonly elapsedDays: number;
  readonly directedLongitude: number;
}
export interface SignificatorAspect {
  readonly a: PlanetRoles;
  readonly b: PlanetRoles;
  readonly type: AspectType;
  readonly angle: number;
  readonly current: Readonly<{
    aLongitude: number; bLongitude: number; aSpeed: number; bSpeed: number;
    orb: number; maximumOrb: number; withinOrb: boolean; exact: boolean;
    motion: AspectMotion; directedLongitude: number;
  }>;
  /** All sampled future contacts, including the opposite branch and returns after reversal. */
  readonly contacts: readonly AspectContact[];
  /** Only an exact current contact or the current in-orb application's branch. No eligibility verdict. */
  readonly timeToPerfection: AspectPerfectionCandidate | null;
  readonly explanation: string;
}
export interface HorarySignificatorAspects {
  readonly schema: "horary.significator-aspects/v1";
  readonly questionId: string;
  readonly policy: HoraryAspectPolicy;
  readonly source: typeof ASPECT_MOTION_SOURCE;
  readonly significators: HorarySignificators;
  readonly search: Readonly<{
    status: "complete" | "refused" | "disabled";
    reason: "sample-budget" | null;
    from: string; to: string; samples: number;
    clock: "engine-utc-model" | "caller-longitude-provider";
    method: typeof ASPECT_SEARCH_METHOD;
  }>;
  readonly aspects: readonly SignificatorAspect[];
}

function longitude(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 360) {
    throw new RangeError("Aspect longitudes must be finite degrees in [0,360).");
  }
  return value;
}

function analyze(longitudeAt: AspectLongitudeAt, result: HoraryCast, inputPolicy: HoraryAspectPolicy,
  clock: HorarySignificatorAspects["search"]["clock"]): HorarySignificatorAspects {
  if (typeof longitudeAt !== "function") throw new RangeError("Aspect longitude provider must be a function.");
  const policy = validateAspectSearchPolicy(inputPolicy);
  const significators = selectSignificators(result);
  const from = dateFrom(result.input.instant, "question instant");
  const endTime = from.getTime() + policy.horizonDays * DAY_MS;
  const to = new Date(endTime);
  if (!Number.isFinite(to.getTime()) || to.getTime() <= from.getTime()) {
    throw new RangeError("Aspect horizon must end at a representable later instant.");
  }
  if (!Array.isArray(result.chart.bodies)) throw new RangeError("Aspect analysis requires chart body rows.");
  const rows = significators.planets.map(({ planet }) => {
    const matches = result.chart.bodies.filter(row => row?.body === planet);
    if (matches.length !== 1) throw new RangeError(`Aspect analysis requires exactly one ${planet} row.`);
    const row = matches[0]!;
    const lon = longitude(row.lon);
    if (typeof row.speed !== "number" || !Number.isFinite(row.speed)) throw new RangeError("Aspect speeds must be finite degrees/day.");
    return { body: planet, lon, speed: row.speed };
  });
  const pending: { observation: Omit<SignificatorAspect, "contacts" | "timeToPerfection" | "explanation">; contacts: AspectContact[] }[] = [];
  let samples = 0;
  let status: HorarySignificatorAspects["search"]["status"] = policy.search && policy.aspects.length ? "complete" : "disabled";
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!, b = rows[j]!;
      for (const definition of ASPECTS) {
        if (!policy.aspects.includes(definition.type)) continue;
        const { type, angle } = definition;
        const positions = [a, b];
        const makePolicy = (orb: number, luminaryOrb: number) => createAspectPolicy({ bodies: [a.body, b.body],
          aspects: [{ type, orb, luminaryOrb }], stationaryRelativeSpeed: policy.stationaryRelativeSpeed });
        // A single rule with the full angular allowance reports its motion even out of orb.
        // Eligibility and exactness get separate engine decisions, without comparing rounded orbs.
        const broad = findConfiguredAspects(positions, makePolicy(180, 180)).aspects[0]!;
        const eligible = findConfiguredAspects(positions, makePolicy(policy.orbs[type], policy.luminaryOrbs[type])).aspects.length > 0;
        const exact = findConfiguredAspects(positions, makePolicy(0, 0)).aspects.length > 0;
        const signed = exactSign([a.lon, -b.lon]);
        const foldedSide = exactSign([a.lon, -b.lon, -180]) > 0 ? -1 :
          exactSign([a.lon, -b.lon, 180]) <= 0 ? 1 : signed;
        const directedLongitude = angle === 0 || angle === 180 || foldedSide >= 0 ? angle : 360 - angle;
        const current = Object.freeze({ aLongitude: a.lon, bLongitude: b.lon, aSpeed: a.speed, bSpeed: b.speed,
          orb: broad.orb, maximumOrb: a.body === "Sun" || a.body === "Moon" || b.body === "Sun" || b.body === "Moon"
            ? policy.luminaryOrbs[type] : policy.orbs[type], withinOrb: eligible, exact, motion: broad.motion, directedLongitude });
        const contacts: AspectContact[] = [];
        if (status === "complete") {
          // Both directed branches are retained; conjunction and opposition have only one.
          const targets = angle === 0 || angle === 180 ? [angle] : [angle, 360 - angle];
          const relative: AspectLongitudeAt = (_body, date) => {
            const alon = longitude(longitudeAt(a.body, new Date(date.getTime())));
            const blon = longitude(longitudeAt(b.body, new Date(date.getTime())));
            const value = roundedValue(exactSum(alon, -blon));
            return value < 0 ? value + 360 : value;
          };
          for (const target of targets) {
            const remaining = policy.maxSamples - samples;
            if (remaining === 0) { status = "refused"; break; }
            const scan = searchLongitudeCrossingsWith(relative, a.body, target, from, to,
              { stepDays: policy.stepDays, maxSamples: remaining });
            samples += scan.samples;
            if (scan.status === "refused") { status = "refused"; break; }
            for (const crossing of scan.crossings) {
              // Date truncation can put a sub-millisecond root back at the open start.
              if (crossing.at.getTime() <= from.getTime()) continue;
              contacts.push(Object.freeze({ at: crossing.at.toISOString(), elapsedDays: (crossing.at.getTime() - from.getTime()) / DAY_MS,
                directedLongitude: target, relativeDirection: crossing.retrograde ? "decreasing" : "increasing" }));
            }
          }
          contacts.sort((x, y) => Date.parse(x.at) - Date.parse(y.at) || x.directedLongitude - y.directedLongitude);
        }
        pending.push({ observation: { a: significators.planets[i]!, b: significators.planets[j]!, type, angle,
          current }, contacts });
      }
    }
  }
  const aspects = pending.map(({ observation, contacts }): SignificatorAspect => {
    // Refusal is atomic for the whole report: earlier pairs/branches expose no partial search results.
    const kept = status === "complete" ? contacts : [];
    const current = observation.current;
    const next = current.withinOrb && current.motion === "applying"
      ? kept.find(contact => contact.directedLongitude === current.directedLongitude) : undefined;
    const timeToPerfection: AspectPerfectionCandidate | null = current.exact
      ? Object.freeze({ kind: "exact-now", at: from.toISOString(), elapsedDays: 0, directedLongitude: current.directedLongitude })
      : next ? Object.freeze({ kind: "candidate", at: next.at, elapsedDays: next.elapsedDays, directedLongitude: next.directedLongitude }) : null;
    const searchExplanation = status === "refused" ? "The global sample budget refused the search; no partial contacts are returned."
      : status === "disabled" ? "Future contact searching is disabled."
      : next ? `The current application has a sampled contact candidate at ${next.at}, after ${next.elapsedDays} elapsed UTC days.`
      : current.withinOrb && current.motion === "applying" ? "No contact on the current application's branch was found in this horizon."
      : "Future contacts, if listed, are not the perfection of a current in-orb application.";
    return Object.freeze({ ...observation, contacts: Object.freeze(kept), timeToPerfection,
      explanation: `${observation.a.planet} and ${observation.b.planet}: ${observation.type} has orb ${current.orb} degrees, ` +
        `${current.withinOrb ? "within" : "outside"} the configured ${current.maximumOrb} degrees, and is ${current.motion}` +
        (current.exact ? "; exact at the question instant." : ".") + " " + searchExplanation +
        " Sign changes, stations and intervening contacts have not been evaluated; this establishes no outcome." });
  });
  return Object.freeze({ schema: "horary.significator-aspects/v1", questionId: significators.questionId,
    policy, source: ASPECT_MOTION_SOURCE, significators,
    search: Object.freeze({ status, reason: status === "refused" ? "sample-budget" : null,
      from: from.toISOString(), to: to.toISOString(), samples, clock, method: ASPECT_SEARCH_METHOD }), aspects: Object.freeze(aspects) });
}

/** Read the cast's current geometry; search moving pairs on the engine's UTC model clock. */
export function evaluateSignificatorAspects(result: HoraryCast, policy: HoraryAspectPolicy = createAspectSearchPolicy()): HorarySignificatorAspects {
  return analyze(bodyLongitude, result, policy, "engine-utc-model");
}

/** Deterministic provider boundary for independent motion fixtures or caller-supplied longitude laws. */
export function evaluateSignificatorAspectsWith(longitudeAt: AspectLongitudeAt, result: HoraryCast,
  policy: HoraryAspectPolicy = createAspectSearchPolicy()): HorarySignificatorAspects {
  return analyze(longitudeAt, result, policy, "caller-longitude-provider");
}
