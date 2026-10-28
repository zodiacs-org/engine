/**
 * Removes en and em dashes from a reading, deterministically and without a
 * model call. The dashes handled are U+2012 (figure dash), U+2013 (en dash),
 * U+2014 (em dash), U+2015 (horizontal bar) and U+2212 (minus sign).
 *
 * In order:
 *  1. A minus sign before a number ("−3") becomes "-".
 *  2. A dash between two point names ("Moon–Saturn", "Sun – Moon") becomes
 *     a hyphen: "Moon-Saturn".
 *  3. A range between numbers, dates, months or weekdays ("3–5",
 *     "2026-11-01–2026-11-05", "November–January") becomes " to " (" and "
 *     after "between").
 *     An unspaced en dash between other words ("push–pull") becomes a hyphen.
 *  4. Two clause dashes in one sentence ("X — an aside — Y") become commas.
 *  5. A single clause dash becomes a colon when a list follows it ("three
 *     things — A, B and C"), a full stop when a new capitalised sentence
 *     follows ("— This is"), and otherwise a comma.
 *  6. Anything left becomes a hyphen between letters, or else a comma.
 *
 * URLs (bare, autolinked and markdown link targets), inline code and fenced
 * code blocks are left untouched.
 */

export const DASH_CLASS = "\\u2012\\u2013\\u2014\\u2015\\u2212";
const D = `[${DASH_CLASS}]`;
const DASH_RE = new RegExp(D, "g");

/** Point names joined by a hyphen when a dash stands between two of them. */
const POINT_NAMES = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
  "Chiron", "Lilith", "North Node", "South Node", "Node", "Ascendant", "Descendant", "Midheaven",
  "IC", "MC", "ASC", "DSC", "AC", "DC", "Fortune", "Lot of Fortune", "Part of Fortune"
];
const POINT_RE = `(?:${[...POINT_NAMES].sort((a, b) => b.length - a.length).join("|")})`;

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const WEEKDAYS = "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday";
/** The end of a range's first side and the start of its second. */
const RANGE_LEFT = `(?:\\d[°'′"″%]?|\\b(?:${MONTHS}|${WEEKDAYS}))`;
const RANGE_RIGHT = `(?:\\d|(?:${MONTHS}|${WEEKDAYS})\\b)`;

/** Words that open a new sentence after a dash ("— This means"): a full stop rather than a comma. */
const SENTENCE_OPENERS = /^(?:This|That|These|Those|It|It's|They|You|You're|We|There|Here|Then|So|But|Yet|Still)\b/;

export interface DedashResult {
  text: string;
  /** Dashes in the input outside protected spans. */
  before: number;
  /** Dashes left outside protected spans (always 0). */
  after: number;
  /** Dashes inside URLs, inline code and code blocks, left as they are. */
  protectedDashes: number;
}

/** Counts the dashes this module removes, in the whole text. */
export function countDashes(text: string): number {
  return (text.match(DASH_RE) ?? []).length;
}

// Placeholders use private-use characters that never occur in a reading.
const OPEN = "";
const CLOSE = "";

