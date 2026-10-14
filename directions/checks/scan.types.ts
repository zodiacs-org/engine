import { parseScan, scan } from "../src/index.js";
import type {
  DirectionAgeRange, DirectionHit, DirectionMotionConvention, HitRefusal,
  ScanComplete, ScanIndex, ScanInput, ScanRefusal, ScanResult, ScanRow, ScanWork,
  SolarEquatorialDay
} from "../src/index.js";

const zodiacalSelection = {
  significator: { kind: "body", id: "S", coordinates: { longitudeDegrees: 350, latitudeDegrees: 4 } },
  promissor: { kind: "body", id: "P", coordinates: { longitudeDegrees: 10, latitudeDegrees: -7 } },
  contact: { kind: "conjunction" }
} as const;
const mundaneSelection = {
  significator: { kind: "body", id: "S", coordinates: { rightAscensionDegrees: 320, declinationDegrees: 20 } },
  promissor: { kind: "body", id: "P", coordinates: { rightAscensionDegrees: 30, declinationDegrees: -20 } },
  contact: { kind: "aspect", aspect: "square", branch: "eastward" }
} as const;
const zodiacal = {
  convention: { system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both", key: "ptolemy" },
  geometry: { ramcDegrees: 0, latitudeDegrees: 0, trueObliquityDegrees: 0 },
  selections: [zodiacalSelection], motions: [{ motion: "direct" }],
  yearUnit: "tropical-365.2422-days",
  ageRange: { fromYears: 0, toYears: 100, includeFrom: true, includeTo: false },
  maxEvaluations: 10
} as const satisfies ScanInput;
const mundane = {
  ...zodiacal,
  convention: { system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", key: "naibod" },
  geometry: { ramcDegrees: 0, latitudeDegrees: 45 },
  selections: [mundaneSelection],
  motions: [{ motion: "direct" }, { motion: "converse", converseConstruction: "placidus-role-swap" }],
  yearUnit: "julian-365.25-days"
} as const satisfies ScanInput;
const samples = {
  timeScale: "tt", frame: "true-equator-equinox-of-date", center: "geocentric", correction: "apparent",
  start: { jdTt: 2451545, rightAscensionDegrees: 359.75 },
  end: { jdTt: 2451546, rightAscensionDegrees: 0.25 }
} as const satisfies SolarEquatorialDay;
const solar = {
  ...zodiacal, convention: { ...zodiacal.convention, key: "solar-equatorial-birth-day" }, solar: samples
} as const satisfies ScanInput;
const angle = {
  ...zodiacal, selections: [{ ...zodiacalSelection, significator: { kind: "angle", angle: "mc" } }]
} as const satisfies ScanInput;
const zodiacalAspects = {
  ...zodiacal, selections: [
    { ...zodiacalSelection, contact: { kind: "aspect", aspect: "opposition" } },
    { ...zodiacalSelection, contact: { kind: "aspect", aspect: "trine", branch: "sinister" } },
    { ...zodiacalSelection, contact: { kind: "aspect", aspect: "sextile", branch: "dexter" } }
  ]
} as const satisfies ScanInput;
const mundaneAspects = {
  ...mundane, selections: [
    { ...mundaneSelection, contact: { kind: "aspect", aspect: "opposition" } },
    { ...mundaneSelection, contact: { kind: "aspect", aspect: "trine", branch: "westward" } }
  ]
} as const satisfies ScanInput;

const { convention: _convention, ...noConvention } = zodiacal;
const { geometry: _geometry, ...noGeometry } = zodiacal;
const { selections: _selections, ...noSelections } = zodiacal;
const { motions: _motions, ...noMotions } = zodiacal;
const { yearUnit: _yearUnit, ...noYearUnit } = zodiacal;
const { ageRange: _ageRange, ...noAgeRange } = zodiacal;
const { maxEvaluations: _maxEvaluations, ...noMaxEvaluations } = zodiacal;
const { system: _system, ...noSystem } = zodiacal.convention;
const { mode: _mode, ...noMode } = zodiacal.convention;
const { latitude: _latitude, ...noLatitude } = zodiacal.convention;
const { key: _key, ...noKey } = zodiacal.convention;
const { fromYears: _fromYears, ...noFromYears } = zodiacal.ageRange;
const { toYears: _toYears, ...noToYears } = zodiacal.ageRange;
const { includeFrom: _includeFrom, ...noIncludeFrom } = zodiacal.ageRange;
const { includeTo: _includeTo, ...noIncludeTo } = zodiacal.ageRange;
const { significator: _significator, ...noSignificator } = zodiacalSelection;
const { promissor: _promissor, ...noPromissor } = zodiacalSelection;
const { contact: _contact, ...noContact } = zodiacalSelection;
const prebuiltMotionConvention = { ...zodiacal.convention, motion: "direct" } as const;
const prebuiltConverseConvention = { ...zodiacal.convention, converseConstruction: "placidus-role-swap" } as const;

// @ts-expect-error The full convention cannot be inferred.
const missingConvention: ScanInput = noConvention;
// @ts-expect-error The shared sphere geometry is explicit.
const missingGeometry: ScanInput = noGeometry;
// @ts-expect-error No contacts are enumerated implicitly.
const missingSelections: ScanInput = noSelections;
// @ts-expect-error Motions are a required selection.
const missingMotions: ScanInput = noMotions;
// @ts-expect-error The directed-year unit is explicit.
const missingYearUnit: ScanInput = noYearUnit;
// @ts-expect-error The age interval is explicit.
const missingAgeRange: ScanInput = noAgeRange;
// @ts-expect-error The evaluation budget is explicit.
const missingMaxEvaluations: ScanInput = noMaxEvaluations;
// @ts-expect-error The shared system is explicit.
const missingSystem: ScanInput = { ...zodiacal, convention: noSystem };
// @ts-expect-error The shared mode is explicit.
const missingMode: ScanInput = { ...zodiacal, convention: noMode };
// @ts-expect-error The shared latitude policy is explicit.
const missingLatitude: ScanInput = { ...zodiacal, convention: noLatitude };
// @ts-expect-error The timing key is explicit.
const missingKey: ScanInput = { ...zodiacal, convention: noKey };
// @ts-expect-error An interval requires its lower age.
const missingFromYears: ScanInput = { ...zodiacal, ageRange: noFromYears };
// @ts-expect-error An interval requires its upper age.
const missingToYears: ScanInput = { ...zodiacal, ageRange: noToYears };
// @ts-expect-error Lower endpoint inclusion is explicit.
const missingIncludeFrom: ScanInput = { ...zodiacal, ageRange: noIncludeFrom };
// @ts-expect-error Upper endpoint inclusion is explicit.
const missingIncludeTo: ScanInput = { ...zodiacal, ageRange: noIncludeTo };
// @ts-expect-error Endpoint inclusion is boolean, not a string flag.
const invalidEndpoint: ScanInput = { ...zodiacal, ageRange: { ...zodiacal.ageRange, includeTo: "yes" } };
// @ts-expect-error The budget is a number, not a string.
const stringBudget: ScanInput = { ...zodiacal, maxEvaluations: "10" };
// @ts-expect-error Calendar anniversaries are not a supported elapsed-year unit.
const calendarYear: ScanInput = { ...zodiacal, yearUnit: "calendar-year" };
// @ts-expect-error Every selection requires a significator.
const missingSignificator: ScanInput = { ...zodiacal, selections: [noSignificator] };
// @ts-expect-error Every selection requires a promissor.
const missingPromissor: ScanInput = { ...zodiacal, selections: [noPromissor] };
// @ts-expect-error Every selection requires an explicit contact.
const missingContact: ScanInput = { ...zodiacal, selections: [noContact] };
// @ts-expect-error One selection is still supplied in an array.
const scalarSelection: ScanInput = { ...zodiacal, selections: zodiacalSelection };
// @ts-expect-error One motion is still supplied in an array.
const scalarMotion: ScanInput = { ...zodiacal, motions: { motion: "direct" } };
// @ts-expect-error Each motion is an explicit object.
const stringMotion: ScanInput = { ...zodiacal, motions: ["direct"] };
// @ts-expect-error Shared conventions do not contain per-hit motion.
const commonMotion: ScanInput = { ...zodiacal, convention: { ...zodiacal.convention, motion: "direct" } };
// @ts-expect-error Shared conventions reject motion even in prebuilt objects.
const prebuiltCommonMotion: ScanInput = { ...zodiacal, convention: prebuiltMotionConvention };
// @ts-expect-error Converse construction belongs to the selected motion.
const commonConverse: ScanInput = { ...zodiacal, convention: { ...zodiacal.convention, converseConstruction: "placidus-role-swap" } };
// @ts-expect-error A prebuilt shared convention also forbids converse construction.
const prebuiltCommonConverse: ScanInput = { ...zodiacal, convention: prebuiltConverseConvention };
// @ts-expect-error An explicitly undefined common motion is still a supplied field.
const undefinedCommonMotion: ScanInput = { ...zodiacal, convention: { ...zodiacal.convention, motion: undefined } };
// @ts-expect-error Converse requires its named construction in each motion item.
const unnamedConverse: ScanInput = { ...zodiacal, motions: [{ motion: "converse" }] };
// @ts-expect-error Direct motion cannot carry a converse construction.
const irrelevantConverse: ScanInput = { ...zodiacal, motions: [{ motion: "direct", converseConstruction: "placidus-role-swap" }] };
// @ts-expect-error An unsupported construction cannot be silently reinterpreted.
const unsupportedConverse: ScanInput = { ...zodiacal, motions: [{ motion: "converse", converseConstruction: "reverse-rotation" }] };
// @ts-expect-error Zodiacal mode is paired with zero-both latitude policy.
const mixedZodiacalLatitude: ScanInput = { ...zodiacal, convention: { ...zodiacal.convention, latitude: "retain-both" } };
// @ts-expect-error Mundane mode is paired with retain-both latitude policy.
const mixedMundaneLatitude: ScanInput = { ...mundane, convention: { ...mundane.convention, latitude: "zero-both" } };
// @ts-expect-error A mundane convention cannot select zodiacal coordinates.
const mixedMode: ScanInput = { ...zodiacal, convention: mundane.convention };
// @ts-expect-error A zodiacal scan cannot mix equatorial and ecliptic selections.
const mixedSelections: ScanInput = { ...zodiacal, selections: [zodiacalSelection, mundaneSelection] };
// @ts-expect-error Zodiacal promissors need ecliptic coordinates.
const mixedPromissor: ScanInput = { ...zodiacal, selections: [{ ...zodiacalSelection, promissor: mundaneSelection.promissor }] };
// @ts-expect-error Mundane significators need equatorial coordinates.
const mixedSignificator: ScanInput = { ...mundane, selections: [{ ...mundaneSelection, significator: zodiacalSelection.significator }] };
// @ts-expect-error Zodiacal contacts use dexter or sinister branches.
const mixedZodiacalBranch: ScanInput = { ...zodiacal, selections: [{ ...zodiacalSelection, contact: mundaneSelection.contact }] };
// @ts-expect-error Mundane contacts use eastward or westward branches.
const mixedMundaneBranch: ScanInput = { ...mundane, selections: [{ ...mundaneSelection, contact: { kind: "aspect", aspect: "square", branch: "dexter" } }] };
// @ts-expect-error A non-opposition aspect needs an explicit branch.
const missingBranch: ScanInput = { ...zodiacal, selections: [{ ...zodiacalSelection, contact: { kind: "aspect", aspect: "square" } }] };
// @ts-expect-error Promissors are bodies; angles are significators.
const anglePromissor: ScanInput = { ...zodiacal, selections: [{ ...zodiacalSelection, promissor: { kind: "angle", angle: "asc" } }] };
// @ts-expect-error Zodiacal geometry requires obliquity.
const missingObliquity: ScanInput = { ...zodiacal, geometry: mundane.geometry };
// @ts-expect-error A solar key requires the solar samples.
const missingSolar: ScanInput = { ...zodiacal, convention: { ...zodiacal.convention, key: "solar-equatorial-birth-day" } };
// @ts-expect-error Fixed keys cannot silently ignore solar samples.
const irrelevantSolar: ScanInput = { ...zodiacal, solar: samples };
// @ts-expect-error An absent solar property is not an explicit undefined property.
const undefinedSolar: ScanInput = { ...zodiacal, solar: undefined };

// Never called. Verify public discriminants and nested immutability.
function contracts(input: ScanInput, result: ScanResult): void {
  const computed: ScanResult = scan(input);
  const parsed: ScanResult = parseScan({ arbitrary: "unknown data" });
  const range: DirectionAgeRange = input.ageRange;
  const motion: DirectionMotionConvention = input.motions[0]!;
  // @ts-expect-error A scan request cannot be omitted.
  scan();
  // @ts-expect-error Typed scan requests reject unknown input.
  scan({ arbitrary: "unknown data" });
  // @ts-expect-error Input fields are readonly.
  input.yearUnit = "julian-365.25-days";
  // @ts-expect-error Convention data are deeply readonly.
  input.convention.key = "naibod";
  // @ts-expect-error Geometry data are deeply readonly.
  input.geometry.ramcDegrees = 0;
  // @ts-expect-error Age endpoint data are deeply readonly.
  input.ageRange.includeTo = true;
  // @ts-expect-error Contact selections are readonly arrays.
  input.selections.push(zodiacalSelection);
  // @ts-expect-error Nested selections are readonly.
  input.selections[0]!.promissor.id = "changed";
  // @ts-expect-error Nested contact fields are readonly.
  input.selections[0]!.contact.kind = "conjunction";
  // @ts-expect-error Motion selections are readonly arrays.
  input.motions.push({ motion: "direct" });
  // @ts-expect-error Nested motion fields are readonly.
  input.motions[0]!.motion = "direct";
  const coordinates = input.selections[0]!.promissor.coordinates;
  if ("longitudeDegrees" in coordinates) {
    // @ts-expect-error Ecliptic input coordinates are deeply readonly.
    coordinates.longitudeDegrees = 0;
  } else {
    // @ts-expect-error Equatorial input coordinates are deeply readonly.
    coordinates.rightAscensionDegrees = 0;
  }
  if (input.solar) {
    // @ts-expect-error Solar input samples are deeply readonly.
    input.solar.start.jdTt = 0;
  }
  if (result.status === "complete") {
    const complete: ScanComplete = result;
    const row: ScanRow = result.hits[0]!;
    const index: ScanIndex = row;
    const hit: DirectionHit = row.hit;
    const work: ScanWork = result.work;
    // @ts-expect-error A complete scan has no refusal code.
    result.code;
    // @ts-expect-error A complete scan has no failure cause.
    result.cause;
    // @ts-expect-error Result hits are readonly arrays.
    result.hits.push(row);
    // @ts-expect-error Raw indices are readonly.
    row.selectionIndex = 0;
    // @ts-expect-error A row's hit is readonly.
    row.hit = hit;
    // @ts-expect-error Nested hit fields are readonly.
    row.hit.arcDegrees = 0;
    // @ts-expect-error Nested hit timing audit data are readonly.
    row.hit.timing.rateDegreesPerYear = 0;
    // @ts-expect-error Result age endpoints are readonly.
    result.ageRange.fromYears = 0;
    // @ts-expect-error Work accounting is readonly.
    result.work.evaluated = 0;
    // @ts-expect-error Duplicate accounting is readonly.
    result.duplicateCount = 0;
    // @ts-expect-error Filtering accounting is readonly.
    result.outsideAgeRangeCount = 0;
    if (row.hit.geometry.solver === "zodiacal-body") {
      // @ts-expect-error Nested geometry remains deeply readonly through a scan row.
      row.hit.geometry.calculation.geometry.promissor.position.hourAngleDegrees = 0;
    }
    if (row.hit.timing.audit.kind === "solar-birth-day") {
      // @ts-expect-error Nested solar audit samples remain deeply readonly.
      row.hit.timing.audit.samples.end.rightAscensionDegrees = 0;
    }
    void [complete, index, work];
  } else {
    const refused: ScanRefusal = result;
    const empty: readonly [] = result.hits;
    const stage: "scan" = result.stage;
    // @ts-expect-error Refusals contain no hits.
    result.hits[0];
    // @ts-expect-error Refusal messages are readonly.
    result.message = "changed";
    // @ts-expect-error Refusals do not claim complete filtering counts.
    result.outsideAgeRangeCount;
    if (result.code === "invalid-input") {
      // @ts-expect-error Invalid input does not claim evaluation accounting.
      result.work;
      // @ts-expect-error Invalid input does not identify an evaluation.
      result.at;
    } else {
      const work: ScanWork = result.work;
      // @ts-expect-error Refusal work accounting is readonly.
      result.work.requestedEvaluations = 0;
      if (result.code === "evaluation-budget") {
        // @ts-expect-error A budget refusal precedes any evaluation index.
        result.at;
        // @ts-expect-error A budget refusal has no single-hit cause.
        result.cause;
      } else {
        const at: ScanIndex = result.at;
        // @ts-expect-error Refusal indices are readonly.
        result.at.motionIndex = 0;
        if (result.code === "hit-refused") {
          const cause: HitRefusal = result.cause;
          // @ts-expect-error Nested single-hit refusal data are readonly.
          result.cause.message = "changed";
          void cause;
        } else {
          const code: "inconsistent-body" = result.code;
          // @ts-expect-error A consistency refusal has no single-hit failure.
          result.cause;
          void code;
        }
        void at;
      }
      void work;
    }
    void [refused, empty, stage];
  }
  void [computed, parsed, range, motion];
}

void [zodiacal, mundane, solar, angle, zodiacalAspects, mundaneAspects,
  missingConvention, missingGeometry, missingSelections, missingMotions, missingYearUnit,
  missingAgeRange, missingMaxEvaluations, missingSystem, missingMode, missingLatitude,
  missingKey, missingFromYears, missingToYears, missingIncludeFrom, missingIncludeTo,
  invalidEndpoint, stringBudget, calendarYear, missingSignificator, missingPromissor,
  missingContact, scalarSelection, scalarMotion, stringMotion, commonMotion,
  prebuiltCommonMotion, commonConverse, prebuiltCommonConverse, undefinedCommonMotion,
  unnamedConverse, irrelevantConverse, unsupportedConverse, mixedZodiacalLatitude,
  mixedMundaneLatitude, mixedMode, mixedSelections, mixedPromissor, mixedSignificator,
  mixedZodiacalBranch, mixedMundaneBranch, missingBranch, anglePromissor,
  missingObliquity, missingSolar, irrelevantSolar, undefinedSolar, contracts];
