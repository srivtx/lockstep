/// <reference types="bun" />
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFixturesTo } from "../src/fixtures.ts";

const ROOT = join(import.meta.dir, "..");
const CLI = join(ROOT, "src", "cli.ts");
const VERSION = (
  JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }
).version;

const workDir = mkdtempSync(join(tmpdir(), "lockstep-contract-"));
writeFixturesTo(workDir);
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[]): CliResult {
  const proc = Bun.spawnSync(["bun", "run", CLI, ...args], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: proc.exitCode ?? -1,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

describe("lockstep CLI contract", () => {
  test("--version and -v print exactly the package version", () => {
    for (const flag of ["--version", "-v"]) {
      const res = runCli([flag]);
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe(VERSION);
    }
  });

  test("--help and -h exit 0 and document the exit codes", () => {
    for (const flag of ["--help", "-h"]) {
      const res = runCli([flag]);
      expect(res.code).toBe(0);
      expect(res.stdout).toContain("Exit codes:");
      for (const code of ["0", "1", "2", "3"]) {
        expect(res.stdout).toMatch(new RegExp(`^\\s*${code}\\s`, "m"));
      }
      expect(res.stdout).toContain("no network calls");
    }
  });

  test("an unknown option exits 2", () => {
    const res = runCli(["--bogus"]);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain("lockstep: unknown option --bogus");
  });

  test("--flag=value works and a value flag without a value exits 2", () => {
    const inline = runCli(["--fail-on=none", "--dir", join(workDir, "drifted")]);
    expect(inline.code).toBe(0);

    const missing = runCli(["--fail-on"]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("--fail-on");
  });

  test("--json prints a single machine-readable result object", () => {
    const res = runCli(["--dir", join(workDir, "drifted"), "--json"]);
    expect(res.code).toBe(1);
    const parsed = JSON.parse(res.stdout) as {
      file: string;
      issues: { code: string }[];
      counts: { error: number };
    };
    expect(parsed.file).toBe(join(workDir, "drifted"));
    expect(parsed.counts.error).toBe(2);
    expect(parsed.issues.some((issue) => issue.code === "LOCK-001")).toBe(true);
  });

  test("the drifted fixture exits 1 and the clean fixture exits 0", () => {
    expect(runCli(["--dir", join(workDir, "drifted")]).code).toBe(1);
    expect(runCli(["--dir", join(workDir, "clean")]).code).toBe(0);
  });
});
