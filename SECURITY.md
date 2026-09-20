# Security Policy

## lockstep

lockstep audits JavaScript and TypeScript projects for toolchain drift. It reads
a project directory and cross-checks every place a Node, Bun, or package-manager
version is declared — `package.json` (`engines`, `packageManager`, `volta`),
`.nvmrc`, `.node-version`, `.tool-versions`, `mise.toml`, the committed lockfile,
and every `.github/workflows/*.yml` — then reports conflicts before you push.

lockstep is not a security scanner. It does not inspect dependencies, look up
advisories, or judge whether a declared version is safe.

## Supported versions

The latest commit on `main` is the only supported version. Security fixes land
on `main` and ship in the next tagged release. Older tags do not receive
backports.

| Version | Supported |
| --- | --- |
| Latest on `main` | Yes |
| Older tags | No |

## Threat model

- **Offline by design.** lockstep contains no network code. It never opens a
  socket, fetches a remote manifest, or checks for updates.
- **No telemetry.** Nothing about your project, your usage, or your machine is
  collected or transmitted.
- **Files never leave the machine.** Projects are read in-process and locally.
- **Read-only.** lockstep never writes to the audited project. The only file it
  may write is the SARIF report requested with `--sarif`.
- **Untrusted input.** A project is treated as hostile: `package.json`,
  `mise.toml`, and workflow YAML are parsed, never evaluated, and a malformed or
  deeply nested file must fail safely rather than exhaust the process.
- **No code execution from input.** lockstep never runs scripts, install hooks,
  package-manager commands, or the contents of a workflow; it only reads text.

## Exit codes

The CLI's exit codes are:

| Code | Meaning |
| --- | --- |
| `0` | No findings at or above `--fail-on` |
| `1` | At least one finding at or above `--fail-on` |
| `2` | Invalid usage or unreadable input |
| `3` | I/O error: a file could not be read, or the report could not be written |

An unexpected failure while reading a project is surfaced as an error rather
than a clean result; a CI gate never passes on unreadable input.

## Reporting a vulnerability

Report privately through GitHub Security Advisories on the repository:

https://github.com/srivtx/lockstep/security/advisories/new

Do not open a public issue for a suspected vulnerability. Include a
description, the affected revision, a minimal reproducer (a fixture layout where
possible), and any suggested fix. Expect an acknowledgement within a few days.

## Verifying a build

```bash
bun install
bunx tsc --noEmit
bun test
```

This installs the locked dependency set, typechecks in strict mode, and runs the
test suite against the generated fixtures. In CI the same gate runs on every
push and pull request.
