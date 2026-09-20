import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  LockfileFact,
  LockfileManager,
  ProjectFacts,
  ToolchainSource,
} from "./types.ts";

export class LockstepScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockstepScanError";
  }
}

export interface ScanResult {
  sources: ToolchainSource[];
  facts: ProjectFacts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readIfExists(file: string): string | null {
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8");
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toStringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(toStringValues);
  return [];
}

function cleanTomlValue(value: string): string {
  const inline = value.match(/version\s*=\s*["']([^"']+)["']/);
  if (inline !== null && inline[1] !== undefined) return inline[1];
  const stripped = value.replace(/^[[{]/, "").replace(/[\]}]$/, "");
  const first = (stripped.split(",")[0] ?? "").trim();
  return first.replace(/^["']|["']$/g, "");
}

function resolveMiseTarget(section: string, key: string): "node" | "bun" | null {
  if (section === "" || section === "tools") {
    if (key === "node" || key === "nodejs") return "node";
    if (key === "bun") return "bun";
    return null;
  }
  if (section === "tools.node" || section === "tools.nodejs") {
    if (key === "version" || key === "node" || key === "nodejs") return "node";
    return null;
  }
  if (section === "tools.bun") {
    if (key === "version" || key === "bun") return "bun";
    return null;
  }
  return null;
}

export function parseMiseTools(text: string): { node: string | null; bun: string | null } {
  let node: string | null = null;
  let bun: string | null = null;
  let section = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line.length === 0) continue;
    if (line.startsWith("[")) {
      section = line.replace(/[[\]]/g, "").trim();
      continue;
    }
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    const target = resolveMiseTarget(section, key);
    if (target === "node") node = cleanTomlValue(value);
    else if (target === "bun") bun = cleanTomlValue(value);
  }
  return { node, bun };
}

export function parseToolVersions(text: string): { node: string | null; bun: string | null } {
  let node: string | null = null;
  let bun: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line.length === 0) continue;
    const tokens = line.split(/\s+/);
    const name = tokens[0];
    const version = tokens[1] ?? null;
    if (name === "nodejs" || name === "node") node = version;
    else if (name === "bun") bun = version;
  }
  return { node, bun };
}

const WORKFLOW_SUFFIXES = [".yml", ".yaml"];

