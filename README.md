# lockstep

> Catch toolchain drift before you push.

**An offline drift guard for JavaScript and TypeScript projects.**

**by svx** · MIT Licensed

[![CI](https://github.com/srivtx/lockstep/actions/workflows/ci.yml/badge.svg)](https://github.com/srivtx/lockstep/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/v/release/srivtx/lockstep?sort=semver&color=16a34a)](https://github.com/srivtx/lockstep/releases)
[![license](https://img.shields.io/badge/license-MIT-0f766e)](LICENSE)

---

**Live site:** [lockstep](https://srivtx.github.io/lockstep)  ·  **Source:** [github.com/srivtx/lockstep](https://github.com/srivtx/lockstep)

**Docs:** [Rules](https://srivtx.github.io/lockstep/rules)  ·  [Usage](https://srivtx.github.io/lockstep/usage)  ·  [CI](https://srivtx.github.io/lockstep/ci)  ·  [FAQ](https://srivtx.github.io/lockstep/faq)

## Why

A project declares its Node, Bun, or package-manager version in more than one
place: `package.json` (`engines`, `packageManager`, `volta`), `.nvmrc`,
`.node-version`, `.tool-versions`, `mise.toml`, the committed lockfile, and the
install step of every GitHub Actions workflow. Nothing keeps those sources
agreeing with each other.

The drift stays invisible until it matters. A contributor on the version from
`.nvmrc` installs a lockfile the committed `packageManager` cannot read, CI
pinned to a different major than `engines` fails after the push, or CI goes
green while installing with a stale, non-frozen lockfile so the failure waits
for the next environment. Corepack is being removed from Node, which turns a
`packageManager` field that nothing activates into a silent no-op.

`lockstep` reads every one of those sources in a single pass and reports the
conflicts before you push. It is offline and read-only: no network calls, no
telemetry, and it never writes to the project it audits. It is not a security
scanner and does not inspect dependencies.

## Install

`lockstep` is not published to npm. Install it from GitHub with the one-line
script (requires [Bun](https://bun.sh)):

```bash
# One-line install (installs the `lockstep` binary)
curl -fsSL https://raw.githubusercontent.com/srivtx/lockstep/main/install.sh | sh

# Or run once, without installing
bunx github:srivtx/lockstep#main

# Install globally
bun add -g github:srivtx/lockstep
lockstep

# Add to a project as a dev dependency
bun add -d github:srivtx/lockstep
```

## Usage

```text
lockstep [dir] [--dir <path>] [--json] [--quiet|-q] [--sarif <path>] [--fail-on <error|warning|info|none>] [-h|--help] [-v|--version]
```

It audits one project per run: pass a positional `dir`, or `--dir <path>`; the
default is the current directory.

```bash
# Audit the current directory
lockstep

# Audit a specific project
lockstep path/to/project

# Machine-readable output
lockstep --json

# Summary only
lockstep --quiet

# Write a SARIF 2.1.0 report and tighten the failure threshold
lockstep --sarif lockstep.sarif --fail-on warning
```

Every option that takes a value (`--dir`, `--sarif`, `--fail-on`) accepts both
`--flag value` and `--flag=value`.

Exit codes:

| Code | Meaning |
|---|---|
| `0` | No findings at or above `--fail-on` |
| `1` | At least one finding at or above `--fail-on` |
| `2` | Invalid usage or unreadable input |
| `3` | I/O error: an input could not be read, or the report could not be written |

## Rules

| Code | Severity | Check |
|---|---|---|
| LOCK-001 | error | Conflicting Node versions across sources |
| LOCK-002 | error | `packageManager` conflicts with the committed lockfile |
| LOCK-003 | error | Multiple lockfiles from different managers |
| LOCK-004 | warning | Lockfile committed but CI does not install frozen |
| LOCK-005 | warning | No lockfile committed |
| LOCK-006 | warning | `packageManager` declared but CI never enables corepack |
| LOCK-007 | info | `engines.node` range does not include the CI-pinned Node |
| LOCK-008 | info | `.nvmrc` and `.node-version` present but differ only cosmetically |
| LOCK-009 | warning | CI `bun-version` major disagrees with `engines.bun` |
| LOCK-010 | info | No GitHub Actions workflow found so CI cannot be verified |

## For agents

`lockstep` is built for unattended runs: `--json` emits stable output, every
finding carries a rule code, and the exit-code scheme is documented, so an agent
can gate a change without scraping a screen.

- **Docs index:** the site serves a machine-readable index at
  [srivtx.github.io/lockstep/llms.txt](https://srivtx.github.io/lockstep/llms.txt).
- **Project conventions:** [`AGENTS.md`](./AGENTS.md) documents the commands,
  layout, and hard rules for working in this repo.
- **MCP-style config:** point your agent's tool config at the CLI and keep the
  JSON contract.

  ```json
  { "mcpServers": { "lockstep": { "command": "bunx", "args": ["github:srivtx/lockstep#main", "--json"] } } }
  ```

## License

[MIT](LICENSE).
