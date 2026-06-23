# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Self-Risen** is a NestJS 11 (TypeScript) REST API for a self-improvement / affirmation mobile app. Users assess life areas (Wheel of Life), record limiting beliefs, and the backend runs an AI pipeline that transcribes the audio (OpenAI Whisper), reframes the belief into positive affirmations (OpenAI chat/NLP), and synthesizes spoken affirmations (OpenAI TTS). Affirmations are stitched into looping audio tracks with background music via ffmpeg.

## Commands

Package manager is **pnpm** (see README / docker-compose, which run `npx prisma` and `pnpm`).

```bash
pnpm install                # install deps
pnpm run start:dev          # watch-mode dev server (nest start --watch)
pnpm run start:prod         # run compiled build (node dist/src/main.js)
pnpm run build              # nest build
pnpm run lint               # eslint --fix over src/apps/libs/test
pnpm run format             # prettier --write

pnpm run test               # jest unit tests (*.spec.ts under src/)
pnpm run test:watch
pnpm run test:cov
pnpm run test:e2e           # uses test/jest-e2e.json

# run a single test file / single test
pnpm jest src/wheel-of-life/tests/wheel-of-life.service.spec.ts
pnpm jest -t "name of the test"
```

### Database (Prisma + PostgreSQL)

```bash
npx prisma migrate dev --name <change>   # create + apply a migration in dev
npx prisma migrate deploy                # apply migrations (prod/CI; docker entrypoint does this)
npx prisma generate                      # regenerate the client after schema edits
npx prisma studio
```

### Local infra

`docker-compose.yml` brings up Postgres 16, Redis 7, and the app (port 8080). `docker-compose.dev.yml` is for dev. Redis is required — Bull queues will not work without it.

When running, Swagger lives at `/api/documentation` (bearer auth scheme name: `firebase`).

## Configuration

Environment is validated at boot, not read ad-hoc. `src/common/config.ts` defines a `Config` class with `class-validator` decorators; `setupConfig()` (called first in `src/main.ts`) populates the exported `config` singleton from `process.env` and **fails fast** if a required var is missing. Import settings via `import { config } from 'src/common'` — do **not** read `process.env` directly. When adding a new env var, add a decorated field to the `Config` class or validation will reject it (`whitelist: true`).

Key var groups: `DATABASE_URL`, `REDIS_*`, `FIREBASE_*`, `OPENAI_*` (model names are configurable per task: `OPENAI_MODEL`, `OPENAI_NLP_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`, `OPENAI_TRANSCRIPTION_MODEL`), `SUPABASE_*`, `STORAGE_PROVIDER`, mail (`MAIL_*`, `MAILGUN_*`, `MAILJET_*`, OAuth), `APPLE_CLIENT_ID`.

## Architecture & conventions

### Module map (`src/<feature>/`)
- **auth / user** — Firebase-based identity, OTP password reset, streaks, monthly OpenAI token budgeting (`token-usage.service.ts`), streak reminders.
- **wheel-of-life** — life-area categories, assessments, and "focus" selection that seed reflection prompts.
- **reflection** — the core AI pipeline (see below). Owns `ReflectionSession`, `Wave`, `Affirmation`.
- **affirmation-loop** — assembles selected affirmations + background music into a single looping audio file using a Bull `audio_merge` queue (`audio-merge.processor.ts`) and ffmpeg.
- **vision-board / journal / stater-videos** — supporting content features.
- **notifications** — multi-channel dispatch (email / SMS / push) via Bull queue + adapter registry.
- **common** — `BaseService`, `BaseController`, config, guards, storage, streak interceptor — re-exported from `src/common/index.ts`.

### Service response pattern (important)
Services do **not** throw for expected failures. They extend `BaseService` and return a discriminated `ServiceResponse<T>` (`src/common/interfaces`): `Results(data)` on success, `HandleError(error)` on failure. Controllers extend `BaseController`, check `result.isError` and `throw result.error` to surface it, then wrap success in `this.response({ message, data, metaData })`. Follow this pattern in new endpoints rather than throwing from the service layer.

### Auth & request user
Endpoints are guarded with `FirebaseGuard` (re-exported as `AuthGuard`) from `@alpha018/nestjs-firebase-auth`. The decoded token is injected with the `@FirebaseUser()` decorator as `auth.DecodedIdToken`; use `user.uid` (the Firebase UID, stored as `User.firebaseId`) to look up the local user — it is **not** the local `User.id`. Firebase Admin is initialized manually in `main.ts` *before* the Nest app, then `app.module.ts` reuses that app (works around the auth module's init bug) — be careful when changing either.

### Streaks
`StreakInterceptor` (applied on activity controllers) bumps the user's streak on each authenticated request via `StreakService`; failures are logged, never thrown, so they never break the request.

### Reflection AI pipeline
The `reflection` module composes three OpenAI services, each lazily instantiating its own `OpenAI` client from `config` and degrading gracefully (returns placeholder text) when `OPENAI_API_KEY` is absent:
- `transcription.service.ts` — Whisper transcription (URL or `Multer` file).
- `nlp-transformation.service.ts` — reframes the limiting belief into affirmations.
- `text-to-speech.service.ts` — TTS, voice keyed by `TtsVoicePreference` persona enum (e.g. `ALEX`) on the `User`/`Affirmation`.
`SessionExpirationService` uses `@nestjs/schedule` cron to expire stale sessions/waves.

### Storage abstraction
`StorageService` (`src/common/storage`) is provider-agnostic and selected by `STORAGE_PROVIDER`; a `SupabaseStorageService` backend and a `CompressionService` (sharp for images, ffmpeg for video, gated by `ENABLE_*_COMPRESSION`) sit behind it. Upload media through `StorageService`, not a vendor SDK directly.

### Notifications
`NotificationsModule` is `@Global`. Outbound messages go through Bull queues (`notification_dispatch`, with retry/backoff). Channel adapters are registered in a `NOTIFICATION_CHANNEL_ADAPTERS` map; email has a prioritized fallback chain **Mailjet > Gmail > Mailgun** chosen at runtime by which credentials are present. Add a channel by writing an adapter and registering it in that factory.

### Data model notes (`prisma/schema.prisma`)
- `User.firebaseId` is the external identity key; relations cascade on user delete.
- Reflection flow: `WheelOfLife` → `WheelCategory` → `WheelFocus` → `ReflectionSession` → `Affirmation` → `AffirmationLoopItem` → `AffirmationLoop`.
- Token budgeting lives on `User` (`tokensUsedThisMonth`, `tokenLimitPerMonth`, monthly reset).
- Migrations are committed under `prisma/migrations/`; create new ones rather than editing the schema without a migration.

### Path aliases
Use the `src/...` import alias (configured in `tsconfig` and jest `moduleNameMapper`), e.g. `import { config } from 'src/common'`.
