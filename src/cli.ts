#!/usr/bin/env bun
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { auditProject } from "./audit.ts";
import { formatJson, formatSummary, formatText } from "./report.ts";
import { writeSarif } from "./sarif.ts";
import { PARSE_ERROR_CODE, type Severity } from "./types.ts";

export type FailOn = "error" | "warning" | "info" | "none";

export interface Options {
  json: boolean;
  quiet: boolean;
  dir: string | null;
  help: boolean;
  version: boolean;
  sarif: string | null;
  failOn: FailOn;
  files: string[];
}

const FAIL_ON_VALUES: FailOn[] = ["error", "warning", "info", "none"];

function readVersion(): string {
  try {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(fileURLToPath(pkgUrl), "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const VERSION = readVersion();

const USAGE = `lockstep - offline toolchain drift guard for JavaScript and TypeScript projects

Usage:
  lockstep [<dir>] [--json] [--quiet] [--sarif <path>] [--fail-on <level>]
  lockstep --dir <path> [--json] [--quiet] [--sarif <path>] [--fail-on <level>]

Options:
  --dir <path>            Audit the project rooted at <path> (default: the
                          current directory)
  --json                  Print the result as machine-readable JSON
  --quiet, -q             Print only the summary line
  --sarif <path>          Write a SARIF 2.1.0 report to <path>
  --fail-on <level>       Exit non-zero at this severity or above:
                          error (default), warning, info, none
  -h, --help              Show this help
  -v, --version           Print the version
  --                      End of options; treat the remaining arguments as the
                          target directory (use this for a path starting with "-")

Reads only local files: package.json (engines, packageManager, volta), .nvmrc,
.node-version, .tool-versions, mise.toml, .github/workflows/*.yml, and the
committed lockfile. It makes no network calls and sends no telemetry. Missing
files are not errors.

Exit codes:
  0  no issues at or above --fail-on
  1  at least one issue at or above --fail-on
  2  invalid usage or unreadable input (including a malformed workflow)
  3  I/O error (the report could not be written)
`;

export function parseArgs(argv: string[]): Options {
  const opts: Options = {
    json: false,
    quiet: false,
    dir: null,
    help: false,
    version: false,
    sarif: null,
    failOn: "error",
    files: [],
  };
  let endOfOptions = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (endOfOptions) {
      opts.files.push(arg);
      continue;
    }
    if (arg === "--") {
      endOfOptions = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--quiet" || arg === "-q") {
      opts.quiet = true;
    } else if (arg === "--dir" || arg.startsWith("--dir=")) {
      const value = arg.startsWith("--dir=") ? arg.slice("--dir=".length) : argv[++i];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        throw new Error("--dir requires a path argument");
      }
      opts.dir = value;
    } else if (arg === "--sarif" || arg.startsWith("--sarif=")) {
      const value = arg.startsWith("--sarif=") ? arg.slice("--sarif=".length) : argv[++i];
      if (value === undefined || value.length === 0 || value.startsWith("-")) {
        throw new Error("--sarif requires a path argument");
      }
      opts.sarif = value;
    } else if (arg === "--fail-on" || arg.startsWith("--fail-on=")) {
      const value = arg.startsWith("--fail-on=") ? arg.slice("--fail-on=".length) : argv[++i];
      if (value === undefined || value.length === 0) {
        throw new Error("--fail-on requires a level argument");
      }
      if (!FAIL_ON_VALUES.includes(value as FailOn)) {
        throw new Error(`Invalid --fail-on value: ${value} (expected error, warning, info, or none)`);
      }
      opts.failOn = value as FailOn;
    } else if (arg === "-h" || arg === "--help") {
      opts.help = true;
    } else if (arg === "-v" || arg === "--version") {
      opts.version = true;
    } else if (arg.startsWith("-") && arg !== "-") {
      throw new Error(`unknown option ${arg}`);
    } else {
      opts.files.push(arg);
    }
  }
  return opts;
}

function resolveTarget(opts: Options): string {
  if (opts.dir !== null) {
    if (opts.files.length > 0) {
      throw new Error("specify the target with either --dir or a positional path, not both");
    }
    return opts.dir;
  }
  if (opts.files.length > 1) {
    throw new Error("lockstep audits one project at a time; gave more than one path");
  }
  return opts.files[0] ?? ".";
}

function exceedsFailOn(counts: Record<Severity, number>, failOn: FailOn): boolean {
  switch (failOn) {
    case "none":
      return false;
    case "info":
      return counts.error > 0 || counts.warning > 0 || counts.info > 0;
    case "warning":
      return counts.error > 0 || counts.warning > 0;
    case "error":
      return counts.error > 0;
  }
}

export async function run(argv: string[]): Promise<number> {
  let opts: Options;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`lockstep: ${err instanceof Error ? err.message : String(err)}`);
    console.error(USAGE);
    return 2;
  }

  if (opts.help) {
    console.log(USAGE);
    return 0;
  }

  if (opts.version) {
    console.log(VERSION);
    return 0;
  }

  let target: string;
  try {
    target = resolveTarget(opts);
  } catch (err) {
    console.error(`lockstep: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  try {
    const stat = statSync(target);
    if (!stat.isDirectory()) {
      console.error(`lockstep: cannot read ${target}: not a directory`);
      return 2;
    }
  } catch (err) {
    console.error(
      `lockstep: cannot read ${target}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 2;
  }

  const result = auditProject(target);
  const parseFailure = result.issues.some((issue) => issue.code === PARSE_ERROR_CODE);

  if (opts.json) {
    console.log(formatJson(result));
  } else if (opts.quiet) {
    console.log(formatSummary(result));
  } else {
    console.log(formatText(result));
  }

  if (opts.sarif !== null) {
    try {
      await writeSarif(opts.sarif, result, "lockstep", VERSION);
    } catch (err) {
      console.error(
        `lockstep: cannot write SARIF report to ${opts.sarif}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return 3;
    }
  }

  if (parseFailure) return 2;
  return exceedsFailOn(result.counts, opts.failOn) ? 1 : 0;
}

if (import.meta.main) {
  const code = await run(process.argv.slice(2));
  process.exit(code);
}
