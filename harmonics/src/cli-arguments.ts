import { createAspectPolicy } from "../../src/configured-aspects.js";
import type { AspectPolicyInput } from "../../src/configured-aspects.js";
import { CliError, parseJsonDocument } from "./cli-input.js";
import { harmonicChart, harmonicLimit } from "./harmonic-chart.js";
import type { DialCircle } from "./dial.js";
import type { HarmonicOrbScaling } from "./harmonic-aspects.js";
import type { PictureRepeatedMembers } from "./planetary-pictures.js";

export interface SourceArguments {
  readonly input: string;
  readonly includeAngles: boolean;
  readonly includeChartPoints: boolean;
}

export interface ChartArguments extends SourceArguments {
  readonly harmonic: number;
  readonly maxHarmonic: number;
}

export interface SpectrumArguments extends SourceArguments {
  readonly bodies?: readonly string[];
  readonly maxHarmonic: number;
  readonly harmonics?: readonly number[];
  readonly orbScaling: HarmonicOrbScaling;
  readonly policy?: AspectPolicyInput;
  readonly bodyWeights?: Readonly<Record<string, number>>;
  readonly aspectWeights?: Readonly<Record<string, number>>;
}

export interface DialArguments extends SourceArguments {
  readonly bodies?: readonly string[];
  readonly circle: DialCircle;
  readonly contactOrb: number;
  readonly repeatedMembers: PictureRepeatedMembers;
}

export type CliArguments =
  | ({ readonly command: "chart" } & ChartArguments)
  | ({ readonly command: "spectrum" } & SpectrumArguments)
  | ({ readonly command: "dial" } & DialArguments);
export type CliHelp = "help" | "chart-help" | "spectrum-help" | "dial-help";

function fail(message: string): never {
  throw new CliError("invalid-arguments", message);
}

function integer(text: string): number {
  if (!/^[1-9]\d*$/u.test(text) || !Number.isSafeInteger(Number(text))) {
    fail("Harmonics must be positive safe integers in decimal notation.");
  }
  return Number(text);
}

function decimal(text: string): number {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(text) || !Number.isFinite(Number(text))) {
    fail("Degree values must be finite nonnegative plain decimals without whitespace.");
  }
  return Number(text);
}

function json(text: string): unknown {
  try {
    return parseJsonDocument(Buffer.from(text));
  } catch {
    return fail("JSON options require bounded UTF-8 JSON without duplicate keys.");
  }
}

function weightMap(text: string): Readonly<Record<string, number>> {
  const value = json(text);
  if (!value || typeof value !== "object" || Array.isArray(value) ||
    Object.values(value).some((weight) => typeof weight !== "number" || !Number.isFinite(weight) || weight < 0)) {
    fail("Weights must be JSON objects with finite nonnegative numerical values.");
  }
  return value as Record<string, number>;
}

function labels(text: string): readonly string[] {
  const value = json(text);
  if (!Array.isArray(value)) fail("--bodies must be a nonempty JSON array of unique point labels.");
  try {
    harmonicChart(value.map((body: unknown) => ({ body: body as string, lon: 0 })), 1);
  } catch {
    fail("--bodies must be a nonempty JSON array of unique point labels.");
  }
  return value as string[];
}