export function scanProject(dir: string): ScanResult {
  const sources: ToolchainSource[] = [];
  const nodeSources: ToolchainSource[] = [];
  const bunSources: ToolchainSource[] = [];
  const ciNodeVersions: string[] = [];
  const ciBunVersions: string[] = [];
  const ciPnpmVersions: string[] = [];

  let hasPackageJson = false;
  let enginesNode: string | null = null;
  let enginesBun: string | null = null;
  let voltaNode: string | null = null;
  let voltaBun: string | null = null;
  let packageManagerRaw: string | null = null;
  let packageManagerManager: string | null = null;
  let packageManagerVersion: string | null = null;
  let packageManagerSource: ToolchainSource | null = null;
  let workspaces = false;

  const addNode = (source: string, file: string, value: string): void => {
    const entry: ToolchainSource = { source, file, value, kind: "node" };
    nodeSources.push(entry);
    sources.push(entry);
  };
  const addBun = (source: string, file: string, value: string): void => {
    const entry: ToolchainSource = { source, file, value, kind: "bun" };
    bunSources.push(entry);
    sources.push(entry);
  };

  const pkgText = readIfExists(join(dir, "package.json"));
  if (pkgText !== null) {
    hasPackageJson = true;
    let pkg: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(pkgText);
      if (!isRecord(parsed)) throw new Error("expected a JSON object");
      pkg = parsed;
    } catch (err) {
      throw new LockstepScanError(
        `package.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (isRecord(pkg["engines"])) {
      enginesNode = asString(pkg["engines"]["node"]);
      enginesBun = asString(pkg["engines"]["bun"]);
    }
    if (isRecord(pkg["volta"])) {
      voltaNode = asString(pkg["volta"]["node"]);
      voltaBun = asString(pkg["volta"]["bun"]);
    }
    packageManagerRaw = asString(pkg["packageManager"]);
    workspaces = pkg["workspaces"] !== undefined;

    if (enginesNode !== null) addNode("engines.node", "package.json", enginesNode);
    if (enginesBun !== null) addBun("engines.bun", "package.json", enginesBun);
    if (voltaNode !== null) addNode("volta.node", "package.json", voltaNode);
    if (voltaBun !== null) addBun("volta.bun", "package.json", voltaBun);
    if (packageManagerRaw !== null) {
      const at = packageManagerRaw.indexOf("@");
      packageManagerManager = at === -1 ? packageManagerRaw : packageManagerRaw.slice(0, at);
      packageManagerVersion = at === -1 ? null : packageManagerRaw.slice(at + 1);
      packageManagerSource = {
        source: "packageManager",
        file: "package.json",
        value: packageManagerRaw,
        kind: "packageManager",
      };
      sources.push(packageManagerSource);
    }
  }

  const nvmrcRaw = readIfExists(join(dir, ".nvmrc"));
  const nvmrc = nvmrcRaw === null ? null : nvmrcRaw.trim();
  if (nvmrc !== null && nvmrc.length > 0) addNode(".nvmrc", ".nvmrc", nvmrc);

  const nodeVersionRaw = readIfExists(join(dir, ".node-version"));
  const nodeVersion = nodeVersionRaw === null ? null : nodeVersionRaw.trim();
  if (nodeVersion !== null && nodeVersion.length > 0) {
    addNode(".node-version", ".node-version", nodeVersion);
  }

  const toolVersionsText = readIfExists(join(dir, ".tool-versions"));
  let toolVersionsNode: string | null = null;
  let toolVersionsBun: string | null = null;
  if (toolVersionsText !== null) {
    const tv = parseToolVersions(toolVersionsText);
    toolVersionsNode = tv.node;
    toolVersionsBun = tv.bun;
    if (toolVersionsNode !== null) addNode("tool-versions", ".tool-versions", toolVersionsNode);
    if (toolVersionsBun !== null) addBun("tool-versions", ".tool-versions", toolVersionsBun);
  }

  let miseFile: string | null = null;
  let miseNode: string | null = null;
  let miseBun: string | null = null;
  for (const candidate of ["mise.toml", ".mise.toml"]) {
    const text = readIfExists(join(dir, candidate));
    if (text === null) continue;
    miseFile = candidate;
    const parsed = parseMiseTools(text);
    miseNode = parsed.node;
    miseBun = parsed.bun;
    if (miseNode !== null) addNode("mise", candidate, miseNode);
    if (miseBun !== null) addBun("mise", candidate, miseBun);
    break;
  }

  let hasCorepack = false;
  let hasFrozenInstall = false;
  const workflowFiles: string[] = [];
  const workflowsDir = join(dir, ".github", "workflows");
  if (existsSync(workflowsDir) && statSync(workflowsDir).isDirectory()) {
    const found = readdirSync(workflowsDir)
      .filter((name) => WORKFLOW_SUFFIXES.some((suffix) => name.endsWith(suffix)))
      .sort();
    for (const name of found) {
      workflowFiles.push(name);
      const rel = `.github/workflows/${name}`;
      const text = readIfExists(join(workflowsDir, name)) ?? "";
      let doc: unknown;
      try {
        doc = parseYaml(text);
      } catch (err) {
        throw new LockstepScanError(
          `malformed YAML in ${rel}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (!isRecord(doc)) continue;
      const jobs = isRecord(doc["jobs"]) ? doc["jobs"] : {};
      for (const job of Object.values(jobs)) {
        if (!isRecord(job)) continue;
        const steps = Array.isArray(job["steps"]) ? job["steps"] : [];
        for (const step of steps) {
          if (!isRecord(step)) continue;
          const uses = asString(step["uses"]);
          const withObj = isRecord(step["with"]) ? step["with"] : null;
          const run = asString(step["run"]);

          if (uses !== null && uses.startsWith("actions/setup-node")) {
            const values = withObj === null ? [] : toStringValues(withObj["node-version"]);
            for (const value of values) {
              ciNodeVersions.push(value);
              addNode(`${rel}:setup-node`, rel, value);
            }
          }
          if (uses !== null && uses.startsWith("oven-sh/setup-bun")) {
            const values = withObj === null ? [] : toStringValues(withObj["bun-version"]);
            for (const value of values) {
              ciBunVersions.push(value);
              addBun(`${rel}:setup-bun`, rel, value);
            }
          }
          if (uses !== null && uses.startsWith("pnpm/action-setup")) {
            const values = withObj === null ? [] : toStringValues(withObj["version"]);
            for (const value of values) {
              ciPnpmVersions.push(value);
              sources.push({
                source: `${rel}:pnpm/action-setup`,
                file: rel,
                value,
                kind: "packageManager",
              });
            }
          }
          if (run !== null) {
            if (/\bcorepack\s+enable\b/.test(run)) hasCorepack = true;
            if (
              /\bnpm\s+ci\b/.test(run) ||
              /--frozen-lockfile\b/.test(run) ||
              /--immutable\b/.test(run)
            ) {
              hasFrozenInstall = true;
            }
          }
        }
      }
    }
  }

  const lockfiles: LockfileFact[] = [];
  const lockfileCandidates: { file: string; manager: LockfileManager }[] = [
    { file: "bun.lock", manager: "bun" },
    { file: "bun.lockb", manager: "bun" },
    { file: "package-lock.json", manager: "npm" },
    { file: "npm-shrinkwrap.json", manager: "npm" },
    { file: "pnpm-lock.yaml", manager: "pnpm" },
    { file: "yarn.lock", manager: "yarn" },
  ];
  for (const candidate of lockfileCandidates) {
    const path = join(dir, candidate.file);
    if (!existsSync(path)) continue;
    let lockfileVersion: string | null = null;
    const text = readIfExists(path);
    if (text !== null) {
      if (candidate.file.endsWith(".json")) {
        try {
          const parsed: unknown = JSON.parse(text);
          if (isRecord(parsed) && parsed["lockfileVersion"] !== undefined) {
            lockfileVersion = String(parsed["lockfileVersion"]);
          }
        } catch {
          lockfileVersion = null;
        }
      } else if (candidate.file === "pnpm-lock.yaml") {
        try {
          const parsed: unknown = parseYaml(text);
          if (isRecord(parsed) && parsed["lockfileVersion"] !== undefined) {
            lockfileVersion = String(parsed["lockfileVersion"]);
          }
        } catch {
          lockfileVersion = null;
        }
      }
    }
    lockfiles.push({ file: candidate.file, manager: candidate.manager, lockfileVersion });
  }

  const kindRank: Record<ToolchainSource["kind"], number> = {
    node: 0,
    bun: 1,
    packageManager: 2,
  };
  const byKind = (a: ToolchainSource, b: ToolchainSource): number =>
    kindRank[a.kind] - kindRank[b.kind] ||
    a.file.localeCompare(b.file) ||
    a.source.localeCompare(b.source) ||
    a.value.localeCompare(b.value);
  sources.sort(byKind);
  nodeSources.sort(byKind);
  bunSources.sort(byKind);

  const facts: ProjectFacts = {
    dir,
    hasPackageJson,
    enginesNode,
    enginesBun,
    voltaNode,
    voltaBun,
    packageManagerRaw,
    packageManagerManager,
    packageManagerVersion,
    workspaces,
    nvmrc,
    nvmrcRaw,
    nodeVersion,
    nodeVersionRaw,
    toolVersionsNode,
    toolVersionsBun,
    miseFile,
    miseNode,
    miseBun,
    nodeSources,
    bunSources,
    packageManagerSource,
    ciNodeVersions,
    ciBunVersions,
    ciPnpmVersions,
    hasCorepack,
    hasFrozenInstall,
    hasWorkflows: workflowFiles.length > 0,
    workflowFiles,
    lockfiles,
  };

  return { sources, facts };
}
