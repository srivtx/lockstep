/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { runRules } from "../src/rules.ts";
import type { Issue, LockfileFact, ProjectFacts, ToolchainSource } from "../src/types.ts";

function src(
  source: string,
  file: string,
  value: string,
  kind: ToolchainSource["kind"] = "node",
): ToolchainSource {
  return { source, file, value, kind };
}

function lock(
  file: string,
  manager: LockfileFact["manager"],
  lockfileVersion: string | null = null,
): LockfileFact {
  return { file, manager, lockfileVersion };
}

function baseFacts(overrides: Partial<ProjectFacts> = {}): ProjectFacts {
  return {
    dir: ".",
    hasPackageJson: true,
    enginesNode: null,
    enginesBun: null,
    voltaNode: null,
    voltaBun: null,
    packageManagerRaw: null,
    packageManagerManager: null,
    packageManagerVersion: null,
    workspaces: false,
    nvmrc: null,
    nvmrcRaw: null,
    nodeVersion: null,
    nodeVersionRaw: null,
    toolVersionsNode: null,
    toolVersionsBun: null,
    miseFile: null,
    miseNode: null,
    miseBun: null,
    nodeSources: [],
    bunSources: [],
    packageManagerSource: null,
    ciNodeVersions: [],
    ciBunVersions: [],
    ciPnpmVersions: [],
    hasCorepack: false,
    hasFrozenInstall: false,
    hasWorkflows: false,
    workflowFiles: [],
    lockfiles: [],
    ...overrides,
  };
}

function codes(facts: ProjectFacts): string[] {
  return runRules(facts).map((issue) => issue.code);
}

function find(facts: ProjectFacts, code: string): Issue | undefined {
  return runRules(facts).find((issue) => issue.code === code);
}

const ALIGNED: Partial<ProjectFacts> = {
  enginesNode: "20",
  nvmrc: "20.11.0",
  nvmrcRaw: "20.11.0\n",
  nodeVersion: "20.11.0",
  nodeVersionRaw: "20.11.0\n",
  nodeSources: [
    src("engines.node", "package.json", "20"),
    src(".nvmrc", ".nvmrc", "20.11.0"),
    src(".node-version", ".node-version", "20.11.0"),
    src(".github/workflows/ci.yml:setup-node", ".github/workflows/ci.yml", "20"),
  ],
  ciNodeVersions: ["20"],
  packageManagerRaw: "pnpm@9.12.0",
  packageManagerManager: "pnpm",
  packageManagerVersion: "9.12.0",
  packageManagerSource: src("packageManager", "package.json", "pnpm@9.12.0", "packageManager"),
  lockfiles: [lock("pnpm-lock.yaml", "pnpm", "9.0")],
  hasWorkflows: true,
  workflowFiles: ["ci.yml"],
  hasCorepack: true,
  hasFrozenInstall: true,
};

