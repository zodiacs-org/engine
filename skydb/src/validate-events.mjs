import { BODIES } from './config.mjs';
import { MAJOR_ASPECTS } from './events.mjs';

/** Validate persisted roots without claiming astronomical accuracy or completeness. */
export function validateEvents(events, descriptor, bodies) {
  let previous = -Infinity;
  const seen = new Set();
  for (const event of events) {
    const fail = () => { throw new Error('Invalid event record'); };
    if (!event || typeof event !== 'object' || Array.isArray(event)) fail();
    const extra = { aspect: ['angle', 'target'], ingress: ['target'], station: [], lunation: ['phase', 'target'] };
    if (!Object.hasOwn(extra, event.kind)) fail();
    const fields = ['kind', 'bodies', 'unit', 'atMs', 'bracket', 'residual', 'direction', ...extra[event.kind]];
    if (Object.keys(event).length !== fields.length || fields.some(key => !Object.hasOwn(event, key)) ||
        !Number.isSafeInteger(event.atMs) || event.atMs < descriptor.startMs || event.atMs >= descriptor.endMs ||
        event.atMs < previous || !Number.isFinite(event.residual) ||
        !['increasing', 'decreasing', 'touch'].includes(event.direction) ||
        event.unit !== (event.kind === 'station' ? 'degrees/day' : 'degrees') ||
        !Array.isArray(event.bodies) || event.bodies.some(body => !bodies.includes(body)) ||
        new Set(event.bodies).size !== event.bodies.length ||
        event.bodies.length !== (['aspect', 'lunation'].includes(event.kind) ? 2 : 1) ||
        !Array.isArray(event.bracket) || event.bracket.length !== 2 ||
        !event.bracket.every(Number.isSafeInteger)) fail();
    const [left, right] = event.bracket;
    if (left < descriptor.startMs || right > descriptor.lastSampleMs || left > right || right - left > 1 ||
        (event.atMs !== left && event.atMs !== right)) fail();
    if (event.kind === 'ingress' && (!Number.isInteger(event.target) || event.target < 0 || event.target >= 360 || event.target % 30)) fail();
    if (event.kind === 'aspect' && (!MAJOR_ASPECTS.includes(event.angle) ||
        ![event.angle, -event.angle].includes(event.target) ||
        (event.angle === 180 && event.target !== 180) ||
        BODIES.indexOf(event.bodies[0]) >= BODIES.indexOf(event.bodies[1]))) fail();
    if (event.kind === 'lunation' && (event.bodies.join() !== 'Sun,Moon' ||
        !['new', 'full'].includes(event.phase) || event.target !== (event.phase === 'new' ? 0 : 180))) fail();
    const identity = JSON.stringify([event.kind, event.bodies, event.target, event.atMs]);
    if (seen.has(identity)) fail();
    seen.add(identity);
    previous = event.atMs;
  }
}
