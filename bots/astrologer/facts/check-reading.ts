/**
 * Checks a reading against its facts sheet: every aspect, transit or station
 * contact the reading names (two points and an aspect word, in either order)
 * must be a line of the sheet with the same aspect type and, for transits and
 * stations, the same direction (the moving body first, the natal point
 * second).
 *
 * Command line: `check-cli.ts`.
 *
 * The parser is a heuristic over plain English, written for the readings the
 * bot produces. It finds a point name, an aspect word and a point name close
 * together in one clause; it does not understand negation beyond "no" and
 * "not" between them, nor which chart of a fold or gap a sentence is about
 * (a relation on any chart of the sheet passes).
 */
// ------------------------------------------------------------------ vocabulary

export const POINTS = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
  "North Node", "Ascendant", "Midheaven"
] as const;
export type Point = (typeof POINTS)[number];

export type AspectType =
  | "conjunction" | "sextile" | "square" | "trine" | "opposition"
  | "semisextile" | "semisquare" | "quintile" | "sesquiquadrate" | "biquintile" | "quincunx";

/** Words for a point, after "North Node" is joined into one token. */
const POINT_WORDS: Record<string, { point: Point; flip?: boolean }> = {
  Sun: { point: "Sun" }, Moon: { point: "Moon" }, Mercury: { point: "Mercury" }, Venus: { point: "Venus" },
  Mars: { point: "Mars" }, Jupiter: { point: "Jupiter" }, Saturn: { point: "Saturn" }, Uranus: { point: "Uranus" },
  Neptune: { point: "Neptune" }, Pluto: { point: "Pluto" },
  NorthNode: { point: "North Node" }, Node: { point: "North Node" },
  Ascendant: { point: "Ascendant" }, ASC: { point: "Ascendant" }, Asc: { point: "Ascendant" }, AC: { point: "Ascendant" },
  Midheaven: { point: "Midheaven" }, MC: { point: "Midheaven" },
  // The opposite angles: an aspect to one is the matching aspect to the other.
  Descendant: { point: "Ascendant", flip: true }, DSC: { point: "Ascendant", flip: true }, DC: { point: "Ascendant", flip: true },
  IC: { point: "Midheaven", flip: true }
};

const ASPECT_WORDS: Record<string, AspectType> = {};
const addWords = (type: AspectType, words: string[]) => { for (const w of words) ASPECT_WORDS[w] = type; };
addWords("conjunction", ["conjunction", "conjunctions", "conjunct", "conjuncts", "conjoin", "conjoins", "conjoined", "conjoining", "conjunctive", "meet", "meets", "meeting", "met"]);
addWords("sextile", ["sextile", "sextiles", "sextiled", "sextiling"]);
addWords("square", ["square", "squares", "squared", "squaring"]);
addWords("trine", ["trine", "trines", "trined", "trining"]);
addWords("opposition", ["opposition", "oppositions", "oppose", "opposes", "opposed", "opposing", "opposite"]);
addWords("semisextile", ["semisextile", "semi-sextile"]);
addWords("semisquare", ["semisquare", "semi-square"]);
addWords("quintile", ["quintile"]);
addWords("sesquiquadrate", ["sesquiquadrate", "sesquisquare", "sesqui-square"]);
addWords("biquintile", ["biquintile"]);
addWords("quincunx", ["quincunx", "inconjunct", "inconjunction"]);

/** Words skipped when looking past a list item for the aspect word of another relation. */
const BEYOND_FILLER = new Set(["to", "of", "with", "direct", "retrograde", "station", "stations", "stationing", "turning", "turns", "s"]);
/** After "on" and a point: the point is part of a group or axis, not the conjunction partner. */
const GROUP_WORDS = new Set(["axis", "cluster", "stellium", "group", "pair", "line"]);

/** Aspect words that name the aspect itself, as in "the Jupiter-Neptune opposition". */
const NOUNS = new Set(["conjunction", "sextile", "square", "trine", "opposition", "semisextile", "semisquare", "quintile", "sesquiquadrate", "biquintile", "quincunx", "inconjunct"]);

const FLIP: Partial<Record<AspectType, AspectType>> = { conjunction: "opposition", opposition: "conjunction", sextile: "trine", trine: "sextile" };

