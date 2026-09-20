/// <reference types="bun" />
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatJson, formatSummary, formatText } from "../src/report.ts";
import { toSarif, writeSarif } from "../src/sarif.ts";
import type { LockstepResult } from "../src/types.ts";

const RESULT: LockstepResult = {
  file: "fixtures/drifted",
  sources: [
    { source: ".nvmrc", file: ".nvmrc", value: "v20.11.0", kind: "node" },
    { source: "packageManager", file: "package.json", value: "pnpm@9.12.0", kind: "packageManager" },
  ],
  issues: [
    {
      code: "LOCK-001",
      severity: "error",
      message: "Node version sources disagree across majors.",
      location: "package.json:engines.node",
      file: "package.json",
    },
    {
      code: "LOCK-007",
      severity: "info",
      message: "engines.node does not match the pinned CI Node version.",
      location: "package.json:engines.node",
      file: "package.json",
    },
  ],
  counts: { error: 1, warning: 0, info: 1 },
};

const workDir = mkdtempSync(join(tmpdir(), "lockstep-report-"));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

describe("formatText", () => {
  test("prints the summary header first", () => {
    const lines = formatText(RESULT).split("\n");
    expect(lines[0]).toBe("fixtures/drifted  errors:1  warnings:0  info:1");
  });

  test("prints one line per source in kind/source/value form", () => {
    expect(formatText(RESULT)).toContain("node  .nvmrc  v20.11.0");
    expect(formatText(RESULT)).toContain("packageManager  packageManager  pnpm@9.12.0");
  });

  test("prints one SEVERITY CODE location message line per issue", () => {
    expect(formatText(RESULT)).toContain(
      "ERROR  LOCK-001  package.json:engines.node  Node version sources disagree across majors.",
    );
    expect(formatText(RESULT)).toContain(
      "INFO  LOCK-007  package.json:engines.node  engines.node does not match the pinned CI Node version.",
    );
  });

  test("formatSummary matches the header line", () => {
    expect(formatSummary(RESULT)).toBe("fixtures/drifted  errors:1  warnings:0  info:1");
  });
});

describe("formatJson", () => {
  test("round-trips the result object", () => {
    expect(JSON.parse(formatJson(RESULT))).toEqual(RESULT);
  });
});

describe("SARIF", () => {
  test("toSarif produces a 2.1.0 log for lockstep", () => {
    const sarif = toSarif(RESULT, "lockstep", "0.1.0");
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]?.tool.driver.name).toBe("lockstep");
    expect(sarif.runs[0]?.tool.driver.informationUri).toBe("https://srivtx.github.io/lockstep");
    expect(sarif.runs[0]?.tool.driver.rules.map((rule) => rule.id)).toEqual([
      "LOCK-001",
      "LOCK-007",
    ]);
    expect(sarif.runs[0]?.results).toHaveLength(2);
  });

  test("maps info to note and error to error", () => {
    const sarif = toSarif(RESULT, "lockstep", "0.1.0");
    const levels = sarif.runs[0]?.results.map((entry) => entry.level);
    expect(levels).toEqual(["error", "note"]);
  });

  test("writeSarif writes valid JSON to disk", async () => {
    const path = join(workDir, "out.sarif");
    const bytes = await writeSarif(path, RESULT, "lockstep", "0.1.0");
    expect(bytes).toBeGreaterThan(0);
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { version: string };
    expect(parsed.version).toBe("2.1.0");
  });
});
