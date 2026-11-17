/*
 * The zone the owner held at tzdata 2025c (ZOD-282): America/Yellowknife.
 * tzdata 2026f's backzone comments its zone out with no NEWS entry or other
 * official announcement behind the change, so the package compiles tzdata
 * 2025c's backzone lines for it (scripts/tzdb-held/yellowknife-2025c.zi)
 * beside 2026f. The evidence scripts read the held file themselves, check it
 * against tzdata 2025c's own backzone, and compile it as the generator does;
 * they take nothing else from the generator.
 *
 * firstDifferenceFromDefault: the held lines and tzdata 2026f's default build
 * (America/Edmonton) agree from 1970 until this instant, where 2026f models
 * Alberta's move to permanent -06 (2026c NEWS). From 1970 the host answers,
 * so the name is not host-legal, as it was not on tzdata 2025c.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export const HELD = [
  {
    name: "America/Yellowknife",
    file: join(ROOT, "scripts/tzdb-held/yellowknife-2025c.zi"),
    release: "2025c",
    firstDifferenceFromDefault: Date.parse("2026-11-01T08:00:00Z") / 1000
  }
];

export const heldNames = new Set(HELD.map((zone) => zone.name));

/** The held file's zone lines: everything but its "##" header. */
export function heldLines(zone) {
  return readFileSync(zone.file, "utf8")
    .split("\n")
    .filter((line) => !line.startsWith("##"))
    .join("\n");
}

/** Throws unless the held lines stand byte for byte, as one block, in the given backzone text. */
export function checkVerbatim(zone, backzone) {
  const lines = heldLines(zone).replace(/\n$/, "");
  const at = backzone.indexOf(`${lines}\n`);
  if (at === -1) throw new Error(`held: ${zone.file} is not verbatim in tzdata ${zone.release}'s backzone`);
  const first = backzone.slice(0, at).split("\n").length;
  return { from: first, to: first + lines.split("\n").length - 1 };
}
