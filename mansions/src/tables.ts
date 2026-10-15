/** Tables describe conventions; obtaining one does not calculate a Moon position. */
export interface RationalDegrees {
  readonly numerator: number;
  readonly denominator: number;
}

export interface MansionDefinition {
  /** One-based index in the cited sequence. */
  readonly index: number;
  readonly arabicName: string;
  /** Editorially normalized Latin transliteration of the attested name. */
  readonly latinLabel: string;
  readonly start: RationalDegrees;
  /** Unwrapped exclusive end, including 360 degrees for the final row. */
  readonly end: RationalDegrees;
  readonly nameSource: {
    readonly id: "biruni-sachau-1879";
    readonly page: number;
    readonly entry: number;
  };
}

export interface BoundaryTable {
  readonly id: "equal28-aries-v1";
  readonly version: 1;
  readonly kind: "equal-longitude-segments";
  readonly zeroPoint: {
    readonly degrees: 0;
    readonly description: "0 degrees Aries in the explicitly selected zodiac";
  };
  readonly intervalConvention: "[start,end)";
  readonly width: RationalDegrees;
  readonly provenance: "SOURCES.md#equal28-aries-v1";
  readonly mansions: readonly MansionDefinition[];
}

// Names follow al-Biruni, tr. Sachau (1879), chapter XXI, pp. 343-350.
// Arabic spelling and Latin normalization are documented in SOURCES.md.
// Endpoints are authored as integer sevenths of a degree, never as rounded DMS.
const rows = [
  [1, "الشرطان", "al-Sharaṭān", 0, 90, 343],
  [2, "البطين", "al-Buṭayn", 90, 180, 343],
  [3, "الثريا", "al-Thurayyā", 180, 270, 343],
  [4, "الدبران", "al-Dabarān", 270, 360, 344],
  [5, "الهقعة", "al-Haqʿa", 360, 450, 344],
  [6, "الهنعة", "al-Hanʿa", 450, 540, 344],
  [7, "الذراع", "al-Dhirāʿ", 540, 630, 345],
  [8, "النثرة", "al-Nathra", 630, 720, 345],
  [9, "الطرف", "al-Ṭarf", 720, 810, 345],
  [10, "الجبهة", "al-Jabha", 810, 900, 345],
  [11, "الزبرة", "al-Zubra", 900, 990, 346],
  [12, "الصرفة", "al-Ṣarfa", 990, 1080, 346],
  [13, "العواء", "al-ʿAwwāʾ", 1080, 1170, 346],
  [14, "السماك الأعزل", "al-Simāk al-Aʿzal", 1170, 1260, 346],
  [15, "الغفر", "al-Ghafr", 1260, 1350, 347],
  [16, "الزبانا", "al-Zubānā", 1350, 1440, 347],
  [17, "الإكليل", "al-Iklīl", 1440, 1530, 347],
  [18, "القلب", "al-Qalb", 1530, 1620, 348],
  [19, "الشولة", "al-Shawla", 1620, 1710, 348],
  [20, "النعائم", "al-Naʿāʾim", 1710, 1800, 348],
  [21, "البلدة", "al-Balda", 1800, 1890, 348],
  [22, "سعد الذابح", "Saʿd al-Dhābiḥ", 1890, 1980, 349],
  [23, "سعد بلع", "Saʿd Bulaʿ", 1980, 2070, 349],
  [24, "سعد السعود", "Saʿd al-Suʿūd", 2070, 2160, 349],
  [25, "سعد الأخبية", "Saʿd al-Akhbiya", 2160, 2250, 349],
  [26, "الفرغ الأول", "al-Fargh al-Awwal", 2250, 2340, 349],
  [27, "الفرغ الثاني", "al-Fargh al-Thānī", 2340, 2430, 350],
  [28, "بطن الحوت", "Baṭn al-Ḥūt", 2430, 2520, 350]
] as const;

const degrees = (numerator: number): RationalDegrees => Object.freeze({ numerator, denominator: 7 });

/** A project-defined equal division with a cited traditional naming sequence. */
export const EQUAL28_ARIES_V1: BoundaryTable = Object.freeze({
  id: "equal28-aries-v1",
  version: 1,
  kind: "equal-longitude-segments",
  zeroPoint: Object.freeze({
    degrees: 0,
    description: "0 degrees Aries in the explicitly selected zodiac"
  }),
  intervalConvention: "[start,end)",
  width: degrees(90),
  provenance: "SOURCES.md#equal28-aries-v1",
  mansions: Object.freeze(rows.map(([index, arabicName, latinLabel, start, end, page]) => Object.freeze({
    index, arabicName, latinLabel,
    start: degrees(start),
    end: degrees(end),
    nameSource: Object.freeze({ id: "biruni-sachau-1879" as const, page, entry: index })
  })))
});

export type BoundaryTableId = BoundaryTable["id"];

/** Selection is mandatory. Unknown, missing and unversioned identifiers fail. */
export function getBoundaryTable(id: BoundaryTableId): BoundaryTable {
  if (id !== "equal28-aries-v1") throw new RangeError("Select a supported versioned mansion table.");
  return EQUAL28_ARIES_V1;
}
