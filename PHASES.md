# SoundSage — Phase Work Breakdowns

> Companion to [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md).
> This file describes **what work has to be done** in each phase, in enough detail that the work can be picked up and executed without re-deriving design decisions.
>
> Each phase: goal, prerequisites, work items, files touched, tests, acceptance criteria, risks.

---

## Phase 1 — Foundation + Google Sign-In (≈5 days)

### Goal
A staging URL on Cloud Run where a real user can sign in with their Google account and see a `User` row materialized in Cloud SQL. Nothing else works yet — but the seam is real.

### Prerequisites
Stage 0 of the runbook complete: GCP staging project, Cloud SQL instance, Upstash Redis, Sentry project, Google OAuth client, Spotify app registration, `TOKEN_ENCRYPTION_KEY` generated, Workload Identity Federation set up.

### Work items

**1.1 Local dev plumbing (0.5 day)**
- `docker-compose.yml` at repo root — `postgres:15` and `redis:7`. Single `docker compose up -d` boots both. Postgres exposed on 5432 with default credentials; Redis on 6379.
- `.env.local` (gitignored) and `.env.example` (committed). Keys: `DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`, `SENTRY_DSN`, `GCP_PROJECT_ID`.
- `next.config.js` — `output: 'standalone'` (required for Cloud Run container builds), `headers()` config for HSTS + baseline CSP.
- Install deps: `prisma @prisma/client @auth/prisma-adapter @tanstack/react-query @google-cloud/tasks @google-cloud/storage ioredis pino pino-pretty zod @sentry/nextjs`. Dev: `@types/pg`.

**1.2 Database schema + migrations (1 day)**
- `prisma/schema.prisma` with the models defined in IMPLEMENTATION_PLAN.md §3: `User`, `SpotifyAccount`, `ListeningEvent`, plus NextAuth's `Account`, `Session`, `VerificationToken`.
- Indexes: unique `(userId, trackId, playedAt)` on `ListeningEvent`, `(userId, playedAt DESC)` index for the primary query path.
- `npx prisma migrate dev --name init` produces the first migration file.
- Decision: skip `pg_partman` for v1; add a follow-up migration in Phase 7 if scale warrants.
- `lib/db.ts` — Prisma client singleton with the `globalThis` hot-reload guard.

**1.3 Auth.js v5 + Google provider (1.5 days)**
- `lib/auth.ts` — exports `handlers`, `auth`, `signIn`, `signOut`. Uses `PrismaAdapter`, Google provider only, `session: { strategy: 'database' }`. `session` callback adds `userId` to the session object.
- `app/api/auth/[...nextauth]/route.ts` — re-exports `handlers.GET` and `handlers.POST`.
- `next-auth.d.ts` type augmentation — adds `userId: string` to `Session`.
- `app/layout.tsx` — server component, calls `await auth()`, mounts `<ThemeProvider>` and `<Masthead>`. Pulls user prefs from `User.prefs` if signed in.
- `app/page.tsx` (temporary) — if no session, render a "Sign in with Google" button that calls `signIn('google')`. If signed in, dump `JSON.stringify(session)` for proof of life.
- Verify the existing `Masthead` and `ConnectionPill` still render without breaking on the unauthenticated path.

**1.4 Observability + security baseline (0.5 day)**
- `lib/logger.ts` — pino instance configured for JSON output (Cloud Logging picks up stdout JSON automatically). Helper `log.child({ userId, route })`.
- `@sentry/nextjs` integration — `instrumentation.ts`, `sentry.client.config.ts`, `sentry.server.config.ts`. DSN from env. Test by throwing in a route, verify event lands in Sentry.
- `next.config.js` security headers: HSTS `max-age=31536000; includeSubDomains; preload`, CSP scaffold (will tighten in Phase 7), `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

**1.5 GitHub Actions deploy pipeline (1 day)**
- `.github/workflows/deploy-staging.yml`:
  - Trigger: push to `main`.
  - Auth: Workload Identity Federation (`google-github-actions/auth@v2`).
  - Build: `gcloud builds submit --tag=...` (or use `gcloud run deploy --source=.`).
  - Deploy: `gcloud run deploy soundsage-web --image=... --region=us-central1 --add-cloudsql-instances=PROJECT:REGION:soundsage-staging --set-secrets=NEXTAUTH_SECRET=NEXTAUTH_SECRET:latest,...`.
  - Migrate: separate `gcloud run jobs execute migrate` step that runs `prisma migrate deploy` against Cloud SQL via the proxy.
- Add staging Cloud Run URL to Google OAuth client redirect URIs.

**1.6 Verification on staging (0.5 day)**
- Sign-in round-trip works: click button → Google consent → return → `User` row visible in Cloud SQL with `googleSubject`, `email`.
- securityheaders.com on staging URL → ≥A.
- Sentry test event visible in dashboard.
- Cloud Logging shows structured pino JSON.

### Files created/modified
- New: `docker-compose.yml`, `.env.local`, `.env.example`, `next.config.js`, `prisma/schema.prisma`, `lib/db.ts`, `lib/auth.ts`, `lib/logger.ts`, `instrumentation.ts`, `sentry.*.config.ts`, `next-auth.d.ts`, `app/layout.tsx`, `app/page.tsx`, `app/api/auth/[...nextauth]/route.ts`, `.github/workflows/deploy-staging.yml`.
- Modified: `package.json` (deps).

### Tests
- Unit: prisma schema validates (`prisma validate`).
- Smoke: `curl /api/auth/providers` returns Google provider config.
- Manual: sign-in round-trip on staging.

### Acceptance criteria
1. Click sign-in on staging → consent → `User` row in DB with `googleSubject` and `email` populated.
2. Sign out clears the session cookie and redirects to `/`.
3. `prisma migrate deploy` against staging completes in <30s via the Auth Proxy.
4. securityheaders.com grades staging ≥A.
5. CI green, deploys to Cloud Run on every push to `main`.

### Risks
- **Auth.js v5 is beta.** Pin a known-good minor version; document upgrade procedure. Don't track `next` tag.
- **Workload Identity Federation has a learning curve.** Allocate half a day for the IAM dance — it's the most common multi-hour blocker on first GCP setups.
- **Cloud SQL Auth Proxy in Cloud Run** uses Unix sockets (`/cloudsql/PROJECT:REGION:INSTANCE`) — `DATABASE_URL` must use that path format, not TCP.

---

## Phase 2 — Spotify Connection (≈4 days)

### Goal
A signed-in user can click "Connect Spotify," go through the consent flow, and have an encrypted `SpotifyAccount` row persisted. They can also disconnect.

### Prerequisites
Phase 1 complete. Spotify app has staging callback URL added: `https://staging-url/api/spotify/connect/callback`.

