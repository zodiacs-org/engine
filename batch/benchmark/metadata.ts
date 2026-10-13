import { readFileSync } from "node:fs";
import { availableParallelism, cpus, release, totalmem } from "node:os";
import { posix } from "node:path";

export type ReadText = (path: string) => string | undefined;
export type CpuMax =
  | { status: "unavailable" | "invalid" }
  | { status: "max"; periodMicros: number }
  | { status: "quota"; quotaMicros: number; periodMicros: number; cpus: number };
export type CpuList =
  | { status: "unavailable" | "invalid" }
  | { status: "available"; cpus: string };

export function parseCpuMax(text: string | undefined): CpuMax {
  if (text === undefined) return { status: "unavailable" };
  const fields = /^(max|[0-9]+)\s+([0-9]+)$/.exec(text.trim());
  if (!fields) return { status: "invalid" };
  const periodMicros = Number(fields[2]);
  if (!Number.isSafeInteger(periodMicros) || periodMicros <= 0) return { status: "invalid" };
  if (fields[1] === "max") return { status: "max", periodMicros };
  const quotaMicros = Number(fields[1]);
  if (!Number.isSafeInteger(quotaMicros) || quotaMicros <= 0) return { status: "invalid" };
  return { status: "quota", quotaMicros, periodMicros, cpus: quotaMicros / periodMicros };
}

export function parseCpuList(text: string | undefined): CpuList {
  if (text === undefined) return { status: "unavailable" };
  const value = text.trim();
  // An empty effective cpuset is an observation, distinct from an unreadable file.
  if (value === "") return { status: "available", cpus: value };
  if (!/^[0-9]+(?:-[0-9]+)?(?:,[0-9]+(?:-[0-9]+)?)*$/.test(value)) {
    return { status: "invalid" };
  }
  for (const range of value.split(",")) {
    const [first, last = first] = range.split("-").map(Number);
    if (first === undefined || last === undefined || !Number.isSafeInteger(first)
      || !Number.isSafeInteger(last) || first > last) return { status: "invalid" };
  }
  return { status: "available", cpus: value };
}

export function parseAffinity(status: string | undefined): CpuList {
  return parseCpuList(status?.match(/^Cpus_allowed_list:[ \t]*([^\n]*)$/m)?.[1]);
}

function absolutePath(value: string): boolean {
  return value.startsWith("/") && !value.split("/").some((part) => part === ".." || part === ".")
    && !value.includes("\0");
}

function decodeMountPath(value: string): string {
  return value.replace(/\\(040|011|012|134)/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

export interface CgroupLocation {
  processPath: string;
  mountPoint: string;
  mountRoot: string;
  directory: string;
}

export function locateCgroupV2(cgroup: string | undefined, mountinfo: string | undefined): CgroupLocation | undefined {
  const processPath = cgroup?.match(/^0::([^\n]+)$/m)?.[1];
  if (!processPath || !absolutePath(processPath) || mountinfo === undefined) return undefined;
  const matches: CgroupLocation[] = [];
  for (const line of mountinfo.split("\n")) {
    const [mount, filesystem] = line.split(" - ");
    if (!mount || !filesystem?.startsWith("cgroup2 ")) continue;
    const fields = mount.split(" ");
    const mountRoot = decodeMountPath(fields[3] ?? "");
    const mountPoint = decodeMountPath(fields[4] ?? "");
    if (!absolutePath(mountRoot) || !absolutePath(mountPoint)) continue;
    if (mountRoot !== "/" && processPath !== mountRoot && !processPath.startsWith(`${mountRoot}/`)) continue;
    const relative = posix.relative(mountRoot, processPath);
    matches.push({ processPath, mountRoot, mountPoint, directory: posix.join(mountPoint, relative) });
  }
  // Prefer the mount exposing more ancestors of the process's group.
  return matches.sort((a, b) => a.mountRoot.length - b.mountRoot.length)[0];
}

export interface CgroupObservation {
  directory: string;
  cpuMax: CpuMax;
  cpusetCpusEffective: CpuList;
}

const ancestorVisibility = "Only ancestors exposed by this mount and cgroup namespace are observed. "
  + "Hidden or unreadable ancestor limits and other workloads may reduce CPU capacity; max is not proof of unlimited capacity.";

export function collectCgroupV2(read: ReadText) {
  const location = locateCgroupV2(read("/proc/self/cgroup"), read("/proc/self/mountinfo"));
  if (!location) return {
    status: "unavailable" as const,
    observations: [] as CgroupObservation[],
    tightestObservedQuotaCpus: null,
    ancestorVisibility,
  };
  const observations: CgroupObservation[] = [];
  let directory = location.directory;
  while (true) {
    observations.push({
      directory,
      cpuMax: parseCpuMax(read(posix.join(directory, "cpu.max"))),
      cpusetCpusEffective: parseCpuList(read(posix.join(directory, "cpuset.cpus.effective"))),
    });
    if (directory === posix.normalize(location.mountPoint)) break;
    directory = posix.dirname(directory);
  }
  const quotas = observations.flatMap(({ cpuMax }) => cpuMax.status === "quota" ? [cpuMax.cpus] : []);
  return {
    status: "available" as const,
    processPath: location.processPath,
    mountPoint: location.mountPoint,
    mountRoot: location.mountRoot,
    observations,
    tightestObservedQuotaCpus: quotas.length ? Math.min(...quotas) : null,
    ancestorVisibility,
  };
}

function readOptional(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

export function collectMachineMetadata() {
  const cpu = cpus();
  return {
    runtime: { node: process.version, v8: process.versions.v8, sqlite: process.versions.sqlite ?? null },
    platform: process.platform,
    arch: process.arch,
    kernelRelease: release(),
    cpu: {
      models: [...new Set(cpu.map(({ model }) => model))],
      logicalCount: cpu.length,
      availableParallelism: availableParallelism(),
    },
    totalMemoryBytes: totalmem(),
    affinity: { source: "/proc/self/status:Cpus_allowed_list", ...parseAffinity(readOptional("/proc/self/status")) },
    cgroupV2: collectCgroupV2(readOptional),
  };
}
