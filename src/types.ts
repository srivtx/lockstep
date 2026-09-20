export type Severity = "error" | "warning" | "info";

export const PARSE_ERROR_CODE = "LOCK-000";

export interface Issue {
  code: string;
  severity: Severity;
  message: string;
  location: string;
  file?: string;
}

export interface ToolchainSource {
  source: string;
  file: string;
  value: string;
  kind: "node" | "bun" | "packageManager";
}

export type LockfileManager = "npm" | "pnpm" | "yarn" | "bun";

export interface LockfileFact {
  file: string;
  manager: LockfileManager;
  lockfileVersion: string | null;
}

export interface ProjectFacts {
  dir: string;
  hasPackageJson: boolean;
  enginesNode: string | null;
  enginesBun: string | null;
  voltaNode: string | null;
  voltaBun: string | null;
  packageManagerRaw: string | null;
  packageManagerManager: string | null;
  packageManagerVersion: string | null;
  workspaces: boolean;
  nvmrc: string | null;
  nvmrcRaw: string | null;
  nodeVersion: string | null;
  nodeVersionRaw: string | null;
  toolVersionsNode: string | null;
  toolVersionsBun: string | null;
  miseFile: string | null;
  miseNode: string | null;
  miseBun: string | null;
  nodeSources: ToolchainSource[];
  bunSources: ToolchainSource[];
  packageManagerSource: ToolchainSource | null;
  ciNodeVersions: string[];
  ciBunVersions: string[];
  ciPnpmVersions: string[];
  hasCorepack: boolean;
  hasFrozenInstall: boolean;
  hasWorkflows: boolean;
  workflowFiles: string[];
  lockfiles: LockfileFact[];
}

export interface LockstepResult {
  file: string;
  sources: ToolchainSource[];
  issues: Issue[];
  counts: Record<Severity, number>;
}