### Work items

**2.1 Token encryption helper (0.5 day)**
- `lib/crypto.ts` — `encrypt(plaintext: string): string` and `decrypt(ciphertext: string): string`.
- AES-256-GCM with random 96-bit nonce. Output format: base64(`nonce ‖ ciphertext ‖ authTag`).
- Key sourced from `process.env.TOKEN_ENCRYPTION_KEY` (base64-decoded to 32 raw bytes).
- Fail fast on key length mismatch.
- Unit tests: round-trip, wrong-key fails with auth-tag error, tampered ciphertext fails, repeated `encrypt(x)` produces different ciphertexts (random nonce).

**2.2 Spotify HTTP client (0.5 day)**
- `lib/spotify.ts` — typed wrapper around `fetch` for Spotify endpoints.
- Redis-backed token bucket: 3 tokens/sec refill, burst capacity 30. Implemented with a Lua script for atomicity.
- On HTTP 429: read `Retry-After`, sleep, retry once (then give up).
- Throws typed errors: `SpotifyAuthError` (401), `SpotifyRateLimitError`, `SpotifyServerError` (5xx).
- Sets `User-Agent: SoundSage/1.0 (+https://...)` per Spotify guidelines.

**2.3 PKCE start endpoint (0.5 day)**
- `POST /api/spotify/connect/start` — requires Google session.
- Generates `code_verifier` (43+ random URL-safe bytes via `crypto.randomBytes`).
- Computes `code_challenge = base64url(sha256(code_verifier))`.
- Generates `state` (CSRF token, 32 random bytes hex-encoded).
- Stores `{ verifier, state, userId }` in an encrypted httpOnly SameSite=Lax cookie with 10-min expiry. Use `iron-session` or hand-rolled with `lib/crypto.ts`.
- Builds Spotify auth URL with: `client_id`, `response_type=code`, `redirect_uri`, `scope` (handoff §8: `user-read-recently-played user-read-currently-playing user-top-read user-read-email`), `code_challenge`, `code_challenge_method=S256`, `state`.
- Returns `{ url }` (client-side redirect) or 302 directly. Pick one — recommend JSON for testability.

**2.4 PKCE callback endpoint (1 day)**
- `GET /api/spotify/connect/callback?code=...&state=...` — requires Google session.
- Verifies `state` matches the cookie value (CSRF check). Reject with 400 if mismatched or cookie missing/expired.
- Exchanges `code` for tokens at `POST https://accounts.spotify.com/api/token` with `code_verifier`. Standard form-encoded body.
- Calls `GET /v1/me` to obtain `spotifyUserId`, `display_name`.
- Encrypts both `access_token` and `refresh_token` via `lib/crypto.ts`.
- Upserts `SpotifyAccount` keyed on `userId` — handles both first-connect and reconnect cleanly.
- Clears the PKCE cookie.
- Redirects to `/?connected=spotify` (UI can toast a success message).
- Edge case: if user denies consent, Spotify redirects with `error=access_denied` — handle gracefully, redirect to `/?connected=denied`.

**2.5 Token refresh (0.5 day)**
- `lib/spotify-tokens.ts` — `ensureFreshToken(userId): Promise<string>` (returns plaintext access token).
- Read `SpotifyAccount`, decrypt access token, check `expiresAt > now() + 5min` → return decrypted access token.
- Else: POST to `/api/token` with `grant_type=refresh_token` + `refresh_token`. Spotify may rotate the refresh token (sometimes returns a new one) — re-encrypt and persist whichever is current.
- On `400 invalid_grant` (refresh token revoked): set a `needsReconnect = true` flag (add to schema), throw `SpotifyAuthError`. UI prompts re-connect.
- Atomic with `prisma.$transaction` — never partially update tokens.

**2.6 Connection management endpoints (0.5 day)**
- `GET /api/spotify/connection` — returns `{ connected: boolean, spotifyDisplayName?, scopes?, lastSyncAt?, needsReconnect? }` for UI consumption.
- `DELETE /api/spotify/connection` — `prisma.spotifyAccount.delete({ where: { userId } })`. `ListeningEvent` rows cascade. Returns 204.
- Both require Google session.

