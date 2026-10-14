import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { CliError, MAX_INPUT_BYTES, parseChartRequest } from "./cli-input.js";
import type { ChartRequest } from "./cli-input.js";
import { harmonicChart } from "./harmonic-chart.js";
import { harmonicSpectrum } from "./harmonic-spectrum.js";
import type { HarmonicSpectrum } from "./harmonic-spectrum.js";
import type { HarmonicAspectPosition } from "./harmonic-aspects.js";
import { findPlanetaryPictures } from "./planetary-pictures.js";
import type { PlanetaryPictureResult } from "./planetary-pictures.js";
import { midpointTrees } from "./midpoint-trees.js";
import type { MidpointTreeResult } from "./midpoint-trees.js";
import { parseCliArguments } from "./cli-arguments.js";
import type { ChartArguments, DialArguments, SourceArguments, SpectrumArguments } from "./cli-arguments.js";
import type { CastChartOptions, CastChartResult, CastHarmonicChartResult, EngineLongitudePoint } from "./engine.js";
import type { HarmonicChart } from "./types.js";

export { parseChartArguments, parseCliArguments } from "./cli-arguments.js";
export type { ChartArguments, DialArguments, SpectrumArguments } from "./cli-arguments.js";

export const CLI_SCHEMA = "zodiacs-harmonics-cli/v1";

export const CHART_HELP = `Usage: harmonics chart --input FILE|- [options]

Input is UTF-8 JSON containing exactly one of {"points":[...]} or {"birth":{...}}.
FILE is a local path; - reads stdin. No network requests are made.

Options:
  --harmonic N             Positive integer harmonic (default 1)
  --max-harmonic N         Positive integer ceiling (default 180)
  --include-angles        Append available angles to a cast birth chart
  --include-chart-points  Append engine chart points to a cast birth chart
  --help                  Show this help, used alone after chart

Results are JSON on stdout. Errors are JSON on stderr with a failing exit status.
`;

export const SPECTRUM_HELP = `Usage: harmonics spectrum --input FILE|- [options]

Shared input options: --include-angles, --include-chart-points (birth only).
  --bodies JSON           Nonempty array selecting supplied/cast point labels
  --harmonics N,N,...      Unique positive integers (default 1..min(180, ceiling))
  --max-harmonic N         Positive integer ceiling (default 180)
  --orb-scaling MODE       inverse-harmonic (default) or fixed
  --policy JSON            Engine AspectPolicyInput; default conjunction-only
  --body-weights JSON      Nonnegative weights keyed by policy body labels
  --aspect-weights JSON    Nonnegative weights keyed by policy aspect types
  --help                  Show this help, used alone after spectrum

Every retained point requires finite speed in source degrees/day.
Policy orb limits are N=1 degrees; see README for scaling and scoring.
Input and output use the chart command's offline JSON/error contract.
`;

export const DIAL_HELP = `Usage: harmonics dial --input FILE|- [options]

Shared input options: --include-angles, --include-chart-points (birth only).
  --bodies JSON           Nonempty array selecting supplied/cast point labels
  --circle DEGREES        90 (default), 45 or 22.5
  --contact-orb DEGREES   Inclusive dial longitude allowance (default 1)
  --repeated-members MODE distinct (default) or doubled planetary picture pairs
  --help                  Show this help, used alone after dial

Returns dial projection/contacts, A+B-C pictures and midpoint trees.
Orbs range from zero to half the circle. Speeds are not required.
Input and output use the chart command's offline JSON/error contract.
`;

export const CLI_HELP = `Offline harmonic charts, strength spectra and Uranian dials.

${CHART_HELP}
${SPECTRUM_HELP}
${DIAL_HELP}`;

export type CliChartResult =
  | { readonly schema: typeof CLI_SCHEMA; readonly command: "chart"; readonly sourceMode: "points";
    readonly harmonicChart: HarmonicChart }
  | ({ readonly schema: typeof CLI_SCHEMA; readonly command: "chart"; readonly sourceMode: "birth" }
    & CastHarmonicChartResult);

export async function executeChart(request: ChartRequest, args: ChartArguments): Promise<CliChartResult> {
  const { harmonic, maxHarmonic, includeAngles, includeChartPoints } = args;
  const header = { schema: CLI_SCHEMA, command: "chart" } as const;
  if (request.mode === "points") {
    if (includeAngles || includeChartPoints) {
      throw new CliError("invalid-arguments", "Angle and chart-point options require birth input.");
    }
    return { ...header, sourceMode: "points", harmonicChart: harmonicChart(request.points, harmonic, { maxHarmonic }) };
  }
  const { castHarmonicChart } = await import("./engine.js");
  return {
    ...header, sourceMode: "birth",
    ...castHarmonicChart(request.birth, harmonic, { maxHarmonic, ...castSettings(request, args) })
  };
}

function castSettings(request: Extract<ChartRequest, { mode: "birth" }>, args: SourceArguments): CastChartOptions {
  return {
    includeAngles: args.includeAngles, includeChartPoints: args.includeChartPoints,
    receiptContext: {
      ...(typeof request.birth.utc === "string" ? { sourceInstant: request.birth.utc } : {}),
      provenance: { runtime: { name: "node", version: process.versions.node } }
    }
  };
}

