import { generateInterpretations } from "../lib/generate-interpretations.mjs";
import { readGenerationJson, writeGeneration } from "../lib/generation-files.mjs";

const usage = "Usage: node evals/bin/generate-interpretations.mjs <sources.json> <plan.json> [--backend mock]";

async function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (![2, 4].includes(args.length) || args.slice(0, 2).some((arg) => !arg || arg.startsWith("-")) ||
      (args.length === 4 && (args[2] !== "--backend" || args[3] !== "mock"))) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = 2;
    return;
  }
  let sources;
  let plan;
  try {
    sources = await readGenerationJson(args[0]);
    plan = await readGenerationJson(args[1]);
  } catch {
    process.stderr.write("Cannot read generation inputs: expected regular UTF-8 JSON files within the byte limit.\n");
    process.exitCode = 2;
    return;
  }
  let result;
  try {
    result = await generateInterpretations(sources, plan, { backend: "mock" });
  } catch {
    process.stderr.write("Generation failed: inputs or generated interpretations did not pass validation.\n");
    process.exitCode = 1;
    return;
  }
  try {
    const summary = await writeGeneration(result);
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch {
    process.stderr.write("Cannot write generation output: output is unavailable, unsafe or conflicts with existing files.\n");
    process.exitCode = 2;
  }
}

await main(process.argv.slice(2));
