# Auth setup

How identity works in Self-Risen: Firebase owns credentials and tokens; Postgres owns the app profile. Primary implementation: `src/auth/auth.service.ts` and `src/auth/auth.controller.ts`.

## Architecture

```text
Client (mobile / web)
    │
    ├─ POST /auth/signup, /login, /signin/*  →  AuthService
    │                                              │
    │                                              ├─ Firebase Admin / Identity Toolkit
    │                                              └─ Prisma User (+ PasswordResetOtp)
    │
    └─ Authorization: Bearer <Firebase ID token>
           │
           └─ FirebaseGuard (@alpha018/nestjs-firebase-auth)
                  → @FirebaseUser() DecodedIdToken
                  → look up User by firebaseId (uid ≠ local User.id)
```

**Dual identity**

| Layer | Role |
| --- | --- |
| Firebase Auth | Email/password, OAuth-linked users, ID tokens, refresh tokens, password updates, token revocation |
| Local `User` | App data keyed by `firebaseId` (unique). Passwords are never stored in Postgres. |

Services return `ServiceResponse` (`Results` / `HandleError`); the controller throws on `isError`.

## Bootstrap & config

1. `setupConfig()` validates env (`src/common/config.ts`).
2. `main.ts` initializes Firebase Admin **before** Nest boots (service account cert), so `@alpha018/nestjs-firebase-auth` reuses that app.
3. `FirebaseAdminModule.forRootAsync` in `app.module.ts` configures JWT extraction from `Authorization: Bearer`, with `checkRevoked: true`.
4. Swagger bearer scheme name: `firebase` (`/api/documentation`).

Required env (via `config`, not raw `process.env`):

| Variable | Use |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Admin + project |
| `FIREBASE_CLIENT_EMAIL` | Service account |
| `FIREBASE_PRIVATE_KEY` | Service account (escaped `\n` normalized at init) |
| `FIREBASE_API_KEY` | Identity Toolkit / Secure Token REST (login, custom-token exchange, refresh) |
| `FIREBASE_STORAGE_BUCKET` | Admin app options |
| `APPLE_CLIENT_ID` | Apple ID token `aud` check |
| Optional | `FIREBASE_PRIVATE_KEY_ID`, `FIREBASE_CLIENT_ID` |

## Endpoints

Base path: `/auth`.

| Method | Path | Auth | Service method |
| --- | --- | --- | --- |
| `POST` | `/signup` | Public | `signUp` |
| `POST` | `/login` | Public | `login` |
| `POST` | `/refresh-token` | Public (refresh token body) | `refreshToken` |
| `POST` | `/signin/google` | Public (Google ID token) | `signInWithGoogle` |
| `POST` | `/signin/facebook` | Public (Facebook access token) | `signInWithFacebook` |
| `POST` | `/signin/apple` | Public (Apple identity token) | `signInWithApple` |
| `PATCH` | `/set-username` | Bearer | `setUserName` |
| `PATCH` | `/logout` | Bearer | `logout` |
| `PATCH` | `/change-password` | Bearer | `changePassword` |
| `POST` | `/forgot-password` | Public | `forgotPassword` |
| `POST` | `/verify-password-reset-otp` | Public | `verifyPasswordResetOtp` |
| `POST` | `/reset-password` | Public | `resetPassword` |

Successful login / OAuth / refresh responses expose Firebase tokens the client stores and sends as Bearer:

- `accessToken` — Firebase ID token
- `refreshToken` — Firebase refresh token
- `expiresIn` — only on refresh

## Flows

### Email/password signup

1. `auth().createUser({ email, password, displayName })`.
2. Resolve locale from `countryCode` via `buildUserLocaleUpdate` (timezone derived server-side). Country and resolvable timezone are required.
3. Create Prisma `User` with `firebaseId`, email, name, locale fields, `lastLoggedInAt`.
4. On DB failure, delete the Firebase user (rollback).

Errors mapped for email-already-exists, invalid email, weak password.

### Email/password login

