import { describe, expect, it } from "vitest";
import {
  collectCgroupV2, locateCgroupV2, parseAffinity, parseCpuList, parseCpuMax,
} from "../benchmark/metadata.js";

const mount = "316 313 0:26 / /sys/fs/cgroup ro - cgroup2 cgroup2 rw\n";

describe("benchmark CPU observations", () => {
  it("distinguishes unreadable, max, finite quota and malformed controls", () => {
    expect(parseCpuMax(undefined)).toEqual({ status: "unavailable" });
    expect(parseCpuMax("max 100000\n")).toEqual({ status: "max", periodMicros: 100_000 });
    expect(parseCpuMax("150000 100000\n")).toEqual({
      status: "quota", quotaMicros: 150_000, periodMicros: 100_000, cpus: 1.5,
    });
    for (const value of ["", "garbage", "max 0", "-1 100000", "0 100000", "1 2 extra", "1.5 100000", "1e9 100000"]) {
      expect(parseCpuMax(value)).toEqual({ status: "invalid" });
    }
  });

  it("reads only the affinity field and preserves unavailable versus empty cpusets", () => {
    expect(parseAffinity("Name:\tnode\nCpus_allowed_list:\t0-3,7\nMems_allowed_list:\t0\n"))
      .toEqual({ status: "available", cpus: "0-3,7" });
    expect(parseAffinity("Cpus_allowed:\t000f\n")).toEqual({ status: "unavailable" });
    expect(parseCpuList(undefined)).toEqual({ status: "unavailable" });
    expect(parseCpuList("\n")).toEqual({ status: "available", cpus: "" });
    for (const value of ["3-1", "0,,2", "all", "-1", "1-2-3", "9007199254740992"]) {
      expect(parseCpuList(value)).toEqual({ status: "invalid" });
    }
  });

  it("resolves the current group instead of assuming the mount root is its group", () => {
    expect(locateCgroupV2("0::/agent\n", mount)).toEqual({
      processPath: "/agent", mountPoint: "/sys/fs/cgroup", mountRoot: "/", directory: "/sys/fs/cgroup/agent",
    });
    expect(locateCgroupV2("0::/\n", mount)?.directory).toBe("/sys/fs/cgroup");
    expect(locateCgroupV2("4:cpu:/agent\n", mount)).toBeUndefined();
    expect(locateCgroupV2("0::/../escape\n", mount)).toBeUndefined();
  });

  it("accounts for mounted subtrees and escaped mount paths without traversing above them", () => {
    const subtree = "1 2 0:26 /tenant /cgroup\\040view ro - cgroup2 cgroup2 rw\n";
    const location = locateCgroupV2("0::/tenant/agent\n", subtree);
    expect(location).toEqual({
      processPath: "/tenant/agent", mountPoint: "/cgroup view", mountRoot: "/tenant", directory: "/cgroup view/agent",
    });
    expect(locateCgroupV2("0::/tenant-other/agent\n", subtree)).toBeUndefined();
    expect(locateCgroupV2("0::/tenant/agent\n", `${subtree}${mount}`)?.mountRoot).toBe("/");
  });

  it("records visible ancestor quotas even when the leaf says max", () => {
    const files: Record<string, string> = {
      "/proc/self/cgroup": "0::/tenant/agent\n",
      "/proc/self/mountinfo": mount,
      "/sys/fs/cgroup/tenant/agent/cpu.max": "max 100000\n",
      "/sys/fs/cgroup/tenant/agent/cpuset.cpus.effective": "0-7\n",
      "/sys/fs/cgroup/tenant/cpu.max": "200000 100000\n",
      "/sys/fs/cgroup/cpu.max": "100000 100000\n",
    };
    const result = collectCgroupV2((path) => files[path]);
    expect(result.status).toBe("available");
    expect(result.observations.map(({ directory }) => directory)).toEqual([
      "/sys/fs/cgroup/tenant/agent", "/sys/fs/cgroup/tenant", "/sys/fs/cgroup",
    ]);
    expect(result.observations[0]?.cpuMax.status).toBe("max");
    expect(result.observations[0]?.cpusetCpusEffective).toEqual({ status: "available", cpus: "0-7" });
    expect(result.observations[1]?.cpusetCpusEffective).toEqual({ status: "unavailable" });
    expect(result.tightestObservedQuotaCpus).toBe(1);
    expect(result.ancestorVisibility).toContain("Hidden or unreadable ancestor limits");
  });

  it("does not interpret missing cgroup files or unreadable quotas as unlimited capacity", () => {
    expect(collectCgroupV2(() => undefined)).toMatchObject({
      status: "unavailable", observations: [], tightestObservedQuotaCpus: null,
    });
    const result = collectCgroupV2((path) => path === "/proc/self/cgroup" ? "0::/agent\n"
      : path === "/proc/self/mountinfo" ? mount : undefined);
    expect(result.observations.map(({ cpuMax }) => cpuMax.status)).toEqual(["unavailable", "unavailable"]);
    expect(result.tightestObservedQuotaCpus).toBeNull();
    expect(result.ancestorVisibility).toContain("max is not proof of unlimited capacity");
  });
});
