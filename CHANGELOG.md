# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-09-20

### Added

- Initial release of `lockstep`.
- Cross-checks every place a Node, Bun, or package-manager version is declared:
  `package.json` (`engines`, `packageManager`, `volta`), `.nvmrc`,
  `.node-version`, `.tool-versions`, `mise.toml`, the committed lockfile, and
  every `.github/workflows/*.yml`.
- Rules `LOCK-001` through `LOCK-010`, from conflicting Node versions and
  package-manager/lockfile mismatches to frozen-install and corepack drift in
  CI.
- `lockstep` CLI with `--dir`, `--json`, `--quiet`, `--sarif`, and `--fail-on`.
- Text, stable JSON, and SARIF 2.1.0 output with exit codes `0`–`3`.
- `makeGoodProject` / `makeDriftedProject` fixtures and `writeFixturesTo(dir)`
  helper.
- GitHub Actions CI running typecheck, tests, site checks, and fixture CLI
  checks.

[Unreleased]: https://github.com/srivtx/lockstep/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/srivtx/lockstep/releases/tag/v0.1.0
