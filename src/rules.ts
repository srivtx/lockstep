import type { Issue, LockfileManager, ProjectFacts, ToolchainSource } from "./types.ts";

function majorOf(value: string): number | null {
  const cleaned = value.trim().replace(/^v/i, "").trim();
  const match = cleaned.match(/\d+/);
  if (match === null) return null;
  const major = Number(match[0]);
  return Number.isFinite(major) ? major : null;
}

function stripV(value: string): string {
  return value.trim().replace(/^v/i, "");
}

function sourceLocation(source: ToolchainSource): string {
  if (source.file === source.source) return source.file;
  if (source.source.startsWith(`${source.file}:`) || source.source.startsWith(`${source.file}#`)) {
    return source.source;
  }
  return `${source.file}:${source.source}`;
}

function isSimpleNodeRange(value: string): boolean {
  const v = value.trim();
  return /^v?\d+(\.\d+){0,2}$/.test(v) || /^(>=|>|<=|<|\^|~)\s*v?\d+(\.\d+){0,2}$/.test(v);
}

export function runRules(facts: ProjectFacts): Issue[] {
  const issues: Issue[] = [];

  const nodeDecls = facts.nodeSources
    .map((source) => ({ source, major: majorOf(source.value) }))
    .filter((entry): entry is { source: ToolchainSource; major: number } => entry.major !== null);
  const nodeMajors = [...new Set(nodeDecls.map((entry) => entry.major))].sort((a, b) => a - b);
  if (nodeMajors.length > 1) {
    const parts = nodeMajors.map((major) => {
      const members = nodeDecls
        .filter((entry) => entry.major === major)
        .map((entry) => `${entry.source.source}=${entry.source.value}`);
      return `Node ${major} (${members.join(", ")})`;
    });
    const first = nodeDecls[0]?.source;
    issues.push({
      code: "LOCK-001",
      severity: "error",
      message: `Node version sources disagree across majors: ${parts.join("; ")}.`,
      location:
        facts.enginesNode !== null
          ? "package.json:engines.node"
          : first === undefined
            ? "package.json:engines.node"
            : sourceLocation(first),
      file: facts.enginesNode !== null ? "package.json" : first?.file,
    });
  }

  if (facts.packageManagerManager !== null) {
    const lockManagers = new Set<LockfileManager>(facts.lockfiles.map((lock) => lock.manager));
    if (lockManagers.size > 0 && !lockManagers.has(facts.packageManagerManager as LockfileManager)) {
      issues.push({
        code: "LOCK-002",
        severity: "error",
        message: `packageManager declares "${facts.packageManagerManager}" but the committed lockfile(s) belong to ${[...lockManagers]
          .sort()
          .join(", ")} (${facts.lockfiles.map((lock) => lock.file).join(", ")}).`,
        location: "package.json:packageManager",
        file: "package.json",
      });
    }
  }

  const lockedManagers = [...new Set(facts.lockfiles.map((lock) => lock.manager))].sort();
  if (lockedManagers.length > 1) {
    issues.push({
      code: "LOCK-003",
      severity: "error",
      message: `Multiple lockfiles from different package managers are committed: ${lockedManagers.join(
        ", ",
      )} (${facts.lockfiles.map((lock) => lock.file).join(", ")}).`,
      location: facts.lockfiles[0]?.file ?? ".",
      file: facts.lockfiles[0]?.file,
    });
  }

  if (facts.lockfiles.length > 0 && facts.hasWorkflows && !facts.hasFrozenInstall) {
    issues.push({
      code: "LOCK-004",
      severity: "warning",
      message:
        "A lockfile is committed but no CI install step is frozen (use npm ci, --frozen-lockfile, or --immutable).",
      location: facts.lockfiles[0]?.file ?? ".",
      file: facts.lockfiles[0]?.file,
    });
  }

  if (facts.lockfiles.length === 0) {
    issues.push({
      code: "LOCK-005",
      severity: "warning",
      message: "No lockfile is committed, so dependency resolution is not pinned.",
      location: ".",
    });
  }

  if (facts.packageManagerManager !== null && facts.hasWorkflows && !facts.hasCorepack) {
    const pm = facts.packageManagerManager;
    const pmPinned =
      (pm === "pnpm" && facts.ciPnpmVersions.length > 0) ||
      (pm === "bun" && facts.ciBunVersions.length > 0);
    if (!pmPinned) {
      issues.push({
        code: "LOCK-006",
        severity: "warning",
        message: `packageManager declares "${pm}" but no workflow enables corepack or pins the package-manager version.`,
        location: "package.json:packageManager",
        file: "package.json",
      });
    }
  }

  if (facts.enginesNode !== null && isSimpleNodeRange(facts.enginesNode)) {
    const engineMajor = majorOf(facts.enginesNode);
    if (engineMajor !== null) {
      const mismatched = facts.ciNodeVersions.filter((value) => {
        const major = majorOf(value);
        return major !== null && major !== engineMajor;
      });
      if (mismatched.length > 0) {
        issues.push({
          code: "LOCK-007",
          severity: "info",
          message: `engines.node (${facts.enginesNode}) does not match the pinned CI Node version(s) ${mismatched.join(
            ", ",
          )}.`,
          location: "package.json:engines.node",
          file: "package.json",
        });
      }
    }
  }

  if (facts.nvmrcRaw !== null && facts.nodeVersionRaw !== null) {
    const normalizedNvmrc = stripV(facts.nvmrcRaw);
    const normalizedNodeVersion = stripV(facts.nodeVersionRaw);
    if (facts.nvmrcRaw !== facts.nodeVersionRaw && normalizedNvmrc === normalizedNodeVersion) {
      issues.push({
        code: "LOCK-008",
        severity: "info",
        message: `.nvmrc (${facts.nvmrc ?? ""}) and .node-version (${facts.nodeVersion ?? ""}) differ only cosmetically (v prefix or trailing whitespace).`,
        location: ".nvmrc",
        file: ".nvmrc",
      });
    }
  }

  if (facts.enginesBun !== null && facts.ciBunVersions.length > 0) {
    const engineMajor = majorOf(facts.enginesBun);
    const mismatched = facts.ciBunVersions.filter((value) => {
      const major = majorOf(value);
      return major !== null && engineMajor !== null && major !== engineMajor;
    });
    if (mismatched.length > 0) {
      issues.push({
        code: "LOCK-009",
        severity: "warning",
        message: `engines.bun (${facts.enginesBun}) disagrees in major with the pinned CI Bun version(s) ${mismatched.join(
          ", ",
        )}.`,
        location: "package.json:engines.bun",
        file: "package.json",
      });
    }
  }

  if (!facts.hasWorkflows) {
    issues.push({
      code: "LOCK-010",
      severity: "info",
      message: "No .github/workflows/*.yml found, so CI cannot be verified.",
      location: ".github/workflows",
    });
  }

  issues.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return issues;
}
