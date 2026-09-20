# Contributing to lockstep

Thanks for helping improve JavaScript toolchain reliability. This document
covers what you need to build, test, and submit a change.

## Development setup

lockstep targets [Bun](https://bun.sh) and TypeScript in strict mode.

```bash
git clone https://github.com/srivtx/lockstep.git
cd lockstep
bun install
```

Run the CLI from source while you work:

```bash
bun run src/cli.ts fixtures/drifted
```

## The gate

Every pull request must pass the same gate CI runs:

```bash
bunx tsc --noEmit && bun test
```

Do not open a PR with a red typecheck or a failing test. Fix the cause rather
than disabling a rule or test.

## Fixtures

`fixtures/` holds the projects the tests run against. They are generated, not
hand-edited:

```bash
bun run make-fixtures
```

`clean/` is internally consistent and `drifted/` declares versions that
deliberately disagree across sources. When you add a rule, add a fixture that
exercises it and assert on the emitted rule codes in `tests/rules.test.ts`.
CLI behavior belongs in `tests/cli.test.ts`. Source parsing for each declaration
site — `package.json`, `.nvmrc`, `.node-version`, `.tool-versions`, `mise.toml`,
the lockfile, and workflows — should have a focused test.

## Code style

- Strict TypeScript. No `any` to silence a type error, no non-null assertions
  to dodge null checks.
- No new runtime dependencies without discussion in an issue first. The offline
  and dependency-light posture is a feature.
- No network access, ever. Reading and auditing are local operations.
- Keep source discovery separate from rule reporting so each declaration parser
  stays testable on its own.
- Match the surrounding style; keep modules small and focused.
- No comments unless they explain something non-obvious.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

fix(rules): align LOCK-001 across .nvmrc and engines
feat(rules): flag frozen-install drift in workflows
test(sources): cover mise.toml version parsing
docs: document the exit codes
```

Common types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`. Useful scopes:
`rules`, `sources`, `cli`.

## Pull request checklist

- [ ] Tests added or updated for the change.
- [ ] `bunx tsc --noEmit` is clean.
- [ ] `bun test` passes.
- [ ] Docs (`README.md`) updated when behavior or flags change.
- [ ] Commit messages follow Conventional Commits.
