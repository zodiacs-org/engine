import { ASPECTS, createAspectPolicy, exactSign, findConfiguredAspects } from "./engine.js";
import type { AspectType, ClassicalPlanet } from "./engine.js";
import type { HoraryAspectPolicy } from "./aspect-policy.js";

export interface AspectRow { readonly body: ClassicalPlanet; readonly lon: number; readonly speed: number }

/** Shared instantaneous decisions. All eligibility, motion and exactness belong to the engine. */
export function observeAspect(a: AspectRow, b: AspectRow, type: AspectType, policy: HoraryAspectPolicy) {
  const { angle } = ASPECTS.find(definition => definition.type === type)!;
  const makePolicy = (orb: number, luminaryOrb: number) => createAspectPolicy({ bodies: [a.body, b.body],
    aspects: [{ type, orb, luminaryOrb }], stationaryRelativeSpeed: policy.stationaryRelativeSpeed });
  const broad = findConfiguredAspects([a, b], makePolicy(180, 180)).aspects[0]!;
  const withinOrb = findConfiguredAspects([a, b], makePolicy(policy.orbs[type], policy.luminaryOrbs[type])).aspects.length > 0;
  const exact = findConfiguredAspects([a, b], makePolicy(0, 0)).aspects.length > 0;
  const signed = exactSign([a.lon, -b.lon]);
  const foldedSide = exactSign([a.lon, -b.lon, -180]) > 0 ? -1 :
    exactSign([a.lon, -b.lon, 180]) <= 0 ? 1 : signed;
  const directedLongitude = angle === 0 || angle === 180 || foldedSide >= 0 ? angle : 360 - angle;
  return Object.freeze({ aLongitude: a.lon, bLongitude: b.lon, aSpeed: a.speed, bSpeed: b.speed,
    orb: broad.orb, maximumOrb: a.body === "Sun" || a.body === "Moon" || b.body === "Sun" || b.body === "Moon"
      ? policy.luminaryOrbs[type] : policy.orbs[type], withinOrb, exact, motion: broad.motion, directedLongitude });
}
