import { VOID_BODIES, VOID_OF_COURSE_CONVENTION, dateFrom, voidOfCourseAt } from "./engine.js";
import type { MoonAspect, VoidOfCourseWindow } from "./engine.js";
import type { ConsiderationObservation } from "./considerations.js";
import { CONSIDERATION_SOURCES } from "./policy.js";

const DAY_MS = 86_400_000;

/** Describes the reused engine scanner, not a claim of exhaustive event finding. */
export const MOON_VOID_SCAN_METHOD = Object.freeze({
  engineFunction: "voidOfCourseAt",
  verification: "sampled;not-proven-complete",
  ingressStepHours: 6,
  aspectStepHours: 3,
  ingressBisections: 24,
  aspectBisections: 26,
  lookBackDays: 7,
  lookAheadDays: 6,
  interval: "[last-exact-aspect-or-ingress,next-ingress)",
  limitations: Object.freeze([
    "No orbs, latitude, declination, nodes, angles, lots or outer planets participate.",
    "A contact at or after the ending ingress does not count for the sign being left.",
    "Sampling assumes direct lunar motion that outruns the selected planets; completeness is not proven.",
    "Root times depend on the scan grid and millisecond Date resolution; near a boundary the status may shift.",
    "Every sampled instant must lie within the engine ephemeris span or the scan throws RangeError.",
    "The scanner has a fixed horizon and no caller-controlled sample budget.",
    "Lilly's contextual qualifications and alternative orb-based readings are not evaluated."
  ])
} as const);

export interface MoonVoidContact {
  readonly at: string;
  readonly body: MoonAspect["body"];
  readonly aspect: MoonAspect["aspect"];
  readonly moonLongitude: number;
}

export interface MoonVoidPeriod {
  readonly from: string;
  readonly to: string;
  readonly sign: VoidOfCourseWindow["sign"];
  readonly nextSign: VoidOfCourseWindow["nextSign"];
  readonly startBasis: "last-exact-aspect" | "sign-ingress";
  readonly lastAspect: MoonVoidContact | null;
}

export interface MoonVoidOfCourseScan {
  readonly at: string;
  readonly clock: "engine-utc-model";
  readonly isVoid: boolean;
  readonly convention: typeof VOID_OF_COURSE_CONVENTION.name;
  readonly bodies: typeof VOID_BODIES.traditional;
  readonly aspects: typeof VOID_OF_COURSE_CONVENTION.aspects;
  readonly sampledFrom: string;
  readonly sampledTo: string;
  readonly method: typeof MOON_VOID_SCAN_METHOD;
  readonly current: MoonVoidPeriod | null;
  /** The next void period, not the next lunar contact. It may belong to a later sign. */
  readonly next: MoonVoidPeriod | null;
}

function period(window: VoidOfCourseWindow | null): MoonVoidPeriod | null {
  if (!window) return null;
  const contact = window.lastAspect;
  return Object.freeze({
    from: window.from.toISOString(), to: window.to.toISOString(),
    sign: window.sign, nextSign: window.nextSign,
    startBasis: contact ? "last-exact-aspect" : "sign-ingress",
    lastAspect: contact ? Object.freeze({ at: contact.at.toISOString(), body: contact.body,
      aspect: contact.aspect, moonLongitude: contact.moonLon }) : null
  });
}

/** The scanner uses the normalized question instant, never an edited chart longitude. */
export function moonVoidOfCourseObservation(instant: string): ConsiderationObservation {
  const at = dateFrom(instant, "instant");
  // Always pass the traditional option: the engine's own default is modern.
  const status = voidOfCourseAt(at, { bodies: "traditional" });
  const scan: MoonVoidOfCourseScan = Object.freeze({
    at: at.toISOString(), clock: "engine-utc-model", isVoid: status.isVoid,
    convention: VOID_OF_COURSE_CONVENTION.name, bodies: VOID_BODIES.traditional,
    aspects: VOID_OF_COURSE_CONVENTION.aspects,
    sampledFrom: new Date(at.getTime() - MOON_VOID_SCAN_METHOD.lookBackDays * DAY_MS).toISOString(),
    sampledTo: new Date(at.getTime() + MOON_VOID_SCAN_METHOD.lookAheadDays * DAY_MS).toISOString(),
    method: MOON_VOID_SCAN_METHOD, current: period(status.current), next: period(status.next)
  });
  const current = scan.current;
  const explanation = current
    ? `The Moon is void of course under the last-exact-aspect convention in ${current.sign}: ` +
      (current.lastAspect
        ? `its last contact was ${current.lastAspect.aspect} to ${current.lastAspect.body} at ${current.from}. `
        : `no selected exact contact was found in that sign; the period starts at ingress ${current.from}. `) +
      `The period ends at entry into ${current.nextSign} at ${current.to}. `
    : "The engine scan places the question outside a void period under the last-exact-aspect convention. ";
  return Object.freeze({
    rule: "moon-void-of-course", source: CONSIDERATION_SOURCES["moon-void-of-course"],
    status: status.isVoid ? "triggered" : "not-triggered", scan,
    evidence: Object.freeze([
      Object.freeze({ fact: "question-instant", value: scan.at }),
      Object.freeze({ fact: "body-set", value: "traditional" }),
      Object.freeze({ fact: "is-void", value: scan.isVoid }),
      Object.freeze({ fact: "verification", value: scan.method.verification })
    ]),
    explanation: explanation + "Only exact Ptolemaic contacts to the Sun through Saturn before sign exit count. " +
      "This is a sampled Lilly-based caution without contextual qualifications or an outcome verdict."
  });
}
