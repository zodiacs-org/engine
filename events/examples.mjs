// Build with npm run build --prefix events, then run node events/examples.mjs.
// Every natal longitude here is invented; no personal birth data is used.
import { executeQuery } from './build/src/index.js';

const queries = [
  ['next Mars square natal Sun from 2023-03-25 to 2023-03-27 clock tt',
    { stepMs: 3600000, maxEvaluations: 10000, natalLongitudes: { Sun: 0 } }],
  ['all Venus retrogrades in Leo from 2023-01-01 to 2024-01-01 clock tt',
    { stepMs: 86400000, maxEvaluations: 10000 }],
  ['all Sun ingresses into Aries from 2023-01-01 to 2024-01-01 clock tt',
    { stepMs: 86400000, maxEvaluations: 10000 }],
  ['all Venus stations retrograde from 2023-01-01 to 2024-01-01 clock tt',
    { stepMs: 86400000, maxEvaluations: 10000 }],
  ['all solar eclipses from 2024-04-07 to 2024-04-10 clock tt',
    { stepMs: 3600000, maxEvaluations: 10000, eclipse: {
      derivativeStepMs: 60000,
      model: { sunRadiusAu: 696000/149597870.7, moonRadiusAu: 1737.4/149597870.7,
        earthRadiusAu: 6378.137/149597870.7 }
    } }],
  ['all void-of-course Moon with Sun , Mercury , Venus , Mars , Jupiter , Saturn aspects conjunction , sextile , square , trine , opposition from 2023-07-01 to 2023-07-08 clock tt',
    { stepMs: 3600000, maxEvaluations: 100000 }]
];
for (const [query, options] of queries) {
  const result = executeQuery(query, options);
  if (result.status !== 'complete' || result.events.length === 0) throw new Error(`Example refused or empty: ${query}`);
  // TT epoch coordinates are not UTC dates. Preserve the explicit clock.
  console.log(JSON.stringify({ query, result }));
}