function protect(text: string): { text: string; saved: string[] } {
  const saved: string[] = [];
  const hold = (s: string) => `${OPEN}${saved.push(s) - 1}${CLOSE}`;
  const out = text
    // Fenced code blocks: ``` or ~~~ to the matching fence, or to the end.
    .replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1?[ \t]*\2[`~]*[ \t]*$|(?![\s\S]))/gm, (m) => hold(m))
    // Inline code.
    .replace(/(`+)[^`\n]*?\1/g, (m) => hold(m))
    // Markdown link and image targets: keep "(url "title")" after "]".
    .replace(/\]\([^)\s]*(?:\s+"[^"]*")?\)/g, (m) => hold(m))
    // Autolinks and bare URLs.
    .replace(/<(?:https?|ftp|mailto):[^>\s]*>/gi, (m) => hold(m))
    .replace(/\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>()\]]*[^\s<>()\].,;:!?'"]/gi, (m) => hold(m));
  return { text: out, saved };
}

function restore(text: string, saved: string[]): string {
  const re = new RegExp(`${OPEN}(\\d+)${CLOSE}`, "g");
  // Placeholders can nest (a URL inside a code span is held by the span first), so restore until none are left.
  let out = text;
  while (re.test(out)) out = out.replace(re, (_, i: string) => saved[Number(i)]!);
  return out;
}

/** A sentence-level replacement for one clause dash, given the text on each side. */
function clauseJoin(left: string, right: string, kind: "comma" | "colon" | "stop"): { left: string; join: string; right: string } {
  const l = left.replace(/[ \t]+$/, "");
  const r = right.replace(/^[ \t]+/, "");
  if (l.trim() === "") return { left: left.replace(/[ \t]+/g, " "), join: "", right: r };
  // The dash is next to punctuation already: drop it.
  if (/^[,.;:!?)\]]/.test(r) || r === "" || r.startsWith("\n")) return { left: l, join: "", right: r };
  if (/[,;:(\[]$/.test(l)) return { left: l, join: " ", right: r };
  if (kind === "stop") {
    if (/[.!?]["')\]]?$/.test(l)) return { left: l, join: " ", right: r };
    return { left: l, join: ". ", right: r };
  }
  return { left: l, join: kind === "colon" ? ": " : ", ", right: r };
}

/** True when the words after a dash, to the sentence's end, read as a list: "A, B and C". */
function isList(rest: string): boolean {
  const tail = rest.split(/[.!?](?:\s|$)|\n/)[0]!.trim();
  if (/[;:]/.test(tail)) return false;
  const commas = (tail.match(/,/g) ?? []).length;
  return commas >= 2 || (commas >= 1 && /,? (?:and|or) \S/.test(tail));
}

/** Splits a line into sentences, keeping the separators. */
function sentences(line: string): string[] {
  return line.split(/(?<=[.!?]["')\]]?)(?=\s+)/);
}

const CLAUSE_DASH = new RegExp(`[ \\t]*${D}[ \\t]*`, "g");

function dedashSentence(s: string, lineStart: boolean): string {
  const dashes = [...s.matchAll(CLAUSE_DASH)];
  if (dashes.length === 0) return s;
  let out = "";
  let pos = 0;
  // Pairs of dashes around an aside: an even count, each pair turned into commas.
  const paired = dashes.length >= 2 && dashes.length % 2 === 0;
  dashes.forEach((m, k) => {
    const start = m.index!;
    const end = start + m[0].length;
    const right = s.slice(end);
    let kind: "comma" | "colon" | "stop" = "comma";
    if (!paired) {
      // A dash at the start of a line is a list marker.
      if (lineStart && k === 0 && s.slice(0, start).trim() === "") {
        out += s.slice(pos, start) + "- ";
        pos = end;
        return;
      }
      if (SENTENCE_OPENERS.test(right.replace(/^[ \t]+/, ""))) kind = "stop";
      else if (isList(right)) kind = "colon";
    }
    const joined = clauseJoin(out + s.slice(pos, start), right, kind);
    out = joined.left + joined.join;
    pos = s.length - joined.right.length;
  });
  return out + s.slice(pos);
}

export function dedash(input: string): DedashResult {
  const total = countDashes(input);
  const { text: held, saved } = protect(input);
  const before = countDashes(held);
  let t = held;
  // 1. Minus sign before a number.
  t = t.replace(/(^|[\s(\[=~≈<>])−(?=\d)/gm, "$1-");
  // 2. Point to point.
  const pointPair = new RegExp(`\\b(${POINT_RE})[ \\t]*${D}[ \\t]*(?=${POINT_RE}\\b)`, "g");
  t = t.replace(pointPair, "$1-");
  // 3. Ranges.
  const range = new RegExp(`(\\bbetween\\s+)?(\\S*?${RANGE_LEFT})[ \\t]*${D}[ \\t]*(?=${RANGE_RIGHT})`, "g");
  t = t.replace(range, (_, between: string | undefined, left: string) => between ? `${between}${left} and ` : `${left} to `);
  // An unspaced en or figure dash between words is a compound: "push–pull".
  t = t.replace(/(?<=\p{L})[\u2012\u2013](?=\p{L})/gu, "-");
  // 4 and 5. Clause dashes, sentence by sentence.
  t = t.split("\n").map((line) => sentences(line).map((s, i) => dedashSentence(s, i === 0)).join("")).join("\n");
  // 6. Whatever is left.
  t = t.replace(new RegExp(`(?<=\\p{L})${D}(?=\\p{L})`, "gu"), "-").replace(new RegExp(`[ \\t]*${D}[ \\t]*`, "g"), ", ");
  const after = countDashes(t);
  const text = restore(t, saved);
  return { text, before, after, protectedDashes: total - before };
}
