import type { LongitudeComparison } from "./compare.js";
import type { DraconicChartResult, DraconicComparisonResult } from "./results.js";

type Result = DraconicChartResult | DraconicComparisonResult;

function contextLines(result: Result): string[] {
  const { receipt, result: natal } = result.natal;
  const node = result.conventions.northNode;
  const ephemeris = receipt.engine.ephemeris;
  return [
    "Synthetic input: caller-declared.",
    `Selected north node: ${node.kind} (${node.enginePoint}); natal longitude ${node.longitude} degrees.`,
    "Rotation: subtract selected natal north-node longitude; wrap to [0, 360) degrees; node target 0 degrees Aries.",
    "Houses: rotate existing natal cusps in order without recasting; preserve computed system.",
    `House systems: requested ${receipt.houses.requested}; computed ${receipt.houses.actual ?? "unavailable"}.`,
    ...(receipt.houses.absenceReason === null ? [] : [`House absence: ${receipt.houses.absenceReason}.`]),
    `Natal flags: ${receipt.resultFlags.join(", ") || "none"}.`,
    `Engine natal receipt: ${receipt.engine.name} ${receipt.engine.version}; ephemeris ${ephemeris ? `${ephemeris.name} ${ephemeris.version}` : "unrecorded"}.`,
    `Input instant: ${receipt.instant}; scale ${receipt.timeScale ?? "unrecorded"}; time known ${receipt.timeKnown}.`,
    `Source instant spelling: ${receipt.sourceInstant ?? "unavailable"}.`,
    `Time basis: ${natal.timeScale?.basis ?? "unrecorded"}; deltaT seconds ${natal.deltaT?.seconds ?? "unrecorded"}; model ${natal.deltaT?.model ?? "unrecorded"}.`,
    "Receipt scope: engine natal only; draconic derived by this library. Use --format json for the full natal receipt.",
    "Position snapshot only. No interpretation or predictions.",
    "Values use JavaScript number text without decimal rounding; displayed digits are not an accuracy claim."
  ];
}

/** CLI presentation only: preserve numerical values, use tabs, and mark absent geometry. */
export function renderChartText(result: DraconicChartResult): string {
  const { bodies, angles, houses } = result.draconic;
  const lines = ["Draconic chart", ...contextLines(result), "", "Bodies",
    "Body\tLongitude (degrees)\tLatitude (degrees, unchanged)\tSign\tDegree in sign\tHouse"];
  for (const body of bodies) {
    lines.push([body.body, body.lon, body.lat, body.sign, body.degree, body.house ?? "unavailable"].join("\t"));
  }
  lines.push("", "Angles");
  if (angles === null) lines.push("unavailable");
  else {
    lines.push("Angle\tLongitude (degrees)");
    for (const [angle, longitude] of Object.entries(angles)) lines.push(`${angle}\t${longitude}`);
  }
  lines.push("", "House cusps");
  if (houses === null) lines.push("unavailable");
  else {
    lines.push("House\tLongitude (degrees)");
    houses.cusps.forEach((longitude, index) => lines.push(`${index + 1}\t${longitude}`));
  }
  return `${lines.join("\n")}\n`;
}

function comparisonRow(label: string | number, row: LongitudeComparison): string {
  return [label, row.natalLongitude, row.draconicLongitude, row.deltaDegrees].join("\t");
}

export function renderComparisonText(result: DraconicComparisonResult): string {
  const { bodies, angles, houses, conventions } = result.comparison;
  const columns = "Natal tropical (degrees)\tDraconic (degrees)\tDelta (degrees)";
  const lines = ["Natal tropical vs draconic comparison", ...contextLines(result),
    `Delta: draconic minus natal, shortest signed circular displacement in ${conventions.deltaRange} degrees; exact half-circle tie +${conventions.antipodalDelta}.`,
    "Coordinate differences only; no elapsed time or motion is implied.", "", "Bodies", `Body\t${columns}`];
  for (const body of bodies) lines.push(comparisonRow(body.body, body));
  lines.push("", "Angles");
  if (angles === null) lines.push("unavailable");
  else {
    lines.push(`Angle\t${columns}`);
    for (const [angle, row] of Object.entries(angles)) lines.push(comparisonRow(angle, row));
  }
  lines.push("", "House cusps");
  if (houses === null) lines.push("unavailable");
  else {
    lines.push(`House\t${columns}`);
    for (const cusp of houses.cusps) lines.push(comparisonRow(cusp.house, cusp));
  }
  return `${lines.join("\n")}\n`;
}
