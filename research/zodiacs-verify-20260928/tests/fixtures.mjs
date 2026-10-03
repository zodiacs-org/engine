import { createChartReceipt, digest } from '../src/core.mjs';
export const MODEL = Object.freeze({
  engine:'synthetic-analytic-fixture', engineVersion:'1',
  artifact:{digest:digest('synthetic-fixture-v1'),scope:'analytic test fixture; not astronomical data'},
  conventions:{zodiac:'tropical',origin:'geocentric',frame:'test-frame',corrections:'none',timeScale:'UTC-like synthetic time',deltaT:'not applicable'}
});
export function receipt({subjectId='synthetic-person', longitude=15, context={}, model=MODEL, facts, warnings=[]}={}) {
  return createChartReceipt({schema:'zodiacs.verify.chart.v1',subjectId,
    context:{utc:'2000-01-01T12:00:00.000Z',latitude:null,longitude:null,timeKnowledge:'exact',requestedHouseSystem:'whole',effectiveHouseSystem:null,...context},
    model, facts:facts??[{id:'longitude:Sun',kind:'longitude',entity:'Sun',value:longitude,unit:'deg',scope:'instant'}],warnings});
}
