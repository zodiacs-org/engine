import type { Person, ValidatedJob } from "./model.js";

export interface ChartsWorkItem {
  readonly kind: "charts";
  readonly index: number;
  readonly person: Person;
}

export interface TransitWorkItem {
  readonly kind: "transit-grid";
  readonly index: number;
  readonly person: Person;
  readonly sampleIndex: number;
  readonly at: string;
}

export interface SynastryWorkItem {
  readonly kind: "synastry-matrix";
  readonly index: number;
  readonly a: Person;
  readonly b: Person;
}

export type WorkItem = ChartsWorkItem | TransitWorkItem | SynastryWorkItem;

function checkedIndex(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new RangeError("Work cursor must be a safe integer within the job");
  }
  return value === 0 ? 0 : value;
}

/** The job is a trusted, frozen snapshot from validateJob or parseJobJson. */
function itemReader(job: ValidatedJob): (index: number) => WorkItem {
  const { spec } = job;
  switch (spec.kind) {
    case "charts":
      return (index) => Object.freeze({ kind: spec.kind, index, person: spec.births[index]! });
    case "transit-grid": {
      const start = BigInt(Date.parse(spec.start));
      const step = BigInt(spec.stepMs);
      const samples = BigInt(job.totalTasks) / BigInt(spec.births.length);
      return (index) => {
        const offset = BigInt(index);
        const sampleIndex = offset % samples;
        return Object.freeze({
          kind: spec.kind,
          index,
          person: spec.births[Number(offset / samples)]!,
          sampleIndex: Number(sampleIndex),
          at: new Date(Number(start + sampleIndex * step)).toISOString(),
        });
      };
    }
    case "synastry-matrix": {
      const width = BigInt(spec.people.length - 1);
      return (index) => {
        const offset = BigInt(index);
        const row = offset / width;
        const column = offset % width;
        return Object.freeze({
          kind: spec.kind,
          index,
          a: spec.people[Number(row)]!,
          b: spec.people[Number(column >= row ? column + 1n : column)]!,
        });
      };
    }
  }
}

/** Seek directly to one row without expanding preceding work. */
export function workItemAt(job: ValidatedJob, index: number): WorkItem {
  const checked = checkedIndex(index, job.totalTasks - 1);
  return itemReader(job)(checked);
}

/** Cursor names the next row; totalTasks resumes an already completed job. */
export function workItems(job: ValidatedJob, cursor = 0): Generator<WorkItem, void, unknown> {
  const start = checkedIndex(cursor, job.totalTasks);
  const read = itemReader(job);
  // Keep the public function ordinary so invalid cursors fail before next().
  return (function* () {
    for (let index = start; index < job.totalTasks; index++) yield read(index);
  })();
}
