/**
 * Reading facts sheet for one birth, or for many.
 *
 *   node_modules/.bin/vite-node bots/astrologer/facts/cli.ts -- '{"date":"1990-06-15","time":"00:00","timeKnown":true,"zone":"Asia/Tokyo","lat":35.6895,"lon":139.6917}'
 *   node_modules/.bin/vite-node bots/astrologer/facts/cli.ts -- --batch < inputs.json > sheets.json
 *
 * One input prints the text sheet (--json prints the facts). --batch reads a
 * JSON object of id to input on stdin and writes a JSON object of id to sheet
 * text. Options: --window-start YYYY-MM-DD (default 2026-11-01), --days N (default 90).
 */
import { readFileSync } from "node:fs";
import { buildReadingFacts, formatReadingFacts } from "./reading-facts.js";
import type { ReadingInput, ReadingOptions } from "./reading-facts.js";

const args = process.argv.slice(2).filter((a) => a !== "--");
const flag = (name: string) => args.includes(name);
const value = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const options: ReadingOptions = {};
if (value("--window-start")) options.windowStart = value("--window-start")!;
if (value("--days")) options.days = Number(value("--days"));

if (flag("--batch")) {
  const inputs = JSON.parse(readFileSync(0, "utf8")) as Record<string, ReadingInput>;
  const out: Record<string, string> = {};
  for (const [id, input] of Object.entries(inputs)) out[id] = formatReadingFacts(await buildReadingFacts(input, options));
  process.stdout.write(JSON.stringify(out));
} else {
  const raw = args.find((a) => a.startsWith("{"));
  if (!raw) {
    process.stderr.write("Give one input as JSON, or --batch with a JSON object on stdin.\n");
    process.exit(2);
  }
  const facts = await buildReadingFacts(JSON.parse(raw) as ReadingInput, options);
  process.stdout.write((flag("--json") ? JSON.stringify(facts, null, 2) : formatReadingFacts(facts)) + "\n");
}
