# SoundSage Launch Runbook

> Operational checklist to take SoundSage from "design done, no infra" to "live and working on GCP."
> Engineering phases: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
> Spec: [SoundSage_Dev_Handoff.md](SoundSage_Dev_Handoff.md)

Each stage has a **gate** — don't proceed until it passes. Commands assume `gcloud` is installed and authenticated.

---

## Stage 0 — GCP project + accounts (1 day)

1. **Create two GCP projects**: `soundsage-staging` and `soundsage-prod`. Keep them isolated; never share a DB or secret across them.
2. **Enable APIs** (per project):
   ```
   gcloud services enable run.googleapis.com sqladmin.googleapis.com \
     secretmanager.googleapis.com cloudtasks.googleapis.com \
     cloudscheduler.googleapis.com cloudbuild.googleapis.com \
     iamcredentials.googleapis.com storage.googleapis.com
   ```
3. **Register Spotify app** at developer.spotify.com:
   - Redirect URIs: `http://localhost:3000/api/spotify/connect/callback`, staging URL, prod URL (added later).
   - Save `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET` in 1Password (or equivalent).
4. **Create Google OAuth client** in GCP Console (APIs & Services → Credentials):
   - Application type: Web.
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`, staging, prod.
   - Save `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.
5. **Create Upstash Redis database** in a GCP-colocated region (e.g. `us-central1`). Save `REDIS_URL`.
6. **Create Sentry project** for SoundSage. Save DSN.
7. **Generate `TOKEN_ENCRYPTION_KEY`**:
   ```
   openssl rand -base64 32
   ```

✅ Gate: all credentials in a password manager; both GCP projects exist with APIs enabled.

---

## Stage 1 — Local dev environment (1 day)

8. **Install runtime deps**:
   ```
   npm install prisma @prisma/client @auth/prisma-adapter \
     @tanstack/react-query @tanstack/react-query-devtools \
     @google-cloud/tasks @google-cloud/storage \
     ioredis pino zod
   npm install -D @types/pg
   ```
9. **`docker-compose.yml`** at repo root with `postgres:15` + `redis:7` for local dev. Single command up.
10. **`.env.local`** (gitignored) with:
    ```
    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/soundsage
    REDIS_URL=redis://localhost:6379
    NEXTAUTH_URL=http://localhost:3000
    NEXTAUTH_SECRET=<openssl rand -base64 32>
    GOOGLE_CLIENT_ID=...
    GOOGLE_CLIENT_SECRET=...
    SPOTIFY_CLIENT_ID=...
    SPOTIFY_CLIENT_SECRET=...
    SPOTIFY_REDIRECT_URI=http://localhost:3000/api/spotify/connect/callback
    TOKEN_ENCRYPTION_KEY=<base64 32 bytes>
    SENTRY_DSN=...
    ```
11. **`.env.example`** committed (key names only, no values).
12. **`next.config.js`** — `output: 'standalone'` (required for Cloud Run), security headers (HSTS, CSP).

✅ Gate: `docker compose up -d && npm run dev` boots; `psql` and `redis-cli` reach local services.

---

## Stage 2 — Schema + Google sign-in (3–4 days)

13. **Prisma schema** per IMPLEMENTATION_PLAN.md §3. `npx prisma migrate dev --name init`.
14. **`lib/db.ts`** — Prisma singleton with hot-reload guard.
15. **`lib/crypto.ts`** — AES-256-GCM `encrypt(plaintext)` / `decrypt(ciphertext)` keyed off `TOKEN_ENCRYPTION_KEY`. Unit-test round-trip.
16. **`lib/auth.ts`** — Auth.js v5 + Google provider + Prisma adapter, Postgres `database` session strategy:
    ```ts
    import NextAuth from 'next-auth';
    import Google from 'next-auth/providers/google';
    import { PrismaAdapter } from '@auth/prisma-adapter';
    import { db } from './db';

    export const { handlers, auth, signIn, signOut } = NextAuth({
      adapter: PrismaAdapter(db),
      providers: [Google({ clientId: ..., clientSecret: ... })],
      session: { strategy: 'database' },
      callbacks: {
        async session({ session, user }) {
          session.userId = user.id;
          return session;
        },
      },
    });
    ```
