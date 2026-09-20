/// <reference types="bun" />
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditProject } from "../src/audit.ts";
import { run } from "../src/cli.ts";
import { writeFixturesTo } from "../src/fixtures.ts";

const workDir = mkdtempSync(join(tmpdir(), "lockstep-e2e-"));
writeFixturesTo(workDir);
const drifted = join(workDir, "drifted");
const clean = join(workDir, "clean");
const infoOnly = join(workDir, "info-only");
mkdirSync(infoOnly, { recursive: true });
writeFileSync(join(infoOnly, "package-lock.json"), '{"lockfileVersion":3}');
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

describe("auditProject on fixtures", () => {
  test("drifted reports LOCK-001, LOCK-002, LOCK-004, LOCK-006 and LOCK-007", () => {
    const result = auditProject(drifted);
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toEqual(["LOCK-001", "LOCK-002", "LOCK-004", "LOCK-006", "LOCK-007"]);
    expect(result.counts.error).toBe(2);
  });

  test("clean reports no issues", () => {
    const result = auditProject(clean);
    expect(result.issues).toEqual([]);
    expect(result.counts).toEqual({ error: 0, warning: 0, info: 0 });
  });
});

describe("run() end to end", () => {
  test("drifted exits 1 at the default fail-on", async () => {
    expect(await run(["--dir", drifted, "--quiet"])).toBe(1);
  });

  test("clean exits 0 at the default fail-on", async () => {
    expect(await run(["--dir", clean, "--quiet"])).toBe(0);
  });

  test("a positional directory is accepted", async () => {
    expect(await run([clean, "--quiet"])).toBe(0);
  });

  test("--fail-on none downgrades every finding to exit 0", async () => {
    expect(await run(["--dir", drifted, "--fail-on", "none", "--quiet"])).toBe(0);
  });

  test("--fail-on info fails on an info-only project", async () => {
    expect(await run(["--dir", infoOnly, "--fail-on", "info", "--quiet"])).toBe(1);
    expect(await run(["--dir", infoOnly, "--fail-on", "warning", "--quiet"])).toBe(0);
  });

  test("an unreadable directory exits 2", async () => {
    expect(await run(["--dir", join(workDir, "missing")])).toBe(2);
  });
});
