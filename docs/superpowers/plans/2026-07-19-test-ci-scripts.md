# Test & CI Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add shared `pnpm run ci` quality gates plus local Bash/PowerShell wrappers and a GitHub Actions workflow that runs the same steps.

**Architecture:** `package.json` owns the step sequence (`prisma generate` → `lint:check` → `build` → `test`). Thin shell/PowerShell scripts resolve the repo root and handle install policy. GitHub Actions installs with a frozen lockfile then calls `pnpm run ci`.

**Tech Stack:** pnpm 10, Node 20, NestJS/Jest (existing), GitHub Actions (`pnpm/action-setup`, `actions/setup-node`)

## Global Constraints

- Node.js **20** (matches `Dockerfile`)
- pnpm **10** (local toolchain; lockfileVersion `9.0`)
- Lint in CI must be **check-only** (no `--fix`)
- No e2e, coverage gates, Postgres/Redis, secrets, or artifact uploads
- Keep existing `"lint"` script with `--fix` unchanged for local autofix
- Spec: `docs/superpowers/specs/2026-07-19-test-ci-scripts-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | Add `lint:check` and `ci` scripts |
| `scripts/run-tests.sh` | Local Bash: install if needed, then `pnpm run ci` |
| `scripts/run-tests.ps1` | Local PowerShell: same as above |
| `scripts/ci.sh` | CI rehearsal Bash: always frozen install, then `pnpm run ci` |
| `scripts/ci.ps1` | CI rehearsal PowerShell: same as above |
| `.github/workflows/ci.yml` | GitHub Actions job on push/PR to `main` |

---

### Task 1: Package.json `lint:check` and `ci` scripts

**Files:**
- Modify: `package.json` (scripts section, after `"lint"`)

**Interfaces:**
- Consumes: existing `lint`, `build`, `test` scripts; `prisma` CLI from dependencies
- Produces: `pnpm lint:check`, `pnpm run ci`

- [ ] **Step 1: Add the two scripts to `package.json`**

In the `"scripts"` object, keep `"lint"` as-is and insert immediately after it:

```json
"lint:check": "eslint \"{src,apps,libs,test}/**/*.ts\"",
"ci": "prisma generate && pnpm lint:check && pnpm build && pnpm test",
```

Full scripts block should look like:

```json
"scripts": {
  "build": "nest build",
  "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
  "start": "nest start",
  "start:dev": "nest start --watch",
  "start:debug": "nest start --debug --watch",
  "start:prod": "node dist/src/main.js",
  "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
  "lint:check": "eslint \"{src,apps,libs,test}/**/*.ts\"",
  "ci": "prisma generate && pnpm lint:check && pnpm build && pnpm test",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:cov": "jest --coverage",
  "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
  "test:e2e": "jest --config ./test/jest-e2e.json"
}
```

Only add `lint:check` and `ci`; leave every other script string unchanged.

- [ ] **Step 2: Verify `lint:check` is check-only**

Run: `pnpm lint:check`

Expected: ESLint runs without writing fixes. Exit `0` if clean, or non-zero if there are lint errors (do not “fix” them as part of this task — CI should surface them). Confirm no file mtimes changed solely due to eslint `--fix` (this command must not pass `--fix`).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "Add lint:check and ci package scripts for shared quality gates"
```

---

### Task 2: Local run-tests scripts (Bash + PowerShell)

**Files:**
- Create: `scripts/run-tests.sh`
- Create: `scripts/run-tests.ps1`

**Interfaces:**
- Consumes: `pnpm run ci` from Task 1
- Produces: executable local entrypoints that install only when `node_modules` is missing

- [ ] **Step 1: Create `scripts/run-tests.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -d node_modules ]]; then
  echo "node_modules missing; running pnpm install..."
  pnpm install
fi

pnpm run ci
```

- [ ] **Step 2: Create `scripts/run-tests.ps1`**

```powershell
$ErrorActionPreference = 'Stop'

$RootDir = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RootDir

if (-not (Test-Path -Path (Join-Path $RootDir 'node_modules') -PathType Container)) {
  Write-Host 'node_modules missing; running pnpm install...'
  pnpm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

pnpm run ci
exit $LASTEXITCODE
```

- [ ] **Step 3: Verify PowerShell wrapper invokes `ci`**

Run (from repo root on Windows):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-tests.ps1
```

Expected: Runs `prisma generate`, `lint:check`, `build`, and `test` in order. Exit code `0` if the tree is clean; non-zero if any step fails. If lint/tests already fail on the branch, that is acceptable for this task — the script must still start those steps and propagate the failure exit code.

- [ ] **Step 4: Commit**

```bash
git add scripts/run-tests.sh scripts/run-tests.ps1
git commit -m "Add local run-tests scripts for Bash and PowerShell"
```

---

### Task 3: CI rehearsal scripts (Bash + PowerShell)

**Files:**
- Create: `scripts/ci.sh`
- Create: `scripts/ci.ps1`

**Interfaces:**
- Consumes: `pnpm run ci` from Task 1
- Produces: entrypoints that always `pnpm install --frozen-lockfile` then run `ci`

- [ ] **Step 1: Create `scripts/ci.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

pnpm install --frozen-lockfile
pnpm run ci
```

- [ ] **Step 2: Create `scripts/ci.ps1`**

```powershell
$ErrorActionPreference = 'Stop'

$RootDir = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $RootDir

pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

pnpm run ci
exit $LASTEXITCODE
```

- [ ] **Step 3: Smoke-check frozen install path**

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\ci.ps1
```

Expected: First line of meaningful work is a frozen lockfile install (or an immediate lockfile mismatch failure). Then the same `ci` pipeline as Task 2. Exit non-zero on any failure.

- [ ] **Step 4: Commit**

```bash
git add scripts/ci.sh scripts/ci.ps1
git commit -m "Add CI rehearsal scripts with frozen lockfile install"
```

---

### Task 4: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm run ci` from Task 1; Node 20; pnpm 10
- Produces: CI job on `push`/`pull_request` to `main`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run CI checks
        run: pnpm run ci
```

- [ ] **Step 2: Sanity-check YAML locally**

Confirm the file exists and contains:
- triggers for `push` and `pull_request` on `main`
- `pnpm` version `10`
- `node-version: 20`
- `pnpm install --frozen-lockfile`
- `pnpm run ci`
- no e2e, coverage, services, or secrets

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Add GitHub Actions CI workflow for lint, build, and unit tests"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| `lint:check` without `--fix` | Task 1 |
| `ci` = generate → lint:check → build → test | Task 1 |
| Keep `lint` with `--fix` | Task 1 |
| `run-tests` Bash + PowerShell, install if missing | Task 2 |
| `ci` Bash + PowerShell, always frozen install | Task 3 |
| GitHub Actions on push/PR to `main` | Task 4 |
| Node 20, pnpm 10 | Task 4 |
| No e2e / coverage / services | Task 4 (omitted by design) |