17. **`app/api/auth/[...nextauth]/route.ts`** wires the handlers.
18. **`app/layout.tsx`** mounts `ThemeProvider` + `Masthead`, server-fetches `auth()`.
19. **`app/page.tsx`** — temporary stub: if no session, "Sign in with Google" button; if signed in, dump session JSON.

✅ Gate: locally, click sign-in → Google consent → return → `User` row in DB with `googleSubject` + `email`. Sign out clears session.

---

## Stage 3 — First deploy to Cloud Run staging (2 days)

Bring infra up *before* most code lands, so deploy issues surface early.

20. **Provision Cloud SQL** (`soundsage-staging`):
    ```
    gcloud sql instances create soundsage-staging \
      --database-version=POSTGRES_15 --tier=db-custom-1-3840 \
      --region=us-central1 --availability-type=zonal
    gcloud sql databases create soundsage --instance=soundsage-staging
    gcloud sql users create soundsage --instance=soundsage-staging --password=...
    ```
21. **Workload Identity Federation** for GitHub Actions (no JSON keys):
    - Create workload identity pool + provider for GitHub.
    - Bind provider to a service account `gha-deployer@soundsage-staging.iam.gserviceaccount.com` with roles: Cloud Run Admin, Cloud SQL Client, Service Account User, Secret Manager Secret Accessor.
22. **Push secrets to Secret Manager**:
    ```
    echo -n "<value>" | gcloud secrets create NEXTAUTH_SECRET --data-file=-
    # repeat for: TOKEN_ENCRYPTION_KEY, GOOGLE_CLIENT_SECRET,
    # SPOTIFY_CLIENT_SECRET, REDIS_URL, SENTRY_DSN, DATABASE_URL
    ```
23. **GitHub Actions workflow** `.github/workflows/deploy-staging.yml`:
    - Auth via WIF.
    - `gcloud builds submit` → builds container.
    - `gcloud run deploy soundsage-web --image=... --region=us-central1 --add-cloudsql-instances=...:soundsage-staging --set-secrets=...`.
    - Run `prisma migrate deploy` via `gcloud run jobs execute migrate`.
24. **Add staging URL** to Spotify and Google redirect URIs.
25. **Sign in on staging** — verify the Google round-trip works in Cloud Run.
26. **Sentry sanity check** — throw in a test route, verify it lands.
27. **Security headers** — verify with securityheaders.com (target ≥A).

✅ Gate: staging Cloud Run URL accepts Google sign-in, errors flow to Sentry, security headers green.

---

## Stage 4 — Spotify connection flow (4 days)

28. **`lib/spotify.ts`** — fetch wrapper with token-bucket rate limiter (3/s, burst 30) and `Retry-After` handling. Backed by Redis for cross-instance state.
29. **`POST /api/spotify/connect/start`** — generates PKCE verifier (43-char URL-safe), stores in encrypted httpOnly cookie, builds Spotify auth URL with `code_challenge` + state token, returns redirect URL.
30. **`GET /api/spotify/connect/callback`** — verifies state, reads verifier from cookie, exchanges code, fetches `/v1/me`, encrypts tokens, upserts `SpotifyAccount`. Redirects to `/`.
31. **`ensureFreshToken(userId)`** — refresh 5 min before expiry; persist new tokens encrypted.
32. **`GET /api/spotify/connection`** — returns `{ connected, spotifyDisplayName?, lastSyncAt? }`.
33. **`DELETE /api/spotify/connection`** — deletes `SpotifyAccount`; events cascade.

✅ Gate: connect → consent → callback → `SpotifyAccount` row with encrypted tokens, decrypt round-trip + `/v1/me` call succeeds. Disconnect deletes cleanly.

---

## Stage 5 — Ingestion MVP (5 days)

34. **Cloud Tasks queue**:
    ```
    gcloud tasks queues create spotify-sync --location=us-central1 \
      --max-concurrent-dispatches=10 --max-attempts=3
    ```
35. **Cloud Run service endpoint** `POST /tasks/sync-user`:
    - Verifies Cloud Tasks OIDC header.
    - Body: `{ userId }`.
    - Runs `incrementalSync(userId)`.
