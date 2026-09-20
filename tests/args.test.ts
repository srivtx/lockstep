import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/cli.ts";

describe("parseArgs", () => {
  test("defaults to the current directory with no findings threshold", () => {
    const opts = parseArgs([]);
    expect(opts).toEqual({
      json: false,
      quiet: false,
      dir: null,
      help: false,
      version: false,
      sarif: null,
      failOn: "error",
      files: [],
    });
  });

  test("parses every boolean flag and both spellings of quiet/help/version", () => {
    expect(parseArgs(["--json"]).json).toBe(true);
    expect(parseArgs(["--quiet"]).quiet).toBe(true);
    expect(parseArgs(["-q"]).quiet).toBe(true);
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
    expect(parseArgs(["--version"]).version).toBe(true);
    expect(parseArgs(["-v"]).version).toBe(true);
  });

  test("parses --dir and --dir=path", () => {
    expect(parseArgs(["--dir", "fixtures/clean"]).dir).toBe("fixtures/clean");
    expect(parseArgs(["--dir=fixtures/clean"]).dir).toBe("fixtures/clean");
  });

  test("parses --sarif and --sarif=path", () => {
    expect(parseArgs(["--sarif", "out.sarif"]).sarif).toBe("out.sarif");
    expect(parseArgs(["--sarif=out.sarif"]).sarif).toBe("out.sarif");
  });

  test("parses every valid --fail-on level", () => {
    expect(parseArgs(["--fail-on", "none"]).failOn).toBe("none");
    expect(parseArgs(["--fail-on=warning"]).failOn).toBe("warning");
    expect(parseArgs(["--fail-on", "info"]).failOn).toBe("info");
    expect(parseArgs(["--fail-on", "error"]).failOn).toBe("error");
  });

  test("rejects an invalid --fail-on value", () => {
    expect(() => parseArgs(["--fail-on", "fatal"])).toThrow(/Invalid --fail-on value/);
  });

  test("rejects a value flag with no value", () => {
    expect(() => parseArgs(["--dir"])).toThrow(/--dir requires/);
    expect(() => parseArgs(["--sarif"])).toThrow(/--sarif requires/);
    expect(() => parseArgs(["--fail-on"])).toThrow(/--fail-on requires/);
  });

  test("rejects unknown options", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/unknown option --bogus/);
  });

  test("captures a positional directory", () => {
    expect(parseArgs(["fixtures/drifted"]).files).toEqual(["fixtures/drifted"]);
  });

  test("-- ends option parsing so dash-prefixed arguments are positional", () => {
    const opts = parseArgs(["--", "--json", "-q"]);
    expect(opts.json).toBe(false);
    expect(opts.quiet).toBe(false);
    expect(opts.files).toEqual(["--json", "-q"]);
  });
});
