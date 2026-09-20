import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DRIFTED_PACKAGE_JSON = `{
  "name": "drifted",
  "version": "1.0.0",
  "engines": {
    "node": ">=18"
  },
  "packageManager": "pnpm@9.12.0"
}
`;

export const DRIFTED_NVMRC = "v20.11.0\n";

export const DRIFTED_NODE_VERSION = "18.19.0\n";

export const DRIFTED_CI = `name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: bun install
`;

export const DRIFTED_PACKAGE_LOCK = `{
  "name": "drifted",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {}
}
`;

export const CLEAN_PACKAGE_JSON = `{
  "name": "clean",
  "version": "1.0.0",
  "engines": {
    "node": "20"
  },
  "packageManager": "pnpm@9.12.0"
}
`;

export const CLEAN_NVMRC = "20.11.0\n";

export const CLEAN_NODE_VERSION = "20.11.0\n";

export const CLEAN_PNPM_LOCK = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
`;

export const CLEAN_CI = `name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - run: corepack enable
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
`;

export function writeFixturesTo(root: string): void {
  const drifted = join(root, "drifted");
  mkdirSync(join(drifted, ".github", "workflows"), { recursive: true });
  writeFileSync(join(drifted, "package.json"), DRIFTED_PACKAGE_JSON);
  writeFileSync(join(drifted, ".nvmrc"), DRIFTED_NVMRC);
  writeFileSync(join(drifted, ".node-version"), DRIFTED_NODE_VERSION);
  writeFileSync(join(drifted, "package-lock.json"), DRIFTED_PACKAGE_LOCK);
  writeFileSync(join(drifted, ".github", "workflows", "ci.yml"), DRIFTED_CI);

  const clean = join(root, "clean");
  mkdirSync(join(clean, ".github", "workflows"), { recursive: true });
  writeFileSync(join(clean, "package.json"), CLEAN_PACKAGE_JSON);
  writeFileSync(join(clean, ".nvmrc"), CLEAN_NVMRC);
  writeFileSync(join(clean, ".node-version"), CLEAN_NODE_VERSION);
  writeFileSync(join(clean, "pnpm-lock.yaml"), CLEAN_PNPM_LOCK);
  writeFileSync(join(clean, ".github", "workflows", "ci.yml"), CLEAN_CI);
}

export function main(): void {
  const root = join(import.meta.dir, "..", "fixtures");
  writeFixturesTo(root);
  console.log("Wrote fixtures/drifted and fixtures/clean");
}

if (import.meta.main) {
  main();
}
