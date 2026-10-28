/**
 * Checks a reading against its facts sheet: every aspect, transit or station
 * contact the reading names (two points and an aspect word, in either order)
 * must be a line of the sheet with the same aspect type and, for transits and
 * stations, the same direction (the moving body first, the natal point
 * second).
 *
 * Command line: `check-cli.ts`.
 *
 * It also checks angle claims ("on the Ascendant", "the rising degree",
 * "Saturn rising", "on the MC-IC axis") against the sheet's natal
 * conjunctions and oppositions with the angles (also in other words: "the
 * rising edge", "the top of the chart", "on the horizon", "angular"), dates and
 * ages said of the birthday or the solar return against the sheet's next
 * birthday and solar return lines, every date, span and orb against the line
 * it is tied to, and each house or sign given for a planet against its natal
 * placement or, for a transiting or stationing planet, its transit or station
 * line (a planet named with no ID is read as the moving one in a dated
 * sentence, after "now" or "then", or in the 90 days). House, sign, chart and
 * planet rulers ("Mercury rules your second house", "the ruler of the Leo
 * second", "your tenth-house ruler", "its ruler, Jupiter") are checked
 * against the whole sign houses of the rising sign, the [R1] line and the
 * traditional rulers.
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
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const SIGN_RE = SIGNS.join("|");
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const TYPE_RE = "conjunction|sextile|square|trine|opposition|semisextile|semisquare|quintile|sesquiquadrate|biquintile|quincunx";
/** An ID's chart prefix on a two-chart sheet: `[B-T3]` is T3 of chart B. */
const CP = "(?:[AB]-)?";
/** An ID with the letter `l`, as a regular expression source. */
const ID = (l: string) => `\\[${CP}${l}\\d+\\]`;
/** Any ID, as a regular expression source. */
const ANY_ID = `${CP}[A-Z]\\d+[a-z]?`;
const SHEET_PATTERNS: [RelationKind, RegExp][] = [
  ["natal", new RegExp(`\\[(${CP}A\\d+)\\] \\d+\\. (${POINT_RE}) (${TYPE_RE}) (${POINT_RE}), orb`)],
  ["transit", new RegExp(`\\[(${CP}T\\d+)\\] transiting (${POINT_RE}) (${TYPE_RE}) natal (${POINT_RE})`)],
  ["station", new RegExp(`\\[(${CP}S\\d+[a-z])\\] stationing (${POINT_RE}) (${TYPE_RE}) natal (${POINT_RE})`)],
  ["natal", new RegExp(`\\[(${CP}C\\d+)\\] (${POINT_RE}) (conjunction|opposition) (Ascendant|Midheaven), orb`)],
  ["transit", new RegExp(`\\[(${CP}B\\d+)\\] Solar return \\(transiting (Sun) (conjunction) natal (Sun)`)]
];

export interface Sheet {
  relations: Relation[];
  /** Every ID on the sheet, with its line. */
  ids: Map<string, string>;
  /** The next birthday line: its date and the age reached, if the sheet has one. */
  birthday: { id: string; date: string; turns: number; line: string } | null;
  /** The solar return lines (one per chart version): exact local dates. */
  solarReturns: { id: string; date: string; line: string }[];
  /** The lines of planets on an angle, and the "none" line. */
  angleLines: string[];
  /** Natal signs and whole sign houses of each point, from the placement lines (a set: a fold or gap has two charts). */
  natal: Map<Point, { signs: Set<string>; houses: Set<number> }>;
  /** Points on an angle by a [C] line, or in an angular house by the [H] line. */
  angular: Set<Point>;
  /** Transit, station and solar return lines: the moving body, and the signs and houses the line gives it (none on older sheets). */
  moving: Map<string, { body: Point; signs: Set<string>; houses: Set<number> }>;
  /** ISO dates written on each ID's line; a station contact also carries its station's. */
  lineDates: Map<string, string[]>;
  /** Orbs written on each ID's line, as D°MM'. */
  lineOrbs: Map<string, string[]>;
  /** In-orb ranges of the transit lines. */
  ranges: { id: string; from: string; to: string; openStart: boolean; openEnd: boolean }[];
  /** The transit window, inclusive. */
  window: { from: string; to: string } | null;
  /** The birth date and other dates of the header lines, which any sentence may give. */
  baseDates: Set<string>;
  /** Every ISO date on the sheet. */
  allDates: Set<string>;
  /** The charts, "A" and, for a fold or gap, "B", in sheet order. */
  charts: string[];
  /** The chart of each ID under a chart heading (the lines before the first heading are shared). */
  chartOf: Map<string, string>;
  /** The heading of each chart ("earlier occurrence (clock on UTC+11:00)"). */
  chartLabels: Map<string, string>;
  /** Natal signs and houses by chart. */
  chartNatal: Map<string, Map<Point, { signs: Set<string>; houses: Set<number> }>>;
  /** The rising sign of each chart that has one. */
  rising: Map<string, string>;
  /** The chart ruler of each chart that has one (the [R1] line). */
  chartRulers: Map<string, Point>;
  /** Fold or gap: the offset each chart reads the clock time on, and which side of the change it is. */
  chartSides: Map<string, { side: "before" | "after"; offset: string }>;
  /** Each chart's dispositor chains (the [L] chain lines): the body, the planets its chain ends at (one in its own sign, or a loop), and the line. */
  chains: Map<string, { body: Point; end: Point[]; line: string }[]>;
  /** Each chart's final dispositor line: the planet, or null for "none", and the line. */
  finalDispositor: Map<string, { planet: Point | null; line: string }>;
  /** Each chart's rising sign line: the minutes earlier and later that change the rising sign (null when none in the search), and the line. */
  risingShift: Map<string, { earlier: number | null; later: number | null; line: string }>;
}