36. **`incrementalSync`** — recently-played → upsert tracks/artists → `createMany({ skipDuplicates: true, data: events.map(e => ({ ...e, source: 'recently_played' })) })` → advance cursor, all in one `$transaction`.
37. **Failure backoff** — 15m → 30m → 1h → 4h → 24h, tracked on `SpotifyAccount.failureCount`.
38. **`POST /api/sync/trigger`** — Redis-rate-limited 1/min/user; enqueues a Cloud Task.
39. **`GET /api/sync/status`** — reads `SpotifyAccount` columns + recent log entries.
40. **Cloud Run job** `periodic-sync`:
    - Enumerates `SpotifyAccount` rows where `failureCount < 5` and `lastSyncAt < now() - 15min`.
    - Enqueues a Cloud Task per user.
41. **Cloud Scheduler** — cron `*/15 * * * *` triggers the Cloud Run job.
42. **Metrics** — emit `ingest_events_total`, `ingest_lag_seconds`, `spotify_429_total` to Cloud Monitoring (custom metrics via OpenTelemetry).

✅ Gate: real Spotify account on staging plays 5 songs → trigger sync → 5 events. Idle Cloud Scheduler runs log "0 new events." Two triggers in 60s → second returns 429.

---

## Stage 6 — Stats API + contract lock (5–7 days)

Build endpoints in this order; each one unlocks a piece of UI.

43. `/api/stats/overview` — KPI rollups.
44. `/api/stats/activity` — daily buckets in user's IANA timezone.
45. `/api/stats/hourly` — 24-bucket radial.
46. `/api/stats/genres` — joins to artist genre data (cached upstream from Spotify).
47. `/api/stats/weekly` — 12-week sparkline.
48. `/api/tracks/top`, `/api/artists/top` — windowed aggregates with `?range`.
49. `/api/history/recent` — cursor-paginated.
50. **Redis response cache** — 5min for `4w`/`7d`, 1h for `6m+`, invalidated by sync completion.
51. **Contract tests** — for each endpoint, a Zod schema mirrors the `types.ts` interface; CI fails on drift.
52. **`DELETE /api/account`** — full GDPR cascade: deletes `User`, all events, sessions, accounts, cache entries.
53. **Performance check** — seed 30k events for one user; `/api/stats/overview?range=4w` p95 <300ms cold cache.

✅ Gate: every endpoint passes contract test; perf target hit; GDPR delete verified.

---

## Stage 7 — UI integration + subtheme QA (5 days)

54. **Build missing components**: `Lede`, `StatStrip`, `WeeklySpark`.
55. **Refactor `ConnectionPill` into two**:
    - `AccountPill` — Google avatar + sign-out (top-right of `Masthead`).
    - `SpotifyPill` — connect / "Spotify · syncing" / disconnect, reads `/api/spotify/connection`.
    - Update `Masthead` to render both.
56. **App router pages**: `app/page.tsx`, `history/page.tsx`, `patterns/page.tsx`, `tracks/page.tsx`, `artists/page.tsx` — server components doing `Promise.all` per handoff §11.
57. **Empty states**:
    - Signed in but Spotify not connected → "Connect Spotify to begin" CTA.
    - Connected but zero events yet → "First sync running, charts populate in ~1 min" with spinner.
58. **React Query provider** in client tree → wires `SyncCard` polling + `RecentStream` infinite scroll.
59. **`no-transitions` flash suppressor** in `ThemeProvider` per handoff §14.
60. **Subtheme QA** — load every page on every subtheme. Artists `--paper: #1a1612` is the trap. Grep for `#[0-9a-f]{3,6}` in `components/` as a safety net.
61. **Playwright smoke** — one test per tab asserting non-empty render. Add to CI.
62. **Lighthouse** on Overview — target ≥85; address the lowest 3 issues.

✅ Gate: all 5 tabs render real data on staging across all subthemes; empty states clean; Playwright green.

---

## Stage 8 — Backfill (4 days)

63. **Cloud Storage bucket** `soundsage-staging-imports` with a 7-day lifecycle delete rule.
64. **`POST /api/import/spotify-zip/start`** — returns a signed upload URL (50MB cap, content-type `application/zip`).
65. **Client uploads directly to GCS**; on success calls `POST /api/import/spotify-zip/finalize` with the object name.
66. **Cloud Tasks job** parses streaming JSON entries from the ZIP → `createMany` with `source = 'extended_history'`. Reports progress via Redis-keyed counter.
67. **`SyncCard`** progress bar reads the counter (existing UI; just wire it).

