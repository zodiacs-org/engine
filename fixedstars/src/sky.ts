import { skyBudgetOf, skyOptionsOf } from "./engine.js";
import type {
  DateInput, Observer, SkyBody, SkyConventions, SkyEvent, SkyEventKind, SkyEvents, SkyFlag, SkyOptions
} from "./engine.js";
import { propagateStarDirection, STAR_POSITION_CONVENTIONS } from "./positions.js";
import type { CatalogStar, ProperMotion } from "./types.js";

export const STAR_SKY_CONVENTIONS = Object.freeze({
  stars: STAR_POSITION_CONVENTIONS,
  vector: "catalog-ray;effectively-infinite-distance;no-measured-distance",
  solver: "unchanged-engine-src/sky/riseset.ts;scoped-vector-substitution",
  clock: "engine-utc-window;native-time-basis-at-each-sample;no-deltaT-pin",
  horizon: "engine-wgs84-local-horizontal-plane;no-height-dip",
  eventTime: "first-whole-millisecond;from-inclusive;to-exclusive",
  flags: "native-window-flags;never-rises-and-never-sets-are-window-local",
  receiptScope: "fixedstars-call-record;not-a-native-engine-receipt;not-an-accuracy-certification"
} as const);

/** Captured by Node preparation from the contract verified during compilation. */
export interface SkyCompatibility {
  readonly schema: "fixedstars-engine-sky-contract/1";
  readonly engineVersion: string;
  readonly vectorImporter: "src/sky/riseset.ts";
  readonly vectorModule: "astronomy-engine";
  readonly bodySlot: "Pluto";
  readonly ephemeris: { readonly version: string; readonly esmSha256: string };
  readonly sources: Readonly<Record<string, string>>;
}

export interface SkyStarInput {
  readonly id: string;
  readonly frame: CatalogStar["frame"];
  readonly epochJulianYear: CatalogStar["epochJulianYear"];
  readonly raDeg: number;
  readonly decDeg: number;
  readonly properMotion: ProperMotion | null;
}

/** Plain, JSON-safe snapshot. In particular, it contains no mutable Dates or Infinity. */
export interface SkyCallRecord {
  readonly schema: "fixedstars-sky-call/1";
  readonly kind: "fixedstars-call-record";
  readonly nativeReceipt: false;
  readonly engine: {
    readonly name: "@zodiacs/engine";
    readonly version: string;
    readonly ephemeris: { readonly name: "astronomy-engine"; readonly version: string };
  };
  readonly compatibility: SkyCompatibility;
  readonly request: {
    readonly subject: { readonly kind: "star"; readonly star: SkyStarInput } |
      { readonly kind: "body"; readonly body: SkyBody };
    readonly observer: Readonly<Required<Observer>>;
    readonly from: string;
    readonly to: string;
    readonly options: SkyConventions & { readonly maxSamples: number | "unlimited" };
  };
  readonly response: {
    readonly status: SkyEvents["status"];
    readonly reason: "sample-budget" | null;
    readonly samples: number;
    readonly flags: readonly SkyFlag[];
    readonly events: readonly {
      readonly kind: SkyEventKind;
      readonly at: string;
      readonly altitude: number;
      readonly azimuth: number;
    }[];
  };
  readonly stellarConventions: typeof STAR_SKY_CONVENTIONS | null;
}

interface StarSkyWindow {
  readonly starId: string;
  readonly observer: Readonly<Required<Observer>>;
  readonly from: Date;
  readonly to: Date;
  readonly conventions: SkyConventions;
  readonly flags: readonly SkyFlag[];
  /** Native solver accounting, including its refinement predicates. */
  readonly samples: number;
  readonly provenance: SkyCallRecord;
}

export type StarSkyEvents =
  | (StarSkyWindow & { readonly status: "complete"; readonly events: readonly SkyEvent[] })
  | (StarSkyWindow & { readonly status: "refused"; readonly reason: "sample-budget"; readonly events: readonly [] });

export interface BodySkyEvents {
  /** The unmodified native solver result, including its body label and conventions. */
  readonly sky: SkyEvents;
  readonly provenance: SkyCallRecord;
}

