import { calc } from '../../src/calc.js';
import { EvaluationContext, validateInstant, SearchInterrupted } from './context.js';
import { EngineRefused } from './engine.js';
import { refineRoot } from './root.js';
import type { Clock, SearchResult } from './types.js';

export type EclipseKind = 'solar' | 'lunar';
export interface EclipseModel {
  /** Spherical radii, in au. No atmospheric enlargement is implicit. */
  readonly sunRadiusAu: number;
  readonly moonRadiusAu: number;
  readonly earthRadiusAu: number;
}
export type EclipseVector = readonly [number, number, number];
export interface EclipseVectors { readonly sun: EclipseVector; readonly moon: EclipseVector }
/** Providers must charge the supplied context for their work. */
export interface EclipseProvider { sample(atMs: number): EclipseVectors }
export interface EclipseOptions { readonly stepMs: number; readonly derivativeStepMs: number }
export interface EclipseGeometry {
  readonly axisDistanceAu: number;
  readonly penumbraRadiusAu: number;
  readonly umbraRadiusAu: number;
  readonly forward: boolean;
}
export interface EclipseEvent extends EclipseGeometry {
  readonly kind: EclipseKind;
  readonly classification: 'central' | 'partial' | 'penumbral' | 'total';
  readonly atMs: number;
  readonly clock: Clock;
  readonly bracket: readonly [number, number];
  readonly derivativeResidualAuSquaredPerMs: number;
  readonly definition: 'minimum-shadow-axis-distance';
  readonly model: Readonly<EclipseModel>;
}
const dot = (a: EclipseVector, b: EclipseVector) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const norm = (a: EclipseVector) => Math.hypot(...a);
function validateModel(model: EclipseModel): Readonly<EclipseModel> {
  if (!model || Object.keys(model).some(k => !['sunRadiusAu', 'moonRadiusAu', 'earthRadiusAu'].includes(k)) ||
      ![model.sunRadiusAu, model.moonRadiusAu, model.earthRadiusAu].every(v => Number.isFinite(v) && v > 0) ||
      model.sunRadiusAu <= Math.max(model.moonRadiusAu, model.earthRadiusAu)) {
    throw new RangeError('Explicit positive spherical radii with the Sun largest are required.');
  }
  return Object.freeze({ ...model });
}
/** Similar-triangle shadow cones; positions share one geocentric Cartesian frame. */
export function eclipseGeometry(kind: EclipseKind, vectors: EclipseVectors, model: EclipseModel): EclipseGeometry {
  if (!['solar', 'lunar'].includes(kind)) throw new RangeError('Unknown eclipse kind.');
  validateModel(model);
  for (const v of [vectors.sun, vectors.moon]) {
    if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite) || norm(v) === 0) {
      throw new RangeError('Finite nonzero Cartesian vectors are required.');
    }
  }
  const { sun, moon } = vectors;
  const delta: EclipseVector = kind === 'solar'
    ? [moon[0]-sun[0], moon[1]-sun[1], moon[2]-sun[2]] : [-sun[0], -sun[1], -sun[2]];
  const length = norm(delta);
  if (!Number.isFinite(length) || length === 0) throw new RangeError('Shadow axis is undefined.');
  const axis: EclipseVector = [delta[0]/length, delta[1]/length, delta[2]/length];
  const target: EclipseVector = kind === 'solar' ? [-moon[0], -moon[1], -moon[2]] : moon;
  const along = dot(target, axis);
  const offset: EclipseVector = [target[0]-along*axis[0], target[1]-along*axis[1], target[2]-along*axis[2]];
  const radius = kind === 'solar' ? model.moonRadiusAu : model.earthRadiusAu;
  const result = { axisDistanceAu: norm(offset), forward: along > 0,
    penumbraRadiusAu: radius + along*(model.sunRadiusAu+radius)/length,
    umbraRadiusAu: radius - along*(model.sunRadiusAu-radius)/length };
  if (![result.axisDistanceAu, result.penumbraRadiusAu, result.umbraRadiusAu].every(Number.isFinite)) {
    throw new RangeError('Nonfinite shadow geometry.');
  }
  return result;
}