1. Identity Toolkit `accounts:signInWithPassword` with `FIREBASE_API_KEY`.
2. Verify returned ID token with Admin `verifyIdToken(..., true)` (checks revocation).
3. Require a local `User` for that `uid`; update `lastLoggedInAt`.
4. Return `idToken` + `refreshToken`.

Missing local user after a valid Firebase session → `UnauthorizedException('User not found')`.

### OAuth (Google / Facebook / Apple)

Same outcome: Firebase custom token → Identity Toolkit `signInWithCustomToken` → ID + refresh tokens.

| Provider | Client sends | Verification |
| --- | --- | --- |
| Google | `idToken` | `oauth2.googleapis.com/tokeninfo` |
| Facebook | `accessToken` | Graph `me?fields=id,name,email,picture` (email required) |
| Apple | `idToken` | JWKS `appleid.apple.com/auth/keys`, `iss` + `aud` = `APPLE_CLIENT_ID` (email required) |

Shared helper `createOrGetOAuthUser`:

- Existing local user by email → bump `lastLoggedInAt`, reuse `firebaseId`.
- New user → `auth().createUser` (or `getUserByEmail` if Firebase already has the email), then Prisma create; handle unique race (`P2002`).

Google may set avatar / `emailVerified`. Apple name is often only on first sign-in.

### Refresh token

`securetoken.googleapis.com/v1/token` with `grant_type=refresh_token` → verify new ID token → ensure local user still exists → return new access + refresh + `expiresIn`.

### Logout

Authenticated: `revokeRefreshTokens(uid)` + set `lastLoggedOutAt`. Client should drop stored tokens.

### Change password (authenticated)

1. Strength check (`validatePasswordStrength`: ≥8, ≤128, letter + number/special).
2. Prove old password via Identity Toolkit sign-in.
3. `auth().updateUser` with new password.
4. Revoke refresh tokens (client must log in again).

### Password reset (OTP)

```text
forgot-password  →  email OTP (hashed in DB)
        ↓
verify-password-reset-otp  →  sets verifiedAt
        ↓
reset-password  →  Firebase updateUser + mark OTP used + revoke tokens + confirmation email
```

Details:

- 4-digit OTP (`generateOtp`), stored as SHA-256 (`hashOtp` / `verifyOtp`, timing-safe).
- TTL 10 minutes; 5-minute request cooldown per email; max 5 failed verify attempts (`MAX_OTP_ATTEMPTS`).
- Prior unused OTPs for that email marked used when issuing a new one.
- Unknown email / missing Firebase user: same generic success message (no account enumeration).
- OTP emailed via `NotificationTypeEnum.PASSWORD_RESET_OTP`; failed send invalidates the OTP.
- Reset requires a still-valid, verified, unused OTP row; confirmation uses `PASSWORD_RESET_CONFIRMATION`.

## Protecting other routes

```ts
@UseGuards(FirebaseGuard)
async handler(@FirebaseUser() user: auth.DecodedIdToken) {
  // user.uid === User.firebaseId
}
```

`AuthGuard` in `src/common` is an alias of `FirebaseGuard`. Always resolve the app user with `firebaseId: user.uid`, not `user.uid` as `User.id`.

## Data model (auth-related)

**`User`** — `firebaseId` (unique), `email` (unique), profile/locale, `lastLoggedInAt` / `lastLoggedOutAt`. No password column.

**`PasswordResetOtp`** — `email`, hashed `otp`, `expiresAt`, `isUsed`, `attempts`, `verifiedAt`.

## File map

| Path | Role |
| --- | --- |
| `src/auth/auth.service.ts` | All auth business logic |
| `src/auth/auth.controller.ts` | HTTP surface |
| `src/auth/auth.module.ts` | Module wiring |
| `src/auth/dto/*` | Request validation |
| `src/auth/utils/otp.util.ts` | OTP generate / hash / verify |
| `src/auth/utils/user-locale.util.ts` | Country → timezone for signup |
| `src/main.ts` | Firebase Admin init |
| `src/app.module.ts` | `FirebaseAdminModule` + JWT extractor |
| `src/common/guards/` | Re-exports `FirebaseGuard` / `FirebaseUser` |