✅ Gate: 5-year, 100k-event ZIP imports in <2min on staging tier; re-upload creates zero duplicates; charts render across the boundary cleanly.

---

## Stage 9 — Production hardening (3–5 days)

68. **Error boundaries** per route segment.
69. **Cloud Monitoring alerts**:
    - `ingest_lag_seconds > 3600` for >5% of accounts (5-min window).
    - `spotify_429_total` rate >10/min.
    - Refresh-token failures >3/min.
    - Cloud Run 5xx rate >1%.
70. **Soak test** — script that simulates 50 users, 30k events each, runs the 15-min Scheduler loop for 7 days. Watch for: token decryption errors, dedupe leaks, cache stampedes, OOM in Cloud Run instances.
71. **User prefs UI** — theme/density toggles in a small settings page; server-persisted to `User.prefs`.
72. **Production CSP audit** — Spotify image CDN (`i.scdn.co`) on `img-src`; Google avatar URLs whitelisted; Sentry's tunnel host on `connect-src`.
73. **`npm audit --omit dev`** clean; review any remaining beta deps (Auth.js v5).
74. **Runbook** (this document, §10 below) reviewed by a second pair of eyes if available.

✅ Gate: 7-day unattended soak passes.

---

## Stage 10 — Production cutover (1 day)

75. **Bootstrap `soundsage-prod` GCP project** — repeat Stage 0 + Stage 3 deploy steps with prod credentials.
76. **Add prod redirect URIs** to Spotify and Google OAuth clients.
77. **Run `prisma migrate deploy`** against prod DB.
78. **Custom domain** — Cloud Run domain mapping → DNS records → wait for SSL provisioning (~15 min).
79. **Daily PG backup** — Cloud SQL automatic backups + 7-day retention; document a restore drill in §10.
80. **Privacy policy + ToS** live on the domain (required for Spotify Extended Quota approval beyond 25 users).
81. **Final security headers check** + Sentry alerting routed to wherever you'll see it.
82. **Smoke test the live URL yourself for 24h** before any external announcement.

✅ Gate: live URL serves real data; no Sentry errors in 24h; you've used it personally without finding bugs.

---

## §10 — On-call runbook

### Clear a stuck Cloud Task

```
gcloud tasks queues purge spotify-sync --location=us-central1
```

### Reset a user's sync state

```sql
UPDATE "SpotifyAccount" SET "failureCount" = 0, "cursor" = NULL WHERE "userId" = '...';
```

### Rotate `TOKEN_ENCRYPTION_KEY`

1. Add new version to Secret Manager: `gcloud secrets versions add TOKEN_ENCRYPTION_KEY --data-file=-`.
2. Deploy a one-shot migration job that decrypts every `SpotifyAccount` token with the old key version and re-encrypts with the new version.
3. Disable the old version after verification.

### Restore from PG backup

```
gcloud sql backups list --instance=soundsage-prod
gcloud sql backups restore <BACKUP_ID> --restore-instance=soundsage-prod
```

### Force-disconnect a user (abuse, deletion request)

```
DELETE FROM "User" WHERE id = '...';   -- cascades to everything
```

---

## Calendar view

| Stage | Days | Cumulative |
|---|---|---|
| 0 — GCP project + accounts | 1 | 1 |
| 1 — local env | 1 | 2 |
| 2 — schema + Google sign-in | 4 | 6 |
| 3 — first Cloud Run deploy | 2 | 8 |
| 4 — Spotify connect flow | 4 | 12 |
| 5 — ingestion MVP | 5 | 17 |
| 6 — stats API | 7 | 24 |
| 7 — UI integration | 5 | 29 |
| 8 — backfill | 4 | 33 |
| 9 — hardening | 5 | 38 |
| 10 — prod cutover | 1 | 39 |

**~8 weeks solo, full-time.** Compress to 5 weeks with a second engineer (parallelize Stage 6 endpoints + Stage 7 UI).

---

## What's next

Stage 0 is unblocked — start by creating the two GCP projects and the Spotify + Google OAuth clients.