**2.7 Tests (0.5 day)**
- Unit: `crypto.ts` round-trip and tamper detection.
- Unit: PKCE verifier/challenge generation matches RFC 7636.
- Integration: connect → mock Spotify → callback → row exists with encrypted tokens → decrypted access token + `/v1/me` succeeds. Use `msw` or Spotify's sandbox account for integration.
- Integration: disconnect deletes row.

### Files created/modified
- New: `lib/crypto.ts`, `lib/spotify.ts`, `lib/spotify-tokens.ts`, `app/api/spotify/connect/start/route.ts`, `app/api/spotify/connect/callback/route.ts`, `app/api/spotify/connection/route.ts`.
- Modified: `prisma/schema.prisma` (add `needsReconnect Boolean @default(false)` to `SpotifyAccount`).

### Acceptance criteria
1. Connect flow: signed-in user → click connect → Spotify consent → returns to `/` with `SpotifyAccount` row, tokens encrypted at rest.
2. Decrypt round-trip + `GET /v1/me` returns the connected user's profile.
3. Disconnect deletes the row; events cascade away if any exist.
4. Re-connect after disconnect works without errors.
5. Token refresh: with an expired access token, calling `ensureFreshToken` returns a fresh one and persists the new tokens.

### Risks
- **PKCE cookie size limits.** Encrypted state can exceed 4KB if encoded poorly — use compact serialization.
- **Refresh-token rotation.** Spotify *sometimes* returns a new refresh token on refresh; missing this leak-bugs your auth state. Always update the stored refresh_token from the response if present.
- **Scope drift.** If you add scopes later, existing users must reconnect. Plan a `scopes` column comparison + UI nudge.

---

## Phase 3 — Ingestion MVP (≈5 days)

### Goal
Connected users see real `ListeningEvent` rows. Manual trigger works. Periodic sync runs every 15 min via Cloud Scheduler. Failure modes are bounded.

### Prerequisites
Phase 2 complete. Cloud Tasks queue created. Cloud Scheduler enabled.

### Work items

**3.1 Cloud Tasks setup (0.5 day)**
- `gcloud tasks queues create spotify-sync --location=us-central1 --max-concurrent-dispatches=10 --max-attempts=3 --max-retry-duration=3600s --min-backoff=10s --max-backoff=600s`.
- Service account `spotify-sync-invoker@...` with `roles/run.invoker` on the Cloud Run service.
- `lib/tasks.ts` — wrapper around `@google-cloud/tasks` `CloudTasksClient`. `enqueueSyncTask({ userId })` creates an HTTP task targeting the worker endpoint with OIDC auth.

**3.2 Worker endpoint (1 day)**
- `POST /tasks/sync-user` — Cloud Run target.
- Verifies request: must have `X-CloudTasks-QueueName` header AND a valid OIDC `Authorization: Bearer ...` token where `aud` matches the Cloud Run URL. Reject anything else with 401.
- Body: `{ userId: string }`.
- Calls `incrementalSync(userId)`.
- Response: 200 on success or business-failure (e.g. user disconnected). Throw 5xx only for transient infra errors that should trigger Cloud Tasks retry.
- Permanent failures (10+ consecutive) → log and return 200 to stop retries.

**3.3 incrementalSync logic (1.5 days)**
- `lib/sync.ts` — `incrementalSync(userId): Promise<SyncResult>`.
- Steps:
  1. Load `SpotifyAccount`. If missing or `needsReconnect`, abort.
  2. `ensureFreshToken(userId)`.
  3. `GET /v1/me/player/recently-played?limit=50&after={cursor.epochMs}`.
  4. If response empty, just update `lastSyncAt = now()` and return `{ inserted: 0 }`.
  5. Map items → event rows: `{ userId, trackId, playedAt, msPlayed: null, source: 'recently_played' }`. (Spotify doesn't return msPlayed on recently-played; that's only in Extended History.)
  6. (Optional, can defer to Phase 4): upsert track + artist metadata. For Phase 3, store just `trackId` and resolve names lazily at query time, OR write a `Track` table now and populate via batch `/v1/tracks?ids=` calls.
  7. `prisma.listeningEvent.createMany({ data, skipDuplicates: true })` — unique index dedupes silently.
  8. Update `SpotifyAccount`: `cursor = max(playedAt)`, `lastSyncAt = now()`, `failureCount = 0`.
  9. All of 5–8 in a single `$transaction`.
- Emit metrics: `ingest_events_total{userId, source}`, `ingest_lag_seconds = now - cursor`.
- Append to a Redis ring buffer for `SyncCard`'s log: `LPUSH sync:log:{userId} "{ts, event, count}"; LTRIM ... 0 5`.

**3.4 Failure handling (0.5 day)**
- Wrap `incrementalSync` body in try/catch. On error:
  - Increment `SpotifyAccount.failureCount`.
  - Compute next-retry delay: `[1: 15m, 2: 30m, 3: 1h, 4: 4h, 5+: 24h]` mapped from `failureCount`.
  - Log structured error with `userId`, `errorClass`, `failureCount`.
- Suspend account when `failureCount >= 10` — periodic-sync job skips it; UI can prompt user.

**3.5 User-triggered sync (0.5 day)**
- `POST /api/sync/trigger` — Google session required.
- Redis rate-limit: `INCR sync:trigger:{userId}` with 60s TTL on first call. If count > 1, return 429 with `Retry-After: 60`.
- `enqueueSyncTask({ userId })`.
- Return `{ jobId: <task-name>, queued: true }`.

