/**
 * P3.2's first clause, as types: every option of the sidereal zodiac that
 * @zodiacs/engine/vedic ships has its counterpart in the request types of
 * @zodiacs/engine/calc, and each of calc's four functions takes it. This file
 * runs nothing. It passes when `tsc --noEmit --strict` compiles it against the
 * installed engine, and fails to compile when a counterpart is missing or
 * differs. What the functions do with these options at run time is
 * sweep-sidereal-options.mjs's to show.
 *
 *   node node_modules/typescript/bin/tsc --noEmit --strict --module nodenext \
 *     --moduleResolution nodenext --target es2022 --types node \
 *     docs/evidence/checkpoint22-rc2-20261009/tools/calc-types-cover-vedic.ts
 */
import type { AyanamsaName, AyanamsaPrecessionModel, UserAyanamsaInput } from '@zodiacs/engine/vedic';
import type {
  CalcAyanamsa, CalcAyanamsaModel, CalcRefusal, CalcRequest, CalcTime, CalcUserAyanamsa, CalcZodiac, ChartRequest, EventsRequest, HousesRequest,
} from '@zodiacs/engine/calc';

/** True when A and B are the same type, not merely assignable one way. */
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
/** True when every value of T is accepted where U is asked for. */
type Takes<T, U> = [T] extends [U] ? true : false;
type Holds<T extends true> = T;

/** The nine built-in ayanamsas, by the same names. */
export type BuiltIns = Holds<Same<CalcAyanamsa, AyanamsaName>>;
/** The precession models a caller's ayanamsa may be computed with. */
export type Models = Holds<Same<CalcAyanamsaModel, AyanamsaPrecessionModel>>;
/** A caller's ayanamsa (SE_SIDM_USER): the same fields, name, epoch, value, rate and model. */
export type CallerFields = Holds<Same<keyof CalcUserAyanamsa, keyof UserAyanamsaInput>>;
/** Which of them may be left out: the same ones. */
type Optional<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];
export type CallerOptional = Holds<Same<Optional<CalcUserAyanamsa>, Optional<UserAyanamsaInput>>>;
/** The same type in each field but the epoch. */
export type CallerName = Holds<Same<CalcUserAyanamsa['name'], UserAyanamsaInput['name']>>;
export type CallerValue = Holds<Same<CalcUserAyanamsa['value'], UserAyanamsaInput['value']>>;
export type CallerRate = Holds<Same<CalcUserAyanamsa['rate'], UserAyanamsaInput['rate']>>;
export type CallerModel = Holds<Same<CalcUserAyanamsa['model'], UserAyanamsaInput['model']>>;
/**
 * The epoch is written in calc's vocabulary: an ISO string or a Date, as /vedic
 * takes them, and a TT Julian date as { jd, scale: "tt" } where /vedic writes
 * { julianDateTT }. /vedic also takes epoch milliseconds, which calc's
 * vocabulary does not; calc also takes a UT1 Julian date (SE_SIDBIT_USER_UT).
 */
export type EpochIso = Holds<Takes<string, CalcUserAyanamsa['epoch']>>;
export type EpochDate = Holds<Takes<Date, CalcUserAyanamsa['epoch']>>;
export type EpochTT = Holds<Takes<{ readonly jd: number; readonly scale: 'tt' }, CalcUserAyanamsa['epoch']>>;
export type EpochUT1 = Holds<Takes<{ readonly jd: number; readonly scale: 'ut1' }, CalcUserAyanamsa['epoch']>>;
/** And no more than that: the epoch takes exactly what `time` takes. */
export type EpochForms = Holds<Same<CalcUserAyanamsa['epoch'], CalcTime>>;
/** The zodiac is tropical, a built-in ayanamsa or a caller's. */
export type Zodiac = Holds<Same<CalcZodiac, 'tropical' | { readonly sidereal: CalcAyanamsa | CalcUserAyanamsa }>>;
/** calc(), houses(), events() and chart() each take it. */
export type Calc = Holds<Same<CalcRequest['zodiac'], CalcZodiac | undefined>>;
export type Houses = Holds<Same<HousesRequest['zodiac'], CalcZodiac | undefined>>;
export type Events = Holds<Same<EventsRequest['zodiac'], CalcZodiac | undefined>>;
export type Chart = Holds<Same<ChartRequest['zodiac'], CalcZodiac | undefined>>;

/** UTC Julian dates are also part of the epoch contract. */
export type EpochUTC = Holds<Takes<{ readonly jd: number; readonly scale: 'utc' }, CalcUserAyanamsa['epoch']>>;
/** Refusal reasons stay discriminated, including the owner's epoch boundary. */
export type RefusalReasons = Holds<Same<CalcRefusal['reason'], 'unsupported-combination' | 'not-in-this-version' | 'out-of-range' | 'epoch-out-of-range' | 'sample-budget'>>;
type EpochRefusal = Extract<CalcRefusal, { readonly reason: 'epoch-out-of-range' }>;
export type EpochRefusalFields = Holds<Same<keyof EpochRefusal, 'status' | 'detail' | 'reason' | 'epochSpan'>>;
