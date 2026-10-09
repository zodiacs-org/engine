/*
 * Shows that each assertion in calc-types-cover-vedic.ts can fail. For each
 * fault below, it copies the installed @zodiacs/engine into a temporary
 * folder, makes one change to dist/calc.d.ts there, compiles the type check
 * against the copy, and records whether tsc refused it and which lines it
 * named. The installed package is not touched. Prints a JSON record.
 *
 *   node docs/evidence/checkpoint22-rc2-20261009/tools/plant-type-faults.mjs \
 *     > docs/evidence/checkpoint22-rc2-20261009/results/calc-types-faults.json
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const site = process.cwd();
const check = join(here, 'calc-types-cover-vedic.ts');
const engine = resolve(site, 'node_modules/@zodiacs/engine');
const version = JSON.parse(readFileSync(join(engine, 'package.json'), 'utf8')).version;

/**
 * Each fault replaces the nth occurrence (from 1) of `from` with `to`, which
 * must occur `count` times in the declarations, and names the assertion it
 * should break.
 */
const FAULTS = [
  { name: 'a built-in ayanamsa left out', from: 'type CalcAyanamsa = AyanamsaName;', to: 'type CalcAyanamsa = Exclude<AyanamsaName, "raman">;', nth: 1, count: 1, breaks: 'BuiltIns' },
  { name: 'a precession model left out', from: 'type CalcAyanamsaModel = AyanamsaPrecessionModel;', to: 'type CalcAyanamsaModel = Exclude<AyanamsaPrecessionModel, "iau1976">;', nth: 1, count: 1, breaks: 'Models' },
  { name: "a caller's field left out (value)", from: '    readonly value: number;\n', to: '', nth: 1, count: 1, breaks: 'CallerFields' },
  { name: 'an optional field made required (rate)', from: 'readonly rate?: number;', to: 'readonly rate: number;', nth: 1, count: 1, breaks: 'CallerOptional' },
  { name: 'the name narrowed to "user"', from: 'readonly name?: string;', to: 'readonly name?: "user";', nth: 1, count: 1, breaks: 'CallerName' },
  { name: 'the value narrowed to 0', from: 'readonly value: number;', to: 'readonly value: 0;', nth: 1, count: 1, breaks: 'CallerValue' },
  { name: 'the rate made unusable (never)', from: 'readonly rate?: number;', to: 'readonly rate?: never;', nth: 1, count: 1, breaks: 'CallerRate' },
  { name: 'the model narrowed to "engine"', from: 'readonly model?: CalcAyanamsaModel;', to: 'readonly model?: "engine";', nth: 1, count: 1, breaks: 'CallerModel' },
  { name: 'the epoch narrowed to a TT Julian date', from: 'readonly epoch: CalcTime;', to: 'readonly epoch: { readonly jd: number; readonly scale: "tt" };', nth: 1, count: 1, breaks: 'EpochIso' },
  { name: 'the epoch made unusable (never)', from: 'readonly epoch: CalcTime;', to: 'readonly epoch: never;', nth: 1, count: 1, breaks: 'EpochTT' },
  { name: 'the epoch without a Date', from: 'readonly epoch: CalcTime;', to: 'readonly epoch: Exclude<CalcTime, Date>;', nth: 1, count: 1, breaks: 'EpochDate' },
  { name: 'the epoch without UT1', from: 'readonly epoch: CalcTime;', to: 'readonly epoch: string | Date | { readonly jd: number; readonly scale: "tt" | "utc" };', nth: 1, count: 1, breaks: 'EpochUT1' },
  { name: 'the epoch widened to anything (unknown)', from: 'readonly epoch: CalcTime;', to: 'readonly epoch: unknown;', nth: 1, count: 1, breaks: 'EpochForms' },
  { name: "a caller's ayanamsa left out of the zodiac", from: 'readonly sidereal: CalcAyanamsa | CalcUserAyanamsa;', to: 'readonly sidereal: CalcAyanamsa;', nth: 1, count: 1, breaks: 'Zodiac' },
  { name: 'calc() without the zodiac', from: '    readonly zodiac?: CalcZodiac;\n', to: '', nth: 1, count: 4, breaks: 'Calc' },
  { name: 'houses() without the zodiac', from: '    readonly zodiac?: CalcZodiac;\n', to: '', nth: 2, count: 4, breaks: 'Houses' },
  { name: 'events() without the zodiac', from: '    readonly zodiac?: CalcZodiac;\n', to: '', nth: 3, count: 4, breaks: 'Events' },
  { name: 'chart() without the zodiac', from: '    readonly zodiac?: CalcZodiac;\n', to: '', nth: 4, count: 4, breaks: 'Chart' },
  { name: 'the epoch without UTC', from: 'readonly epoch: CalcTime;', to: 'readonly epoch: string | Date | { readonly iso: string; readonly deltaT?: number } | { readonly jd: number; readonly scale: "tt" | "ut1"; readonly deltaT?: number };', nth: 1, count: 1, breaks: 'EpochUTC' },
  { name: 'the epoch refusal reason renamed', from: 'readonly reason: "epoch-out-of-range";', to: 'readonly reason: "out-of-epoch-range";', nth: 1, count: 1, breaks: 'RefusalReasons' },
  { name: 'the epoch refusal span omitted', from: '    readonly epochSpan: typeof EPHEMERIS_SPAN;\n', to: '', nth: 1, count: 1, breaks: 'EpochRefusalFields' },
];