const STATION_WORDS = new Set(["station", "stations", "stationing", "stationary", "stationed"]);
/** "retrograde" and "direct" name a station only after a turning verb, or in a dated sentence. */
const TURN_WORDS = new Set(["turns", "turning", "turned", "turn", "goes", "going"]);
const MOTION_WORDS = new Set(["retrograde", "direct"]);
const TRANSIT_WORDS = new Set(["transiting", "transit", "transits"]);
const NATAL_WORDS = new Set(["natal", "your", "birth"]);
const MONTHS = /^(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\.?$/i;
const SIGN_WORDS = new Set(["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]);
/** Words that end the search for a point before one is found: a new clause or a rulership, not the same relation. */
const STOP_WORDS = new Set(["and", "then", "while", "but", "which", "whereas", "or", "so", "because", "since", "after", "before", "until", "when", "whose", "who", "rules", "ruler", "ruling", "rule", "ruled", "lord", "dispositor"]);
/** Words that do not count toward the reach between a point and an aspect word, with the date words below. */
const REACH_FREE = new Set(["the", "your", "natal", "transiting", "its", "own", "to", "of", "with", "both", "exactly", "exact", "again", "also", "on", "around", "-"]);
const DATE_WORD = /^(\d[\d\-]*|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)$/;
/** Words that may sit between a point and "on" in "the Moon is on the Ascendant" or "Mars stationing retrograde on your Sun". */
const ON_FILLER = new Set(["is", "sits", "sitting", "lies", "falls", "in", "exactly", "right", "directly", "the", "your", "natal", "its", "own", "stationing", "stations", "station", "turning", "turns", "retrograde", "direct", "close", "to", "a", "an", "while"]);

// ------------------------------------------------------------------ the sheet

export type RelationKind = "natal" | "transit" | "station";

export interface Relation {
  id: string;
  kind: RelationKind;
  /** Natal aspects: the sheet's order. Transits and stations: the moving body. */
  a: Point;
  /** Natal aspects: the sheet's order. Transits and stations: the natal point. */
  b: Point;
  type: AspectType;
  line: string;
}

const POINT_RE = POINTS.join("|");
const TYPE_RE = "conjunction|sextile|square|trine|opposition|semisextile|semisquare|quintile|sesquiquadrate|biquintile|quincunx";
const SHEET_PATTERNS: [RelationKind, RegExp][] = [
  ["natal", new RegExp(`\\[(A\\d+)\\] \\d+\\. (${POINT_RE}) (${TYPE_RE}) (${POINT_RE}), orb`)],
  ["transit", new RegExp(`\\[(T\\d+)\\] transiting (${POINT_RE}) (${TYPE_RE}) natal (${POINT_RE})`)],
  ["station", new RegExp(`\\[(S\\d+[a-z])\\] stationing (${POINT_RE}) (${TYPE_RE}) natal (${POINT_RE})`)]
];

export interface Sheet {
  relations: Relation[];
  /** Every ID on the sheet, with its line. */
  ids: Map<string, string>;
}

/** Reads the relations and IDs from a sheet written by `formatReadingFacts`. */
export function parseSheet(text: string): Sheet {
  const relations: Relation[] = [];
  const ids = new Map<string, string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const tag = /\[([A-Z]\d+[a-z]?)\]/.exec(line);
    if (tag && !ids.has(tag[1]!)) ids.set(tag[1]!, line.slice(tag.index));
    for (const [kind, re] of SHEET_PATTERNS) {
      const m = re.exec(line);
      if (m) relations.push({ id: m[1]!, kind, a: m[2] as Point, type: m[3] as AspectType, b: m[4] as Point, line: line.slice(m.index) });
    }
  }
  return { relations, ids };
}

// ------------------------------------------------------------------ the reading

interface Token {
  text: string;
  /** Lower case, with a possessive 's removed. */
  word: string;
  point?: { point: Point; flip?: boolean };
  aspect?: AspectType;
  /** A list joiner between two points: "and", "&", ",", "/", "-". */
  joiner?: boolean;
  id?: string;
}

function tokenize(clause: string): Token[] {
  const joined = clause.replace(/North Node/g, "NorthNode").replace(/[\u2013\u2014]/g, " - ");
  const raw = joined.match(/\[[A-Z]\d+[a-z]?\]|[A-Za-z]+(?:['’]s)?|\d+(?:[°'.:\-/]\d*)*'?|[,&/\-]/g) ?? [];
  return raw.map((text) => {
    const id = /^\[([A-Z]\d+[a-z]?)\]$/.exec(text)?.[1];
    if (id) return { text, word: text, id };
    const bare = text.replace(/['’]s$/, "");
    const word = bare.toLowerCase();
    const t: Token = { text, word };
    if (POINT_WORDS[bare]) t.point = POINT_WORDS[bare];
    if (ASPECT_WORDS[word]) t.aspect = ASPECT_WORDS[word];
    if (word === "and" || word === "&" || word === "," || word === "/" || word === "-") t.joiner = true;
    return t;
  });
}

export interface Mention {
  a: Point;
  b: Point;
  type: AspectType;
  /** "transit" when the clause marks the first point as moving (transiting, natal on the other side, a date, a station or a return). */
  context: "transit" | "station" | "any";
  /** The sheet ID quoted right before the mention, if any. */
  cited: string | null;
  /** The words of the mention. */
  text: string;
  /** The sentence it is in. */
  sentence: string;
}


/**
 * Points next to `start`, walking in `step` direction: up to `reach` filler
 * tokens to the first point (tokens in `free` do not count), then a list of
 * points joined by joiners. A stop word, a comma, another aspect word or an
 * ID ends the search before a point is found. In the list, ", and" ends it
 * (a new clause), and so does a point that is followed, further on, by an
 * aspect word (the subject of another relation).
 */
function pointsNear(tokens: Token[], start: number, step: 1 | -1, reach: number, free?: Set<string>): { indices: number[]; negated: boolean } {
  const indices: number[] = [];
  let negated = false;
  let i = start + step;
  let skipped = 0;
  while (i >= 0 && i < tokens.length) {
    const t = tokens[i]!;
    if (t.point) break;
    if (t.aspect || t.id || STOP_WORDS.has(t.word) || t.word === ",") return { indices, negated };
    if (t.word === "no" || t.word === "not" || t.word === "never" || t.word === "without") negated = true;
    if (!(free?.has(t.word) || (free === ON_FILLER && SIGN_WORDS.has(t.word)) || (free === REACH_FREE && DATE_WORD.test(t.word)))) skipped += 1;
    if (skipped > reach) return { indices, negated };
    i += step;
  }
  const filler = (k: number) => k >= 0 && k < tokens.length && (NATAL_WORDS.has(tokens[k]!.word) || tokens[k]!.word === "the" || TRANSIT_WORDS.has(tokens[k]!.word));
  while (i >= 0 && i < tokens.length && tokens[i]!.point) {
    indices.push(i);
    let j = i + step;
    const joiners: string[] = [];
    while (j >= 0 && j < tokens.length && (tokens[j]!.joiner || filler(j))) {
      if (tokens[j]!.joiner) joiners.push(tokens[j]!.word);
      j += step;
    }
    if (joiners.length === 0 || j < 0 || j >= tokens.length || !tokens[j]!.point) break;
    if (joiners.includes(",") && joiners.includes("and")) break;
    // "Venus and Neptune's station", "Mercury and the Mars-North Node conjunction": a new subject.
    if (step === 1 && joiners.includes("and") && (/['\u2019]s$/.test(tokens[j]!.text) || (tokens[j + 1]?.word === "-" && tokens[j + 2]?.point))) break;
    let beyond = j + step;
    while (beyond >= 0 && beyond < tokens.length && (filler(beyond) || BEYOND_FILLER.has(tokens[beyond]!.word))) beyond += step;
    const after = tokens[beyond];
    if (after && (after.aspect || after.word === "on")) break;
    i = j;
  }
  return { indices, negated };
}

/** The words just before a point (up to two), for "natal" and "transiting" marks. */
function marks(tokens: Token[], index: number): { natal: boolean; transiting: boolean } {
  const before = tokens.slice(Math.max(0, index - 2), index).map((t) => t.word);
  return { natal: before.some((w) => NATAL_WORDS.has(w)), transiting: before.some((w) => TRANSIT_WORDS.has(w)) };
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/;
const CLAUSE_SPLIT = /[;:()]/;

const hasDate = (tokens: Token[]) => tokens.some((t, i) =>
  /^\d{4}-\d{2}-\d{2}$/.test(t.text) || (MONTHS.test(t.word) && t.text[0] !== t.word[0]) || (/^\d{1,2}$/.test(t.text) && MONTHS.test(tokens[i + 1]?.word ?? "")));

/** True when the tokens describe a station: a station word, a turning verb before retrograde or direct, or retrograde or direct in a dated sentence. */
const isStation = (tokens: Token[], dated: boolean) => tokens.some((t, i) =>
  STATION_WORDS.has(t.word) || (MOTION_WORDS.has(t.word) && (dated || TURN_WORDS.has(tokens[i - 1]?.word ?? ""))));


/** A date within `span` tokens before `from` or after `to`, stopping at a comma or stop word. */
function dateNear(tokens: Token[], from: number, to: number, span: number): boolean {
  const isDateAt = (k: number) => {
    const t = tokens[k]!;
    return /^\d{4}-\d{2}-\d{2}$/.test(t.text) || (MONTHS.test(t.word) && t.text[0] !== t.word[0]) || (/^\d{1,2}$/.test(t.text) && MONTHS.test(tokens[k + 1]?.word ?? ""));
  };
  for (const [startAt, step] of [[from - 1, -1], [to + 1, 1]] as const) {
    for (let k = startAt, n = 0; k >= 0 && k < tokens.length && n < span; k += step, n += 1) {
      if (tokens[k]!.word === "," || STOP_WORDS.has(tokens[k]!.word) || tokens[k]!.aspect) break;
      if (isDateAt(k)) return true;
    }
  }
  return false;
}

/** Every relation the reading names. */
export function findMentions(reading: string): Mention[] {
  const out: Mention[] = [];
  for (const sentence of reading.split(SENTENCE_SPLIT)) {
    const sentenceDated = hasDate(tokenize(sentence));
    // A station sentence: the planet just before a station word is the default first point for later aspect words.
    let stationSubject: Point | null = null;
    for (const clause of sentence.split(CLAUSE_SPLIT)) {
      const tokens = tokenize(clause);
      const station = isStation(tokens, sentenceDated);
      const moving: Mention["context"] = station ? "station" : "transit";
      const stationAt = new Map<number, Point>();
      tokens.forEach((t, k) => {
        if (!STATION_WORDS.has(t.word) && !(MOTION_WORDS.has(t.word) && (sentenceDated || TURN_WORDS.has(tokens[k - 1]?.word ?? "")))) return;
        for (let b = k - 1; b >= Math.max(0, k - 3); b -= 1) if (tokens[b]!.point) { stationAt.set(k, tokens[b]!.point!.point); break; }
      });
      const emit = (ai: number | null, a: Point, bi: number | null, b: Point, type: AspectType, at: number, context: Mention["context"]) => {
        const first = ai ?? at;
        let cited: string | null = null;
        for (let k = first - 1; k >= Math.max(0, first - 4); k -= 1) if (tokens[k]!.id) { cited = tokens[k]!.id!; break; }
        let x = a;
        let y = b;
        if (ai !== null && bi !== null) {
          const ma = marks(tokens, ai);
          const mb = marks(tokens, bi);
          if (ma.transiting) context = moving;
          // "your natal Sun ... transiting Mars": the moving body is the second.
          if (mb.transiting || (ma.natal && !mb.natal && context !== "any")) { x = b; y = a; context = moving; }
        }
        const lo = Math.min(first, bi ?? at, at);
        const hi = Math.max(first, bi ?? at, at);
        if (context === "any" && dateNear(tokens, lo, hi, 5)) context = moving;
        out.push({ a: x, b: y, type, context, cited, text: tokens.slice(lo, hi + 1).map((t) => t.text).join(" "), sentence: sentence.trim() });
      };
      for (let i = 0; i < tokens.length; i += 1) {
        const t = tokens[i]!;
        const next = tokens[i + 1];
        if (stationAt.has(i)) stationSubject = stationAt.get(i)!;
        // "solar return" in a dated sentence: the Sun conjunct its natal place.
        if (t.word === "solar") {
          const r = next?.word === "-" ? i + 2 : i + 1;
          if (/^returns?$/.test(tokens[r]?.word ?? "")) {
            if (sentenceDated) emit(null, "Sun", null, "Sun", "conjunction", i, "transit");
            i = r;
            continue;
          }
        }
        // "X returns (to its natal place)": X conjunct natal X.
        if (/^(return|returns|returning|returned)$/.test(t.word)) {
          const left = pointsNear(tokens, i, -1, 0, new Set(["s"]));
          if (left.indices.length && !left.negated) emit(left.indices[0]!, tokens[left.indices[0]!]!.point!.point, null, tokens[left.indices[0]!]!.point!.point, "conjunction", i, "transit");
          continue;
        }
        const on = !t.aspect && t.word === "on";
        const type = t.aspect ?? (on ? "conjunction" : undefined);
        if (!type) continue;
        const left = on ? pointsNear(tokens, i, -1, 0, ON_FILLER) : pointsNear(tokens, i, -1, 1, REACH_FREE);
        const right = on ? pointsNear(tokens, i, 1, 0, ON_FILLER) : pointsNear(tokens, i, 1, 1, REACH_FREE);
        if (left.negated || right.negated) continue;
        let lefts = left.indices.map((k) => ({ k, p: tokens[k]!.point! }));
        let rights = right.indices.map((k) => ({ k, p: tokens[k]!.point! }));
        // "Mercury direct 14 Nov ...: trine natal Moon": the station's planet.
        if (!lefts.length && rights.length && stationSubject && !on) lefts = [{ k: -1, p: { point: stationSubject } }];
        // "on its own natal place": the subject itself.
        const selfRef = !rights.length && tokens.slice(i + 1, i + 4).some((x) => x.word === "its") && tokens.slice(i + 1, i + 6).some((x) => /^(place|position|degree|point)$/.test(x.word));
        if (selfRef && lefts.length) {
          const l = lefts[0]!;
          emit(l.k < 0 ? null : l.k, l.p.point, null, l.p.point, type, i, moving);
          continue;
        }
        if (on) {
          if (!lefts.length || !rights.length) continue;
          // "on your North Node axis", "on your Saturn-Mars cluster", "on your Sun trine": not a conjunction.
          const r = rights[0]!.k;
          let k = r + 1;
          if (tokens[k]?.word === "-") continue;
          while (k < tokens.length && REACH_FREE.has(tokens[k]!.word)) k += 1;
          if (tokens[k] && (GROUP_WORDS.has(tokens[k]!.word) || tokens[k]!.aspect)) continue;
          lefts = lefts.slice(0, 1);
          rights = rights.slice(0, 1);
        }
        // "the Jupiter-Neptune opposition", "Venus and Saturn are in trine": the pair before the noun.
        const hyphenPair = lefts.length === 2 && tokens.slice(lefts[1]!.k + 1, lefts[0]!.k).some((x) => x.word === "-");
        if (NOUNS.has(t.word) && lefts.length === 2 && (hyphenPair || !rights.length)) {
          rights = [lefts[0]!];
          lefts = lefts.slice(1);
        } else if (!lefts.length && rights.length === 2 && tokens.slice(i + 1, rights[0]!.k).some((x) => x.word === "between")) {
          // "a trine between Venus and Saturn".
          lefts = [rights[0]!];
          rights = rights.slice(1);
        }
        // "squared by", "opposed by": the right side is the moving body.
        if (next?.word === "by" && /ed$/.test(t.word)) [lefts, rights] = [rights, lefts];
        const context: Mention["context"] = station || (lefts[0]?.k === -1) ? "station" : "any";
        lefts.forEach((l, li) => rights.forEach((r, ri) => {
          // A point paired with itself only straight across the aspect word ("Sun opposition Sun"), never inside a list.
          if (l.p.point === r.p.point && (li > 0 || ri > 0)) return;
          const flips = (l.p.flip ? 1 : 0) + (r.p.flip ? 1 : 0);
          const actual = flips % 2 ? (FLIP[type] ?? type) : type;
          emit(l.k < 0 ? null : l.k, l.p.point, r.k, r.p.point, actual, i, l.p.point === r.p.point && context === "any" ? "transit" : context);
        }));
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ the check

export interface Violation {
  kind: "not-on-sheet" | "wrong-aspect" | "reversed" | "unknown-id" | "id-mismatch";
  mention: string;
  /** The sentence of the reading it is in. */
  sentence: string;
  /** What the reading names, as "A type B". */
  named: string;
  /** The sheet lines with the same two points, if any. */
  sheet: string[];
  message: string;
}

export interface CheckResult {
  ok: boolean;
  mentions: number;
  violations: Violation[];
  /** IDs the reading quotes. */
  cited: string[];
}

const same = (r: Relation, a: Point, b: Point, type: AspectType, kinds: RelationKind[], ordered: boolean) =>
  kinds.includes(r.kind) && r.type === type && (r.a === a && r.b === b || (!ordered && r.a === b && r.b === a));

/** Checks a reading against a sheet. */
export function checkReading(sheetText: string, reading: string): CheckResult {
  const sheet = parseSheet(sheetText);
  const violations: Violation[] = [];
  const cited = [...new Set([...reading.matchAll(/\[([A-Z]\d+[a-z]?)\]/g)].map((m) => m[1]!))];
  for (const id of cited) {
    if (!sheet.ids.has(id)) violations.push({ kind: "unknown-id", mention: `[${id}]`, sentence: "", named: `[${id}]`, sheet: [], message: `[${id}] is not an ID on the sheet.` });
  }
  const mentions = findMentions(reading);
  for (const m of mentions) {
    const named = `${m.a} ${m.type} ${m.b}`;
    const moving: RelationKind[] = m.context === "station" ? ["station", "transit"] : ["transit", "station"];
    const kinds: RelationKind[] = m.context === "any" ? ["natal", ...moving] : moving;
    const ok = sheet.relations.some((r) => r.kind === "natal" ? m.a !== m.b && same(r, m.a, m.b, m.type, kinds, false) : same(r, m.a, m.b, m.type, kinds, true));
    const pair = sheet.relations.filter((r) => (r.a === m.a && r.b === m.b) || (r.a === m.b && r.b === m.a));
    const lines = [...new Set(pair.map((r) => r.line))];
    if (ok) {
      if (m.cited && sheet.ids.has(m.cited)) {
        const r = sheet.relations.find((x) => x.id === m.cited);
        if (r && !(r.type === m.type && (r.a === m.a && r.b === m.b || (r.kind === "natal" && r.a === m.b && r.b === m.a)))) {
          violations.push({ kind: "id-mismatch", mention: m.text, sentence: m.sentence, named, sheet: [r.line], message: `quotes [${m.cited}] but names ${named}; [${m.cited}] is: ${r.line}` });
        }
      }
      continue;
    }
    const reversed = pair.filter((r) => r.kind !== "natal" && r.type === m.type && r.a === m.b && r.b === m.a && kinds.includes(r.kind));
    const otherType = pair.filter((r) => r.type !== m.type && kinds.includes(r.kind));
    if (reversed.length) {
      violations.push({ kind: "reversed", mention: m.text, sentence: m.sentence, named, sheet: lines, message: `names ${named} with the direction reversed; the sheet has: ${reversed.map((r) => r.line).join(" | ")}` });
    } else if (otherType.length) {
      violations.push({ kind: "wrong-aspect", mention: m.text, sentence: m.sentence, named, sheet: lines, message: `names ${named}, but the sheet gives a different aspect for these points: ${otherType.map((r) => r.line).join(" | ")}` });
    } else {
      const what = m.context === "any" ? "an aspect, transit or station contact" : m.context === "station" ? "a station contact or transit" : "a transit or station contact";
      violations.push({ kind: "not-on-sheet", mention: m.text, sentence: m.sentence, named, sheet: lines, message: `names ${named}, which is not ${what} on the sheet${lines.length ? `; the sheet has for these points: ${lines.join(" | ")}` : ""}` });
    }
  }
  return { ok: violations.length === 0, mentions: mentions.length, violations, cited };
}

/** The violations as a numbered list, for a revision prompt. */
export function formatViolations(result: CheckResult): string {
  return result.violations.map((v, i) => `${i + 1}. ${v.sentence ? `In "${v.sentence}": ` : ""}${v.message}`).join("\n");
}
