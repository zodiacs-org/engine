import { TextDecoder } from "node:util";
import { CliError, MAX_JSON_BYTES, MAX_JSON_DEPTH, MAX_JSON_TOKENS, parseJson } from "./json.mjs";

const SCHEMA = "numerology-cli/1";
const commonOptions = {
  "--system": "system", "--master-numbers": "masterNumbers", "--method": "method",
  "--y-as-vowel": "yAsVowel", "--transliteration": "transliteration"
};
const fields = {
  profile: { "--birth-date": "birthDate", "--name": "name", "--target-date": "targetDate" },
  cycles: { "--birth-date": "birthDate", "--target-date": "targetDate" },
  compare: { "--birth-date": "birthDate", "--before-name": "beforeName",
    "--after-name": "afterName", "--target-date": "targetDate" }
};
const required = {
  profile: ["birthDate", "name"], cycles: ["birthDate", "targetDate"],
  compare: ["birthDate", "beforeName", "afterName"]
};
const domains = {
  system: ["pythagorean", "chaldean"], masterNumbers: ["preserve", "reduce"],
  method: ["components", "whole-date"], yAsVowel: ["never", "always", "when-no-other-vowels"]
};

function help(command) {
  return {
    schema: SCHEMA, ok: true,
    help: {
      ...(command === undefined ? {} : { command }),
      usage: "node numerology/cli.mjs <profile|cycles|compare> [flags | --input JSON | --input -] [--pretty]",
      commands: {
        profile: "--birth-date YYYY-MM-DD --name NAME [--target-date YYYY-MM-DD]",
        cycles: "--birth-date YYYY-MM-DD --target-date YYYY-MM-DD",
        compare: "--birth-date YYYY-MM-DD --before-name NAME --after-name NAME [--target-date YYYY-MM-DD]"
      },
      options: domains,
      defaults: { system: "pythagorean", masterNumbers: "preserve", method: "components",
        yAsVowel: "never", targetDate: null },
      cyclesOptions: ["masterNumbers"],
      transliteration: "--transliteration JSON with only id and mappings; profile and compare only",
      jsonRequest: "Use command fields in camelCase and an optional options object. Profile/compare targetDate belongs in options. The command remains an argument.",
      input: "--input - reads one UTF-8 JSON request to EOF from piped stdin. Input mode cannot be combined with calculation flags.",
      limits: { jsonBytes: MAX_JSON_BYTES, jsonDepth: MAX_JSON_DEPTH, jsonTokens: MAX_JSON_TOKENS },
      output: "Success: JSON on stdout, empty stderr. Failure: JSON on stderr, empty stdout. Receipts retain supplied names and dates.",
      exitCodes: { success: 0, ioOrInternalError: 1, invalidArgumentsOrInput: 2 }
    }
  };
}

function argumentsFor(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: help() };
  const [command, ...args] = argv;
  if (!Object.hasOwn(fields, command ?? "")) {
    throw new CliError("invalid-arguments", "Choose a command: profile, cycles, or compare; use --help for usage.");
  }
  if (args.length === 1 && args[0] === "--help") return { help: help(command) };
  const availableOptions = command === "cycles" ? { "--master-numbers": "masterNumbers" } : commonOptions;
  const flags = { ...fields[command], ...availableOptions };
  const request = Object.create(null);
  const options = Object.create(null);
  const seen = new Set();
  let input;
  let pretty = false;
  for (let index = 0; index < args.length; index++) {
    // Support both --flag value and --flag=value. There are no short aliases,
    // positional values, optional flag values, or implicit type coercions.
    const argument = args[index];
    const equal = argument.indexOf("=");
    const flag = equal < 0 ? argument : argument.slice(0, equal);
    if (seen.has(flag)) throw new CliError("invalid-arguments", "Options must not be repeated.");
    seen.add(flag);
    if (flag === "--pretty" && equal < 0) { pretty = true; continue; }
    if (!Object.hasOwn(flags, flag) && flag !== "--input") {
      throw new CliError("invalid-arguments", "Unknown or inapplicable option; use command --help for usage.");
    }
    const value = equal < 0 ? args[++index] : argument.slice(equal + 1);
    if (value === undefined || value === "" || (equal < 0 && value.startsWith("--"))) {
      throw new CliError("invalid-arguments", "Each option requires a nonempty value.");
    }
    if (flag === "--input") { input = value; continue; }
    const key = flags[flag];
    if (Object.hasOwn(availableOptions, flag)) {
      options[key] = flag === "--transliteration" ? parseJson(value) : value;
    } else if (key === "targetDate" && command !== "cycles") {
      options.targetDate = value;
    } else { request[key] = value; }
  }
  if (input !== undefined && [...seen].some((flag) => flag !== "--input" && flag !== "--pretty")) {
    throw new CliError("invalid-arguments", "Use either --input or calculation flags, without mixing them.");
  }
  if (Object.keys(options).length) request.options = options;
  return { command, pretty, input, request };
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateRequest(command, request) {
  if (!object(request)) throw new CliError("invalid-input", "The request must be a JSON object.");
  for (const key of Object.keys(request)) {
    if (!required[command].includes(key) && key !== "options") {
      throw new CliError("invalid-input", "Unknown or inapplicable request field.");
    }
  }
  for (const key of required[command]) {
    if (!Object.hasOwn(request, key) || typeof request[key] !== "string" || request[key].length === 0) {
      throw new CliError("invalid-input", "Required date and name fields must be nonempty strings.");
    }
  }
  const options = Object.hasOwn(request, "options") ? request.options : {};
  if (!object(options)) throw new CliError("invalid-input", "Options must be a JSON object.");
  const allowed = command === "cycles" ? ["masterNumbers"] : [...Object.keys(domains), "transliteration", "targetDate"];
  for (const key of Object.keys(options)) {
    if (!allowed.includes(key)) throw new CliError("invalid-input", "Unknown or inapplicable calculation option.");
    if (Object.hasOwn(domains, key) && !domains[key].includes(options[key])) {
      throw new CliError("invalid-input", "Unsupported calculation option value.");
    }
    if (key === "targetDate" && (typeof options[key] !== "string" || options[key].length === 0)) {
      throw new CliError("invalid-input", "Target date must be a nonempty civil-date string.");
    }
  }
  return options;
}