async function castSource(request: Extract<ChartRequest, { mode: "birth" }>, args: SourceArguments): Promise<CastChartResult> {
  // Supplied-point commands never initialize the casting API or ephemeris.
  const { castChart } = await import("./engine.js");
  return castChart(request.birth, castSettings(request, args));
}

type AnalysisSource =
  | { readonly sourceMode: "points" }
  | { readonly sourceMode: "birth"; readonly source: CastChartResult };
export type CliSpectrumResult = AnalysisSource & {
  readonly schema: typeof CLI_SCHEMA; readonly command: "spectrum"; readonly spectrum: HarmonicSpectrum;
};
export type CliDialResult = AnalysisSource & {
  readonly schema: typeof CLI_SCHEMA; readonly command: "dial";
  readonly planetaryPictures: PlanetaryPictureResult; readonly midpointTrees: MidpointTreeResult;
};

async function analysisSource(request: ChartRequest, args: SourceArguments & { readonly bodies?: readonly string[] }):
Promise<{ readonly points: readonly EngineLongitudePoint[]; readonly metadata: AnalysisSource }> {
  let points: readonly EngineLongitudePoint[];
  let metadata: AnalysisSource;
  if (request.mode === "points") {
    if (args.includeAngles || args.includeChartPoints) {
      throw new CliError("invalid-arguments", "Angle and chart-point options require birth input.");
    }
    points = request.points;
    metadata = { sourceMode: "points" };
  } else {
    const source = await castSource(request, args);
    points = source.points;
    metadata = { sourceMode: "birth", source };
  }
  if (args.bodies !== undefined) {
    if (args.bodies.some((body) => !points.some((point) => point.body === body))) {
      throw new CliError("invalid-input", "Every --bodies label must exist in the source points.");
    }
    // Filter before aspect validation, retaining original source order and receipt.
    points = points.filter((point) => args.bodies!.includes(point.body));
  }
  return { points, metadata };
}

export async function executeSpectrum(request: ChartRequest, args: SpectrumArguments): Promise<CliSpectrumResult> {
  const { points, metadata } = await analysisSource(request, args);
  const known = points.map((point): HarmonicAspectPosition => {
    if (typeof point.speed !== "number" || !Number.isFinite(point.speed)) {
      throw new CliError("invalid-input", "Spectrum requires finite source speeds. Use --bodies to exclude unknown-speed points.");
    }
    return { ...point, speed: point.speed };
  });
  const spectrum = harmonicSpectrum(known, {
    maxHarmonic: args.maxHarmonic, orbScaling: args.orbScaling,
    ...(args.harmonics === undefined ? {} : { harmonics: args.harmonics }),
    ...(args.policy === undefined ? {} : { policy: args.policy }),
    ...(args.bodyWeights === undefined ? {} : { bodyWeights: args.bodyWeights }),
    ...(args.aspectWeights === undefined ? {} : { aspectWeights: args.aspectWeights })
  });
  return { schema: CLI_SCHEMA, command: "spectrum", ...metadata, spectrum };
}

export async function executeDial(request: ChartRequest, args: DialArguments): Promise<CliDialResult> {
  const { points, metadata } = await analysisSource(request, args);
  return {
    schema: CLI_SCHEMA, command: "dial", ...metadata,
    planetaryPictures: findPlanetaryPictures(points, args.circle, {
      contactOrb: args.contactOrb, repeatedMembers: args.repeatedMembers
    }),
    midpointTrees: midpointTrees(points, args.circle, { contactOrb: args.contactOrb })
  };
}

export async function readInput(path: string, stdin: Readable = process.stdin): Promise<Uint8Array> {
  const stream = path === "-" ? stdin : createReadStream(path);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      size += bytes.byteLength;
      if (size > MAX_INPUT_BYTES) throw new CliError("invalid-input", "Input exceeds the byte limit.");
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("input-read", "Could not read the local input file or stdin.");
  }
  return Buffer.concat(chunks, size);
}

/** Writes a complete result only after validation/calculation; never exits a host process. */
export async function runCli(args: readonly string[]): Promise<number> {
  try {
    const parsed = parseCliArguments(args);
    if (typeof parsed === "string") {
      const help = { help: CLI_HELP, "chart-help": CHART_HELP, "spectrum-help": SPECTRUM_HELP, "dial-help": DIAL_HELP };
      process.stdout.write(help[parsed]);
      return 0;
    }
    const request = parseChartRequest(await readInput(parsed.input));
    const result = parsed.command === "chart" ? await executeChart(request, parsed)
      : parsed.command === "spectrum" ? await executeSpectrum(request, parsed) : await executeDial(request, parsed);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    const failure = error instanceof CliError ? error : error instanceof RangeError
      ? new CliError("invalid-input", error.message)
      : new CliError("execution-failed", "Analysis calculation failed.");
    process.stderr.write(`${JSON.stringify({ error: { code: failure.code, message: failure.message } })}\n`);
    return 1;
  }
}
