import type { Angles, BodyPosition, HouseNumber, Houses } from "../../src/index.js";
import type { SelectedNorthNode } from "./engine-adapter.js";
import { signedLongitudeDelta } from "./rotation.js";
import { transformNatal } from "./transform.js";
import type { DraconicSource } from "./transform.js";

export interface LongitudeComparison {
  natalLongitude: number;
  draconicLongitude: number;
  deltaDegrees: number;
}

export interface BodyComparison extends LongitudeComparison {
  body: BodyPosition["body"];
}

export interface CuspComparison extends LongitudeComparison {
  house: HouseNumber;
}

/** Structured coordinate differences only, without aspects or interpretation. */
export interface NatalDraconicComparison {
  node: SelectedNorthNode;
  conventions: {
    units: "degrees";
    longitudeRange: "[0, 360)";
    deltaDirection: "draconic-minus-natal";
    deltaRange: "(-180, 180]";
    antipodalDelta: 180;
  };
  bodies: BodyComparison[];
  angles: { [K in keyof Angles]: LongitudeComparison } | null;
  houses: { system: Houses["system"]; cusps: CuspComparison[] } | null;
}

function compareLongitude(natalLongitude: number, draconicLongitude: number): LongitudeComparison {
  return {
    natalLongitude, draconicLongitude,
    deltaDegrees: signedLongitudeDelta(natalLongitude, draconicLongitude)
  };
}

/**
 * Derive and compare one source's natal tropical and draconic longitudes.
 * Body order, angle keys and cusp order refer to that same source; there is
 * no matching of independently supplied charts. Absent geometry stays null.
 * This pure snapshot allocates independent output and never casts a chart.
 */
export function compareNatal(source: DraconicSource): NatalDraconicComparison {
  const rotated = transformNatal(source);
  const { natal } = source;
  return {
    node: rotated.node,
    conventions: {
      units: "degrees", longitudeRange: "[0, 360)",
      deltaDirection: "draconic-minus-natal", deltaRange: "(-180, 180]", antipodalDelta: 180
    },
    bodies: rotated.bodies.map((body, index) => ({
      body: body.body, ...compareLongitude(natal.bodies[index]!.lon, body.lon)
    })),
    angles: rotated.angles === null ? null : {
      asc: compareLongitude(natal.angles!.asc, rotated.angles.asc),
      mc: compareLongitude(natal.angles!.mc, rotated.angles.mc),
      dsc: compareLongitude(natal.angles!.dsc, rotated.angles.dsc),
      ic: compareLongitude(natal.angles!.ic, rotated.angles.ic)
    },
    houses: rotated.houses === null ? null : {
      system: rotated.houses.system,
      cusps: rotated.houses.cusps.map((cusp, index) => ({
        house: (index + 1) as HouseNumber,
        ...compareLongitude(natal.houses!.cusps[index]!, cusp)
      }))
    }
  };
}