**3.6 Sync status endpoint (0.5 day)**
- `GET /api/sync/status` — returns `SyncStatus` shape from `types.ts`:
  - `connected`, `lastSyncAt`, `cursor`, `failureCount`, `inProgress` (heuristic: any task in flight), `recentLog: SyncLogEntry[]`.
- Reads `SpotifyAccount` + Redis log.

**3.7 Periodic sync job (0.5 day)**
- Cloud Run **job** (not service): containerized entrypoint `scripts/periodic-sync.ts`.
- Query: `SELECT userId FROM SpotifyAccount WHERE failureCount < 5 AND (lastSyncAt IS NULL OR lastSyncAt < now() - INTERVAL '15 minutes')`.
- For each userId: `enqueueSyncTask({ userId })`. Limit concurrency by chunking enqueues if needed (Cloud Tasks handles execution concurrency).
- Cloud Scheduler cron `*/15 * * * *` triggers `gcloud run jobs execute periodic-sync`.

**3.8 Testing (0.5 day)**
- Integration: connect → trigger → assert N events in DB.
- Test: trigger twice in 60s → second returns 429.
- Test: re-run sync → 0 new events (dedup via unique index).
- Test: cursor advances correctly across runs.
- Test: simulated 5xx from Spotify → `failureCount` increments → next call delayed.

### Files created/modified
- New: `lib/tasks.ts`, `lib/sync.ts`, `app/tasks/sync-user/route.ts`, `app/api/sync/trigger/route.ts`, `app/api/sync/status/route.ts`, `scripts/periodic-sync.ts`, Cloud Run job + Scheduler config.

### Acceptance criteria
1. Real Spotify account on staging plays 5 songs → trigger sync → 5 events in DB.
2. Cloud Scheduler at `*/15 * * * *` runs cleanly when there's nothing to do.
3. Triggering sync twice in 60s returns 429 the second time.
4. Killing a worker mid-run leaves DB consistent (no half-written events) — verified by integration test.
5. `ingest_lag_seconds` and `spotify_429_total` are visible in Cloud Monitoring.

### Risks
- **Spotify 24h window.** Users who connect, listen on day 1, then return on day 7 will lose plays from days 2–6 unless backfill is done. Phase 5 fixes this; set expectations in `SyncCard` UI now.
- **Track metadata.** Decision to defer track/artist `Track` table population vs. embed names in `ListeningEvent` affects Phase 4 query complexity. Recommend: add a minimal `Track { id, name, artistNames }` table now and populate during sync — reduces Phase 4 join cost.

---

## Phase 4 — Dashboard API + Contract Lock (≈7 days)

### Goal
Every API endpoint defined in handoff §9 returns real data, in the exact shape `types.ts` demands. UI components don't change yet — this is purely backend.

### Prerequisites
Phase 3 complete with at least one user accumulating real events.

### Work items

**4.1 Aggregation infrastructure (1 day)**
- `lib/range.ts` — `parseRange(query): { from: Date, to: Date, grain: 'hour'|'day'|'week' }`. Accepts `24h|7d|4w|6m|1y|all`. `to` is always `now()`. `grain` derived from range size.
- `lib/timezone.ts` — resolves user IANA tz (default UTC, persisted to `User.timezone` on first stats call from a tz-aware client). Provides `bucketByDayInTz(events, tz)` etc.
- DST honesty: never normalize 23h/25h days. Return raw bucket counts; UI renders honestly.
- `lib/cache.ts` — `cacheGet<T>(key)`, `cacheSet(key, value, ttl)`, `invalidatePrefix(prefix)`. Backed by Redis.

**4.2 `/api/stats/overview` (0.5 day)**
- Aggregates within `[from, to]`: `totalPlays`, `uniqueTracks`, `uniqueArtists`, `totalMinutes`, `topTrack`, `topArtist`, `peakDay`.
- Single query with subqueries or 2–3 small queries — pick whichever EXPLAIN-ANALYZEs cleaner.
- Cache: `stats:{userId}:overview:{range}`, TTL 300s for `4w/7d/24h`, 3600s for `6m/1y/all`.

**4.3 `/api/stats/activity` (0.5 day)**
- Daily buckets in user tz across the range.
- SQL: `SELECT date_trunc('day', played_at AT TIME ZONE $tz) AS day, COUNT(*) AS plays FROM listening_events WHERE user_id = $1 AND played_at BETWEEN $2 AND $3 GROUP BY day ORDER BY day`.
- Returns `ActivityBucket[]` with peak flag set on the max-plays day.

**4.4 `/api/stats/hourly` (0.5 day)**
- 24-bucket array indexed by hour-of-day in user tz.
- SQL: `SELECT EXTRACT(hour FROM played_at AT TIME ZONE $tz)::int AS hour, COUNT(*), MODE() WITHIN GROUP (ORDER BY track_id) AS top_track FROM ...`.
- Always 24 buckets in response, padding zero-count hours.

**4.5 `/api/stats/genres` (0.75 day)**
- Requires artist→genres data. Add an `Artist { id, name, genres String[] }` table now if not in Phase 3.
- Background job: when a sync introduces new artist IDs, batch-fetch `/v1/artists?ids=` (50 at a time), populate `Artist` table.
- API query: aggregate plays per genre (UNNEST `Artist.genres`) within the range.
- Returns top N (`?limit=` defaults to 12) with percentages. Bucket the long tail into "other".