export interface StarSkySearch {
  readonly compatibility: SkyCompatibility;
  starEvents(star: CatalogStar, observer: Observer, from: DateInput, to: DateInput, options?: SkyOptions): StarSkyEvents;
  bodyEvents(body: SkyBody, observer: Observer, from: DateInput, to: DateInput, options?: SkyOptions): BodySkyEvents;
}

/** Internal factory contract, supplied only by the prepared bundle's loader. */
export interface SkySolverAdapter {
  starEvents(star: CatalogStar, observer: Observer, from: DateInput, to: DateInput, options?: SkyOptions): SkyEvents;
  bodyEvents(body: SkyBody, observer: Observer, from: DateInput, to: DateInput, options?: SkyOptions): SkyEvents;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function capturedOptions(options: SkyOptions | undefined): { options: SkyOptions; budget: number | "unlimited" } {
  // Reuse the solver's strict own-data-property and budget checks. Supplying
  // the captured object also prevents a second read of caller option fields.
  const input = skyOptionsOf(options, ["limb", "refraction", "maxSamples"], "options");
  const budget = skyBudgetOf(input.maxSamples);
  return { options: input as SkyOptions, budget: budget === Infinity ? "unlimited" : budget };
}

/** Internal: Node preparation supplies an isolated adapter and its verified contract. */
export function createStarSkySearch(adapter: SkySolverAdapter, contract: SkyCompatibility): StarSkySearch {
  const compatibility = freeze(structuredClone(contract));
  const engine = freeze({ name: "@zodiacs/engine" as const, version: compatibility.engineVersion,
    ephemeris: { name: "astronomy-engine" as const, version: compatibility.ephemeris.version } });

  function record(
    result: SkyEvents, subject: SkyCallRecord["request"]["subject"], maxSamples: number | "unlimited"
  ): SkyCallRecord {
    return freeze({ schema: "fixedstars-sky-call/1", kind: "fixedstars-call-record", nativeReceipt: false,
      engine, compatibility,
      request: { subject, observer: result.observer, from: result.from.toISOString(), to: result.to.toISOString(),
        options: { ...result.conventions, maxSamples } },
      response: { status: result.status, reason: result.status === "refused" ? result.reason : null,
        samples: result.samples, flags: result.flags,
        events: result.events.map((event) => ({ ...event, at: event.at.toISOString() })) },
      stellarConventions: subject.kind === "star" ? STAR_SKY_CONVENTIONS : null });
  }

  return Object.freeze({ compatibility,
    starEvents(star: CatalogStar, observer: Observer, from: DateInput, to: DateInput, options?: SkyOptions): StarSkyEvents {
      // Copy only the mutable motion data consumed by the provider. Do not
      // freeze caller astrometry, lore, aliases or source metadata.
      if (!star || typeof star !== "object") throw new RangeError("A catalog star is required.");
      const captured = { ...star };
      captured.properMotion = captured.properMotion === null ? null : { ...captured.properMotion };
      propagateStarDirection(captured, 0);
      const policy = capturedOptions(options);
      const result = adapter.starEvents(captured, observer, from, to, policy.options);
      const astrometry: SkyStarInput = { id: captured.id, frame: captured.frame,
        epochJulianYear: captured.epochJulianYear, raDeg: captured.raDeg, decDeg: captured.decDeg,
        properMotion: captured.properMotion };
      const provenance = record(result, { kind: "star", star: astrometry }, policy.budget);
      // Keep all native fields except the private point-body label. Preserve
      // refusal as a discriminated union, with no partial events to pair.
      const { body: _slot, ...window } = result;
      return Object.freeze({ ...window, starId: captured.id, provenance });
    },
    bodyEvents(body: SkyBody, observer: Observer, from: DateInput, to: DateInput, options?: SkyOptions): BodySkyEvents {
      const policy = capturedOptions(options);
      const sky = adapter.bodyEvents(body, observer, from, to, policy.options);
      return Object.freeze({ sky, provenance: record(sky, { kind: "body", body: sky.body }, policy.budget) });
    }
  });
}
