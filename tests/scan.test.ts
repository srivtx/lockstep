/// <reference types="bun" />
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditProject } from "../src/audit.ts";
import { writeFixturesTo } from "../src/fixtures.ts";
import { LockstepScanError, parseMiseTools, parseToolVersions, scanProject } from "../src/scan.ts";
import { PARSE_ERROR_CODE } from "../src/types.ts";

const workDir = mkdtempSync(join(tmpdir(), "lockstep-scan-"));
writeFixturesTo(workDir);
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

describe("scanProject", () => {
  test("reads the drifted fixture", () => {
    const { facts, sources } = scanProject(join(workDir, "drifted"));
    expect(facts.enginesNode).toBe(">=18");
    expect(facts.nvmrc).toBe("v20.11.0");
    expect(facts.nodeVersion).toBe("18.19.0");
    expect(facts.packageManagerManager).toBe("pnpm");
    expect(facts.packageManagerVersion).toBe("9.12.0");
    expect(facts.ciNodeVersions).toEqual(["20"]);
    expect(facts.ciBunVersions).toEqual([]);
    expect(facts.hasCorepack).toBe(false);
    expect(facts.hasFrozenInstall).toBe(false);
    expect(facts.hasWorkflows).toBe(true);
    expect(facts.lockfiles.map((lock) => lock.manager)).toEqual(["npm"]);
    expect(facts.lockfiles[0]?.lockfileVersion).toBe("3");
    expect(sources.some((source) => source.source === ".nvmrc")).toBe(true);
    expect(sources.some((source) => source.kind === "packageManager")).toBe(true);
  });

  test("reads the clean fixture", () => {
    const { facts } = scanProject(join(workDir, "clean"));
    expect(facts.enginesNode).toBe("20");
    expect(facts.hasCorepack).toBe(true);
    expect(facts.hasFrozenInstall).toBe(true);
    expect(facts.ciPnpmVersions).toEqual(["9.12.0"]);
    expect(facts.lockfiles).toEqual([
      { file: "pnpm-lock.yaml", manager: "pnpm", lockfileVersion: "9.0" },
    ]);
  });

  test("a malformed workflow becomes a single LOCK-000 fatal issue", () => {
    const dir = mkdtempSync(join(tmpdir(), "lockstep-badyaml-"));
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(join(dir, ".github", "workflows", "bad.yml"), "jobs:\n  build: [unclosed\n");
    expect(() => scanProject(dir)).toThrow(LockstepScanError);

    const result = auditProject(dir);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.code).toBe(PARSE_ERROR_CODE);
    expect(result.counts.error).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  test("missing files are not errors", () => {
    const dir = mkdtempSync(join(tmpdir(), "lockstep-empty-"));
    const { facts, sources } = scanProject(dir);
    expect(sources).toEqual([]);
    expect(facts.hasPackageJson).toBe(false);
    expect(facts.lockfiles).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("toolchain file parsers", () => {
  test("parseToolVersions reads nodejs and bun lines", () => {
    expect(parseToolVersions("nodejs 20.11.0\nbun 1.1.0\n")).toEqual({
      node: "20.11.0",
      bun: "1.1.0",
    });
  });

  test("parseToolVersions tolerates a plugin with no version", () => {
    expect(parseToolVersions("nodejs\nbun 1.1.0\n").node).toBeNull();
  });

  test("parseMiseTools reads the [tools] table", () => {
    expect(parseMiseTools('[tools]\nnode = "20"\nbun = "1"\n')).toEqual({
      node: "20",
      bun: "1",
    });
  });

  test("parseMiseTools reads an inline table", () => {
    expect(parseMiseTools("[tools]\nnode = { version = \"20.11.0\" }\n")).toEqual({
      node: "20.11.0",
      bun: null,
    });
  });
});