async function readStdin(stdin) {
  if (stdin.isTTY) throw new CliError("invalid-input", "Pipe a UTF-8 JSON request to --input - and close stdin.");
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of stdin) {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) throw new CliError("input-limit", "JSON input exceeds the byte limit.");
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError("input-io", "Could not read stdin.", 1);
  }
  try {
    // Preserve a BOM so JSON.parse rejects it, just as in inline JSON.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(Buffer.concat(chunks));
  } catch { throw new CliError("invalid-encoding", "Stdin must contain valid UTF-8."); }
}

async function calculate(command, request, options) {
  let api;
  try { api = await import("../.build/index.js"); }
  catch {
    throw new CliError("library-unavailable", "Build the local numerology library with npm run build in numerology/.", 1);
  }
  try {
    if (command === "profile") return api.profile(request.birthDate, request.name, options);
    if (command === "compare") return api.compareNames(request.birthDate, request.beforeName, request.afterName, options);
    return {
      personalYear: api.personalYear(request.birthDate, request.targetDate, options),
      personalMonth: api.personalMonth(request.birthDate, request.targetDate, options),
      personalDay: api.personalDay(request.birthDate, request.targetDate, options)
    };
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      // Library messages can contain unsupported source scalars. Keep transport
      // diagnostics fixed, without names, dates, raw JSON, or parser excerpts.
      throw new CliError("invalid-input", "Calculation input violates the documented date, name, or option rules.");
    }
    throw error;
  }
}

export async function run(argv, { stdin, stdout, stderr }) {
  let response;
  let pretty = false;
  try {
    const parsed = argumentsFor(argv);
    if (parsed.help) response = parsed.help;
    else {
      pretty = parsed.pretty;
      const request = parsed.input === undefined ? parsed.request
        : parseJson(parsed.input === "-" ? await readStdin(stdin) : parsed.input);
      const options = validateRequest(parsed.command, request);
      const result = await calculate(parsed.command, request, options);
      response = { schema: SCHEMA, ok: true, command: parsed.command, result };
    }
  } catch (error) {
    const known = error instanceof CliError;
    const failure = { schema: SCHEMA, ok: false, error: {
      code: known ? error.code : "internal-error",
      message: known ? error.message : "Could not complete the calculation."
    } };
    try { await write(stderr, JSON.stringify(failure) + "\n"); }
    catch { return 1; }
    return known ? error.exitCode : 1;
  }
  try { await write(stdout, JSON.stringify(response, null, pretty ? 2 : undefined) + "\n"); }
  catch {
    try {
      await write(stderr, JSON.stringify({ schema: SCHEMA, ok: false,
        error: { code: "output-io", message: "Could not write stdout." } }) + "\n");
    } catch { /* The diagnostic stream may also be unavailable. */ }
    return 1;
  }
  return 0;
}

function write(stream, value) {
  return new Promise((resolve, reject) => {
    // A failed write emits error as well as invoking its callback. Keep the
    // listener installed through that event, including asynchronous EPIPE.
    stream.once("error", reject);
    stream.write(value, (error) => {
      if (error) reject(error);
      else { stream.removeListener("error", reject); resolve(); }
    });
  });
}
