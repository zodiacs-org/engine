// Executable synthetic library example. Fixed local documents only.
import { fileURLToPath } from 'node:url';
import { loadSearchDependencies, parseRuleSet, RULE_LIMITS, streamElectional } from '../build/index.js';
import { readBoundedText } from '../build/cli-main.js';
import { parseCliControls } from '../build/cli-controls.js';

const documents = {
  hours: ['synthetic-hours.yaml', 'yaml', 'controls.json'],
  conditions: ['synthetic-conditions.json', 'json', 'conditions-controls.json'],
  'long-range': ['synthetic-long-range.yaml', 'yaml', 'controls.json'],
};
const name = process.argv[2] ?? 'hours';
if (!Object.hasOwn(documents, name) || process.argv.length > 3) {
  console.error('Usage: node examples/library.mjs [hours|conditions|long-range]');
  process.exitCode = 1;
} else {
  const [document, format, controlsFile] = documents[name];
  const read = file => readBoundedText(fileURLToPath(new URL(file, import.meta.url)), RULE_LIMITS.documentBytes);
  const controller = new AbortController();
  let signalCode;
  const interrupt = () => { signalCode = 130; controller.abort(); };
  const terminate = () => { signalCode = 143; controller.abort(); };
  const outputError = () => controller.abort();
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate); process.stdout.on('error', outputError);
  try {
    const rules = parseRuleSet(await read(document), format);
    const controls = parseCliControls(await read(controlsFile), rules.rules);
    const dependencies = await loadSearchDependencies();
    for await (const frame of streamElectional(rules, dependencies, { ...controls, signal: controller.signal })) {
      // Await the write before pulling more work; keep complete native audits.
      await new Promise((resolve, reject) => process.stdout.write(JSON.stringify(frame) + '\n', error => error ? reject(error) : resolve()));
      if (frame.type === 'end') process.exitCode = signalCode ?? ({ complete: 0, unresolved: 2, refused: 3 }[frame.status]);
    }
  } catch {
    console.error('{"error":"example-failed"}'); process.exitCode = signalCode ?? 1;
  } finally {
    process.off('SIGINT', interrupt); process.off('SIGTERM', terminate); process.stdout.off('error', outputError);
  }
}