describe("runRules", () => {
  test("an aligned project produces no issues", () => {
    expect(runRules(baseFacts(ALIGNED))).toEqual([]);
  });

  test("issues are sorted by code", () => {
    const result = codes(
      baseFacts({
        enginesNode: ">=18",
        nodeSources: [src("engines.node", "package.json", ">=18"), src(".nvmrc", ".nvmrc", "20")],
      }),
    );
    expect(result).toEqual([...result].sort());
  });

  test("LOCK-001 flags Node sources that disagree across majors", () => {
    const issue = find(
      baseFacts({
        enginesNode: ">=18",
        nodeSources: [
          src("engines.node", "package.json", ">=18"),
          src(".nvmrc", ".nvmrc", "v20.11.0"),
          src(".node-version", ".node-version", "18.19.0"),
        ],
      }),
      "LOCK-001",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("error");
    expect(issue!.message).toContain("engines.node=>=18");
    expect(issue!.message).toContain(".nvmrc=v20.11.0");
  });

  test("LOCK-001 does not fire when majors agree but precision differs", () => {
    expect(
      codes(
        baseFacts({
          nodeSources: [
            src("engines.node", "package.json", "20"),
            src(".nvmrc", ".nvmrc", "20.11.0"),
          ],
        }),
      ),
    ).not.toContain("LOCK-001");
  });

  test("LOCK-002 flags a packageManager that disagrees with the lockfile", () => {
    const issue = find(
      baseFacts({
        packageManagerManager: "pnpm",
        packageManagerRaw: "pnpm@9.12.0",
        lockfiles: [lock("package-lock.json", "npm", "3")],
      }),
      "LOCK-002",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("error");
    expect(issue!.message).toContain("pnpm");
    expect(issue!.message).toContain("npm");
  });

  test("LOCK-002 does not fire when the manager matches a committed lockfile", () => {
    expect(
      codes(
        baseFacts({
          packageManagerManager: "pnpm",
          lockfiles: [lock("pnpm-lock.yaml", "pnpm", "9.0")],
        }),
      ),
    ).not.toContain("LOCK-002");
  });

  test("LOCK-003 flags two lockfiles from different managers", () => {
    const issue = find(
      baseFacts({ lockfiles: [lock("pnpm-lock.yaml", "pnpm"), lock("yarn.lock", "yarn")] }),
      "LOCK-003",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("error");
  });

  test("LOCK-003 does not fire for two lockfiles from the same manager", () => {
    expect(
      codes(
        baseFacts({
          lockfiles: [lock("bun.lock", "bun"), lock("bun.lockb", "bun")],
        }),
      ),
    ).not.toContain("LOCK-003");
  });

  test("LOCK-004 warns when a lockfile is committed but CI is not frozen", () => {
    const issue = find(
      baseFacts({
        lockfiles: [lock("package-lock.json", "npm", "3")],
        hasWorkflows: true,
        workflowFiles: ["ci.yml"],
        hasFrozenInstall: false,
      }),
      "LOCK-004",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
  });

  test("LOCK-004 is silent when CI installs with a frozen lockfile", () => {
    expect(
      codes(
        baseFacts({
          lockfiles: [lock("package-lock.json", "npm", "3")],
          hasWorkflows: true,
          hasFrozenInstall: true,
        }),
      ),
    ).not.toContain("LOCK-004");
  });

  test("LOCK-005 warns when no lockfile is committed", () => {
    const issue = find(baseFacts({ lockfiles: [] }), "LOCK-005");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
  });

  test("LOCK-006 warns when a packageManager has no corepack or version pin in CI", () => {
    const issue = find(
      baseFacts({
        packageManagerManager: "pnpm",
        hasWorkflows: true,
        hasCorepack: false,
        ciPnpmVersions: [],
      }),
      "LOCK-006",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
  });

  test("LOCK-006 is silent when a setup action pins the package-manager version", () => {
    expect(
      codes(
        baseFacts({
          packageManagerManager: "pnpm",
          hasWorkflows: true,
          hasCorepack: false,
          ciPnpmVersions: ["9.12.0"],
        }),
      ),
    ).not.toContain("LOCK-006");
  });

  test("LOCK-007 notes an engines.node range outside the pinned CI Node major", () => {
    const issue = find(
      baseFacts({ enginesNode: ">=18", ciNodeVersions: ["20"] }),
      "LOCK-007",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("info");
  });

  test("LOCK-007 is silent when engines.node and CI agree", () => {
    expect(codes(baseFacts({ enginesNode: "20", ciNodeVersions: ["20"] }))).not.toContain(
      "LOCK-007",
    );
  });

  test("LOCK-008 notes .nvmrc and .node-version that differ only by a v prefix", () => {
    const issue = find(
      baseFacts({
        nvmrc: "v20.11.0",
        nvmrcRaw: "v20.11.0\n",
        nodeVersion: "20.11.0",
        nodeVersionRaw: "20.11.0\n",
      }),
      "LOCK-008",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("info");
  });

  test("LOCK-008 is silent when the two files are byte-identical", () => {
    expect(
      codes(
        baseFacts({
          nvmrc: "20.11.0",
          nvmrcRaw: "20.11.0\n",
          nodeVersion: "20.11.0",
          nodeVersionRaw: "20.11.0\n",
        }),
      ),
    ).not.toContain("LOCK-008");
  });

  test("LOCK-009 warns when CI Bun disagrees in major with engines.bun", () => {
    const issue = find(
      baseFacts({ enginesBun: ">=1.1.0", ciBunVersions: ["2.0.0"] }),
      "LOCK-009",
    );
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
  });

  test("LOCK-010 notes that no workflow could be verified", () => {
    const issue = find(baseFacts({ hasWorkflows: false }), "LOCK-010");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("info");
  });

  test("every issue carries a code, severity, message and location", () => {
    for (const issue of runRules(
      baseFacts({
        enginesBun: ">=1.1.0",
        ciBunVersions: ["2.0.0"],
        nodeSources: [src("engines.node", "package.json", ">=18"), src(".nvmrc", ".nvmrc", "20")],
      }),
    )) {
      expect(issue.code).toMatch(/^LOCK-\d{3}$/);
      expect(["error", "warning", "info"]).toContain(issue.severity);
      expect(issue.message.length).toBeGreaterThan(0);
      expect(issue.location.length).toBeGreaterThan(0);
    }
  });
});
