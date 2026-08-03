# Test & CI Scripts Design

**Date:** 2026-07-19  
**Status:** Approved for implementation

## Goal

Add a local run-tests path and GitHub Actions CI that share one source of truth for quality gates: Prisma client generation, lint (check-only), build, and unit tests. No e2e, no coverage thresholds, no external service containers.

## Decisions

| Decision | Choice |
|----------|--------|
| Hosting | GitHub Actions (`.github/workflows/ci.yml`) |
| Step ownership | `package.json` `"ci"` script |
| Local scripts | Both Bash and PowerShell |
| Lint in CI | Check-only (`lint:check`), not `--fix` |
| Out of scope | e2e, coverage gates, Postgres/Redis in CI |

## Package scripts

Add / adjust in `package.json`:

```json
"lint:check": "eslint \"{src,apps,libs,test}/**/*.ts\"",
"ci": "prisma generate && pnpm lint:check && pnpm build && pnpm test"
```

Keep existing `"lint"` with `--fix` for local autofix.

## Local scripts

### `scripts/run-tests.sh` / `scripts/run-tests.ps1`

- Resolve repo root from script location
- If `node_modules` is missing, run `pnpm install`
- Run `pnpm run ci`
- Exit non-zero on first failure (`set -e` / `$ErrorActionPreference = 'Stop'`)

### `scripts/ci.sh` / `scripts/ci.ps1`

- Same as run-tests, but always `pnpm install --frozen-lockfile` first
- Used to rehearse CI locally

Optional convenience: `"test:ci": "pnpm run ci"` is unnecessary; callers use `pnpm run ci` or the shell wrappers.

## GitHub Actions workflow

**File:** `.github/workflows/ci.yml`

**Triggers:** `push` and `pull_request` targeting `main`

**Job (single, ubuntu-latest):**

1. Checkout
2. Setup pnpm **10** (matches local toolchain; lockfileVersion 9.0)
3. Setup Node.js **20** (matches `Dockerfile`) with pnpm cache
4. `pnpm install --frozen-lockfile`
5. `pnpm run ci`

No secrets, no service containers, no artifact uploads.

## Failure behavior

Any failing step fails the job/script. Lint violations fail CI without rewriting files.

## Non-goals

- E2E (`test:e2e`) and DB/Redis provisioning
- Coverage reporting or minimum % gates
- Deploy / Railway hooks
- Changing ESLint rules or test suite contents