**4.6 `/api/stats/weekly` (0.5 day)**
- Last 12 ISO-weeks regardless of `?range`.
- Returns `{ weekStart, plays, minutes }[]` with `length === 12`, padding zero weeks.

**4.7 `/api/tracks/top` + `/api/artists/top` (0.5 day)**
- `?range`, `?limit` (default 8 for tracks, 6 for artists per handoff Overview-page wiring).
- Group-by-and-count, join to `Track`/`Artist` for display data.
- Returns `TopTrack[]` / `TopArtist[]` exactly as `types.ts`.

**4.8 `/api/history/recent` (0.5 day)**
- Cursor pagination: `?cursor=<ISO8601>&limit=<int>`.
- SQL: `WHERE user_id = $1 AND played_at < $cursor ORDER BY played_at DESC LIMIT $limit + 1`. Last item used as `nextCursor`.
- Returns `RecentHistoryResponse`: `events[]`, `nextCursor` (null if no more).

**4.9 Redis caching layer (0.5 day)**
- All `/api/stats/*` GET endpoints check cache first. Cache misses populate it.
- On `incrementalSync` completion: `invalidatePrefix('stats:{userId}:')`.
- `/api/history/recent` and `/api/sync/status` are not cached.

**4.10 Contract tests (1 day)**
- `lib/schemas.ts` — Zod schemas mirroring every interface in `types.ts`. Keep alphabetized for grep-ability.
- For each endpoint: integration test that hits the route against a seeded test user, parses response with the corresponding Zod schema, asserts no schema errors.
- Wire into CI on every PR. Drift fails the build.

**4.11 `DELETE /api/account` (0.5 day)**
- Google session required.
- `prisma.user.delete({ where: { id: session.userId } })` — `onDelete: Cascade` on all FK relations handles the rest.
- Manually invalidate `stats:{userId}:*` and `sync:log:{userId}` Redis keys.
- Sign user out (clear session cookies).
- Audit log entry to a separate table or structured log.
- Returns 204.

**4.12 Performance check (0.5 day)**
- `scripts/seed-events.ts` — seeds 30k synthetic events for one user.
- Run `/api/stats/overview?range=4w` 100x, measure p95.
- `EXPLAIN ANALYZE` the underlying queries. Verify the `(userId, played_at DESC)` index is used.
- Target: p95 < 300ms cold cache. Add indexes or reshape queries until met.

### Files created/modified
- New: `lib/range.ts`, `lib/timezone.ts`, `lib/cache.ts`, `lib/schemas.ts`, all 11 route files under `app/api/stats/...`, `app/api/tracks/top/`, `app/api/artists/top/`, `app/api/history/recent/`, `app/api/account/route.ts`, `scripts/seed-events.ts`.
- Modified: `prisma/schema.prisma` (add `Track`, `Artist`, `User.timezone`).

### Acceptance criteria
1. Every endpoint passes its Zod contract test in CI.
2. 30k-event seeded user returns `/api/stats/overview?range=4w` in <300ms p95 from cold cache.
3. `DELETE /api/account` removes user + all events + all cache entries; integration test asserts zero residual rows.
4. DST transition day (23h or 25h) renders correct raw bucket counts in `/api/stats/activity`.

### Risks
- **DTO drift.** UI was built first. If a real aggregate doesn't fit `types.ts`, the choice is: fix the SQL, change the type + component, or add a transformation layer. Strongly bias toward the first two — the third creates long-term maintenance debt.
- **Genre data lag.** New artists won't have genres on the first sync. Acceptable: render "Unknown" until backfill task catches up. Alert if backlog >100.

---

## Phase 5 — Historical Backfill (≈4 days)