/** The line in the check that declares each assertion. */
const checkLines = readFileSync(check, 'utf8').split('\n');
const lineOf = (name) => checkLines.findIndex((line) => line.startsWith(`export type ${name} =`)) + 1;

function replaceNth(text, from, to, nth, count) {
  const occurrences = text.split(from).length - 1;
  if (occurrences !== count) throw new Error(`${JSON.stringify(from)} occurs ${occurrences} times, expected ${count}`);
  let at = -1;
  for (let seen = 0; seen < nth; seen += 1) {
    at = text.indexOf(from, at + 1);
    if (at < 0) throw new Error(`occurrence ${nth} of ${JSON.stringify(from)} not found`);
  }
  return text.slice(0, at) + to + text.slice(at + from.length);
}

function compile(dts) {
  const folder = mkdtempSync(join(tmpdir(), 'calc-type-fault-'));
  try {
    writeFileSync(join(folder, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    const modules = join(folder, 'node_modules');
    mkdirSync(join(modules, '@zodiacs'), { recursive: true });
    mkdirSync(join(modules, '@types'), { recursive: true });
    cpSync(engine, join(modules, '@zodiacs/engine'), { recursive: true, dereference: true });
    writeFileSync(join(modules, '@zodiacs/engine/dist/calc.d.ts'), dts);
    symlinkSync(resolve(site, 'node_modules/typescript'), join(modules, 'typescript'));
    symlinkSync(resolve(site, 'node_modules/@types/node'), join(modules, '@types/node'));
    symlinkSync(resolve(site, 'node_modules/undici-types'), join(modules, 'undici-types'));
    mkdirSync(join(folder, 'tools'));
    cpSync(check, join(folder, 'tools/calc-types-cover-vedic.ts'));
    const tsc = spawnSync(process.execPath, [
      join(modules, 'typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'nodenext', '--moduleResolution', 'nodenext',
      '--target', 'es2022', '--types', 'node', 'tools/calc-types-cover-vedic.ts',
    ], { cwd: folder, encoding: 'utf8' });
    const errors = tsc.stdout.split('\n').filter((line) => line.includes('error TS'));
    return { exit: tsc.status, lines: [...new Set(errors.map((line) => Number(/\((\d+),\d+\)/u.exec(line)?.[1])))].sort((a, b) => a - b), errors };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const original = readFileSync(join(engine, 'dist/calc.d.ts'), 'utf8');
const control = compile(original);
const faults = FAULTS.map((fault) => {
  const result = compile(replaceNth(original, fault.from, fault.to, fault.nth, fault.count));
  const expectedLine = lineOf(fault.breaks);
  return {
    fault: fault.name,
    breaks: fault.breaks,
    line: expectedLine,
    refused: result.exit !== 0,
    refusedAtThatLine: result.lines.includes(expectedLine),
    linesNamed: result.lines,
  };
});

process.stdout.write(`${JSON.stringify({
  schema: 'zodiacs.calc-type-faults.v1',
  what: 'Each fault changes one thing in a copy of the installed engine\'s dist/calc.d.ts; the type check is compiled against the copy. refusedAtThatLine: tsc named the line of the assertion the fault breaks.',
  engine: version,
  control: { refused: control.exit !== 0, errors: control.errors },
  faults,
  caught: faults.filter((fault) => fault.refusedAtThatLine).length,
  of: faults.length,
}, null, 1)}\n`);
if (control.exit !== 0 || faults.some((fault) => !fault.refusedAtThatLine)) process.exitCode = 1;