/** Shared strict token parsing. Command-specific flags never silently carry over. */
export function parseCliArguments(args: readonly string[]): CliArguments | CliHelp {
  if (args.length === 1 && args[0] === "--help") return "help";
  const command = args[0];
  if (command !== "chart" && command !== "spectrum" && command !== "dial") {
    fail("Expected chart, spectrum or dial. Use harmonics --help for usage.");
  }
  if (args.length === 2 && args[1] === "--help") return `${command}-help`;
  const allowed = ["--input", "--include-angles", "--include-chart-points",
    ...(command === "chart" ? ["--harmonic", "--max-harmonic"] : command === "spectrum"
      ? ["--bodies", "--harmonics", "--max-harmonic", "--orb-scaling", "--policy", "--body-weights", "--aspect-weights"]
      : ["--bodies", "--circle", "--contact-orb", "--repeated-members"])];
  const values = new Map<string, string>();
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index]!;
    if (!allowed.includes(option)) fail(`Unknown option or positional argument. Use ${command} --help.`);
    if (values.has(option)) fail("Options must not be repeated.");
    if (option === "--include-angles" || option === "--include-chart-points") values.set(option, "true");
    else {
      const value = args[++index];
      if (value === undefined || value.trim() === "" || value.startsWith("--")) {
        fail("Every value option requires a nonempty value.");
      }
      values.set(option, value);
    }
  }
  const input = values.get("--input");
  if (input === undefined) fail("--input FILE|- is required.");
  const source = {
    input, includeAngles: values.has("--include-angles"), includeChartPoints: values.has("--include-chart-points")
  };
  if (command === "dial") {
    const circle = decimal(values.get("--circle") ?? "90");
    if (circle !== 90 && circle !== 45 && circle !== 22.5) fail("Dial circle must be 90, 45 or 22.5 degrees.");
    const contactOrb = decimal(values.get("--contact-orb") ?? "1");
    if (contactOrb > circle / 2) fail("contactOrb must not exceed half the dial circle.");
    const repeatedMembers = values.get("--repeated-members") ?? "distinct";
    if (repeatedMembers !== "distinct" && repeatedMembers !== "doubled") fail("repeated-members must be distinct or doubled.");
    return { command, ...source, circle, contactOrb, repeatedMembers,
      ...(values.has("--bodies") ? { bodies: labels(values.get("--bodies")!) } : {}) };
  }
  const maxHarmonic = integer(values.get("--max-harmonic") ?? "180");
  if (command === "chart") {
    const harmonic = integer(values.get("--harmonic") ?? "1");
    try { harmonicLimit(harmonic, { maxHarmonic }); }
    catch { fail("harmonic must not exceed maxHarmonic."); }
    return { command, ...source, harmonic, maxHarmonic };
  }
  const harmonics = values.has("--harmonics") ? values.get("--harmonics")!.split(",").map(integer) : undefined;
  if (harmonics && (new Set(harmonics).size !== harmonics.length || harmonics.some((n) => n > maxHarmonic))) {
    fail("harmonics must be unique and must not exceed maxHarmonic.");
  }
  const orbScaling = values.get("--orb-scaling") ?? "inverse-harmonic";
  if (orbScaling !== "inverse-harmonic" && orbScaling !== "fixed") fail("orb-scaling must be inverse-harmonic or fixed.");
  const policy = values.has("--policy") ? json(values.get("--policy")!) as AspectPolicyInput : undefined;
  if (policy !== undefined) {
    try { createAspectPolicy(policy); }
    catch { fail("--policy must satisfy the engine's aspect policy input contract."); }
  }
  return {
    command, ...source, maxHarmonic, orbScaling,
    ...(harmonics === undefined ? {} : { harmonics }),
    ...(policy === undefined ? {} : { policy }),
    ...(values.has("--bodies") ? { bodies: labels(values.get("--bodies")!) } : {}),
    ...(values.has("--body-weights") ? { bodyWeights: weightMap(values.get("--body-weights")!) } : {}),
    ...(values.has("--aspect-weights") ? { aspectWeights: weightMap(values.get("--aspect-weights")!) } : {})
  };
}

/** Compatibility helper for the original chart executor and its embedders. */
export function parseChartArguments(args: readonly string[]): ChartArguments | "help" {
  const parsed = parseCliArguments(args);
  if (parsed === "help" || parsed === "chart-help") return "help";
  if (typeof parsed === "string" || parsed.command !== "chart") fail("Expected the chart command.");
  const { command: _command, ...chart } = parsed;
  return chart;
}
