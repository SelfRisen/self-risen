# Self-Risen API

A [NestJS 11](https://nestjs.com) + TypeScript REST API for a self-improvement / affirmation mobile app.

Users assess their life areas (Wheel of Life), record a limiting belief out loud, and the b**a**ckend runs an AI pipeline that transcribes the audio (OpenAI Whisper), reframes the belief into positive affirmations (OpenAI chat), and synthesizes them as spoken audio (OpenAI TTS). Selected affirmations are stitched with background music into a single looping track via ffmpeg.

## Table of contents

- [What's in the box](#whats-in-the-box)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Third-party accounts you need](#third-party-accounts-you-need)
- [Running the app](#running-the-app)
- [Database & migrations](#database--migrations)
- [Tests & quality gates](#tests--quality-gates)
- [API surface](#api-surface)
- [Architecture notes](#architecture-notes)
- [Docker](#docker)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)



## What's in the box


| Module                                       | Responsibility                                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `auth` / `user`                              | Firebase identity, social sign-in (Google / Facebook / Apple), OTP password reset, streaks, monthly OpenAI token budgeting |
| `wheel-of-life`                              | Life-area categories, scoring, history, and "focus" selection that seeds reflection prompts                                |
| `reflection`                                 | The core AI pipeline — sessions, waves, transcription, reframing, TTS                                                      |
| `affirmation-loop`                           | Merges selected affirmations + background music into one looping audio file (Bull queue + ffmpeg)                          |
| `vision-board` / `journal` / `stater-videos` | Supporting content features                                                                                                |
| `notifications`                              | Email / SMS / push dispatch through a Bull queue and an adapter registry                                                   |
| `common`                                     | `BaseService` / `BaseController`, config validation, guards, storage abstraction, streak interceptor                       |




## Prerequisites


| Requirement       | Version    | Notes                                                                                     |
| ----------------- | ---------- | ----------------------------------------------------------------------------------------- |
| Node.js           | 20.x       | CI runs Node 20; the Docker image is `node:20-alpine`                                     |
| pnpm              | 10.x       | The project is pnpm-only — `pnpm-lock.yaml` is the committed lockfile                     |
| PostgreSQL        | 16         | Or use the bundled Docker service                                                         |
| Redis             | 7          | **Required.** Bull queues (audio merge, notifications) will not run without it            |
| ffmpeg            | any recent | Required for audio looping and video compression. Must be on `PATH`, or set `FFMPEG_PATH` |
| Docker (optional) | —          | Easiest way to get Postgres + Redis locally                                               |


Install ffmpeg:

```bash
# macOS
brew install ffmpeg
# Ubuntu/Debian
sudo apt-get install ffmpeg
# Windows
winget install Gyan.FFmpeg
```



## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres + Redis (skip if you run your own)
docker compose -f docker-compose.dev.yml up -d

# 3. Create your .env (see the template below) and fill in real credentials
#    The app validates every variable at boot and exits if one is missing.

# 4. Generate the Prisma client and apply migrations
npx prisma generate
npx prisma migrate dev

# 5. Run the API in watch mode
pnpm run start:dev
```

Once it's up:

- API root: `http://localhost:8080/`
- Swagger UI: `http://localhost:8080/api/documentation` (bearer scheme name: `firebase`)



## Environment variables

Configuration is **validated at boot, not read ad-hoc**. `src/common/config.ts` declares a `Config` class with `class-validator` decorators, and `setupConfig()` runs first in `src/main.ts`. If a required variable is missing or the wrong type, the process logs `Bootstrap failed: Invalid configuration: …` and exits with code 1.

Two consequences worth knowing:

- Read settings via `import { config } from 'src/common'` — never `process.env` directly.
- When you add a new variable, add a decorated field to the `Config` class, or validation (`whitelist: true`) will drop it.

`.env` is git-ignored. Create it at the repo root:

```dotenv
# --- Application ---
NODE_ENV=development
PORT=8080
BASE_URL=http://localhost:8080
FRONTEND_URL=http://localhost:3000

# --- Database ---
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/self_risen?schema=public

# --- Redis (Bull queues) ---
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# --- JWT ---
JWT_SECRET=change-me
JWT_EXPIRATION=24h

# --- Firebase (identity + optional storage) ---
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=
FIREBASE_API_KEY=
FIREBASE_STORAGE_BUCKET=
FIREBASE_PRIVATE_KEY_ID=   # optional
FIREBASE_CLIENT_ID=        # optional

# --- Apple Sign-In ---
APPLE_CLIENT_ID=

# --- Supabase (default media storage backend) ---
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=
STORAGE_PROVIDER=supabase   # 'supabase' | 'firebase'

# --- OpenAI ---
OPENAI_API_KEY=
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_NLP_MODEL=gpt-3.5-turbo
OPENAI_TTS_MODEL=tts-1
OPENAI_TTS_VOICE=alloy
OPENAI_TRANSCRIPTION_MODEL=whisper-1
OPENAI_REQUEST_TIMEOUT_MS=60000

# --- Mail: Gmail/OAuth (required by config validation) ---
MAIL_USERNAME=
MAIL_PASSWORD=
OAUTH_CLIENTID=
OAUTH_CLIENT_SECRET=
OAUTH_REFRESH_TOKEN=

# --- Mail: Mailjet / Mailgun (optional fallbacks) ---
MAILJET_API_KEY=
MAILJET_SECRET_KEY=
MAILJET_FROM_EMAIL=
MAILJET_FROM_NAME=
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_FROM_EMAIL=

# --- Media compression ---
ENABLE_IMAGE_COMPRESSION=true
ENABLE_VIDEO_COMPRESSION=true
COMPRESSION_QUALITY_SMALL=85
COMPRESSION_QUALITY_MEDIUM=75
COMPRESSION_QUALITY_LARGE=65

# --- Optional ---
FFMPEG_PATH=   # absolute path to the ffmpeg binary if it isn't on PATH
```

Everything above without an `# optional` comment is enforced by `Config` and must be present — including the mail and OAuth block, even if you don't plan to send email locally. Put in placeholder strings if you need to.

`FIREBASE_PRIVATE_KEY` gotcha: keep it double-quoted with literal `\n` escapes. `main.ts` converts `\n` back to real newlines, strips surrounding quotes, and refuses a key without the `BEGIN PRIVATE KEY` marker.

## Third-party accounts you need


| Service                            | Used for                                                                | Behavior when absent                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Firebase**                       | All authentication. Every guarded endpoint verifies a Firebase ID token | The app will not boot — Firebase Admin init is a hard requirement                                                                        |
| **OpenAI**                         | Transcription, belief reframing, TTS                                    | The three reflection services degrade gracefully and return placeholder text instead of calling the API                                  |
| **Supabase** (or Firebase Storage) | Audio/image/video uploads                                               | Uploads fail; pick the backend with `STORAGE_PROVIDER`                                                                                   |
| **Mailjet / Gmail / Mailgun**      | Transactional email                                                     | Email dispatch fails; the adapter picks the first chain member whose credentials are present, in the order **Mailjet > Gmail > Mailgun** |
| **Twilio / Expo push**             | SMS and push notifications                                              | Those channels are skipped                                                                                                               |


For Firebase, download a service-account JSON from *Project settings → Service accounts* and either split it into the `FIREBASE_`* env vars or drop it at the repo root as `firebase-credentials.json` — `app.module.ts` falls back to that file when the env vars are missing.

## Running the app

```bash
pnpm run start         
pnpm run start:dev  
pnpm run start:debug   
pnpm run build     
pnpm run start:prod     
```

Startup logs the Swagger URL only when `NODE_ENV` is `development` or `staging`.

## Database & migrations

Prisma 6 against PostgreSQL. The schema lives in [prisma/schema.prisma](prisma/schema.prisma) and migrations are committed under [prisma/migrations/](prisma/migrations/) — always create a migration rather than editing the schema in place.

```bash
npx prisma generate
npx prisma migrate dev
npx prisma migrate deploy               
```

Core relational chain:

```
User → WheelOfLife → WheelCategory → WheelFocus → ReflectionSession → Affirmation → AffirmationLoopItem → AffirmationLoop
```

`User.firebaseId` is the external identity key (not `User.id`), and relations cascade on user delete. Monthly OpenAI budgeting fields (`tokensUsedThisMonth`, `tokenLimitPerMonth`) live on `User`.

## Tests & quality gates

```bash
pnpm run test           # jest unit tests (*.spec.ts under src/)
pnpm run test:watch
pnpm jest src/wheel-of-life/tests/wheel-of-life.service.spec.ts
pnpm jest -t "name of the test"
```

Convenience wrappers that mirror CI locally live in [scripts/](scripts/):

```bash
./scripts/run-tests.sh     # installs if node_modules is missing, then pnpm run ci
./scripts/ci.sh            # frozen-lockfile install, then pnpm run ci
# PowerShell equivalents: scripts/run-tests.ps1, scripts/ci.ps1
```

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs `pnpm run ci` on every push and PR to `main`.

## API surface

All routes are served from the root (no global prefix). Swagger at `/api/documentation` is the authoritative reference.


| Prefix                                        | Module                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                           | Health / hello                                                                                                                                                      |
| `/auth`                                       | signup, login, refresh-token, logout, password reset OTP, `signin/google`, `signin/facebook`, `signin/apple`                                                        |
| `/user`                                       | Profile, avatar upload, `stats` + streak calendar/chart, streak-reminder preferences, `preferences/tts-voice`, `token-usage`, account deletion                      |
| `/wheel-of-life`                              | Categories, `scores`, `breakdown`, `history`, `focus`, `focuses`                                                                                                    |
| `/reflection`                                 | `sessions`, `sessions/:id/belief`, `sessions/:id/generate-affirmation`, `sessions/:id/record-affirmation`, `sessions/:id/regenerate-voice`, `waves`, `affirmations` |
| `/reflection/loops`                           | Affirmation loops, per-loop reminders, `tokens`                                                                                                                     |
| `/journal`, `/vision-board`, `/stater-videos` | Supporting content                                                                                                                                                  |
| `/storage`                                    | `upload/image`, `upload/images`, `upload/audio`, `upload/video`, `upload/mixed`, delete by path                                                                     |
| `/notifications`                              | Push-token registration, listing, `unread-count`, mark-read                                                                                                         |




### Authenticating a request

Guarded endpoints use `FirebaseGuard` (re-exported as `AuthGuard`). Send the Firebase ID token as a bearer token:

```
Authorization: Bearer <firebase-id-token>
```

The decoded token is injected with `@FirebaseUser()`; handlers look the local user up by `user.uid` against `User.firebaseId`.

### Response shape

Services don't throw for expected failures — they extend `BaseService` and return a discriminated `ServiceResponse<T>` (`Results(data)` / `HandleError(error)`). Controllers extend `BaseController`, rethrow `result.error` when `result.isError`, and wrap success in `this.response({ message, data, metaData })`. Follow that pattern in new endpoints instead of throwing from the service layer.

## Architecture notes

- **Reflection pipeline** — three OpenAI services, each lazily constructing its own client from `config`: `transcription.service.ts` (Whisper, URL or Multer file), `nlp-transformation.service.ts` (reframing), `text-to-speech.service.ts` (voice chosen by the `TtsVoicePreference` persona enum — `SAGE`, `PHOENIX`, `RIVER`, `QUINN`, `ALEX`, `ROBIN`). `SessionExpirationService` expires stale sessions and waves on a `@nestjs/schedule` cron.
- **Audio looping** — `affirmation-loop` pushes work onto the Bull `audio_merge` queue; `audio-merge.processor.ts` drives ffmpeg. No Redis means no processing.
- **Storage** — go through `StorageService` (`src/common/storage`), never a vendor SDK directly. `CompressionService` sits behind it (sharp for images, ffmpeg for video), gated by `ENABLE_IMAGE_COMPRESSION` / `ENABLE_VIDEO_COMPRESSION`.
- **Notifications** — `NotificationsModule` is `@Global`; outbound messages go through the `notification_dispatch` Bull queue with retry/backoff. Add a channel by writing an adapter and registering it in the `NOTIFICATION_CHANNEL_ADAPTERS` factory.
- **Streaks** — `StreakInterceptor` bumps the user's streak on each authenticated request to an activity controller. Failures are logged, never thrown, so they can't break a request.
- **Firebase init order** — Firebase Admin is initialized manually in `main.ts` *before* the Nest app boots, and `app.module.ts` reuses that instance (a workaround for an init bug in `@alpha018/nestjs-firebase-auth`). Change either side carefully.
- **Path aliases** — import with the `src/...` alias (wired in `tsconfig` and jest's `moduleNameMapper`), e.g. `import { config } from 'src/common'`.



## Docker

Postgres + Redis only, for local development against a host-run API:

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml down
```

Full stack (Postgres + Redis + the API on port 8080). It builds from the multi-stage [Dockerfile](Dockerfile), which installs ffmpeg, runs `prisma migrate deploy` at startup, and executes as a non-root user:

```bash
docker compose up --build
```

`docker-compose.yml` reads secrets from your shell environment (or a root `.env`) for the mail, OAuth, JWT, Mailgun, and Twilio values, and mounts `./firebase-credentials.json` read-only into the container — create that file first or remove the volume mount.

## Deployment

The image is Railway-optimized (see [railway.json](railway.json) and [README.railway.md](README.railway.md) for the platform-specific walkthrough). Anywhere else, the requirements are the same: Node 20, ffmpeg on the image, reachable Postgres and Redis, and the full validated environment. Migrations run at container start via `pnpm prisma migrate deploy`.

The Dockerfile ships a `HEALTHCHECK` that GETs `/` every 30s after a 40s grace period.

## Troubleshooting


| Symptom                                                      | Cause / fix                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `Bootstrap failed: Invalid configuration: …`                 | A required env var is missing or the wrong type. The error names the property — add it to `.env`. |
| `Missing required Firebase credentials`                      | No `FIREBASE_*` env vars *and* no `firebase-credentials.json` at the repo root.                   |
| `FIREBASE_PRIVATE_KEY is missing "BEGIN PRIVATE KEY" marker` | The key got mangled by the shell. Wrap it in double quotes and keep the `\n` escapes literal.     |
| Jobs queue but never finish                                  | Redis isn't running or `REDIS_HOST`/`REDIS_PORT` are wrong. Bull silently accumulates jobs.       |
| Affirmation loops fail during merge                          | ffmpeg isn't on `PATH`. Install it or set `FFMPEG_PATH`.                                          |
| Affirmations come back as placeholder text                   | `OPENAI_API_KEY` is unset — the AI services degrade instead of failing.                           |
| Prisma type errors after a schema edit                       | Run `npx prisma generate`.                                                                        |
| Upload errors mentioning a missing bucket                    | `STORAGE_PROVIDER` doesn't match the bucket you actually configured (`supabase` vs `firebase`).   |




## License

UNLICENSED — private project.