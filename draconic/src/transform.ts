import { houseOf, SIGNS } from "../../src/index.js";
import type { Angles, BodyPosition, Chart, HouseNumber, Houses } from "../../src/index.js";
import type { SelectedNorthNode } from "./engine-adapter.js";
import { rotateLongitude } from "./rotation.js";

export interface DraconicSource {
  natal: Pick<Chart, "bodies" | "angles" | "houses">;
  node: SelectedNorthNode;
}

/** A position snapshot. No natal speed is presented as a draconic rate. */
export interface DraconicBody extends Pick<BodyPosition, "body" | "lon" | "lat" | "sign" | "degree"> {
  /** Longitude-only placement against the rotated natal cusps, or null. */
  house: HouseNumber | null;
}

/** Derived coordinates, deliberately separate from an engine tropical Chart. */
export interface DraconicChart {
  node: SelectedNorthNode;
  bodies: DraconicBody[];
  angles: Angles | null;
  houses: Houses | null;
}

/**
 * Pure fixed rotation of an existing natal chart and selected node.
 * All longitudes are degrees in [0, 360). Rotates existing cusps in their
 * original order, including whole-sign cusps; never casts replacement houses.
 * Selection and provenance belong to the source, not to this transformation.
 */
export function transformNatal(source: DraconicSource): DraconicChart {
  const { natal, node } = source;
  if (!node || !((node.kind === "true" && node.enginePoint === "North Node")
    || (node.kind === "mean" && node.enginePoint === "Mean Node"))) {
    throw new RangeError("Selected node must identify a true or mean north node.");
  }
  // Validate even if the supplied chart has no positions.
  rotateLongitude(node.longitude, node.longitude);
  const rotate = (longitude: number): number => rotateLongitude(longitude, node.longitude);

  let houses: Houses | null = null;
  if (natal.houses !== null) {
    if (!Array.isArray(natal.houses.cusps) || natal.houses.cusps.length !== 12) {
      throw new RangeError("House cusps must contain 12 longitudes.");
    }
    houses = { system: natal.houses.system, cusps: Array.from(natal.houses.cusps, rotate) };
  }
  const angles: Angles | null = natal.angles === null ? null : {
    asc: rotate(natal.angles.asc),
    mc: rotate(natal.angles.mc),
    dsc: rotate(natal.angles.dsc),
    ic: rotate(natal.angles.ic)
  };
  const bodies = Array.from(natal.bodies, (body): DraconicBody => {
    const lon = rotate(body.lon);
    if (typeof body.lat !== "number" || !Number.isFinite(body.lat) || Math.abs(body.lat) > 90) {
      throw new RangeError("Body latitude must be finite and within [-90, 90] degrees.");
    }
    // lon is already canonical. Avoid renormalizing it: adding 360 before
    // a remainder can round a value immediately below a sign boundary up.
    const sign = SIGNS[Math.floor(lon / 30)]!;
    return {
      body: body.body, lon, lat: body.lat, sign: sign.slug, degree: lon % 30,
      house: houses === null ? null : houseOf(lon, houses.cusps)
    };
  });
  // Copy only the public scalar fields. A structurally compatible caller
  // object can also carry mutable metadata that does not belong in output.
  const selected: SelectedNorthNode = node.kind === "true"
    ? { kind: "true", enginePoint: "North Node", longitude: node.longitude }
    : { kind: "mean", enginePoint: "Mean Node", longitude: node.longitude };
  return { node: selected, bodies, angles, houses };
}