/** Reads the relations and IDs from a sheet written by `formatReadingFacts`. */
export function parseSheet(text: string): Sheet {
  const relations: Relation[] = [];
  const ids = new Map<string, string>();
  let birthday: Sheet["birthday"] = null;
  const solarReturns: Sheet["solarReturns"] = [];
  const angleLines: string[] = [];
  const natal: Sheet["natal"] = new Map();
  const angular = new Set<Point>();
  const moving: Sheet["moving"] = new Map();
  const lineDates: Sheet["lineDates"] = new Map();
  const lineOrbs: Sheet["lineOrbs"] = new Map();
  const ranges: Sheet["ranges"] = [];
  let window: Sheet["window"] = null;
  const baseDates = new Set<string>();
  const allDates = new Set<string>();
  const charts: string[] = [];
  const chartOf = new Map<string, string>();
  const chartLabels = new Map<string, string>();
  const chartNatal: Sheet["chartNatal"] = new Map();
  const rising = new Map<string, string>();
  const chartRulers = new Map<string, Point>();
  const chartSides: Sheet["chartSides"] = new Map();
  const chains: Sheet["chains"] = new Map();
  const finalDispositor: Sheet["finalDispositor"] = new Map();
  const risingShift: Sheet["risingShift"] = new Map();
  let chart: string | null = null;
  const natalOf = (p: Point) => {
    if (!natal.has(p)) natal.set(p, { signs: new Set(), houses: new Set() });
    const c = chart ?? "A";
    if (!chartNatal.has(c)) chartNatal.set(c, new Map());
    const byChart = chartNatal.get(c)!;
    if (!byChart.has(p)) byChart.set(p, { signs: new Set(), houses: new Set() });
    const both = [natal.get(p)!, byChart.get(p)!];
    return { signs: { add: (x: string) => both.forEach((n) => n.signs.add(x)) }, houses: { add: (x: number) => both.forEach((n) => n.houses.add(x)) } };
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    // "=== Chart A: earlier occurrence ... ===", or an older sheet's "=== Chart: earlier occurrence ... ===".
    const heading = /^=== Chart(?: ([AB]))?: (.*) ===$/.exec(line);
    if (heading) {
      chart = heading[1] ?? (charts.length === 0 ? "A" : "B");
      charts.push(chart);
      chartLabels.set(chart, heading[2]!.replace(/^[AB]: /, ""));
      const side = /offset (before|after) the change \((UTC[^)]*)\)|(earlier|later) occurrence \(clock on (UTC[^)]*)\)/.exec(heading[2]!);
      if (side) chartSides.set(chart, { side: (side[1] ?? (side[3] === "earlier" ? "before" : "after")) as "before" | "after", offset: side[2] ?? side[4]! });
      continue;
    }
    // "=== Both charts compared ... ===": lines of both charts.
    if (/^=== /.test(line)) { chart = null; continue; }
    const tag = new RegExp(`\\[(${ANY_ID})\\]`).exec(line);
    if (tag && !ids.has(tag[1]!)) ids.set(tag[1]!, line.slice(tag.index));
    const isoDates = [...line.matchAll(ISO_DATE)].map((m) => m[0]);
    for (const d of isoDates) allDates.add(d);
    if (!tag || /^(Person|Instant):/.test(line) || /^\[N\d+\]/.test(line)) for (const d of isoDates) baseDates.add(d);
    const win = /^Transits (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2}) inclusive/.exec(line);
    if (win) window = { from: win[1]!, to: win[2]! };
    if (tag) {
      const id = tag[1]!;
      if (chart) chartOf.set(id, chart);
      const ruler = new RegExp(`^${ID("R")} Chart ruler: (${POINT_RE}) \\((${SIGN_RE}) rising\\)`).exec(line.slice(tag.index));
      if (ruler) { chartRulers.set(chart ?? "A", ruler[1] as Point); rising.set(chart ?? "A", ruler[2]!); }
      // "[L2] Moon in Scorpio: domicile lord Mars. Chain: Moon → Mars → Jupiter → Moon (ends in a loop: Moon, Mars, Jupiter dispose one another)."
      const chain = new RegExp(`^${ID("L")} (${POINT_RE}) in (?:${SIGN_RE})?[^.]*\\. Chain: .*\\((ends at (${POINT_RE}), in its own sign|ends in a loop: ([^)]*) dispose one another|stops at the Moon)`).exec(line.slice(tag.index));
      if (chain) {
        const end = chain[3] ? [chain[3] as Point] : chain[4] ? chain[4].split(", ") as Point[] : ["Moon" as Point];
        const c = chart ?? "A";
        if (!chains.has(c)) chains.set(c, []);
        chains.get(c)!.push({ body: chain[1] as Point, end, line: line.slice(tag.index) });
      }
      const final = new RegExp(`^${ID("L")} Final dispositor: (none|${POINT_RE})`).exec(line.slice(tag.index));
      if (final) finalDispositor.set(chart ?? "A", { planet: final[1] === "none" ? null : final[1] as Point, line: line.slice(tag.index) });
      if (new RegExp(`^${ID("E")} Rising sign `).test(line.slice(tag.index))) {
        const by = (dir: string) => { const x = new RegExp(`(\\d+) minutes? ${dir} or more`).exec(line); return x ? Number(x[1]) : null; };
        risingShift.set(chart ?? "A", { earlier: by("earlier"), later: by("later"), line: line.slice(tag.index) });
      }
      const parent = /^(?:[AB]-)?S\d+[a-z]$/.test(id) ? id.slice(0, -1) : null;
      lineDates.set(id, [...(parent ? lineDates.get(parent) ?? [] : []), ...isoDates]);
      lineOrbs.set(id, [...line.matchAll(/\borb (\d+°\d{2}')/g)].map((m) => m[1]!));
      const place = new RegExp(`^${ID("P")} (${POINT_RE}) \\d+°\\d+' (${SIGN_RE})(?:, whole sign house (\\d+))?`).exec(line.slice(tag.index));
      if (place) {
        natalOf(place[1] as Point).signs.add(place[2]!);
        if (place[3]) natalOf(place[1] as Point).houses.add(Number(place[3]));
      }
      const angles = new RegExp(`^${ID("P")} Ascendant \\S+ (${SIGN_RE}); Midheaven \\S+ (${SIGN_RE}) \\(whole sign house (\\d+)\\)`).exec(line.slice(tag.index));
      if (angles) {
        natalOf("Ascendant").signs.add(angles[1]!);
        rising.set(chart ?? "A", angles[1]!);
        natalOf("Ascendant").houses.add(1);
        natalOf("Midheaven").signs.add(angles[2]!);
        natalOf("Midheaven").houses.add(Number(angles[3]));
      }
      const moonDay = new RegExp(`^${ID("P")} Moon: in (${SIGN_RE}) for the whole local date`).exec(line.slice(tag.index));
      if (moonDay) natalOf("Moon").signs.add(moonDay[1]!);
      // "Moon: changes sign during the local date: Aries then Taurus", "Mercury: changes sign ... (Aries then Taurus)".
      const daySigns = new RegExp(`^${ID("P")} (${POINT_RE}): changes sign during the local date`).exec(line.slice(tag.index));
      if (daySigns) for (const m of line.matchAll(new RegExp(`\\b(${SIGN_RE})\\b`, "g"))) natalOf(daySigns[1] as Point).signs.add(m[1]!);
      const onAngle = new RegExp(`^${ID("C")} (${POINT_RE}) (?:conjunction|opposition) (?:Ascendant|Midheaven)`).exec(line.slice(tag.index));
      if (onAngle) angular.add(onAngle[1] as Point);
      if (new RegExp(`^${ID("H")} Points in the angular houses`).test(line.slice(tag.index))) {
        for (const m of line.matchAll(new RegExp(`\\b(${POINT_RE})\\b`, "g"))) if (m.index! > line.indexOf("):")) angular.add(m[1] as Point);
      }
      const body = new RegExp(`^${ID("T")} transiting (${POINT_RE}) |^${ID("S")} (${POINT_RE}) stations |^${ID("B")} Solar return`).exec(line.slice(tag.index));
      if (body) {
        const entry = { body: (body[1] ?? body[2] ?? "Sun") as Point, signs: new Set<string>(), houses: new Set<number>() };
        // "transiting Saturn in Aries, whole sign house 7", "at 5°02' Scorpio, whole sign house 4".
        for (const m of line.matchAll(new RegExp(`\\b(?:in|at \\d+°\\d+') (${SIGN_RE})(?:, whole sign house (\\d+))?`, "g"))) {
          entry.signs.add(m[1]!);
          if (m[2]) entry.houses.add(Number(m[2]));
        }
        moving.set(id, entry);
        const range = /from (before )?(\d{4}-\d{2}-\d{2}) to (after )?(\d{4}-\d{2}-\d{2})/.exec(line);
        if (range && /^(?:[AB]-)?T/.test(id)) ranges.push({ id, from: range[2]!, to: range[4]!, openStart: !!range[1], openEnd: !!range[3] });
      } else if (parent && moving.has(parent)) moving.set(id, moving.get(parent)!);
    }
    const bday = /\[(N\d+)\] Next birthday [^:]*: (\d{4}-\d{2}-\d{2}), when the person turns (\d+)/.exec(line);
    if (bday) birthday = { id: bday[1]!, date: bday[2]!, turns: Number(bday[3]), line: line.slice(bday.index) };
    const sr = /\[((?:[AB]-)?B\d+)\] Solar return .*: exact (\d{4}-\d{2}-\d{2})/.exec(line);
    if (sr) solarReturns.push({ id: sr[1]!, date: sr[2]!, line: line.slice(sr.index) });
    if (tag && /^(?:[AB]-)?C/.test(tag[1]!)) angleLines.push(line.slice(tag.index));
    for (const [kind, re] of SHEET_PATTERNS) {
      const m = re.exec(line);
      if (m) relations.push({ id: m[1]!, kind, a: m[2] as Point, type: m[3] as AspectType, b: m[4] as Point, line: line.slice(m.index) });
    }
  }
  // "Born on 29 February: in a common year this sheet gives 1 March; some keep 28 February."
  if (birthday && /Born on 29 February/.test(text)) for (const md of ["02-28", "02-29"]) baseDates.add(`${birthday.date.slice(0, 4)}-${md}`);
  if (charts.length === 0) charts.push("A");
  return { relations, ids, birthday, solarReturns, angleLines, natal, angular, moving, lineDates, lineOrbs, ranges, window, baseDates, allDates, charts, chartOf, chartLabels, chartNatal, rising, chartRulers, chartSides, chains, finalDispositor, risingShift };
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

export function tokenize(clause: string): Token[] {
  const joined = clause
    .replace(/North Node/g, "NorthNode")
    .replace(/[\u2013\u2014]/g, " - ")
    // Names of the angles' degrees: "Venus on the rising degree" is Venus conjunct the Ascendant.
    .replace(/\b(?:rising|ascending) (?:degree|point)\b|\bdegree rising\b/gi, "Ascendant")
    .replace(/\b(?:descending|setting) (?:degree|point)\b/gi, "Descendant")
    .replace(/\bculminating (?:degree|point)\b|\bMedium Coeli\b/gi, "Midheaven")
    .replace(/\bImum Coeli\b/gi, "IC")
    // Paraphrases of the angles: "on the rising edge" is on the Ascendant, "at the top of the chart" on the Midheaven.
    .replace(/\b(?:rising|eastern) (?:edge|horizon|angle)\b/gi, "Ascendant")
    .replace(/\b(?:setting|western) (?:edge|horizon|angle)\b/gi, "Descendant")
    .replace(/\b(?:at|on|near) (?:the )?(?:very )?(?:top|highest point|peak|summit) of (?:the |your )?(?:chart|sky|wheel)\b/gi, "on the Midheaven")
    .replace(/\b(?:at|on|near) (?:the )?(?:very )?(?:bottom|lowest point|base|foot) of (?:the |your )?(?:chart|sky|wheel)\b/gi, "on the IC")
    .replace(/\b(?:at|on|near) (?:the |your )?chart's (?:top|highest point|peak)\b/gi, "on the Midheaven")
    .replace(/\b(?:at|on|near) (?:the |your )?chart's (?:bottom|lowest point|base)\b/gi, "on the IC")
    .replace(/\bon the horizon\b/gi, "on the Ascendant axis")
    .replace(/\bon the meridian\b/gi, "on the Midheaven axis")
    .replace(/\bat (the|your) (Ascendant|Descendant|Midheaven|MC|IC|DSC|ASC)\b/g, "on $1 $2");
  const raw = joined.match(/\[(?:[AB]-)?[A-Z]\d+[a-z]?\]|[A-Za-z]+(?:['’]s)?|\d+(?:[°'.:\-/]\d*)*'?|[,&/\-]/g) ?? [];
  return raw.map((text) => {
    const id = /^\[((?:[AB]-)?[A-Z]\d+[a-z]?)\]$/.exec(text)?.[1];
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
  /** "on the Ascendant axis": a conjunction or an opposition with the angle passes. */
  axis?: boolean;
}

/** The angle points, for axis and "rising" claims. */
const ANGLES = new Set<Point>(["Ascendant", "Midheaven"]);


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
    // "Saturn, the Sun on the IC": a bare comma before the point next to the word starts another item, not the same list (v8 M2).
    if (step === -1 && indices.length === 1 && joiners.every((w) => w === ",")) break;
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

/** Every ID quoted in a text. */
const ID_G = /\[((?:[AB]-)?[A-Z]\d+[a-z]?)\]/g;

const SENTENCE_SPLIT = /(?<=[.!?])(?<!\] \d{1,2}\.)\s+|\n+/;
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
      const emit = (ai: number | null, a: Point, bi: number | null, b: Point, type: AspectType, at: number, context: Mention["context"], axis = false) => {
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
        out.push({ a: x, b: y, type, context, cited, text: tokens.slice(lo, hi + 1).map((t) => t.text).join(" "), sentence: sentence.trim(), ...(axis ? { axis } : {}) });
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
        // "Saturn rising", "Venus culminating": the planet on the Ascendant or the Midheaven (not "Scorpio rising", not "rising sign", not "rising in").
        if (t.point && !ANGLES.has(t.point.point) && /^(rising|culminating)$/.test(next?.word ?? "") && !/^(sign|signs|in|time|times)$/.test(tokens[i + 2]?.word ?? "")) {
          emit(i, t.point.point, i + 1, next!.word === "rising" ? "Ascendant" : "Midheaven", "conjunction", i + 1, "any");
          i += 1;
          continue;
        }
        // "Venus setting": on the Descendant (not "setting the pace", "setting limits", "setting out").
        if (t.point && !ANGLES.has(t.point.point) && next?.word === "setting" && !/^(the|a|an|your|his|her|their|its|our|my|up|out|off|down|aside|about|limits|boundaries|goals|standards|priorities|rules|terms|tone|pace|expectations|sign)$/.test(tokens[i + 2]?.word ?? "")) {
          emit(i, t.point.point, i + 1, "Ascendant", "opposition", i + 1, "any");
          i += 1;
          continue;
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
          // "Saturn on the Ascendant axis", "on the Ascendant-Descendant axis", "on the MC/IC axis": conjunct either end.
          if (ANGLES.has(rights[0]!.p.point)) {
            let a = k;
            if ((tokens[a]?.word === "-" || tokens[a]?.word === "/") && tokens[a + 1]?.point?.point === rights[0]!.p.point) a += 2;
            if (tokens[a]?.word === "axis") {
              emit(lefts[0]!.k, lefts[0]!.p.point, r, rights[0]!.p.point, "conjunction", i, "any", true);
              continue;
            }
          }
          if (tokens[k]?.word === "-") continue;
          while (k < tokens.length && REACH_FREE.has(tokens[k]!.word)) k += 1;
          if (tokens[k] && (GROUP_WORDS.has(tokens[k]!.word) || tokens[k]!.aspect)) continue;
          // "Moon and Venus on the Ascendant": every planet of the list is put on the angle.
          if (!ANGLES.has(rights[0]!.p.point)) lefts = lefts.slice(0, 1);
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
  kind: "not-on-sheet" | "wrong-aspect" | "reversed" | "unknown-id" | "id-mismatch" | "date-mismatch" | "age-mismatch"
    | "range-mismatch" | "orb-mismatch" | "house-mismatch" | "sign-mismatch" | "ruler-mismatch" | "chart-mismatch";
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

// ------------------------------------------------------------------ birthday dates

const MONTH_NUMBER: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};
const MONTH_RE = "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)(?![A-Za-z])";
const DATE_PATTERNS: [RegExp, (m: RegExpExecArray) => { month: number; day: number; year?: number }][] = [
  [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => ({ month: Number(m[2]), day: Number(m[3]), year: Number(m[1]) })],
  [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?${MONTH_RE}(?:,? (\\d{4})\\b)?`, "g"), (m) => ({ month: MONTH_NUMBER[m[2]!.slice(0, 3).toLowerCase()]!, day: Number(m[1]), ...(m[3] ? { year: Number(m[3]) } : {}) })],
  [new RegExp(`\\b${MONTH_RE}\\.? (\\d{1,2})(?:st|nd|rd|th)?\\b(?:,? (\\d{4})\\b)?`, "g"), (m) => ({ month: MONTH_NUMBER[m[1]!.slice(0, 3).toLowerCase()]!, day: Number(m[2]), ...(m[3] ? { year: Number(m[3]) } : {}) })]
];

interface DateAt {
  /** MM-DD. */
  md: string;
  /** The year, when the text gives one. */
  year?: number;
  text: string;
  index: number;
  end: number;
}

/** Calendar dates written in `text`, as ISO dates, "11 November (2026)" or "November 11(, 2026)", in order. */
function datesIn(text: string): DateAt[] {
  const out: DateAt[] = [];
  for (const [re, read] of DATE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const { month, day, year } = read(m as RegExpExecArray);
      if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) continue;
      if (out.some((d) => m.index! < d.end && m.index! + m[0].length > d.index)) continue;
      out.push({ md: `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, ...(year ? { year } : {}), text: m[0], index: m.index!, end: m.index! + m[0].length });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** True when a date written in the reading is the ISO date `iso` (the month and day only, when the reading gives no year). */
const sameDate = (d: DateAt, iso: string) => d.md === iso.slice(5) && (d.year === undefined || d.year === Number(iso.slice(0, 4)));

const mdShift = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(5, 10);
};

const COUNT_WORDS: Record<string, number> = { a: 1, the: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
/** "the day after the birthday", "two days before your child's birthday", "the day after the solar return". */
const RELATIVE_BIRTHDAY = /\b(?:(the|a|one|two|three|four|five|six|seven|\d+) )?days? (after|before) (?:the |your |their |his |her )?(?:child's |baby's |son's |daughter's )?(birthday|solar return)/gi;
const BIRTHDAY_WORD = /\b(birthday|solar return)\b/gi;
/** Text between a birthday word and a date that still ties the two together: short, and not across ", and" or a like clause break (v8 G4: "runs 2026-11-01 to 2027-01-29, and the next birthday is 2026-11-04"). */
const TIED_GAP = /^(?![^]*,\s*(?:and|but|while|so|then|whereas)\b)[^;\[\]]{0,25}$/;

function birthdayViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  const b = sheet.birthday;
  const returns = sheet.solarReturns;
  if (!b) return out;
  const facts = `the sheet gives the next birthday as ${b.date} ([${b.id}])${returns.length ? ` and the solar return as ${returns.map((r) => `${r.date} ([${r.id}])`).join(" or ")}` : ""}`;
  const sheetLines = [b.line, ...returns.map((r) => r.line)];
  const sentences = reading.split(SENTENCE_SPLIT);
  sentences.forEach((raw, si) => {
    const sentence = raw.trim();
    if (!sentence) return;
    const dates = datesIn(sentence);
    const relativeSpans: [number, number][] = [];
    for (const m of sentence.matchAll(RELATIVE_BIRTHDAY)) {
      relativeSpans.push([m.index!, m.index! + m[0].length]);
      const n = m[1] ? (COUNT_WORDS[m[1].toLowerCase()] ?? Number(m[1])) : 1;
      const sign = m[2]!.toLowerCase() === "after" ? 1 : -1;
      const anchors = m[3]!.toLowerCase() === "birthday" ? [b.date] : returns.map((r) => r.date);
      // The date the phrase is said of: the last one before it in the sentence, else the last in the sentence before.
      const before = dates.filter((d) => d.end <= m.index!);
      const prior = si > 0 ? datesIn(sentences[si - 1]!) : [];
      const date = before.at(-1) ?? prior.at(-1);
      if (!date || anchors.length === 0) continue;
      if (anchors.some((a) => mdShift(a, sign * n) === date.md)) continue;
      const named = `${date.text} as ${m[0].trim()}`;
      out.push({ kind: "date-mismatch", mention: m[0], sentence, named, sheet: sheetLines, message: `calls ${date.text} ${m[0].trim()}, but ${facts}` });
    }
    for (const m of sentence.matchAll(BIRTHDAY_WORD)) {
      if (relativeSpans.some(([x, y]) => m.index! >= x && m.index! < y)) continue;
      const solar = m[1]!.toLowerCase() === "solar return";
      const allowed = solar ? returns.map((r) => r.date.slice(5)) : [b.date.slice(5), ...returns.map((r) => r.date.slice(5))];
      const start = m.index!;
      const end = start + m[0].length;
      const tied = dates.filter((d) => (d.index >= end && TIED_GAP.test(sentence.slice(end, d.index))) || (d.end <= start && TIED_GAP.test(sentence.slice(d.end, start))));
      for (const d of tied) {
        if (allowed.length === 0 || allowed.includes(d.md)) continue;
        out.push({ kind: "date-mismatch", mention: d.text, sentence, named: `${m[0]} ${d.text}`, sheet: sheetLines, message: `ties ${d.text} to the ${m[0].toLowerCase()}, but ${facts}` });
      }
    }
    for (const m of sentence.matchAll(/\bturns? (\d{1,3})\b(?![°'.:\d])|\b(\d{1,3})(?:st|nd|rd|th) birthday\b/gi)) {
      const n = Number(m[1] ?? m[2]);
      if (n === b.turns) continue;
      out.push({ kind: "age-mismatch", mention: m[0], sentence, named: m[0], sheet: [b.line], message: `says "${m[0]}", but the sheet gives the next birthday as ${b.date}, when the person turns ${b.turns} ([${b.id}])` });
    }
  });
  return out;
}

// ------------------------------------------------------------------ dates, ranges and orbs tied to sheet lines

/** What a sentence is about: the IDs it quotes or whose relation it names, the points it names, and the bodies it has moving. */
interface SentenceContext {
  ids: Set<string>;
  points: Set<Point>;
  moving: Set<Point>;
}

const MOVING_VERBS = new Set(["moves", "moving", "passes", "passing", "travels", "travelling", "traveling", "enters", "entering", "crosses", "crossing", "transits", "transiting", "stationing", "ingress"]);

function sentenceContext(sheet: Sheet, sentence: string): SentenceContext {
  const ids = new Set<string>();
  for (const m of sentence.matchAll(ID_G)) if (sheet.ids.has(m[1]!)) ids.add(m[1]!);
  for (const m of findMentions(sentence)) {
    for (const r of sheet.relations) if (r.type === m.type && ((r.a === m.a && r.b === m.b) || (r.a === m.b && r.b === m.a))) ids.add(r.id);
  }
  const tokens = tokenize(sentence);
  const points = new Set<Point>(tokens.filter((t) => t.point).map((t) => t.point!.point));
  const moving = new Set<Point>();
  for (const id of ids) {
    const mv = sheet.moving.get(id);
    if (mv) moving.add(mv.body);
    if (mv) points.add(mv.body);
    const r = sheet.relations.find((x) => x.id === id);
    if (r) { points.add(r.a); points.add(r.b); }
  }
  tokens.forEach((t, i) => {
    if (!t.point) return;
    if (tokens.slice(Math.max(0, i - 2), i).some((x) => x.word === "transiting" || x.word === "stationing")) moving.add(t.point.point);
    // "Mars stations retrograde", "Mercury turns direct".
    const after = tokens.slice(i + 1, i + 3).map((x) => x.word);
    if (after.some((w) => STATION_WORDS.has(w)) || (TURN_WORDS.has(after[0] ?? "") && MOTION_WORDS.has(after[1] ?? ""))) moving.add(t.point.point);
  });
  return { ids, points, moving };
}

/**
 * The sheet lines a sentence's dates must come from: the IDs it quotes or whose
 * relation it names, the station lines of planets it says station, and every
 * transit or station line of a point it names that none of those lines has.
 * Empty when the sentence names no point: any sheet date may stand there.
 */
function tiedLines(sheet: Sheet, ctx: SentenceContext): string[] {
  const out = new Set(ctx.ids);
  // A station named in words ("Mars stations retrograde") ties its station line.
  for (const [id, mv] of sheet.moving) if (/^(?:[AB]-)?S\d+$/.test(id) && ctx.moving.has(mv.body)) out.add(id);
  const covered = new Set<Point>();
  for (const id of out) {
    const mv = sheet.moving.get(id);
    if (mv) covered.add(mv.body);
    const r = sheet.relations.find((x) => x.id === id);
    if (r) { covered.add(r.a); covered.add(r.b); }
  }
  const loose = [...ctx.points].filter((p) => !covered.has(p));
  for (const [id, mv] of sheet.moving) if (loose.includes(mv.body)) out.add(id);
  for (const r of sheet.relations) if (r.kind !== "natal" && (loose.includes(r.a) || loose.includes(r.b))) out.add(r.id);
  return [...out];
}

const RANGE_TIGHT = /^\s*(?:to|until|till|through|thru|-|\u2013)\s*$/i;
const THROUGH_WINDOW = /\b(?:through|throughout|across|for|during) (?:all of )?(?:the )?(?:whole |entire |full )?(?:window|reading period|90 days|three months)\b|\ball (?:through )?(?:the )?window\b|\b(?:runs|lasts|spans|covers|fills|holds|stays|remains|continues)(?: in orb)? (?:for |through |across )?(?:all of )?the (?:whole |entire |full )?(?:window|90 days|three months)\b/gi;
const TO_WINDOW_END = /\b(?:until|till|to|through|into) the (?:end|close) of the window\b/gi;
const FROM_WINDOW_START = /\bfrom the (?:start|beginning|opening) of the window\b/gi;

function dateViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  const sentences = reading.split(SENTENCE_SPLIT).map((x) => x.trim());
  let previous: SentenceContext | null = null;
  for (const sentence of sentences) {
    if (!sentence) continue;
    const ctx = sentenceContext(sheet, sentence);
    const lines = tiedLines(sheet, ctx);
    // "It runs the whole window": a sentence with no point and no ID is about the one before, for the claims of a range.
    const before = previous;
    if (ctx.ids.size || ctx.points.size) previous = ctx;
    const rangeLines = ctx.ids.size === 0 && ctx.points.size === 0 && before && /^(?:It|This|That|The (?:transit|contact|station))\b/.test(sentence) ? tiedLines(sheet, before) : lines;
    const lineText = (ids: string[]) => ids.map((id) => sheet.ids.get(id)!).filter(Boolean);
    const dates = datesIn(sentence);
    const birthdayWords = /\b(birthday|solar return)\b/i.test(sentence);
    const allowed = new Set<string>([...sheet.baseDates, ...(sheet.window ? [sheet.window.from, sheet.window.to] : [])]);
    if (birthdayWords) {
      if (sheet.birthday) allowed.add(sheet.birthday.date);
      for (const r of sheet.solarReturns) allowed.add(r.date);
      // "the day after the birthday": the birthday check verifies the shift, so the shifted date may stand.
      for (const m of sentence.matchAll(RELATIVE_BIRTHDAY)) {
        const n = m[1] ? (COUNT_WORDS[m[1].toLowerCase()] ?? Number(m[1])) : 1;
        const sign = m[2]!.toLowerCase() === "after" ? 1 : -1;
        const anchors = m[3]!.toLowerCase() === "birthday" ? (sheet.birthday ? [sheet.birthday.date] : []) : sheet.solarReturns.map((r) => r.date);
        for (const a of anchors) allowed.add(`${a.slice(0, 4)}-${mdShift(a, sign * n)}`);
      }
    }
    for (const id of lines) for (const d of sheet.lineDates.get(id) ?? []) allowed.add(d);
    const pool = lines.length ? allowed : new Set([...allowed, ...sheet.allDates]);
    for (const d of dates) {
      if ([...pool].some((iso) => sameDate(d, iso))) continue;
      const elsewhere = [...sheet.allDates].filter((iso) => sameDate(d, iso));
      const tied = lines.length ? `the lines it is tied to (${lines.map((x) => `[${x}]`).join(", ")}) give ${[...new Set(lines.flatMap((id) => sheet.lineDates.get(id) ?? []))].join(", ") || "no date"}` : "no sheet line gives it";
      out.push({
        kind: "date-mismatch", mention: d.text, sentence, named: d.text, sheet: lineText(lines),
        message: `gives the date ${d.text}, but ${tied}${elsewhere.length ? `; that date belongs to another line` : lines.length ? "; the date is not on the sheet" : ""}. Copy dates exactly as the sheet line writes them.`
      });
    }
    // Ranges: "from D1 to D2", "D1 to D2", "between D1 and D2", "20 to 22 November", must be one line's in-orb range or the window.
    const known = [...sheet.ranges, ...(sheet.window ? [{ id: "window", from: sheet.window.from, to: sheet.window.to }] : [])];
    for (const m of sentence.matchAll(new RegExp(`\\b(\\d{1,2}) (?:to|-|\\u2013|until|through) (\\d{1,2}) ${MONTH_RE}|\\b${MONTH_RE} (\\d{1,2}) (?:to|-|\\u2013|until|through) (\\d{1,2})\\b`, "g"))) {
      const month = String(MONTH_NUMBER[(m[3] ?? m[4])!.slice(0, 3).toLowerCase()]!).padStart(2, "0");
      const [d1, d2] = (m[3] ? [m[1], m[2]] : [m[5], m[6]]).map((x) => `${month}-${x!.padStart(2, "0")}`);
      if (known.some((r) => r.from.slice(5) === d1 && r.to.slice(5) === d2)) continue;
      out.push({ kind: "range-mismatch", mention: m[0], sentence, named: m[0], sheet: [], message: `gives the span ${m[0]}, which is not a range on the sheet. To group several contacts, give each sheet date; give a span only as a line's own in-orb range.` });
    }
    for (let i = 0; i + 1 < dates.length; i += 1) {
      const a = dates[i]!;
      const b = dates[i + 1]!;
      const between = sentence.slice(a.end, b.index);
      const before = sentence.slice(i > 0 ? dates[i - 1]!.end : 0, a.index);
      const isRange = RANGE_TIGHT.test(between)
        || (/^\s*and\s*$/i.test(between) && /\bbetween\s+$/i.test(before))
        || (/\bfrom\b/i.test(before) && /\b(?:to|until|till|through)\b/i.test(between) && between.length <= 120 && !/[;:]/.test(between));
      if (!isRange) continue;
      if (known.some((r) => sameDate(a, r.from) && sameDate(b, r.to))) continue;
      const tiedRanges = sheet.ranges.filter((r) => lines.includes(r.id));
      out.push({
        kind: "range-mismatch", mention: sentence.slice(a.index, b.end), sentence, named: `${a.text} to ${b.text}`, sheet: lineText(tiedRanges.map((r) => r.id)),
        message: `gives the span ${a.text} to ${b.text}, which is not a range on the sheet${tiedRanges.length ? `; the tied lines give ${tiedRanges.map((r) => `[${r.id}] from ${r.from} to ${r.to}`).join(", ")}` : "; two dates of different lines do not make a span, and the sheet gives no ingress or egress dates"}. To group several contacts, give each sheet date.`
      });
    }
    // "in orb through the window", "until the end of the window": the tied range must cover it.
    const tiedRanges = sheet.ranges.filter((r) => rangeLines.includes(r.id));
    if (sheet.window && tiedRanges.length) {
      const w = sheet.window;
      const claims: [RegExp, (r: Sheet["ranges"][number]) => boolean][] = [
        [THROUGH_WINDOW, (r) => (r.openStart || r.from <= w.from) && (r.openEnd || r.to >= w.to)],
        [TO_WINDOW_END, (r) => r.openEnd || r.to >= w.to],
        [FROM_WINDOW_START, (r) => r.openStart || r.from <= w.from]
      ];
      for (const [re, covers] of claims) {
        for (const m of sentence.matchAll(re)) {
          const short = tiedRanges.filter((r) => !covers(r));
          if (!short.length) continue;
          out.push({
            kind: "range-mismatch", mention: m[0], sentence, named: m[0], sheet: lineText(short.map((r) => r.id)),
            message: `says "${m[0]}", but ${short.map((r) => `[${r.id}] is in orb only from ${r.from} to ${r.to}`).join("; ")}, and the window is ${w.from} to ${w.to}. Give the line's own range.`
          });
        }
      }
    }
    // Orbs: an orb written in the sentence must be one of its tied lines' orbs, as written.
    const orbIds = [...ctx.ids];
    const orbPool = orbIds.length ? new Set(orbIds.flatMap((id) => sheet.lineOrbs.get(id) ?? [])) : new Set([...sheet.lineOrbs.values()].flat());
    if (orbPool.size) {
      for (const m of sentence.matchAll(/\borbs? (?:of )?(\d+)°(?:\s?(\d{1,2})['′])?(\.\.\.|…)?/g)) {
        const text = m[2] !== undefined ? `${m[1]}°${m[2].padStart(2, "0")}'` : `${m[1]}°`;
        if (orbPool.has(text) && !m[3]) continue;
        out.push({
          kind: "orb-mismatch", mention: m[0], sentence, named: m[0], sheet: lineText(orbIds),
          message: `gives "${m[0]}", but ${orbIds.length ? `the lines it quotes give orb ${[...orbPool].join(", ")}` : "no sheet line gives that orb"}. Copy the orb exactly as written, or leave it out.`
        });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ houses and signs

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6, "7th": 7, "8th": 8, "9th": 9, "10th": 10, "11th": 11, "12th": 12
};
/** Words that may sit between a planet and "in (your) Nth house" or "in Aries" when the house or sign is said of that planet. */
const ATTACH_FILLER = new Set([
  "is", "are", "was", "sits", "sit", "sitting", "lies", "lie", "falls", "fall", "placed", "located", "now", "still", "also", "here", "natal", "your", "the", "its", "own",
  "transiting", "stationing", "stations", "station", "turning", "turns", "retrograde", "direct", "peregrine", "exalted", "dignified", "debilitated", "angular", "itself",
  "moves", "moving", "passes", "passing", "travels", "travelling", "traveling", "which", "that", "and", "both", "whole", "sign", ",", "in", "house"
]);
const PLACE_WORDS = new Set(["in", "into", "through", "across", "crossing", "enters", "entering", "to"]);
const RULER_WORDS = new Set(["ruler", "rulers", "rules", "ruling", "rule", "ruled", "lord", "lords", "cusp", "dispositor"]);

interface PlaceClaim {
  kind: "house" | "sign";
  value: string;
  text: string;
  /** The planet it is said of, if any. */
  of: Point | null;
  /** The planet is marked as moving ("transiting Saturn", "Saturn moves into"). */
  explicitlyMoving: boolean;
  /** The planet is the clause's only one, not attached to the house or sign by the words between. */
  weak?: boolean;
}

/** House and sign placements in a clause: "Saturn sits in your tenth house", "your tenth-house Sun", "house 7", "transiting Mars in Leo". */
export function placeClaims(tokens: Token[]): PlaceClaim[] {
  const out: PlaceClaim[] = [];
  const attachLeft = (from: number): { of: Point | null; moving: boolean; weak?: boolean } => {
    let moving = false;
    for (let k = from, n = 0; k >= 0 && n < 7; k -= 1) {
      const t = tokens[k]!;
      if (t.point) return { of: t.point.point, moving: moving || tokens.slice(Math.max(0, k - 2), k).some((x) => x.word === "transiting" || x.word === "stationing") };
      if (MOVING_VERBS.has(t.word)) moving = true;
      // "Venus, the benefic of sect, is in Virgo": skip the phrase set off by commas after the planet.
      if (t.word === ",") {
        let j = k - 1;
        while (j >= Math.max(0, k - 8) && tokens[j]!.word !== "," && !tokens[j]!.point && !tokens[j]!.aspect && !tokens[j]!.id && !STOP_WORDS.has(tokens[j]!.word)) j -= 1;
        if (j >= 1 && j < k - 1 && tokens[j]!.word === "," && tokens[j - 1]!.point && /^(the|a|an|our|your)$/.test(tokens[j + 1]!.word)) { k = j; continue; }
      }
      if (!(ATTACH_FILLER.has(t.word) || SIGN_WORDS.has(t.word) || /^\d/.test(t.text))) return single(from);
      if (!/^\d/.test(t.text) && t.word !== ",") n += 1;
    }
    return single(from);
  };
  // "Mars rules the chart and sits in Taurus in the seventh house": the clause's only planet, with no aspect, ID or second planet before the claim.
  const single = (from: number): { of: Point | null; moving: boolean; weak?: boolean } => {
    const before = tokens.slice(0, from + 1);
    const planets = new Set(before.filter((x) => x.point && !ANGLES.has(x.point.point)).map((x) => x.point!.point));
    if (planets.size !== 1 || before.some((x) => x.aspect || x.id || x.point && ANGLES.has(x.point.point) || /^(it|its|this|that|which|they|their)$/.test(x.word))) return { of: null, moving: false };
    const k = before.findIndex((x) => x.point);
    return { of: [...planets][0]!, moving: tokens.slice(Math.max(0, k - 2), k).some((x) => x.word === "transiting" || x.word === "stationing"), weak: true };
  };
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i]!;
    let house: number | null = null;
    let start = i;
    let end = i;
    if (ORDINALS[t.word] && (tokens[i + 1]?.word === "house" || (tokens[i + 1]?.word === "-" && tokens[i + 2]?.word === "house"))) {
      house = ORDINALS[t.word]!;
      end = tokens[i + 1]!.word === "house" ? i + 1 : i + 2;
    } else if (t.word === "house" && /^(1[0-2]|[1-9])$/.test(tokens[i + 1]?.text ?? "")) {
      house = Number(tokens[i + 1]!.text);
      end = i + 1;
    }
    if (house !== null) {
      // "ruler of the tenth house", "tenth-house ruler": a rulership, not a placement.
      const near = tokens.slice(Math.max(0, start - 3), start).map((x) => x.word);
      if (near.some((w) => RULER_WORDS.has(w)) || RULER_WORDS.has(tokens[end + 1]?.word ?? "")) { i = end; continue; }
      let of: Point | null = null;
      let moving = false;
      let weak = false;
      // "your tenth-house Sun", "house 1 Uranus".
      let r = end + 1;
      while (r < tokens.length && (tokens[r]!.word === "natal" || tokens[r]!.word === "transiting")) r += 1;
      if (tokens[r]?.point && tokens[r - 1]?.word !== ",") {
        of = tokens[r]!.point!.point;
        moving = tokens[r - 1]?.word === "transiting";
      } else {
        let k = start - 1;
        while (k >= 0 && /^(the|your|its|their|own|a)$/.test(tokens[k]!.word)) k -= 1;
        if (k >= 0 && (PLACE_WORDS.has(tokens[k]!.word) || t.word === "house")) {
          const a = attachLeft(PLACE_WORDS.has(tokens[k]!.word) ? k - 1 : k);
          of = a.of;
          if (a.weak) weak = true;
          moving = a.moving || MOVING_VERBS.has(tokens[k]!.word) || tokens[k]!.word === "into" || tokens[k]!.word === "through";
        }
      }
      out.push({ kind: "house", value: String(house), text: tokens.slice(start, end + 1).map((x) => x.text).join(" "), of, explicitlyMoving: moving, ...(weak ? { weak } : {}) });
      i = end;
      continue;
    }
    if (SIGN_WORDS.has(t.word) && t.text[0] !== t.word[0] && PLACE_WORDS.has(tokens[i - 1]?.word ?? "")) {
      // "in Aries" after a planet: the planet's sign. A sign with no planet is not read.
      if (tokens[i + 1]?.word === "rising" || tokens[i + 1]?.word === "house") continue;
      const a = attachLeft(i - 2);
      const verb = tokens[i - 1]!.word;
      // "0°32' into Pisces" is a degree within the sign, not a body moving into it.
      const degree = /^\d/.test(tokens[i - 2]?.text ?? "");
      out.push({ kind: "sign", value: t.text, text: `${tokens[i - 1]!.text} ${t.text}`, of: a.of, explicitlyMoving: a.moving || (!degree && (verb === "into" || verb === "enters" || verb === "entering" || verb === "through")), ...(a.weak ? { weak: true } : {}) });
    }
  }
  return out;
}

/** A heading or bold lead of the 90-day part. */
const TRANSIT_HEADING = /\b(90|ninety|days|calendar|transits?|window|weeks?|months?|january|february|march|april|may|june|july|august|september|october|november|december|phase)\b/i;
const NATAL_HEADING = /\b(natal|themes?|calculated|uncertain(?:ty)?|birth chart|the chart|summary|closing)\b/i;
/** Words that put a planet in the sky of the window. */
const TRANSIT_TIME = /\b(now|then|currently|this month|that month|at the moment|these weeks|that week|this week|in the window|this window|during the window|this period)\b/i;

function placementViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  const natalText = (p: Point, kind: "house" | "sign") => {
    const n = sheet.natal.get(p);
    const v = kind === "house" ? [...(n?.houses ?? [])].map(String) : [...(n?.signs ?? [])];
    return v.length ? `natal ${p} is in ${kind === "house" ? `house ${v.join(" or ")}` : v.join(" or ")}` : `the sheet gives no natal ${kind} for ${p}`;
  };
  const movingValues = (body: Point, ids: string[], kind: "house" | "sign") => {
    const lines = [...sheet.moving].filter(([id, mv]) => mv.body === body && ids.includes(id) && quoted.has(id));
    const use = lines.length ? lines : [...sheet.moving].filter(([, mv]) => mv.body === body);
    return new Set(use.flatMap(([, mv]) => kind === "house" ? [...mv.houses].map(String) : [...mv.signs]));
  };
  const sentences = reading.split(SENTENCE_SPLIT).map((x) => x.trim());
  let previous: SentenceContext | null = null;
  let quoted = new Set<string>();
  // The part of the reading a sentence is in: the 90 days (or a month of it) or the natal themes, by the last heading or bold lead.
  let transitSection = false;
  const headingCharts = chartHeadings(reading);
  for (const sentence of sentences) {
    if (!sentence) continue;
    const heading = /^#+\s*(.*)$/.exec(sentence)?.[1] ?? /^\*\*([^*]+)\*\*/.exec(sentence)?.[1];
    if (heading !== undefined) {
      if (TRANSIT_HEADING.test(heading)) transitSection = true;
      else if (/^#/.test(sentence) || NATAL_HEADING.test(heading)) transitSection = false;
    }
    // "Saturn, now in Aries", "Mercury is then in Scorpio", or any planet in a dated sentence or the 90 days: it may be the moving one.
    const transitContext = transitSection || hasDate(tokenize(sentence)) || TRANSIT_TIME.test(sentence);
    quoted = new Set([...sentence.matchAll(ID_G)].map((m) => m[1]!));
    let ctx = sentenceContext(sheet, sentence);
    const before = previous;
    // "It tests ...", "That day ...": a sentence with no point and no ID is about the one before.
    if (ctx.ids.size === 0 && ctx.points.size === 0 && previous) ctx = previous;
    else previous = ctx;
    // "[T4] transiting Saturn conjunction natal Moon ... Saturn is in your second house": still the moving Saturn.
    if (ctx.ids.size === 0 && before) for (const p of ctx.points) if (before.moving.has(p)) ctx.moving.add(p);
    const ids = tiedLines(sheet, ctx.ids.size === 0 && before ? { ...ctx, ids: new Set([...before.ids].filter((id) => ctx.moving.has(sheet.moving.get(id)?.body as Point))) } : ctx);
    for (const clause of sentence.split(CLAUSE_SPLIT)) {
      // "the Midheaven would be in Pisces if the birth time were later": another chart, not this one.
      if (/\bwould (?:be|move|fall|sit|go)\b|\bif the birth time\b/i.test(clause)) continue;
      for (const c of placeClaims(tokenize(clause))) {
        const natalValues = (p: Point) => {
          const n = sheet.natal.get(p);
          return new Set(c.kind === "house" ? [...(n?.houses ?? [])].map(String) : [...(n?.signs ?? [])]);
        };
        if (c.of) {
          const body = c.of;
          const isMoving = c.explicitlyMoving || ctx.moving.has(body);
          if (!isMoving) {
            if (natalValues(body).has(c.value)) {
              // Fold or gap: a house or sign that holds in one chart only must name it.
              const holds = sheet.charts.filter((x) => { const n = sheet.chartNatal.get(x)?.get(body); return c.kind === "house" ? n?.houses.has(Number(c.value)) : n?.signs.has(c.value); });
              if (sheet.charts.length < 2 || holds.length === sheet.charts.length) continue;
              const scope = chartScope(sheet, sentence);
              const named = scope.named.size ? [...scope.named] : headingCharts.get(sentence) ? [headingCharts.get(sentence)!] : [];
              if (named.length === 2 || (named.length === 1 && holds.includes(named[0]!) && !scope.shared)) continue;
              const where = sheet.charts.map((x) => { const n = sheet.chartNatal.get(x)?.get(body); return `chart ${x} ${c.kind === "house" ? `house ${[...(n?.houses ?? [])].join(" or ")}` : [...(n?.signs ?? [])].join(" or ")}`; }).join(", ");
              out.push({ kind: "chart-mismatch", mention: c.text, sentence, named: `${body} ${c.kind === "house" ? `in house ${c.value}` : `in ${c.value}`}`, sheet: [], message: `puts ${body} in ${c.kind === "house" ? `house ${c.value}` : c.value}${named.length === 1 ? ` in chart ${named[0]}` : scope.shared ? " in both charts" : " without naming the chart"}, but natal ${body} is in ${where}. Name the chart.` });
              continue;
            }
            const mv = movingValues(body, ids, c.kind);
            if (transitContext && mv.size) {
              if (mv.has(c.value)) continue;
              out.push({
                kind: c.kind === "house" ? "house-mismatch" : "sign-mismatch", mention: c.text, sentence, named: `${body} ${c.kind === "house" ? `in house ${c.value}` : `in ${c.value}`}`, sheet: [],
                message: `puts ${body} in ${c.kind === "house" ? `house ${c.value}` : c.value}, but ${natalText(body, c.kind)}, and the sheet gives the moving ${body} ${c.kind === "house" ? `house ${[...mv].join(" or ")}` : [...mv].join(" or ")}. Say which you mean (natal, or transiting with its line's ID) and give the ${c.kind} as that line gives it.`
              });
              continue;
            }
            // A natal point with no house on the sheet (no birth time): any house is unsupported.
            out.push({ kind: c.kind === "house" ? "house-mismatch" : "sign-mismatch", mention: c.text, sentence, named: `${body} ${c.kind === "house" ? `in house ${c.value}` : `in ${c.value}`}`, sheet: [], message: `puts ${body} in ${c.kind === "house" ? `house ${c.value}` : c.value}, but ${natalText(body, c.kind)}.` });
            continue;
          }
          const mv = movingValues(body, ids, c.kind);
          const allowed = c.explicitlyMoving ? mv : new Set([...mv, ...natalValues(body)]);
          if (allowed.has(c.value)) continue;
          out.push({
            kind: c.kind === "house" ? "house-mismatch" : "sign-mismatch", mention: c.text, sentence, named: `transiting ${body} ${c.kind === "house" ? `in house ${c.value}` : `in ${c.value}`}`, sheet: [],
            message: `puts the moving ${body} in ${c.kind === "house" ? `house ${c.value}` : c.value}, but ${mv.size ? `the sheet gives the moving ${body} ${c.kind === "house" ? `house ${[...mv].join(" or ")}` : [...mv].join(" or ")}` : `no sheet line gives a ${c.kind} for the moving ${body}`}; ${natalText(body, c.kind)}. Give a transiting body's ${c.kind} only as its line gives it.`
          });
          continue;
        }
        // A house or sign with no planet of its own, in a sentence about a transit or station.
        if (ctx.moving.size === 0) continue;
        const allowed = new Set<string>();
        // The natal points of the sentence and of the lines it is tied to ("so leave room in the third house" after a transit to the third-house Venus).
        const natalPoints = new Set(ctx.points);
        for (const id of ids) {
          const r = sheet.relations.find((x) => x.id === id);
          if (r) { natalPoints.add(r.b); if (r.kind === "natal") natalPoints.add(r.a); }
        }
        for (const p of natalPoints) for (const v of natalValues(p)) allowed.add(v);
        for (const b of ctx.moving) for (const v of movingValues(b, ids, c.kind)) allowed.add(v);
        if (allowed.has(c.value)) continue;
        const movingNames = [...ctx.moving].join(", ");
        out.push({
          kind: c.kind === "house" ? "house-mismatch" : "sign-mismatch", mention: c.text, sentence, named: c.kind === "house" ? `house ${c.value}` : c.value, sheet: [],
          message: `ties ${c.kind === "house" ? `house ${c.value}` : c.value} to a transit or station of ${movingNames}, but no sheet line puts ${movingNames} there, and no natal point it names is ${c.kind === "house" ? "in that house" : "in that sign"}. Give a transiting body's ${c.kind} only as its line gives it.`
        });
      }
    }
  }
  return out;
}

/** "Venus is angular", "angular Mars": the planet must be on an angle ([C]) or in an angular house ([H]). */
function angularViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  for (const raw of reading.split(SENTENCE_SPLIT)) {
    const sentence = raw.trim();
    for (const clause of sentence.split(CLAUSE_SPLIT)) {
      const tokens = tokenize(clause);
      tokens.forEach((t, i) => {
        if (t.word !== "angular" || /^(house|houses)$/.test(tokens[i + 1]?.word ?? "")) return;
        let p: Point | null = tokens[i + 1]?.point?.point ?? null;
        for (let k = i - 1; !p && k >= Math.max(0, i - 4); k -= 1) {
          if (tokens[k]!.point) p = tokens[k]!.point!.point;
          else if (!/^(is|are|sits|stays|both|and|also|very|strongly|,)$/.test(tokens[k]!.word)) break;
        }
        if (!p || ANGLES.has(p) || sheet.angular.has(p)) return;
        out.push({ kind: "not-on-sheet", mention: `${p} angular`, sentence, named: `${p} angular`, sheet: sheet.angleLines, message: `calls ${p} angular, but no [C] line puts it on an angle and the [H] line puts it in no angular house.${sheet.angleLines.length ? ` Planets on an angle, per the sheet: ${sheet.angleLines.join(" | ")}` : ""}` });
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ rulers

/** The traditional domicile ruler of each sign (the fixed rule INSTRUCTIONS.md gives). */
export const SIGN_RULERS: Readonly<Record<string, Point>> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon", Leo: "Sun", Virgo: "Mercury",
  Libra: "Venus", Scorpio: "Mars", Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter"
};
/** Modern co-rulers, accepted only in a sentence that says "modern". */
const MODERN_RULERS: Readonly<Record<string, Point>> = { Scorpio: "Pluto", Aquarius: "Uranus", Pisces: "Neptune" };

/** The sign of whole sign house `n` when `rising` rises. */
const houseSign = (rising: string, n: number) => SIGNS[(SIGNS.indexOf(rising) + n - 1) % 12]!;

const OWN_RULER_WORDS = new Set(["rules", "ruler", "rulers", "ruling", "rule", "ruled", "lord", "lords"]);
/** Words that may sit between a ruler word and the house, sign or chart it names. */
const RULE_FILLER = new Set(["the", "your", "its", "their", "of", "both", "and", ",", "natal", "whole", "sign", "-", "also", "over"]);

interface RulerClaim {
  ruler: Point;
  houses: number[];
  signs: string[];
  chart: boolean;
  /** "its ruler, Jupiter": the planet whose sign's ruler is named. */
  of: Point | null;
  text: string;
}

/** House, sign or chart targets next to a ruler word: "your second house", "the Leo second", "the 2nd and 11th houses", "the chart", "your Virgo rising". */
function ruleTargets(tokens: Token[], from: number, step: 1 | -1, reach: number): { houses: number[]; signs: string[]; chart: boolean; end: number } {
  const houses: number[] = [];
  const signs: string[] = [];
  let chart = false;
  let k = from;
  let end = from - step;
  for (let n = 0; k >= 0 && k < tokens.length && n < reach; k += step) {
    const t = tokens[k]!;
    if (t.point || t.aspect || t.id || (STOP_WORDS.has(t.word) && t.word !== "and" && !RULER_WORDS.has(t.word))) break;
    if (ORDINALS[t.word]) { houses.push(ORDINALS[t.word]!); end = k; continue; }
    if (t.word === "house" && /^(1[0-2]|[1-9])$/.test(tokens[k + 1]?.text ?? "") && step === 1) { houses.push(Number(tokens[k + 1]!.text)); k += 1; end = k; continue; }
    if (SIGN_WORDS.has(t.word) && t.text[0] !== t.word[0]) { signs.push(t.text.replace(/['\u2019]s$/, "")); end = k; continue; }
    if (/^(chart|horoscope|rising|ascendant)$/.test(t.word)) { chart = true; end = k; continue; }
    if (/^(house|houses)$/.test(t.word)) { end = k; continue; }
    if (RULE_FILLER.has(t.word)) { n += 1; continue; }
    break;
  }
  return { houses, signs, chart, end };
}

/** Rulership claims of a sentence: "Mercury rules your second house", "the ruler of the Leo second, the Sun", "your tenth-house ruler Saturn", "ruled by Jupiter", "Venus rules the chart", "its ruler, Saturn". */
function rulerClaims(sentence: string): RulerClaim[] {
  const out: RulerClaim[] = [];
  const all = tokenize(sentence);
  const subject = all.find((t) => t.point && !ANGLES.has(t.point.point))?.point?.point ?? null;
  for (const clause of sentence.split(CLAUSE_SPLIT)) {
    const tokens = tokenize(clause.replace(/\bAscendant\b/g, "ascendant"));
    tokens.forEach((t, i) => {
      if (!OWN_RULER_WORDS.has(t.word)) return;
      if (tokens.slice(Math.max(0, i - 4), i + 6).some((x) => /^(not|no|never|nor)$/.test(x.word))) return;
      const pointAt = (from: number, step: 1 | -1, reach: number) => {
        for (let k = from, n = 0; k >= 0 && k < tokens.length && n < reach; k += step, n += 1) {
          const x = tokens[k]!;
          if (x.point) return ANGLES.has(x.point.point) ? null : x.point.point;
          if (x.aspect || x.id || x.word === "-" && step === -1 && n === 0) return null;
        }
        return null;
      };
      let ruler: Point | null = null;
      let target = { houses: [] as number[], signs: [] as string[], chart: false, end: i };
      let of: Point | null = null;
      if (t.word === "ruled" && tokens[i + 1]?.word === "by") {
        ruler = pointAt(i + 2, 1, 3);
        target = ruleTargets(tokens, i - 1, -1, 6);
        if (!target.houses.length && !target.signs.length && !target.chart) {
          // "Uranus is itself ruled by Jupiter": the planet's dispositor.
          const p = pointAt(i - 1, -1, 4);
          if (p && p !== ruler) of = p;
        }
      } else if (/^(rules|rule|ruling)$/.test(t.word)) {
        ruler = pointAt(i - 1, -1, 6);
        target = ruleTargets(tokens, i + 1, 1, 6);
      } else {
        // ruler, rulers, lord, lords.
        const left = ruleTargets(tokens, i - 1, -1, 4);
        const right = tokens[i + 1]?.word === "of" ? ruleTargets(tokens, i + 2, 1, 6) : { houses: [], signs: [], chart: false, end: i };
        target = left.houses.length || left.signs.length || left.chart ? left : right;
        const possessive = tokens[i - 1]?.word === "its" || /['’]s$/.test(tokens[i - 1]?.text ?? "");
        const bare = /^(your|the)$/.test(tokens[i - 1]?.word ?? "") && tokens[i + 1]?.word !== "of" && !target.houses.length && !target.signs.length;
        if (possessive) {
          // "Mars's ruler", "its ruler" (the sentence's first planet).
          of = tokens[i - 1]!.point?.point ?? (tokens[i - 1]!.word === "its" ? subject : null);
          if (of && ANGLES.has(of)) { of = null; target.chart = true; }
        } else if (bare && !target.chart) target.chart = /^(your|the)$/.test(tokens[i - 1]!.word) && /^(is|,)$/.test(tokens[i + 1]?.word ?? "") || /^(your)$/.test(tokens[i - 1]!.word);
        const after = Math.max(i, right.end) + 1;
        let k = after;
        while (k < tokens.length && /^(is|was|,|the|planet|here|now)$/.test(tokens[k]!.word)) k += 1;
        // "so the ruler is stretched": a predicate, not a name; the planet before it is not the ruler (v8 M2).
        const predicate = /^(is|was)$/.test(tokens[after]?.word ?? "") && !tokens[k]?.point;
        ruler = predicate ? null : tokens[k]?.point && !ANGLES.has(tokens[k]!.point!.point) ? tokens[k]!.point!.point : pointAt(i - 1 - (left === target ? i - 1 - left.end + 1 : 0), -1, 4);
        if (ruler && ruler === of) ruler = null;
      }
      if (!ruler || (!target.houses.length && !target.signs.length && !target.chart && !of)) return;
      out.push({ ruler, houses: target.houses, signs: target.signs, chart: target.chart, of, text: tokens.slice(Math.max(0, Math.min(i, target.end) - 1), Math.max(i, target.end) + 2).map((x) => x.text).join(" ") });
    });
  }
  return out;
}

/** House, sign, chart and planet rulers claimed in the reading, against the rising sign, the [R1] line and the traditional rulers. */
function rulerViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  // A bold lead phrase ("**Saturn, the ruler.** Your chart ruler ...") is a sentence of its own here.
  for (const raw of reading.split(SENTENCE_SPLIT).flatMap((x) => x.split(/(?<=[.!?:]\*\*)\s+/))) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const modern = /\bmodern\b/i.test(sentence);
    // "Gemini rising would make Mercury the chart ruler": a hypothetical chart, not this one.
    const hypothetical = /\b(would|if|were|could|might|otherwise)\b/i.test(sentence);
    const rules = (sign: string, p: Point) => SIGN_RULERS[sign] === p || (modern && MODERN_RULERS[sign] === p);
    const charts = sentenceCharts(sheet, sentence);
    for (const c of rulerClaims(sentence)) {
      const push = (named: string, message: string) => out.push({ kind: "ruler-mismatch", mention: c.text, sentence, named, sheet: [], message });
      for (const sign of c.signs) {
        if (c.houses.length === 0 && !rules(sign, c.ruler)) push(`${c.ruler} rules ${sign}`, `says ${c.ruler} rules ${sign}, but ${sign}'s ruler is ${SIGN_RULERS[sign]} (traditional rulers).`);
      }
      for (const n of c.houses) {
        const risings = charts.map((x) => sheet.rising.get(x)).filter((x): x is string => !!x);
        if (hypothetical) continue;
        if (risings.length === 0) { push(`${c.ruler} rules house ${n}`, `names a ruler of house ${n}, but the sheet gives no rising sign, so there are no houses to rule.`); continue; }
        const signs = risings.map((r) => houseSign(r, n));
        const named = c.signs.length ? c.signs : null;
        if (named && !named.some((x) => signs.includes(x))) {
          push(`house ${n} in ${named.join(" or ")}`, `calls house ${n} ${named.join(" or ")}, but with ${[...new Set(risings)].join(" or ")} rising house ${n} is ${[...new Set(signs)].join(" or ")} (whole sign houses).`);
          continue;
        }
        if (signs.some((x) => rules(x, c.ruler))) continue;
        push(`${c.ruler} rules house ${n}`, `says ${c.ruler} rules house ${n}, but with ${[...new Set(risings)].join(" or ")} rising house ${n} is ${[...new Set(signs)].join(" or ")}, ruled by ${[...new Set(signs.map((x) => SIGN_RULERS[x]!))].join(" or ")} (whole sign houses, traditional rulers). ${c.ruler} rules ${houseList(sheet, charts, c.ruler)}.`);
      }
      if (c.chart && c.houses.length === 0 && c.signs.length === 0 && !hypothetical) {
        const rulers = charts.map((x) => sheet.chartRulers.get(x)).filter((x): x is Point => !!x);
        if (rulers.length && !rulers.includes(c.ruler)) push(`${c.ruler} rules the chart`, `makes ${c.ruler} the chart ruler, but the [R1] line gives ${[...new Set(rulers)].join(" or ")}.`);
      }
      if (c.of && c.houses.length === 0 && c.signs.length === 0 && !c.chart) {
        const signs = charts.flatMap((x) => [...(sheet.chartNatal.get(x)?.get(c.of!)?.signs ?? [])]);
        if (signs.length && !signs.some((x) => rules(x, c.ruler))) push(`${c.ruler} rules ${c.of}`, `makes ${c.ruler} the ruler of ${c.of}, but ${c.of} is in ${[...new Set(signs)].join(" or ")}, ruled by ${[...new Set(signs.map((x) => SIGN_RULERS[x]!))].join(" or ")} (the [L] line's domicile lord).`);
      }
    }
  }
  return out;
}

/** "rules the house where it sits", "rules its own house", "ruler of the house it occupies": rulership of the planet's own house, in words. */
const OCCUPIED_RULE = /\b(?:rules?|ruling|ruler of|lord of)\s+(?:both\s+)?(?:its own (?:house|sign)|the (?:very )?(?:house|sign) (?:(?:where|in which|that|which) )?it\b|the (?:house|sign) (?:that|which) (?:holds|contains) it\b)/gi;

/**
 * A planet said to rule the house it occupies must be in a sign it rules, since a whole sign house is its sign (v8 P2:
 * "Saturn also rules the house where it sits with Mars and Uranus, the second house", with Saturn in Gemini, ruled by Mercury).
 */
function occupiedRulerViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  for (const raw of reading.split(SENTENCE_SPLIT).flatMap((x) => x.split(/(?<=[.!?:]\*\*)\s+/))) {
    const sentence = raw.trim();
    if (!sentence || /\b(would|if|were|could|might|otherwise)\b/i.test(sentence)) continue;
    const modern = /\bmodern\b/i.test(sentence);
    const subject = tokenize(sentence).find((t) => t.point && !ANGLES.has(t.point.point))?.point?.point ?? null;
    const charts = sentenceCharts(sheet, sentence);
    for (const m of sentence.matchAll(OCCUPIED_RULE)) {
      const prefix = sentence.slice(0, m.index!).split(CLAUSE_SPLIT).at(-1)!;
      const before = tokenize(prefix);
      if (before.slice(-5).some((t) => /^(not|no|never|nor)$/.test(t.word))) continue;
      // The nearest planet before the verb, unless it follows an aspect word or "by", or an aspect, "by" or an ID lies between (then it is another relation's); else the sentence's subject.
      let planet: Point | null = null;
      for (let k = before.length - 1; k >= 0; k -= 1) {
        const t = before[k]!;
        if (t.word === "it" || t.word === "itself" || t.aspect || t.id || t.word === "by") break;
        if (!t.point) continue;
        // "squared by the Moon": the object of another relation.
        let j = k - 1;
        while (j >= 0 && /^(the|your|natal|transiting)$/.test(before[j]!.word)) j -= 1;
        if (!(before[j]?.aspect || before[j]?.word === "by")) planet = ANGLES.has(t.point.point) ? null : t.point.point;
        break;
      }
      planet ??= subject;
      if (!planet) continue;
      const p = planet;
      const places = charts.map((x) => ({ chart: x, natal: sheet.chartNatal.get(x)?.get(p) })).filter((x) => x.natal && x.natal.signs.size);
      if (!places.length) continue;
      const rules = (sign: string) => SIGN_RULERS[sign] === p || (modern && MODERN_RULERS[sign] === p);
      if (places.some((x) => [...x.natal!.signs].some(rules))) continue;
      const where = places.map((x) => `${[...x.natal!.signs].join(" or ")}${x.natal!.houses.size ? ` (whole sign house ${[...x.natal!.houses].join(" or ")})` : ""}${charts.length > 1 ? ` in chart ${x.chart}` : ""}`);
      const lords = [...new Set(places.flatMap((x) => [...x.natal!.signs].map((g) => SIGN_RULERS[g]!)))];
      out.push({
        kind: "ruler-mismatch", mention: m[0], sentence, named: `${p} rules its own house`, sheet: [],
        message: `says ${p} rules the house it occupies, but ${p} is in ${where.join(", ")}, ruled by ${lords.join(" or ")} (whole sign houses, traditional rulers). ${p} rules ${houseList(sheet, charts, p)}.`
      });
    }
  }
  return out;
}

/** "houses 12 and 3 (Gemini and Virgo)": the houses a planet rules. */
function houseList(sheet: Sheet, charts: string[], p: Point): string {
  const rising = sheet.rising.get(charts[0]!);
  if (!rising) return "no house on this sheet";
  const hs = [...Array(12).keys()].map((k) => k + 1).filter((n) => SIGN_RULERS[houseSign(rising, n)] === p);
  return hs.length ? `house ${hs.join(" and ")} (${hs.map((n) => houseSign(rising, n)).join(" and ")})` : "no sign";
}

/** The charts a sentence is about: those it names ("chart B", "the earlier occurrence"); every chart when it names none. */
function sentenceCharts(sheet: Sheet, sentence: string): string[] {
  const named = chartScope(sheet, sentence).named;
  return named.size === 1 ? [...named] : sheet.charts;
}

// ------------------------------------------------------------------ two charts (fold or gap)

/** "chart B", "the earlier occurrence", "the first 01:45": a chart named in words, with its place in the text. */
const CHART_NAME = /\b(?:chart|candidate|version|option) ([AB])\b|\b(earlier|first|later|second) (?:occurrence|chart|version|time|candidate|birth time|reading|one|\d{1,2}:\d{2})\b/gi;
const SHARED = /\b(?:both charts|both versions|both occurrences|both candidates|both times|both readings|in both|on both|either chart|either version|either occurrence|either candidate|either time|either way|whichever (?:chart|time|occurrence|version|one)|shared by both|common to both|the two charts share|both share|same in both)\b/i;
const EXCLUSIVE = /\bonly (?:in|for|on|with) (?:the )?(?:chart ([AB])|candidate ([AB])|(earlier|later|first|second) (?:chart|occurrence|version|time|candidate))\b/i;

interface ChartScope {
  /** Charts the sentence names in words. */
  named: Set<string>;
  /** The sentence says a fact holds in both charts. */
  shared: boolean;
  /** The sentence says a fact holds only in this chart. */
  exclusive: string | null;
}

const chartLetter = (m: RegExpExecArray | RegExpMatchArray) => (m[1] ? m[1].toUpperCase() : /^(earlier|first)$/i.test(m[2]!) ? "A" : "B");
/** "the later", "Earlier:", "in B", "A has": shorter names of a chart (capital letters only). */
const CHART_SHORT = /\b[Tt]he (earlier|later)\b(?! (?:than|part|half|weeks?|days?|months?|dates?|transits?|contacts?|stations?))|^\W*(Earlier|Later)\b(?=:)|\b(?:[Ii]n|[Ff]or|[Oo]n|[Uu]nder|[Ww]ith|[Ff]rom) ([AB])\b(?![-'\u2019])|\b([AB]) (?:has|have|gives|puts|alone|only|lists|adds)\b/g;

/** The charts a text names, with their places. */
function chartNames(text: string): { at: number; end: number; chart: string; text: string }[] {
  const out = [...text.matchAll(CHART_NAME)].map((m) => ({ at: m.index!, end: m.index! + m[0].length, chart: chartLetter(m), text: m[0] }));
  for (const m of text.matchAll(CHART_SHORT)) {
    if (out.some((x) => m.index! < x.end && m.index! + m[0].length > x.at)) continue;
    const word = m[1] ?? m[2];
    out.push({ at: m.index!, end: m.index! + m[0].length, chart: word ? (/^earlier$/i.test(word) ? "A" : "B") : (m[3] ?? m[4])!, text: m[0] });
  }
  return out.sort((a, b) => a.at - b.at);
}

function chartScope(sheet: Sheet, sentence: string): ChartScope {
  if (sheet.charts.length < 2) return { named: new Set(), shared: false, exclusive: null };
  // A chart's own ID ("[B-T3]") names its chart.
  const named = new Set([...chartNames(sentence).map((x) => x.chart), ...[...sentence.matchAll(/\[([AB])-[A-Z]\d+[a-z]?\]/g)].map((m) => m[1]!)]);
  const ex = EXCLUSIVE.exec(sentence);
  const exclusive = ex ? (ex[1] ?? ex[2])?.toUpperCase() ?? (/^(earlier|first)$/i.test(ex[3]!) ? "A" : "B") : null;
  return { named, shared: SHARED.test(sentence) && !exclusive, exclusive };
}

/**
 * The chart each sentence is under, by sentence: the one a heading or bold
 * lead names, until the next heading, or else the one an earlier sentence of
 * the same paragraph names ("In chart A, ... It sits in the eighth house.").
 */
function chartHeadings(reading: string): Map<string, string> {
  const out = new Map<string, string>();
  let carried: string | null = null;
  for (const paragraph of reading.split(/\n+/)) {
    let inParagraph: string | null = null;
    for (const raw of paragraph.split(SENTENCE_SPLIT)) {
      const sentence = raw.trim();
      if (!sentence) continue;
      const heading = /^#+\s*(.*)$/.exec(sentence)?.[1] ?? /^\*\*([^*]+)\*\*/.exec(sentence)?.[1];
      if (heading !== undefined) {
        const named = new Set(chartNames(heading).map((x) => x.chart));
        carried = named.size === 1 && !SHARED.test(heading) ? [...named][0]! : null;
      }
      const own = new Set([...chartNames(sentence).map((x) => x.chart), ...[...sentence.matchAll(/\[([AB])-[A-Z]\d+[a-z]?\]/g)].map((m) => m[1]!)]);
      if (own.size === 2 || SHARED.test(sentence)) inParagraph = null;
      else if (own.size === 1) inParagraph = [...own][0]!;
      const c = carried ?? inParagraph;
      if (c && own.size === 0) out.set(sentence, c);
    }
  }
  return out;
}

const MOVING_NOUNS = new Set(["contact", "contacts", "transit", "transits", "aspects", "aspect", "hits"]);

/**
 * Fold and gap sheets: each claim is checked against the chart it is
 * attributed to (a chart named in the sentence or the heading above it, or
 * the chart of a quoted ID). A contact said to hold in both charts must be on
 * both; one said to hold only in one chart must be missing from the other; a
 * contact only one chart has, named with no chart, is flagged; and a date or
 * orb quoted from one chart's line in a sentence that names no chart must be
 * the other chart's too.
 */
function chartViolations(sheet: Sheet, reading: string, mentions: Mention[]): Violation[] {
  const out: Violation[] = [];
  if (sheet.charts.length < 2) return out;
  const other = (c: string) => (c === "A" ? "B" : "A");
  const relIn = (c: string, a: Point, b: Point, type: AspectType | null, kinds: RelationKind[]) => sheet.relations.filter((r) => sheet.chartOf.get(r.id) === c && kinds.includes(r.kind)
    && (type === null || r.type === type) && (r.kind === "natal" ? (r.a === a && r.b === b) || (r.a === b && r.b === a) : r.a === a && r.b === b));
  const headingChart = chartHeadings(reading);
  const bySentence = new Map<string, Mention[]>();
  for (const m of mentions) if (!m.axis) bySentence.set(m.sentence, [...(bySentence.get(m.sentence) ?? []), m]);
  for (const [sentence, ms] of bySentence) {
    const scope = chartScope(sheet, sentence);
    const named = scope.named.size ? scope.named : headingChart.has(sentence) ? new Set([headingChart.get(sentence)!]) : new Set<string>();
    const quotedCharts = new Set([...sentence.matchAll(ID_G)].map((x) => sheet.chartOf.get(x[1]!)).filter((x): x is string => !!x));
    // A sentence that names both charts, or quotes both charts' lines, sets them side by side: only "only in" claims are checked.
    const sideBySide = scope.named.size === 2 || quotedCharts.size === 2;
    for (const m of ms) {
      const named0 = `${m.a} ${m.type} ${m.b}`;
      const moving: RelationKind[] = m.context === "station" ? ["station", "transit"] : ["transit", "station"];
      const kinds: RelationKind[] = m.context === "any" ? ["natal", ...moving] : moving;
      const present = sheet.charts.filter((c) => relIn(c, m.a, m.b, m.type, kinds).length);
      if (present.length === 0) continue;
      const lineOf = (c: string) => relIn(c, m.a, m.b, m.type, kinds).map((r) => r.line).join(" | ");
      const push = (message: string) => out.push({ kind: "chart-mismatch", mention: m.text, sentence, named: named0, sheet: present.map(lineOf), message });
      const citedChart = m.cited ? sheet.chartOf.get(m.cited) ?? null : null;
      if (scope.exclusive) {
        const x = scope.exclusive;
        if (present.includes(other(x))) push(`says only chart ${x} has ${named0}, but chart ${other(x)} has it too: ${lineOf(other(x))}. Check each chart's lines (the comparison lines give what differs).`);
        else if (!present.includes(x)) push(`says chart ${x} has ${named0}, but only chart ${other(x)} does: ${lineOf(other(x))}.`);
        continue;
      }
      if (sideBySide) continue;
      if (scope.shared && present.length === 1) { push(`says both charts have ${named0}, but only chart ${present[0]} does: ${lineOf(present[0]!)}.`); continue; }
      if (named.size === 1) {
        const x = [...named][0]!;
        if (!present.includes(x)) { push(`puts ${named0} in chart ${x}, but only chart ${other(x)} has it: ${lineOf(other(x))}.`); continue; }
        if (citedChart && citedChart !== x && scope.named.size === 1) { push(`quotes chart ${citedChart}'s [${m.cited}] in a sentence about chart ${x}; chart ${x}'s line is: ${lineOf(x)}.`); continue; }
        continue;
      }
      if (named.size === 0 && !scope.shared && present.length === 1 && !(citedChart && /^[AB]-/.test(m.cited!) && citedChart === present[0])) {
        push(`names ${named0}, which only chart ${present[0]} has (${lineOf(present[0]!)}), without saying which chart. Name the chart ("in chart ${present[0]}").`);
      }
    }
  }
  // "the Jupiter, Mars and Sun contacts to the Ascendant ... appear only in the later chart" (v6 F3).
  for (const raw of reading.split(SENTENCE_SPLIT)) {
    const sentence = raw.trim();
    const scope = chartScope(sheet, sentence);
    if (!scope.exclusive) continue;
    const x = scope.exclusive;
    for (const clause of sentence.split(CLAUSE_SPLIT)) {
      const tokens = tokenize(clause);
      tokens.forEach((t, i) => {
        if (!MOVING_NOUNS.has(t.word)) return;
        let j = i + 1;
        if (!/^(to|with|on)$/.test(tokens[j]?.word ?? "")) return;
        const lefts = pointsNear(tokens, i, -1, 1, REACH_FREE).indices.map((k) => tokens[k]!.point!.point);
        const rights = pointsNear(tokens, j, 1, 1, REACH_FREE).indices.map((k) => tokens[k]!.point!.point);
        for (const a of lefts) for (const b of rights) {
          const there = relIn(other(x), a, b, null, ["transit", "station"]);
          if (there.length) out.push({ kind: "chart-mismatch", mention: `${a} ${t.word} to ${b}`, sentence, named: `${a} ${t.word} to ${b}`, sheet: there.map((r) => r.line), message: `says the ${a} ${t.word} to the ${b} are only in chart ${x}, but chart ${other(x)} has ${there.map((r) => r.line).join(" | ")}. Check each chart's lines (the comparison lines give what differs).` });
        }
      });
    }
  }
  // A date or orb quoted from one chart's line in a sentence that names no chart, or says both, must be on the other chart's matching line too.
  for (const raw of reading.split(SENTENCE_SPLIT)) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const scope = chartScope(sheet, sentence);
    if (scope.named.size || scope.exclusive || headingChart.has(sentence)) continue;
    const quoted = [...sentence.matchAll(ID_G)].map((x) => x[1]!);
    const dates = datesIn(sentence);
    const orbs = [...sentence.matchAll(/\borbs? (?:of )?(\d+°\d{2}')/g)].map((x) => x[1]!);
    for (const id of quoted) {
      const c = sheet.chartOf.get(id);
      const r = sheet.relations.find((x) => x.id === id);
      if (!c || !r) continue;
      const twin = relIn(other(c), r.a, r.b, r.type, [r.kind]);
      if (!twin.length || twin.some((t) => quoted.includes(t.id))) continue;
      const own = sheet.lineDates.get(id) ?? [];
      const theirs = twin.flatMap((t) => sheet.lineDates.get(t.id) ?? []);
      const badDate = dates.find((d) => own.some((iso) => sameDate(d, iso)) && !theirs.some((iso) => sameDate(d, iso)));
      const theirOrbs = twin.flatMap((t) => sheet.lineOrbs.get(t.id) ?? []);
      const badOrb = orbs.find((o) => (sheet.lineOrbs.get(id) ?? []).includes(o) && !theirOrbs.includes(o));
      if (!badDate && !badOrb) continue;
      out.push({
        kind: "chart-mismatch", mention: badDate?.text ?? `orb ${badOrb}`, sentence, named: `[${id}] ${badDate ? badDate.text : `orb ${badOrb}`}`, sheet: [r.line, ...twin.map((t) => t.line)],
        message: `gives chart ${c}'s ${badDate ? `date ${badDate.text}` : `orb ${badOrb}`} for [${id}] without naming the chart, but chart ${other(c)}'s matching line differs: ${twin.map((t) => t.line).join(" | ")}. Say which chart, or give both charts' lines.`
      });
    }
  }
  out.push(...clockViolations(sheet, reading));
  return out;
}

/** "born before the clocks moved": the birth instant before the change (chart A, the earlier instant, on every fold or gap sheet). */
const BORN_BEFORE = /\bborn before the (?:change|clocks?|switch|jump)\b|\bbefore the clocks? (?:moved|changed|went|jumped|sprang)\b/gi;
const BORN_AFTER = /\bborn after the (?:change|clocks?|switch|jump)\b|\bafter the clocks? (?:moved|changed|went|jumped|sprang)\b|\bor after\b/gi;
/** "a clock that had not yet changed", "one still on the old offset": the clock the time was read from. */
const CLOCK_BEFORE = /\b(?:clocks?|one|watch) (?:that |which )?(?:had not (?:yet )?|hadn't (?:yet )?|has not (?:yet )?|hasn't (?:yet )?|was not (?:yet )?|wasn't (?:yet )?|not yet )(?:been )?(?:changed|moved|gone (?:forward|back)|sprung forward|switched|set forward|put forward|set back|put back)\b|\b(?:clocks?|one|watch) (?:that |which )?(?:was |were )?still (?:on|showing|reading)\b|\bthe old offset\b/gi;
const CLOCK_AFTER = /\b(?:clocks?|one|watch) (?:that |which )?(?:had|has|was|were) (?:already )?(?:been )?(?:changed|moved|gone (?:forward|back)|sprung forward|switched|set forward|put forward|set back|put back)\b|\b(?:clocks?|one|watch) (?:that |which )?(?:was |were )?already (?:on|showing|set|changed)\b|\bthe new offset\b/gi;

/** "a clock that had not yet changed (so chart A)": the clock state each chart is said to come from, against the sheet's chart headings (v6 G2). */
function clockViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  if (sheet.chartSides.size < 2) return out;
  for (const raw of reading.split(SENTENCE_SPLIT)) {
    const sentence = raw.trim();
    const states: { at: number; end: number; side: "before" | "after"; born: boolean }[] = [];
    const add = (re: RegExp, side: "before" | "after", born: boolean) => {
      for (const m of sentence.matchAll(re)) if (!states.some((x) => m.index! < x.end && m.index! + m[0].length > x.at)) states.push({ at: m.index!, end: m.index! + m[0].length, side, born });
    };
    add(CLOCK_BEFORE, "before", false);
    add(CLOCK_AFTER, "after", false);
    add(BORN_BEFORE, "before", true);
    add(BORN_AFTER, "after", true);
    states.sort((a, b) => a.at - b.at);
    if (!states.some((x) => !x.born) && !states.some((x) => x.born && !/^or after$/i.test(sentence.slice(x.at, x.end)))) continue;
    const names = chartNames(sentence).filter((x) => !/^(the |earlier|later)/i.test(x.text) || /occurrence|chart|version|candidate/i.test(x.text));
    for (const n of names) {
      // The state just before the chart's name, with no other chart named between; else the one just after it.
      const before = states.filter((x) => x.end <= n.at && n.at - x.end <= 100 && !names.some((o) => o !== n && o.at > x.end && o.at < n.at)).at(-1);
      const after = states.find((x) => x.at >= n.end && x.at - n.end <= 60 && !names.some((o) => o !== n && o.at > n.end && o.at < x.at));
      const state = before ?? after;
      const truth = sheet.chartSides.get(n.chart);
      if (!state || !truth) continue;
      // Born before the change: the earlier instant, chart A; a clock reading: the offset the chart reads the time on.
      if (state.born) {
        const side = n.chart === "A" ? "before" : "after";
        if (state.side === side) continue;
        out.push({
          kind: "chart-mismatch", mention: n.text, sentence, named: `${n.text} born ${state.side} the change`, sheet: [...sheet.chartLabels].map(([c, l]) => `Chart ${c}: ${l}`),
          message: `ties ${n.text} to a birth ${state.side} the clock change, but chart A is the earlier instant (before the change) and chart B the later (after it). Quote the [G] lines or the chart headings.`
        });
        continue;
      }
      if (state.side === truth.side) continue;
      out.push({
        kind: "chart-mismatch", mention: n.text, sentence, named: `${n.text} from a clock ${state.side} the change`, sheet: [...sheet.chartLabels].map(([c, l]) => `Chart ${c}: ${l}`),
        message: `ties ${n.text} to a clock ${state.side === "before" ? "not yet changed" : "already changed"}, but on the sheet chart ${n.chart} reads the time on ${truth.offset}, the offset ${truth.side} the change${sheet.charts.map((c) => c === n.chart ? "" : `; chart ${c} reads it on ${sheet.chartSides.get(c)?.offset}, ${sheet.chartSides.get(c)?.side} the change`).join("")}. Quote the [G] lines or the chart headings.`
      });
    }
  }
  return out;
}

const COUNT_NUMBER: Record<string, number> = { no: 0, none: 0, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
/** "Three planets sit on angles", "no planet is on an angle", "two of your planets are on the angles". */
const ANGLE_COUNT = /\b(no|none|one|a single|single|two|three|four|five|six|seven|eight|nine|ten|\d{1,2}) (?:of (?:the|your) )?(?:planets?|points?|bodies)(?: and (?:the )?(?:North )?Node)?(?: (?:sit|sits|are|is|lie|lies|fall|falls|stand|stands|placed|found|that sit|that are))? (?:on|at) (?:an |the |your )?angles?\b/gi;

/** A count of the planets on an angle must be the number of [C] lines (with or without the node), in the chart it is said of (v6 P7). */
function angleCountViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  const onAngle = (c: string) => sheet.relations.filter((x) => /(?:^|-)C\d+$/.test(x.id) && (sheet.charts.length < 2 || sheet.chartOf.get(x.id) === c));
  if (!sheet.angleLines.length) return out;
  for (const raw of reading.split(SENTENCE_SPLIT)) {
    const sentence = raw.trim();
    for (const m of sentence.matchAll(ANGLE_COUNT)) {
      const word = m[1]!.toLowerCase().replace(/^a /, "");
      const n = COUNT_NUMBER[word] ?? Number(word);
      const charts = sentenceCharts(sheet, sentence);
      const counts = charts.map((c) => onAngle(c));
      if (counts.some((list) => list.length === n || list.filter((x) => x.a !== "North Node").length === n)) continue;
      const list = counts[0]!;
      out.push({
        kind: "not-on-sheet", mention: m[0], sentence, named: m[0], sheet: sheet.angleLines,
        message: `says "${m[0]}", but the sheet's [C] lines put ${list.length} ${list.length === 1 ? "point" : "points"} on an angle${list.length ? ` (${list.map((x) => `[${x.id}] ${x.a}`).join(", ")})` : ""}${charts.length > 1 ? " in chart A, and " + counts[1]!.length + " in chart B" : ""}. Give the sheet's count, or name every [C] line; never count them yourself.`
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ angle contacts and houses

/** "the tenth house", "your 10th-house", "house 10": whole sign house numbers written in a sentence. */
const HOUSE_NUMBER = /\b(first|fourth|seventh|tenth|1st|4th|7th|10th)[- ]house\b|\bhouse (1|4|7|10)\b(?![-\d])/gi;

/**
 * An aspect to an angle read as a house: "[A11] Jupiter square Midheaven touches the parent side of the chart (the tenth
 * house)" when the Midheaven is in whole sign house 11 (v7 E1). A sentence that names the Midheaven or the IC and the house
 * of that angle by number (10 or 4) is flagged when the angle is in another whole sign house, unless another point the
 * sentence names, or a line it quotes, is in that house, or the sentence says it is not.
 */
function angleHouseViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  for (const raw of reading.split(SENTENCE_SPLIT)) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const tokens = tokenize(sentence);
    const named = tokens.filter((t) => t.point).map((t) => t.point!);
    const angles = new Set(named.filter((p) => p.point === "Midheaven").map((p) => (p.flip ? "IC" : "Midheaven")));
    if (!angles.size) continue;
    const charts = sentenceCharts(sheet, sentence);
    const quoted = [...sentence.matchAll(ID_G)].map((x) => sheet.ids.get(x[1]!) ?? "");
    for (const m of sentence.matchAll(HOUSE_NUMBER)) {
      const n = ORDINALS[(m[1] ?? "").toLowerCase()] ?? Number(m[2]);
      const angle = n === 10 ? "Midheaven" : n === 4 ? "IC" : null;
      if (!angle || !angles.has(angle)) continue;
      if (/\b(?:not|never|rather than|instead of|nor)\s+(?:in\s+)?(?:the|your)?\s*$/i.test(sentence.slice(0, m.index))) continue;
      const mcHouses = charts.flatMap((c) => [...(sheet.chartNatal.get(c)?.get("Midheaven")?.houses ?? [])]);
      if (!mcHouses.length) continue;
      const houses = angle === "Midheaven" ? mcHouses : mcHouses.map((h) => ((h + 5) % 12) + 1);
      if (houses.includes(n)) continue;
      // "Saturn in the tenth house squares the Midheaven": the house is another point's.
      const others = named.filter((p) => p.point !== "Midheaven").map((p) => p.point);
      if (others.some((p) => charts.some((c) => sheet.chartNatal.get(c)?.get(p)?.houses.has(n)))) continue;
      if (quoted.some((l) => new RegExp(`whole sign house ${n}\\b`).test(l))) continue;
      out.push({
        kind: "house-mismatch", mention: m[0], sentence, named: `${angle} as house ${n}`, sheet: [],
        message: `reads the ${angle} as "${m[0]}", but in whole sign houses the ${angle} degree is in house ${[...new Set(houses)].join(" or ")}, not house ${n}. A contact with the ${angle} is a contact with that degree, not a placement in house ${n}: name the angle, or the house it is in, and keep the two apart.`
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ group placements, window phases and "the same day"

/** "both in the eighth house", "are all in Scorpio": a house or sign said of every point before it. */
const GROUP_PLACE = new RegExp(`\\b(?:both|all|each|all three|all four|all of them|together)\\b,? (?:(?:are|sit|fall|lie|placed|found|now) )?in (?:the |your )?(?:(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\\d{1,2}(?:st|nd|rd|th))[- ]house|house (\\d{1,2})\\b|(${SIGN_RE})\\b)`, "g");

/**
 * "[A1] Moon trine Mercury and [A13] Sun conjunction Mercury, both in the eighth house" when the Moon is in the fourth
 * (v7 O2): a house or sign said of a group must be the natal house or sign of every planet named before it in the clause.
 * Sentences about transits or stations are not read.
 */
function groupPlaceViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  for (const raw of reading.split(SENTENCE_SPLIT)) {
    const sentence = raw.trim();
    if (!sentence || /\b(transiting|stationing|stations?|transits?)\b/i.test(sentence) || /\[(?:[AB]-)?[TSB]\d+[a-z]?\]/.test(sentence)) continue;
    if (/\b(would|if|were)\b/i.test(sentence)) continue;
    const charts = sentenceCharts(sheet, sentence);
    for (const m of sentence.matchAll(GROUP_PLACE)) {
      const head = sentence.slice(0, m.index).split(CLAUSE_SPLIT).at(-1)?.split("**").at(-1) ?? "";
      const points = [...new Set(tokenize(head).filter((t) => t.point && !ANGLES.has(t.point.point)).map((t) => t.point!.point))];
      if (points.length < 2) continue;
      const house = m[1] ? ORDINALS[m[1].toLowerCase()] ?? null : m[2] ? Number(m[2]) : null;
      const sign = m[3] ?? null;
      const wrong = points.filter((p) => {
        const at = charts.map((c) => sheet.chartNatal.get(c)?.get(p)).filter((x) => !!x);
        if (!at.length) return false;
        return house !== null ? at.every((x) => x!.houses.size > 0 && !x!.houses.has(house)) : at.every((x) => x!.signs.size > 0 && !x!.signs.has(sign!));
      });
      if (!wrong.length) continue;
      const where = (p: Point) => charts.flatMap((c) => [...((house !== null ? sheet.chartNatal.get(c)?.get(p)?.houses : sheet.chartNatal.get(c)?.get(p)?.signs) ?? [])]).join(" or ");
      out.push({
        kind: house !== null ? "house-mismatch" : "sign-mismatch", mention: m[0], sentence, named: `${points.join(", ")} ${m[0]}`, sheet: [],
        message: `puts ${points.join(", ")} "${m[0]}", but ${wrong.map((p) => `${p} is in ${house !== null ? "house " : ""}${where(p)}`).join(", ")} (the placement lines). An aspect has no house of its own: give each planet's own house.`
      });
    }
  }
  return out;
}

const WINDOW_END = /\b(?:near|toward|towards|at|by|close to|around) the (?:window's (?:end|close)|end of the window|close of the window)\b|\b(?:late|later) in the window\b|\bin the window's (?:last|final|closing) (?:weeks?|days|month)\b/i;
const WINDOW_START = /\b(?:near|at|around|close to) the (?:window's (?:start|opening|beginning)|start of the window|beginning of the window|opening of the window)\b|\bearly in the window\b|\bin the window's (?:first|opening) (?:weeks?|days|month)\b/i;

/** "Near the window's end, [S1a] ... falls in mid-November" in a window that starts 1 November (v7 O2): the dates must be in the last (or first) third, or half for "late (early) in the window". */
function windowPhaseViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  if (!sheet.window) return out;
  const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  const from = day(sheet.window.from);
  const span = day(sheet.window.to) - from;
  const year = Number(sheet.window.from.slice(0, 4));
  const isoOf = (d: DateAt) => {
    // A date written with no year: the year that puts it in the window.
    const y = d.year ?? (`${sheet.window!.from.slice(5)}` <= d.md ? year : year + 1);
    return `${y}-${d.md}`;
  };
  for (const raw of reading.split(SENTENCE_SPLIT)) {
    const sentence = raw.trim();
    const end = WINDOW_END.exec(sentence);
    const start = WINDOW_START.exec(sentence);
    const phrase = end ?? start;
    if (!phrase) continue;
    // "Near the window's end": the last third; "late in the window": the second half (and the same for the start).
    const loose = /\b(?:late|later|early) in\b/i.test(phrase[0]);
    const part = loose ? 1 / 2 : 1 / 3;
    const inPart = (iso: string) => (end ? day(iso) >= from + (1 - part) * span : day(iso) <= from + part * span);
    // A date not on the sheet is the date check's to flag.
    const written = datesIn(sentence).map(isoOf).filter((d) => sheet.allDates.has(d));
    const quoted = [...sentence.matchAll(ID_G)].map((x) => x[1]!).filter((id) => (sheet.lineDates.get(id) ?? []).length);
    const bad = written.length ? written.filter((d) => !inPart(d)) : quoted.filter((id) => !(sheet.lineDates.get(id) ?? []).some(inPart)).flatMap((id) => sheet.lineDates.get(id)!.slice(0, 1).map((d) => `${d} ([${id}])`));
    if (!bad.length || (written.length === 0 && quoted.length === 0)) continue;
    out.push({
      kind: "date-mismatch", mention: phrase[0], sentence, named: `"${phrase[0]}" for ${bad.join(", ")}`, sheet: quoted.map((id) => sheet.ids.get(id) ?? ""),
      message: `says "${phrase[0]}", but ${bad.join(", ")} is not in the ${end ? "last" : "first"} ${loose ? "half" : "third"} of the window (${sheet.window.from} to ${sheet.window.to}). Give the date instead.`
    });
  }
  return out;
}

const SAME_DAY = /\b(?:the|that) same (?:day|date)\b|\bthat day\b/gi;

/**
 * "[T5] ..., exact 2026-11-22 ... [T4] transiting Sun trine natal Moon falls the same day" when [T4] is exact 2026-11-21
 * (v7 O15): the lines quoted in the part of the sentence that says "the same day" must share a date with what it refers
 * to, the dates and lines written before it in the sentence, or else in the sentence before.
 */
function sameDayViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  const sentences = reading.split(SENTENCE_SPLIT).map((x) => x.trim());
  const datesOfText = (text: string): string[] => {
    const written = datesIn(text);
    if (written.length) return written.map((d) => `${d.year ?? "*"}-${d.md}`);
    return [...text.matchAll(ID_G)].flatMap((x) => sheet.lineDates.get(x[1]!) ?? []);
  };
  const agrees = (iso: string, ref: string[]) => ref.some((r) => r.slice(-5) === iso.slice(5) && (r.startsWith("*") || r.slice(0, 4) === iso.slice(0, 4)));
  sentences.forEach((sentence, si) => {
    for (const m of sentence.matchAll(SAME_DAY)) {
      // The segment that says it: from the last comma, "with" or "and" before the phrase to the next comma after it.
      const left = sentence.slice(0, m.index);
      const cut = Math.max(left.lastIndexOf(","), left.lastIndexOf(";"), left.search(/\b(?:with|and)\s+\[[^\]]*\][^\[]*$/));
      const nextComma = sentence.indexOf(",", m.index! + m[0].length);
      const segment = sentence.slice(cut + 1, nextComma < 0 ? sentence.length : nextComma);
      const ids = [...segment.matchAll(ID_G)].map((x) => x[1]!).filter((id) => (sheet.lineDates.get(id) ?? []).length && !/^(?:[AB]-)?[NB]\d+$/.test(id));
      if (!ids.length || datesIn(segment).length) continue;
      const before = sentence.slice(0, cut + 1);
      const ref = datesOfText(before).length ? datesOfText(before) : si > 0 ? datesOfText(sentences[si - 1]!) : [];
      if (!ref.length) continue;
      const wrong = ids.filter((id) => !(sheet.lineDates.get(id) ?? []).some((iso) => agrees(iso, ref)));
      if (!wrong.length) continue;
      out.push({
        kind: "date-mismatch", mention: m[0], sentence, named: `${wrong.map((id) => `[${id}]`).join(", ")} "${m[0]}"`, sheet: wrong.map((id) => sheet.ids.get(id) ?? ""),
        message: `says ${wrong.map((id) => `[${id}]`).join(", ")} falls "${m[0]}" as ${[...new Set(ref.map((r) => r.replace(/^\*-/, "")))].join(" or ")}, but ${wrong.map((id) => `[${id}] is dated ${(sheet.lineDates.get(id) ?? []).join(", ")}`).join("; ")}. Give each line's own date.`
      });
    }
  });
  return out;
}

/** "These are the only angle placements", "no other planet is on an angle": a list of the planets on an angle said to be complete. */
const ONLY_ANGLES = /\b(?:the|are) only (?:angle placements|angle contacts|angular planets|planets? (?:on|at) (?:an |the )?angles?|points? (?:on|at) (?:an |the )?angles?|planets? on (?:an |the )?angle)\b|\bno other (?:planet|point|body)s? (?:is |are |sits? |lies? )?(?:on|at) (?:an |the )?angles?\b|\bnothing else (?:is |sits? )?(?:on|at) (?:an |the )?angles?\b/i;

/**
 * A list of the planets on an angle said to be complete must name every [C] line of each chart it covers (v7 F1: chart A's
 * Jupiter and North Node called "the only angle placements", leaving out [A-C3] Mercury on the IC). The planets named in
 * the paragraph up to the claim count as listed.
 */
function onlyAngleViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  for (const paragraph of reading.split(/\n+/)) {
    const m = ONLY_ANGLES.exec(paragraph);
    if (!m) continue;
    const upto = paragraph.slice(0, m.index + m[0].length);
    const sentence = paragraph.split(SENTENCE_SPLIT).find((x) => x.includes(m[0])) ?? m[0];
    const listed = new Set(tokenize(upto).filter((t) => t.point && !ANGLES.has(t.point.point)).map((t) => t.point!.point));
    for (const x of upto.matchAll(ID_G)) {
      const r = sheet.relations.find((y) => y.id === x[1]);
      if (r && /(?:^|-)C\d+$/.test(r.id)) listed.add(r.a);
    }
    const named = chartScope(sheet, upto).named;
    const charts = named.size ? [...named] : sheet.charts;
    for (const c of charts) {
      const lines = sheet.relations.filter((x) => /(?:^|-)C\d+$/.test(x.id) && (sheet.charts.length < 2 || sheet.chartOf.get(x.id) === c));
      const missing = lines.filter((x) => !listed.has(x.a));
      if (!missing.length) continue;
      const label = sheet.charts.length > 1 ? ` chart ${c}'s` : " the sheet's";
      out.push({
        kind: "not-on-sheet", mention: m[0], sentence: sentence.trim(), named: `"${m[0]}" without ${missing.map((x) => `[${x.id}]`).join(", ")}`, sheet: missing.map((x) => x.line),
        message: `says "${m[0]}", but the list leaves out${label} ${missing.map((x) => `[${x.id}] ${x.a}`).join(", ")}: ${missing.map((x) => x.line).join(" | ")}. Name every [C] line of each chart, or drop "only".`
      });
    }
  }
  return out;
}

/** "... but not the rising sign", "the rising sign would stay": a birth-time shift said to leave the rising sign alone. */
const RISING_KEPT = /\b(?:but )?not (?:change )?(?:the|your) rising sign\b|\b(?:the |your )?rising sign (?:would |will )?(?:stay|stays|remain|remains|hold|holds|keep|keeps|survive|survives)\b|\b(?:keep|keeps|leave|leaves) (?:the|your) (?:same )?rising sign\b/i;

/**
 * A shift of the birth time said not to change the rising sign must be shorter than the [E] rising sign line's margin
 * that way (v7 O15: "141 minutes later ... but not the rising sign" when 75 minutes later gives Libra). The shift is the
 * last "N minutes earlier (later)" in the sentence or the one before.
 */
function risingKeptViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  if (!sheet.risingShift.size) return out;
  const sentences = reading.split(SENTENCE_SPLIT).map((x) => x.trim());
  sentences.forEach((sentence, si) => {
    const m = RISING_KEPT.exec(sentence);
    if (!m) return;
    const shifts = [...`${si > 0 ? sentences[si - 1] : ""} ${sentence}`.matchAll(/\b(\d+) minutes? (earlier|later)\b/g)];
    const last = shifts.at(-1);
    if (!last) return;
    const minutes = Number(last[1]);
    const dir = last[2] as "earlier" | "later";
    for (const c of sentenceCharts(sheet, sentence)) {
      const r = sheet.risingShift.get(c);
      const margin = r?.[dir];
      if (!r || margin === null || margin === undefined || minutes < margin) continue;
      out.push({
        kind: "sign-mismatch", mention: m[0], sentence, named: `rising sign kept at ${minutes} minutes ${dir}`, sheet: [r.line],
        message: `says a birth time ${minutes} minutes ${dir} keeps the rising sign, but the sheet says: ${r.line} Quote that line; the houses, chart ruler and angle contacts change with it.`
      });
      return;
    }
  });
  return out;
}

// ------------------------------------------------------------------ dispositor chains

const CHAIN_WORDS = new Set(["chain", "chains", "dispositor", "dispositors", "rulers", "lords", "roads"]);
const CHAIN_VERBS = new Set(["lead", "leads", "leading", "led", "run", "runs", "running", "end", "ends", "ending", "ended", "go", "goes", "return", "returns", "trace", "traces", "converge", "converges", "point", "points", "come", "comes", "flow", "flows", "terminate", "terminates", "finish", "finishes"]);
const TARGET_FILLER = new Set(["the", "a", "both", "either", "loop", "loops", "of", "and", ",", "-", "its", "own", "sign", "pair", "planet", "planets", "single", "with", "domicile", "mutual"]);
const PRONOUNS = new Set(["it", "itself", "them", "their", "these", "this", "that", "those", "they"]);

type ChainQuant = "all" | "most" | "plain";

/**
 * Summary claims about where the dispositor chains end, against the [L] lines: "most chains lead to Venus" (v7 O4),
 * "every chain ends at Jupiter", "everything runs back to Saturn", "Saturn at the end of every chain", "the chains
 * end at Mars and Mercury", "Mercury's chain ends at Venus", "the Sun, Moon and Venus all lead back to it", and "X is
 * the final dispositor". "Most" passes when more than half the chains, or more than end at any other place, end there.
 */
function dispositorViolations(sheet: Sheet, reading: string): Violation[] {
  const out: Violation[] = [];
  if (!sheet.chains.size) return out;
  let previous: Point[] = [];
  for (const raw of reading.split(SENTENCE_SPLIT).flatMap((x) => x.split(/(?<=[.!?:]\*\*)\s+/))) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const tokens = tokenize(sentence);
    const planets = (from: number, to: number) => tokens.slice(from, to).filter((t) => t.point && !ANGLES.has(t.point.point)).map((t) => t.point!.point);
    const own = planets(0, tokens.length);
    const hypothetical = /\b(would|if|were|could)\b/i.test(sentence);
    const charts = sentenceCharts(sheet, sentence).filter((c) => sheet.chains.has(c));
    const before = (i: number, skip: Point[] = []) => {
      const here = planets(0, i).filter((p) => !skip.includes(p));
      return here.length ? here : previous;
    };
    // The planets named after a preposition: "to Venus", "in the loop of Sun and Mars", "to it", "in their loop", "at itself".
    const targetsAt = (j: number, owner: Point | null, skip: Point[]): Point[] => {
      const got: Point[] = [];
      for (let k = j; k < tokens.length && k < j + 10; k += 1) {
        const t = tokens[k]!;
        if (t.point && !ANGLES.has(t.point.point)) { got.push(t.point.point); continue; }
        if (PRONOUNS.has(t.word) && !got.length) {
          if (t.word === "itself" && owner) return [owner];
          const ante = before(j, skip);
          if (/^(it|itself|this|that)$/.test(t.word) && !/^(pair|loop|planets)$/.test(tokens[k + 1]?.word ?? "")) return ante.slice(0, 1);
          return ante;
        }
        if (t.id && got.length) break;
        if (TARGET_FILLER.has(t.word) || t.id) continue;
        break;
      }
      return got;
    };
    const push = (named: string, lines: string[], message: string) => out.push({ kind: "ruler-mismatch", mention: named, sentence, named, sheet: lines, message });
    const endsOf = (c: string) => sheet.chains.get(c)!;
    const describe = (c: string) => {
      const groups = new Map<string, Point[]>();
      for (const x of endsOf(c)) groups.set(x.end.join(", "), [...(groups.get(x.end.join(", ")) ?? []), x.body]);
      return [...groups].map(([end, bodies]) => `${bodies.length} at ${end.includes(",") ? `the loop ${end}` : end} (${bodies.join(", ")})`).join("; ");
    };
    const finalLine = (c: string) => sheet.finalDispositor.get(c)?.line ?? "";
    const check = (quant: ChainQuant, bodies: Point[] | null, targets: Point[], phrase: Token[]) => {
      if (!targets.length || hypothetical) return;
      const text = phrase.map((x) => x.text).join(" ").replace(/ ([,'’])/g, "$1").replace(/^[,\s]+/, "");
      const what = `"${text}"${targets.every((p) => text.includes(p)) ? "" : ` (read as ${[...new Set(targets)].join(" and ")})`}`;
      if (out.some((v) => v.sentence === sentence && v.named === what)) return;
      for (const c of charts) {
        const list = endsOf(c).filter((x) => !bodies || bodies.includes(x.body));
        if (!list.length) continue;
        const hits = list.filter((x) => x.end.some((p) => targets.includes(p)));
        const label = charts.length > 1 || sheet.charts.length > 1 ? ` in chart ${c}` : "";
        if (bodies) {
          const wrong = list.filter((x) => !x.end.some((p) => targets.includes(p)));
          if (wrong.length) { push(what, wrong.map((x) => x.line), `says ${what}, but${label} ${wrong.map((x) => `${x.body}'s chain ends at ${x.end.join(", ")}`).join("; ")}. Quote the [L] line.`); return; }
          continue;
        }
        if (quant === "plain") {
          const all = new Set(list.flatMap((x) => x.end));
          const missing = targets.filter((p) => !all.has(p));
          if (missing.length) { push(what, [finalLine(c)], `says ${what}, but${label} no chain ends at ${missing.join(" or ")}: ${finalLine(c)} Quote [L11] as written.`); return; }
          continue;
        }
        const others = new Map<string, number>();
        for (const x of list) if (!x.end.some((p) => targets.includes(p))) others.set(x.end.join(","), (others.get(x.end.join(",")) ?? 0) + 1);
        const best = Math.max(0, ...others.values());
        const ok = quant === "all" ? hits.length === list.length : hits.length * 2 > list.length || hits.length > best;
        if (!ok) { push(what, [finalLine(c)], `says ${what}, but${label} the [L] chains end: ${describe(c)}. ${finalLine(c)} Quote [L11] and the chains as written; never count or rank them yourself.`); return; }
      }
    };
    // "X is the final dispositor", "[L11] makes Saturn the final dispositor", "Final dispositor: Mars".
    const negatedFinal = /\b(?:no|not|none|nor|without|never|isn't|is not)\b(?:\s+\S+){0,3}\s+final dispositor|final dispositor[:,]?\s+none|\bnone as (?:a |the )?final dispositor/i.test(sentence);
    tokens.forEach((t, i) => {
      if (t.word !== "final" || tokens[i + 1]?.word !== "dispositor" || negatedFinal || hypothetical) return;
      let claimed: Point | null = null;
      for (let k = i - 1, n = 0; k >= 0 && n < 4; k -= 1, n += 1) {
        const x = tokens[k]!;
        if (x.point) { claimed = ANGLES.has(x.point.point) ? null : x.point.point; break; }
        if (!/^(is|the|as|,|was|make|makes|made|be|its|chart's|sole|only|single)$/.test(x.word)) break;
      }
      if (!claimed) for (let k = i + 2, n = 0; k < tokens.length && n < 3; k += 1, n += 1) {
        const x = tokens[k]!;
        if (x.point) { claimed = ANGLES.has(x.point.point) ? null : x.point.point; break; }
        if (!/^(is|the|,|planet|here)$/.test(x.word)) break;
      }
      if (!claimed) return;
      for (const c of charts) {
        const f = sheet.finalDispositor.get(c);
        if (!f || f.planet === claimed) continue;
        push(`${claimed} final dispositor`, [f.line], `makes ${claimed} the final dispositor, but the sheet says: ${f.line} Quote [L11] as written.`);
      }
    });
    tokens.forEach((t, i) => {
      // "Saturn at the end of every chain", "Mercury at the end of the chains".
      if (t.word === "end" && tokens[i - 1]?.word === "the" && tokens[i - 2]?.word === "at" && tokens[i + 1]?.word === "of") {
        const rest = tokens.slice(i + 2, i + 6).map((x) => x.word);
        const chainAt = rest.findIndex((w) => w === "chain" || w === "chains");
        if (chainAt < 0 || tokens[i + 2 + chainAt + 1]?.text.endsWith("s") && /^(chain)$/.test(tokens[i + 2 + chainAt + 1]?.word ?? "")) return;
        if (tokens.slice(i + 2, i + 2 + chainAt).some((x) => x.point || x.id || /^(its|their|his|her)$/.test(x.word))) return;
        const quant: ChainQuant = rest.some((w) => /^(every|all|each)$/.test(w)) ? "all" : rest.includes("most") ? "most" : "plain";
        const subject = planets(Math.max(0, i - 4), i - 2);
        if (subject.length) check(quant, null, subject, tokens.slice(Math.max(0, i - 4), i + 3 + chainAt));
        return;
      }
      if (!CHAIN_VERBS.has(t.word)) return;
      let j = i + 1;
      if (tokens[j]?.word === "back") j += 1;
      if (!/^(to|at|in|on|into|with)$/.test(tokens[j]?.word ?? "")) return;
      const back = j > i + 1;
      // Up to 6 tokens before the verb: the subject.
      const from = Math.max(0, i - 6);
      const left = tokens.slice(from, i);
      // "Venus rules the chart, and most chains lead to it": the subject starts after the last "and" when the quantifier or the chain word is after it.
      const lastAnd = left.map((x) => x.word).lastIndexOf("and");
      const cut = lastAnd > -1 && left.slice(lastAnd + 1).some((x) => CHAIN_WORDS.has(x.word) || /^(most|all|every|each|everything|majority)$/.test(x.word)) ? lastAnd + 1 : 0;
      const subj = left.slice(cut).filter((x) => !(STOP_WORDS.has(x.word) && x.word !== "and" && !CHAIN_WORDS.has(x.word)));
      const words = subj.map((x) => x.word);
      const chainy = words.some((w) => CHAIN_WORDS.has(w));
      const quantWord = words.find((w) => /^(most|majority|all|every|each|everything)$/.test(w));
      // "nearly every planet", "almost all": most.
      const nearly = words.some((w, k) => /^(nearly|almost|virtually|practically)$/.test(w) && /^(all|every|each|everything)$/.test(words[k + 1] ?? ""));
      const quant: ChainQuant | null = quantWord === "most" || quantWord === "majority" || nearly ? "most" : quantWord ? "all" : chainy ? "plain" : null;
      if (!quant) return;
      if (quantWord === "everything" && !back && !tokens.some((x) => CHAIN_WORDS.has(x.word))) return;
      if (quantWord && !chainy && quantWord !== "everything" && !back) return;
      if (/^(many|some|several|few|one|two|three|four|other)$/.test(words.find((w) => /^(many|some|several|few|one|two|three|four|other)$/.test(w)) ?? "")) return;
      // The chain's owner: "Mercury's chain", "the chain of Mars", "[L3]", "Its chain", or a list "the Sun, Moon and Venus all lead back".
      const ci = subj.findIndex((x) => x.word === "chain" || x.word === "chains");
      let bodies: Point[] | null = null;
      if (ci >= 0) {
        const pre = subj[ci - 1];
        const post = subj[ci + 1]?.word === "of" ? subj[ci + 2] : undefined;
        if (pre?.point && /['’]s$/.test(pre.text)) bodies = [pre.point.point];
        else if (pre?.word === "its" && subj[ci]!.word === "chain") bodies = before(from + cut).slice(0, 1);
        else if (post?.point) bodies = [post.point.point];
        else if (pre?.point && subj[ci]!.word === "chains") {
          // "Your Sun and Moon chains both lead to Mars".
          let k = from + cut + ci - 1;
          while (k > 0 && (tokens[k - 1]!.point || tokens[k - 1]!.joiner)) k -= 1;
          bodies = planets(k, from + cut + ci);
        }
        else {
          const lid = subj.find((x) => x.id && /^(?:[AB]-)?L\d+$/.test(x.id) && !/^(?:[AB]-)?L1[12]$/.test(x.id));
          const line = lid ? sheet.ids.get(lid.id!) : undefined;
          const body = line ? new RegExp(`^${ID("L")} (${POINT_RE}) in`).exec(line)?.[1] : undefined;
          if (body) bodies = [body as Point];
        }
        if (bodies && !bodies.length) return;
        if (!bodies && subj[ci]!.word === "chain" && quant === "plain") return;
      } else if (quantWord === "all" && (back || tokens[i - 1]?.word === "all")) {
        // "Your Sun, Venus, Mars, Jupiter and Pluto all trace back to it": the whole list before "all".
        let k = i - 1;
        while (k > 0 && (tokens[k - 1]!.point || tokens[k - 1]!.joiner || /^(the|your|all)$/.test(tokens[k - 1]!.word))) k -= 1;
        const listed = planets(k, i);
        if (listed.length) bodies = listed;
      }
      const targets = targetsAt(j + 1, bodies?.[0] ?? null, bodies ?? []);
      check(quant, bodies, targets, tokens.slice(from + cut, Math.min(tokens.length, j + 4)));
    });
    if (own.length) previous = own;
  }
  return out;
}

const same = (r: Relation, a: Point, b: Point, type: AspectType, kinds: RelationKind[], ordered: boolean) =>
  kinds.includes(r.kind) && r.type === type && (r.a === a && r.b === b || (!ordered && r.a === b && r.b === a));

/** Checks a reading against a sheet. */
export function checkReading(sheetText: string, reading: string): CheckResult {
  const sheet = parseSheet(sheetText);
  const violations: Violation[] = [];
  const cited = [...new Set([...reading.matchAll(ID_G)].map((m) => m[1]!))];
  const sentences = reading.split(SENTENCE_SPLIT).map((x) => x.trim());
  for (const id of cited) {
    const sentence = sentences.find((x) => x.includes(`[${id}]`)) ?? "";
    if (!sheet.ids.has(id)) violations.push({ kind: "unknown-id", mention: `[${id}]`, sentence, named: `[${id}]`, sheet: [], message: `[${id}] is not an ID on the sheet.` });
  }
  const mentions = findMentions(reading);
  for (const m of mentions) {
    const named = m.axis ? `${m.a} on the ${m.b} axis (conjunction or opposition ${m.b})` : `${m.a} ${m.type} ${m.b}`;
    const moving: RelationKind[] = m.context === "station" ? ["station", "transit"] : ["transit", "station"];
    const kinds: RelationKind[] = m.context === "any" ? ["natal", ...moving] : moving;
    const pair = sheet.relations.filter((r) => (r.a === m.a && r.b === m.b) || (r.a === m.b && r.b === m.a));
    const lines = [...new Set(pair.map((r) => r.line))];
    const angleClaim = (ANGLES.has(m.a) || ANGLES.has(m.b)) && (m.type === "conjunction" || m.type === "opposition");
    const angleHint = angleClaim && sheet.angleLines.length ? ` Planets on an angle, per the sheet: ${sheet.angleLines.join(" | ")}` : "";
    if (m.axis) {
      const onAxis = pair.some((r) => r.kind === "natal" && (r.type === "conjunction" || r.type === "opposition"));
      if (!onAxis) violations.push({ kind: "not-on-sheet", mention: m.text, sentence: m.sentence, named, sheet: lines, message: `names ${named}, which is not on the sheet${lines.length ? `; the sheet has for these points: ${lines.join(" | ")}` : ""}.${angleHint}` });
      continue;
    }
    const ok = sheet.relations.some((r) => r.kind === "natal" ? m.a !== m.b && same(r, m.a, m.b, m.type, kinds, false) : same(r, m.a, m.b, m.type, kinds, true));
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
      violations.push({ kind: "wrong-aspect", mention: m.text, sentence: m.sentence, named, sheet: lines, message: `names ${named}, but the sheet gives a different aspect for these points: ${otherType.map((r) => r.line).join(" | ")}${angleHint ? `.${angleHint}` : ""}` });
    } else {
      const what = m.context === "any" ? "an aspect, transit or station contact" : m.context === "station" ? "a station contact or transit" : "a transit or station contact";
      violations.push({ kind: "not-on-sheet", mention: m.text, sentence: m.sentence, named, sheet: lines, message: `names ${named}, which is not ${what} on the sheet${lines.length ? `; the sheet has for these points: ${lines.join(" | ")}` : ""}${angleHint ? `.${angleHint}` : ""}` });
    }
  }
  violations.push(...birthdayViolations(sheet, reading));
  // A date the birthday check already flagged is not flagged twice.
  const flagged = new Set(violations.filter((v) => v.kind === "date-mismatch").map((v) => `${v.sentence}|${v.mention}`));
  violations.push(...dateViolations(sheet, reading).filter((v) => !flagged.has(`${v.sentence}|${v.mention}`)));
  violations.push(...placementViolations(sheet, reading), ...angularViolations(sheet, reading), ...rulerViolations(sheet, reading), ...occupiedRulerViolations(sheet, reading), ...angleCountViolations(sheet, reading), ...angleHouseViolations(sheet, reading), ...dispositorViolations(sheet, reading), ...groupPlaceViolations(sheet, reading),
    ...windowPhaseViolations(sheet, reading), ...sameDayViolations(sheet, reading), ...onlyAngleViolations(sheet, reading), ...risingKeptViolations(sheet, reading), ...chartViolations(sheet, reading, mentions));
  return { ok: violations.length === 0, mentions: mentions.length, violations, cited };
}

/** The violations as a numbered list, for a revision prompt. */
export function formatViolations(result: CheckResult): string {
  return result.violations.map((v, i) => `${i + 1}. ${v.sentence ? `In "${v.sentence}": ` : ""}${v.message}`).join("\n");
}
