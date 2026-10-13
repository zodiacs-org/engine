import { evaluateReading } from "../lib/evaluate-reading.mjs";
import { readEvaluationJson, writeEvaluationReport } from "../lib/evaluation-files.mjs";

const usage = "Usage: node evals/bin/evaluate-reading.mjs <case.json> [--reading <reading.json> [--extract] | --mock]";
const pathArgument = (value) => typeof value === "string" && value.length > 0 && !value.startsWith("-");

async function main(args) {
  if (args.length === 1 && args[0] === "--help") {
    process.stdout.write(`${usage}\n`);
    return;
  }
  if (!pathArgument(args[0]) || !(
    args.length === 1 ||
    (args.length === 2 && args[1] === "--mock") ||
    (args.length === 3 && args[1] === "--reading" && pathArgument(args[2])) ||
    (args.length === 4 && args[1] === "--reading" && pathArgument(args[2]) && args[3] === "--extract")
  )) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = 2;
    return;
  }
  let syntheticCase;
  const options = {};
  try {
    syntheticCase = await readEvaluationJson(args[0]);
    if (args[1] === "--reading") options.reading = await readEvaluationJson(args[2]);
    if (args[3] === "--extract") options.extract = true;
  } catch {
    process.stderr.write("Cannot read evaluation inputs: expected regular UTF-8 JSON files within the byte limit.\n");
    process.exitCode = 2;
    return;
  }
  let result;
  try {
    result = await evaluateReading(syntheticCase, options);
  } catch {
    process.stderr.write("Evaluation failed: case, reading, engine reference or report did not pass validation.\n");
    process.exitCode = 1;
    return;
  }
  try {
    const summary = await writeEvaluationReport(result);
    process.stdout.write(`${JSON.stringify({ ...summary, mode: result.workflow.mode,
      extraction: result.workflow.extraction, overall: result.score.overall,
      diagnostics: result.score.diagnostics, limits: result.score.limits })}\n`);
  } catch {
    process.stderr.write("Cannot write evaluation report: output is unavailable, unsafe or conflicts with an existing file.\n");
    process.exitCode = 2;
  }
}

await main(process.argv.slice(2));