export class EclipseEngineAdapter implements EclipseProvider {
  constructor(readonly context: EvaluationContext) {}
  sample(atMs: number): EclipseVectors {
    validateInstant(atMs);
    const { startMs, endMs, clock } = this.context.window;
    if (atMs < startMs || atMs > endMs) throw new RangeError('Sample is outside the search window.');
    const sample = (body: 'Sun' | 'Moon'): EclipseVector => this.context.evaluate(() => {
      const p = calc({ body, time: clock === 'utc' ? new Date(atMs) : { jd: atMs/86400000+2440587.5, scale: clock },
        center: 'geocentric', frame: 'ecliptic-true-of-date', zodiac: 'tropical',
        flags: { correction: 'apparent', cartesian: true, speeds: false, units: 'degrees' } });
      if (p.status === 'refused') throw new EngineRefused(p);
      if (!p.cartesian) throw new RangeError('Missing eclipse vector.');
      return [p.cartesian.x, p.cartesian.y, p.cartesian.z];
    });
    return { sun: sample('Sun'), moon: sample('Moon') };
  }
}

export function searchEclipses(context: EvaluationContext, kind: EclipseKind, model: EclipseModel,
  options: EclipseOptions, provider: EclipseProvider = new EclipseEngineAdapter(context)): SearchResult<EclipseEvent> {
  const frozenModel = validateModel(model);
  if (!['solar', 'lunar'].includes(kind) || !options ||
      Object.keys(options).some(k => !['stepMs', 'derivativeStepMs'].includes(k)) ||
      !Number.isSafeInteger(options.stepMs) || options.stepMs < 1 ||
      !Number.isSafeInteger(options.derivativeStepMs) || options.derivativeStepMs < 1) {
    throw new RangeError('Explicit positive integer scan and derivative steps are required.');
  }
  const { stepMs, derivativeStepMs } = options;
  const { startMs, endMs, clock } = context.window;
  if (derivativeStepMs > (endMs-startMs)/2) throw new RangeError('Derivative step exceeds window.');
  const geometry = (t: number) => { context.checkpoint(); return eclipseGeometry(kind, provider.sample(t), frozenModel); };
  const slope = (t: number) => {
    const lo = Math.max(startMs, t-derivativeStepMs), hi = Math.min(endMs, t+derivativeStepMs);
    const a = geometry(lo).axisDistanceAu, b = geometry(hi).axisDistanceAu;
    const derivative = (b*b-a*a)/(hi-lo);
    if (!Number.isFinite(derivative)) throw new RangeError('Nonfinite shadow derivative.');
    return derivative;
  };
  return context.search(() => {
    const events: EclipseEvent[] = [];
    let left = startMs, a = slope(left);
    while (left < endMs) {
      const right = left + Math.min(stepMs, endMs-left), b = slope(right);
      if (a < 0 && b >= 0) {
        const root = refineRoot(slope, left, right);
        if (root.status === 'refused') throw new SearchInterrupted('evaluation-budget');
        // A boundary derivative uses only one side and cannot confirm a minimum.
        if (root.atMs > startMs+derivativeStepMs && root.atMs <= endMs-derivativeStepMs) {
          const g = geometry(root.atMs);
          const targetRadius = kind === 'solar' ? frozenModel.earthRadiusAu : frozenModel.moonRadiusAu;
          if (g.forward && g.axisDistanceAu < g.penumbraRadiusAu+targetRadius) {
            const classification = kind === 'solar'
              ? (g.axisDistanceAu < targetRadius ? 'central' : 'partial')
              : (g.umbraRadiusAu > 0 && g.axisDistanceAu+targetRadius < g.umbraRadiusAu ? 'total'
                : g.umbraRadiusAu > 0 && g.axisDistanceAu < g.umbraRadiusAu+targetRadius ? 'partial' : 'penumbral');
            events.push({ ...g, kind, classification, atMs: root.atMs, clock, bracket: root.bracket,
              derivativeResidualAuSquaredPerMs: root.value, definition: 'minimum-shadow-axis-distance', model: frozenModel });
          }
        }
      }
      left = right; a = b;
    }
    return events;
  });
}