### Goal
Users can upload their Spotify Extended Streaming History ZIP (from Spotify's privacy portal) and see months/years of data in their dashboard.

### Prerequisites
Phase 4 complete. Cloud Storage bucket provisioned.

### Work items

**5.1 Cloud Storage setup (0.5 day)**
- `gcloud storage buckets create gs://soundsage-staging-imports --location=us-central1`.
- Lifecycle rule: delete objects after 7 days.
- Service account `imports-uploader@...` with `roles/storage.objectAdmin` scoped to this bucket.
- CORS config allowing `PUT` from staging/prod origins for direct uploads.

**5.2 Upload start endpoint (0.5 day)**
- `POST /api/import/spotify-zip/start` — Google session + Spotify connection required.
- Generates a V4 signed PUT URL with 15-min expiry, content-type `application/zip`, max size 50MB.
- Object name: `imports/{userId}/{uuid}.zip`.
- Returns `{ uploadUrl, objectName }`.

**5.3 Upload finalize endpoint (0.5 day)**
- `POST /api/import/spotify-zip/finalize` — body: `{ objectName }`.
- Verifies object exists and belongs to `userId` (object name path check).
- Verifies size <50MB (HEAD on the object).
- Generates `jobId` (UUID), enqueues a Cloud Task targeting `/tasks/import-zip` with `{ userId, objectName, jobId }`.
- Returns `{ jobId }`.

**5.4 ZIP parser job (1.5 days)**
- `POST /tasks/import-zip` — Cloud Tasks OIDC verified.
- Streams the ZIP from GCS via `@google-cloud/storage` `createReadStream` piped through `unzipper.Parse()`.
- For each entry matching `Streaming_History_Audio_*.json` or `endsong_*.json`:
  - Pipes through `stream-json` to emit objects without buffering the whole file.
  - For each entry: map `spotify_track_uri` → `trackId`, `ts` → `playedAt`, `ms_played` → `msPlayed`.
  - Filter out: podcasts (`spotify_episode_uri`), tracks with `ms_played < 30000` (matches Spotify's "play counted" threshold), tracks before `from` if doing a partial import.
  - Tag `source = 'extended_history'`.
- Buffer 1000 events at a time → `prisma.listeningEvent.createMany({ data, skipDuplicates: true })`.
- Update progress in Redis: `SET import:{jobId} "{processed:N, total:T, status:'running'}"` after each batch.
- On completion: `status: 'complete'`, invalidate stats cache for that user.
- On failure: `status: 'failed'`, store error message.

**5.5 Progress UI wiring (0.5 day)**
- `GET /api/import/spotify-zip/status?jobId=` — returns `{ status, processed, total, errorMessage? }`.
- `SyncCard` polls this endpoint while an import is active. Existing progress bar UI is reused — no component changes required.

**5.6 Testing (0.5 day)**
- Use a real Spotify Extended Streaming History export (download from Spotify privacy portal yourself for the test user).
- Verify dedup: re-upload same ZIP → 0 new events.
- Verify cross-source: events from `recently_played` and `extended_history` overlapping plays both end up in DB exactly once (unique index handles it).
- Verify charts render correctly across the import boundary (no gap, no double-count).

### Files created/modified
- New: `app/api/import/spotify-zip/start/route.ts`, `app/api/import/spotify-zip/finalize/route.ts`, `app/api/import/spotify-zip/status/route.ts`, `app/tasks/import-zip/route.ts`, `lib/import-parser.ts`.

### Acceptance criteria
1. 5-year, 100k-event ZIP imports in <2 min.
2. Re-uploading the same ZIP creates zero duplicate events.
3. Charts on Overview render correctly across the import + recently_played boundary.
4. Failed imports surface a meaningful error in `SyncCard`.

### Risks
- **ZIP variability.** Spotify has shipped multiple Extended History formats over the years — `endsong_*.json`, `Streaming_History_Audio_*.json`, etc. Parser must handle the union of known shapes. Test against at least 2 vintages.
- **Memory pressure.** Streaming is non-negotiable — a single 100k-event JSON file loaded fully will OOM Cloud Run's default 512MB instance. Use `stream-json`, never `JSON.parse(fs.readFileSync(...))`.

---

## Phase 6 — UI Integration + Subtheme QA (≈5 days)

### Goal
Every page reads from real APIs and looks correct on every subtheme — including dark Artists. The three missing components are built. `ConnectionPill` is split appropriately for the two-layer auth model.

### Prerequisites
Phase 4 complete (APIs return contract-stable data). Phase 5 nice-to-have.

### Work items

**6.1 Build missing components (1.5 days)**
- `components/Lede.tsx` — hero stat block. Large display number (Display primitive, size 64+) with eyebrow + subtitle. Used at top of Overview. Skeleton state when loading.
- `components/StatStrip.tsx` — KPI row, 4–6 stat tiles. Each tile: caption + display number + optional sparkline + optional delta arrow. Uses `Caps` and `Mono` primitives.
- `components/charts/WeeklySpark.tsx` — 12-week sparkline SVG. ~360×60px. No axis, just line + filled area + endpoint dot. Skeleton state when loading.
- All three follow the existing component pattern: props-driven, no internal data fetching.

**6.2 ConnectionPill split (0.5 day)**
- Rename current `ConnectionPill.tsx` → `SpotifyPill.tsx`. Logic changes from `useSession` to fetching `/api/spotify/connection`. States: not connected (CTA "Connect Spotify"), connected (Spotify logo + "Synced 3m ago"), needs reconnect (warning state).
- New `components/AccountPill.tsx` — Google avatar + name + sign-out menu. Uses `useSession`. Top-right of `Masthead`.
- Update `Masthead.tsx` to render both: `AccountPill` rightmost, `SpotifyPill` to its left.

**6.3 App router pages (1.5 days)**
- `app/page.tsx` (Overview):
  - Server component.
  - `Promise.all` of `fetchOverview`, `fetchActivity`, `fetchHourly`, `fetchGenres`, `fetchTopTracks`, `fetchTopArtists`, `fetchRecent`.
  - Renders, in order: `MotifRail tab="overview"`, `Lede`, `StatStrip`, `ActivityRibbon`, `HourlyClock`, `GenreBar`, `TrackRankList`, `ArtistRankList`, `RecentStream`, `SyncCard`.
- `app/history/page.tsx` — `MotifRail tab="history"`, `NorenBanner kanji="歴" title="Listening History"`, paginated `RecentStream` (initial server fetch + client `useInfiniteQuery`).
- `app/patterns/page.tsx` — `MotifRail tab="patterns"`, `NorenBanner kanji="型"`, `HourlyClock`, `GenreBar`, behavioral analytics block.
- `app/tracks/page.tsx` — `MotifRail tab="tracks"`, `NorenBanner kanji="曲"`, full `TrackRankList` with multi-window comparison (4w / 6m / 1y / all side-by-side).
- `app/artists/page.tsx` — `MotifRail tab="artists"`, `NorenBanner kanji="師"`, full `ArtistRankList`, discovery trail block.

**6.4 Empty states (0.5 day)**
- Signed in but Spotify not connected → dashed-border CTA card mid-page: "Connect Spotify to begin." Handled at the page level by checking `/api/spotify/connection` server-side before fetching stats.
- Connected but zero events yet → "First sync running, charts populate in ~1 min" with sync spinner. Show on every page that depends on listening data.
- Auto-refresh: poll `/api/sync/status` every 5s while in this state; transition to populated charts when first events land.

**6.5 React Query provider (0.5 day)**
- `app/providers.tsx` (client component) — wraps `QueryClientProvider` with sensible defaults (`staleTime: 30s`, `refetchOnWindowFocus: false`).
- Mounted in `app/layout.tsx` inside the body.
- `SyncCard` polling: existing component, just verify the `useQuery({ refetchInterval: 30_000 })` works.
- `RecentStream` infinite scroll: `useInfiniteQuery` with `getNextPageParam: (last) => last.nextCursor`.

**6.6 Theme transition flash fix (0.25 day)**
- Per handoff §14: in `ThemeProvider`, on first mount add `no-transitions` class to `<html>`, then `requestAnimationFrame(() => removeClass())` in next frame.
- `globals.css`: `.no-transitions * { transition: none !important; }`.

**6.7 Subtheme QA pass (0.5 day)**
- Visit each of 5 tabs in browser. Verify visually that subtheme transitions are smooth and nothing renders white-on-white or black-on-black.
- Run `grep -rEn '#[0-9a-fA-F]{3,6}' components/` — must return zero hits outside `globals.css` and SVG fill attributes that intentionally hardcode (decorative motifs).
- Capture Playwright screenshots for each tab × 2 viewports (desktop, mobile) as visual regression baseline.
- Specifically validate the Artists tab dark `--paper: #1a1612` doesn't break the existing components (the gotcha called out in handoff §6).

**6.8 Playwright smoke tests (0.5 day)**
- `tests/e2e/dashboard.spec.ts` (already scaffolded per `package.json` script).
- One test per tab: navigate, assert main `<h1>` or `Display` text renders, assert no console errors.
- One test for "signed in, no Spotify" empty state.
- One test for sign-out flow.
- Add to CI on every PR.

**6.9 Lighthouse pass (0.25 day)**
- Run on Overview page on staging. Target ≥85 perf score.
- Address top 3 issues — likely candidates: image sizing, font preload, JS bundle splitting, removing unused CSS.

### Files created/modified
- New: `components/Lede.tsx`, `components/StatStrip.tsx`, `components/charts/WeeklySpark.tsx`, `components/AccountPill.tsx`, `app/page.tsx`, `app/history/page.tsx`, `app/patterns/page.tsx`, `app/tracks/page.tsx`, `app/artists/page.tsx`, `app/providers.tsx`, `tests/e2e/*`.
- Renamed/modified: `components/ConnectionPill.tsx` → `components/SpotifyPill.tsx` (with logic changes).
- Modified: `components/Masthead.tsx` (render both pills), `components/ThemeProvider.tsx` (no-transitions logic).

### Acceptance criteria
1. All 5 tabs render real data on staging.
2. All 5 subthemes look correct across all components — Artists dark theme verified.
3. Empty-state for never-connected user works without console errors.
4. Lighthouse perf ≥85 on Overview.
5. Playwright smoke tests green in CI.
6. No hex literals in `components/` outside intentionally-decorative SVGs.

### Risks
- **React Query SSR hydration.** Next.js App Router + React Query has known hydration footguns. Allocate buffer for the first server-fetched-then-client-refreshed round trip. Use `dehydrate`/`HydrationBoundary` per official docs.
- **Long tab routes.** The `/tracks` and `/artists` "full chart" views could pull a lot of data; paginate or limit by default.

---

## Phase 7 — Production hardening + launch (≈5 days)

### Goal
SoundSage is ready for real users at a custom domain. Observability is wired. The runbook has been exercised. The soak test has run unattended for 7 days.

### Prerequisites
Phase 6 complete on staging, used personally for at least a few days.

### Work items

**7.1 Error boundaries (0.5 day)**
- `app/error.tsx` — root error boundary. Logs to Sentry, renders graceful fallback ("Something went wrong. We've been notified.") with a "Try again" button.
- `app/{tab}/error.tsx` for each tab — same pattern, scoped.
- `app/global-error.tsx` — last-resort full-page boundary.

**7.2 Cloud Monitoring alerts (1 day)**
- Custom metrics emitted from app: `ingest_lag_seconds` (gauge per user), `spotify_429_total` (counter), `refresh_token_failure_total` (counter).
- Alert policies in Cloud Monitoring:
  - `ingest_lag_seconds > 3600` for >5% of accounts within a 5-min window.
  - `spotify_429_total` rate >10/min sustained 5 min.
  - `refresh_token_failure_total` rate >3/min sustained 5 min.
  - Cloud Run `request_count{response_code_class="5xx"}` rate >1% sustained 5 min.
- Notification channels: email + (optional) PagerDuty/Slack integration.

**7.3 Soak test (1.5 days)**
- `scripts/soak-test.ts` — simulates 50 users.
- Each user: random "listening pattern" (5–50 events/day), triggers periodic sync, occasionally a manual sync, occasionally a disconnect/reconnect.
- Run for 7 days against staging. Cloud Scheduler 15-min loop continues running in background.
- Capture daily metrics: token decryption error count (should be 0), dedupe collision count (irrelevant — index handles it), Cloud Run instance restarts, p95 API latency, ingest lag distribution.
- Final report: any anomaly investigated and either fixed or explained.

**7.4 User prefs UI (0.5 day)**
- `app/settings/page.tsx` — small settings page.
- Theme toggle (paper / midnight) — persists to `User.prefs.theme`.
- Density toggle (compact / regular / roomy) — persists to `User.prefs.density`.
- "Disconnect Spotify" button → confirmation modal → `DELETE /api/spotify/connection`.
- "Delete account" button → typed-confirmation modal ("type DELETE") → `DELETE /api/account`.
- `PUT /api/me/prefs` endpoint.

**7.5 Production CSP audit (0.5 day)**
- Tighten CSP from Phase 1 baseline.
- Whitelist: `i.scdn.co` (Spotify album art), `lh3.googleusercontent.com` (Google avatars), Sentry tunnel host, fonts.googleapis.com / fonts.gstatic.com.
- Use a nonce strategy for inline scripts (Next.js supports this in middleware).
- Verify in DevTools that no CSP violations log on any page.

**7.6 Dependency audit (0.25 day)**
- `npm audit --omit dev` — fix all high/critical.
- Document any pinned beta deps with rationale (Auth.js v5 most likely).

**7.7 Runbook drill (0.25 day)**
- In staging, perform each runbook procedure in [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) §10 end-to-end:
  - Rotate `TOKEN_ENCRYPTION_KEY`.
  - Force-disconnect a user.
  - Restore from a PG backup.
  - Clear a stuck Cloud Task.
- If any procedure fails or is unclear, fix the runbook before launch.

**7.8 Production GCP project bootstrap (1 day)**
- Repeat Stage 0 + Stage 3 from runbook for `soundsage-prod`:
  - New Cloud SQL instance (consider `db-custom-2-7680` for prod tier).
  - New Upstash Redis (separate, dedicated).
  - New Secret Manager secrets (production values, distinct from staging).
  - New Sentry project.
- Add prod redirect URIs to Spotify and Google OAuth clients.
- `prisma migrate deploy` against prod DB.
- Deploy Cloud Run with prod env wiring.
- Custom domain: `gcloud run domain-mappings create --service=soundsage-web --domain=soundsage.app`. Add DNS records per output. Wait for SSL provisioning (~15 min).

**7.9 Final smoke + launch (0.5 day)**
- Use the live URL personally for 24h.
- Verify Sentry quiet, Cloud Monitoring alerts not firing, p95 latency stable.
- Privacy policy + ToS published at `/privacy` and `/terms` (required for any future Spotify Extended Quota beyond 25 users).
- External announcement (if applicable).

### Files created/modified
- New: `app/error.tsx`, `app/{tab}/error.tsx` × 5, `app/global-error.tsx`, `app/settings/page.tsx`, `app/api/me/prefs/route.ts`, `scripts/soak-test.ts`, `app/privacy/page.tsx`, `app/terms/page.tsx`.
- Modified: `next.config.js` (tightened CSP).
- Infra: prod GCP project, alert policies, domain mapping.

### Acceptance criteria
1. 7-day unattended soak passes with no token decryption errors and no dedupe leaks.
2. All 4 alert policies tested by deliberately tripping each in staging.
3. Runbook drill — every procedure works as documented.
4. Live prod URL serves real users, observed quiet for 24h.
5. Lighthouse perf still ≥85 on prod.
6. Privacy policy + ToS live and linked from footer.

### Risks
- **Cloud Run cold starts.** First request after scale-to-zero may take 2–4s. Mitigate with `--min-instances=1` on prod (small cost) once user volume justifies it.
- **Spotify Extended Quota.** Default rate quotas allow ~25 users. Beyond that, you must apply for Extended Quota with privacy policy + ToS + rationale. Plan for the 1–2 week review window before public scaling.

---

## Cross-phase work that doesn't fit neatly

These don't have their own phase but **must** happen alongside the phases listed.

- **Documentation as you build.** Each new endpoint gets a one-paragraph description in a `docs/api.md`. Each new env var lands in `.env.example` immediately.
- **CHANGELOG.md.** Update at the end of each phase with what shipped.
- **`README.md` keepalive.** First-time-clone instructions stay correct as the stack evolves.
- **Backup verification.** Phase 7 includes a restore drill, but Phase 1 should *enable* automated daily backups when the staging Cloud SQL is created — easier to land at instance creation than retrofit.
- **Dependency upgrades.** Phase 1 pins versions. Schedule a one-day "patch sweep" between Phase 5 and Phase 6 to absorb any patch-level upgrades that landed during the first month.

---

## What's done and what's left

| Phase | Status | Notes |
|---|---|---|
| 0 (UI scaffold) | ✅ Done | All §5 components, types, lib/api, globals.css |
| 1 — Foundation + Google sign-in | ⬜ Not started | Blocked by Stage 0 of runbook |
| 2 — Spotify connection | ⬜ Not started | |
| 3 — Ingestion MVP | ⬜ Not started | |
| 4 — Dashboard API + contract lock | ⬜ Not started | |
| 5 — Backfill | ⬜ Not started | |
| 6 — UI integration + subtheme QA | ⬜ Not started | Includes ConnectionPill split + 3 missing components |
| 7 — Hardening + launch | ⬜ Not started | |

Total estimate: **~6 weeks of phase work + ~1 week of pre-phase infra setup (Stages 0–1 of runbook)** = **~7 weeks solo full-time**.
