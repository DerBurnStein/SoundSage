# SoundSage Implementation Plan

> Source-of-truth spec: [SoundSage_Dev_Handoff.md](SoundSage_Dev_Handoff.md)
> Operational checklist: [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md)
> Current state: UI scaffold complete (all §5 components), backend & app wiring not started.
> This plan supersedes the handoff's §13 four-week sketch — see "Why this differs from §13" at bottom.

---

## 0. Architectural decisions — LOCKED

Hard requirements: **Google Identity Services for sign-in, Google Cloud for hosting.**

| Layer | Decision | Note |
|---|---|---|
| **App identity** | Auth.js (NextAuth v5) Google provider only | Google = SoundSage account |
| **Spotify access** | Custom OAuth 2.0 + PKCE flow | Spotify is a linkable data connection, not a login |
| **Web host** | Cloud Run (Next.js standalone container) | Scale-to-zero, native SSR |
| **Database** | Cloud SQL Postgres 15 + Cloud SQL Auth Proxy | Managed, IAM auth |
| **Periodic sync** | Cloud Scheduler → Cloud Run job (every 15 min) | Native cron, no always-on worker |
| **On-demand trigger** | Cloud Tasks → Cloud Run service endpoint | Decouples click from execution |
| **Cache** | Upstash Redis (GCP region) | Migrate to Memorystore only if VPC traffic justifies the connector cost |
| **Secrets** | Secret Manager, mounted as Cloud Run env vars | Audited, native rotation |
| **CI/CD** | GitHub Actions + Workload Identity Federation | No service-account JSON keys in repo |
| **Errors** | Sentry | Pairs with Cloud Logging |
| **Domain** | `*.run.app` (staging) → Cloud Run domain mapping (prod) | No load balancer at v1 traffic |

**Cascade effects** — these flow through every subsequent phase:

1. **Two-layer auth.** Google session + linkable Spotify connection (independent lifecycles).
2. **Schema rewrite** (see §3): drop the handoff's `Account` model; replace with `User` keyed on `googleSubject` + `SpotifyAccount` joined 1:1.
3. **`ConnectionPill` splits into two components**: Google account avatar/sign-out, and a separate Spotify connection pill.
4. **Cloud Tasks replaces BullMQ.** Redis is cache-only.
5. **Two destructive actions** (not one): "Disconnect Spotify" (drops events + tokens, keeps account) vs. "Delete account" (full GDPR cascade).

---

## 1. Current state

**Built** — Phase 0 effectively done:
- All 14 components from handoff §5 (`primitives`, `Masthead`, `ConnectionPill`, `ThemeProvider`, `SyncCard`, charts, lists, motif).
- `types.ts` (full DTO contracts), `lib/api.ts` (typed fetch + `QUERY_KEYS`), `globals.css` (tokens + subthemes).
- `next-auth` and Playwright installed.

**Not built** — everything backend, all app-router pages, three components (`WeeklySpark`, `StatStrip`, `Lede`), and key deps (`@tanstack/react-query`, Prisma, `@google-cloud/tasks`, ioredis).

The DTO contract is **frozen by the components** — backend conforms to `types.ts`, not the other way around.

---

## 2. Cross-cutting concerns (start in Phase 1, never "later")

- **Observability**: structured pino logs from the first endpoint; Cloud Logging picks them up automatically on Cloud Run. Sentry from the first deploy.
- **Security**: AES-256-GCM token encryption lands the same PR as token persistence. CSP + HSTS configured before first staging URL is shared.
- **Testing**: every API route ships with a contract test asserting the response matches `types.ts`. Playwright smoke runs in CI from Phase 3.
- **GDPR**: `DELETE /api/account` lands in Phase 4, not at the end. Cascading deletes are easier to design at schema time.

---

## 3. Schema (revised for two-layer auth)

```prisma
model User {
  id            String   @id @default(cuid())
  googleSubject String   @unique          // sub claim from Google ID token
  email         String   @unique
  name          String?
  image         String?
  prefs         Json     @default("{\"theme\":\"paper\",\"density\":\"regular\"}")
  timezone      String   @default("UTC")  // IANA, populated on first stats query
  createdAt     DateTime @default(now())

  spotify       SpotifyAccount?
  events        ListeningEvent[]
  sessions      Session[]                 // NextAuth
  accounts      Account[]                 // NextAuth (Google OIDC tokens)
}

model SpotifyAccount {
  userId         String    @id
  spotifyUserId  String    @unique
  accessToken    String                   // AES-256-GCM ciphertext (base64)
  refreshToken   String                   // AES-256-GCM ciphertext (base64)
  expiresAt      DateTime
  scopes         String                   // space-delimited granted scopes
  cursor         DateTime?                // ingestion high-water mark
  lastSyncAt     DateTime?
  failureCount   Int       @default(0)
  connectedAt    DateTime  @default(now())
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model ListeningEvent {
  id        BigInt   @id @default(autoincrement())
  userId    String
  trackId   String
  playedAt  DateTime
  msPlayed  Int?
  source    String                        // 'recently_played' | 'extended_history'
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, trackId, playedAt])
  @@index([userId, playedAt(sort: Desc)])
}

// NextAuth-required tables (verbatim from @auth/prisma-adapter)
model Account { /* ... Google OIDC tokens ... */ }
model Session { /* ... server-side session rows ... */ }
model VerificationToken { /* ... */ }
```

Rationale for splitting `User` from `SpotifyAccount`:
- A user can exist without Spotify linked (post-signup, pre-connect).
- Disconnect Spotify = delete `SpotifyAccount` row → events cascade → user keeps their SoundSage account.
- Delete account = delete `User` → everything cascades.

---

## 4. Phases

### Phase 1 — Foundation + Google Sign-In (~5 days)

**Goal:** deployed staging URL on Cloud Run where a user can sign in with Google and a `User` row is created.

Scope:
- GCP project + Cloud SQL instance + Upstash Redis + Secret Manager bootstrap.
- Repo plumbing: `app/` directory stub, `lib/db.ts`, Prisma schema (§3), first migration via Cloud SQL Auth Proxy.
- `lib/auth.ts` — Auth.js v5 with Google provider + Prisma adapter + Postgres session strategy.
- `app/api/auth/[...nextauth]/route.ts`.
- `app/layout.tsx` mounting `ThemeProvider` + `Masthead`.
- `app/page.tsx` stub showing session JSON (proof of life).
- GitHub Actions deploy via Workload Identity Federation → Cloud Run.
- Sentry + pino + structured-log baseline.
- HSTS + CSP headers in `next.config.js`.

Acceptance:
- `/api/auth/signin` → Google consent → callback → `User` row persisted with email + googleSubject.
- Staging URL live with HSTS + CSP verified by securityheaders.com (≥A).
- `prisma migrate deploy` runs from clean DB to schema in <30s via Cloud SQL Auth Proxy.

Risks:
- Auth.js v5 is still beta — pin a known-good version.
- Workload Identity Federation setup is fiddly; allocate half a day.

---

### Phase 2 — Spotify Connection (~4 days)

**Goal:** an authenticated user can click "Connect Spotify" and a `SpotifyAccount` row appears with encrypted tokens.

Scope:
- `lib/crypto.ts` — AES-256-GCM encrypt/decrypt for refresh + access tokens. Key from Secret Manager. Round-trip unit-tested.
- `lib/spotify.ts` — token-bucket rate limiter (3/s, burst 30), `Retry-After` handling.
- Custom PKCE flow:
  - `POST /api/spotify/connect/start` — generates PKCE verifier, stores in encrypted cookie, returns Spotify auth URL with state-token CSRF check.
  - `GET /api/spotify/connect/callback` — verifies state, exchanges code, encrypts and persists tokens, redirects to `/`.
- `GET /api/spotify/connection` — returns `{ connected: boolean, spotifyDisplayName?, lastSyncAt? }` for `ConnectionPill`.
- `DELETE /api/spotify/connection` — disconnect (deletes `SpotifyAccount` and cascades events).
- `ensureFreshToken(userId)` — refreshes 5 min before expiry.

Acceptance:
- Connect → consent → callback → `SpotifyAccount` row with encrypted tokens.
- Decrypting access token + calling `/v1/me` returns the connected Spotify user.
- Disconnect deletes the row and all events for that user.
- Re-connect after disconnect works cleanly.

---

### Phase 3 — Ingestion MVP (~5 days)

**Goal:** an authenticated user can hit "Run sync now" and see real `ListeningEvent` rows from the last 24h.

Scope:
- Cloud Tasks queue `spotify-sync` (max 1 attempt per task, 60s deadline).
- Cloud Run service endpoint `POST /tasks/sync-user` (header-authenticated by Cloud Tasks OIDC).
- `incrementalSync(userId)`: recently-played → upsert tracks/artists → `createMany({ skipDuplicates: true })` → advance cursor. Single `$transaction`.
- Failure backoff: 15m → 30m → 1h → 4h → 24h, tracked on `SpotifyAccount.failureCount`.
- `GET /api/sync/status` + `POST /api/sync/trigger` (Redis-rate-limited 1/min/user; enqueues a Cloud Task).
- Cloud Run **job** `periodic-sync` triggered by Cloud Scheduler every 15 min — enumerates active users, enqueues a task per user.
- Metrics: `ingest_events_total`, `ingest_lag_seconds`, `spotify_429_total` exported via Cloud Monitoring.

Acceptance:
- Real Spotify account on staging plays 5 songs → trigger sync → 5 events.
- Triggering sync twice in 60s returns 429 the second time.
- Killing the worker mid-run leaves DB consistent (integration test).
- Cloud Scheduler trigger logs "0 new events" cleanly when idle.

---

### Phase 4 — Dashboard API + Contract Lock (~7 days)

**Goal:** every endpoint in handoff §9 returns real data shaped exactly like `types.ts`.

Scope:
- All 11 API routes from §9 (overview, activity, hourly, genres, weekly, top tracks, top artists, recent, sync status/trigger).
- Each route: session check (401 missing), `?range` parsing, user-timezone-aware aggregation (DST 23h/25h days rendered honestly), Redis cache (5min for `4w`/`7d`, 1h for historical), invalidated on sync completion.
- **Contract tests**: each endpoint's response parsed by a Zod schema derived from `types.ts`. CI fails on drift.
- `DELETE /api/account` — full GDPR cascade + cache flush.
- SQL aggregation queries reviewed for index usage on `(userId, played_at DESC)`.

Acceptance:
- Every endpoint has a contract test.
- 30k-event seeded user returns `/api/stats/overview?range=4w` in <300ms p95 from cold cache.
- GDPR delete removes user + all events + cache; verified by integration test.

---

### Phase 5 — Historical Backfill (~4 days)

**Goal:** users upload Spotify Extended Streaming History ZIP and see months of data.

Scope:
- `POST /api/import/spotify-zip` — Cloud Storage signed-URL upload (50MB cap).
- Cloud Tasks job parses streaming JSON → maps to `ListeningEvent` rows with `source = 'extended_history'`.
- Progress reporting via existing `SyncCard` progress UI.
- Re-upload idempotency through the unique index.

Acceptance:
- 5-year, 100k-event ZIP imports in <2 min.
- Re-uploading creates zero duplicates.
- Charts render correctly across the import boundary.

---

### Phase 6 — UI Integration + Subtheme QA (~5 days)

**Goal:** every page reads from real APIs and looks correct on every subtheme.

Scope:
- Build the three missing components: `Lede`, `StatStrip`, `WeeklySpark`.
- **Split `ConnectionPill` into two**: `AccountPill` (Google avatar + sign-out) and `SpotifyPill` (connect/disconnect + sync state). Update `Masthead` layout accordingly.
- All 5 app pages: `app/page.tsx`, `history/`, `patterns/`, `tracks/`, `artists/` — server components doing `Promise.all` fetches per handoff §11.
- Empty-state for unconnected users on Overview ("Connect Spotify to begin").
- React Query provider in client tree — wires `SyncCard` polling + `RecentStream` infinite scroll.
- `no-transitions` flash suppressor in `ThemeProvider` per §14.
- Subtheme QA pass: visual diff every component on every subtheme. Artists dark-`--paper` is the trap — grep for hex literals as a safety net.
- Playwright smoke per tab.

Acceptance:
- All 5 tabs render real data on staging across all subthemes.
- Empty-state for never-connected user works without console errors.
- Lighthouse perf ≥85 on Overview.

---

### Phase 7 — Production hardening + launch (~5 days)

Scope:
- Error boundaries per route segment.
- Cloud Monitoring alert rules: `ingest_lag > 1h` for >5% of users; `spotify_429_rate > 10/min`; refresh-token failure spike.
- Soak test: 50 simulated users, 30k events each, 7-day Cloud Scheduler loop. Verify no decryption errors, no dedupe leaks, no cache stampedes.
- User prefs UI (theme, density), server-persisted.
- Production CSP audit, `npm audit --omit dev` clean.
- Runbook (in [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) §10): clear stuck job, rotate `TOKEN_ENCRYPTION_KEY`, reset a user's sync state, restore from PG backup.
- Production project (separate GCP project from staging), domain mapping, DNS cutover.

Acceptance:
- 7-day unattended soak passes.
- Runbook reviewed.
- Live URL serves real users; you've used it for 24h yourself without finding bugs.

---

## 5. Component build status

Already shipped (don't rebuild):
> `primitives`, `Masthead`, `ConnectionPill` (will be split — see Phase 6), `ThemeProvider`, `SyncCard`, `ActivityRibbon`, `HourlyClock`, `GenreBar`, `RankList`, `RecentStream`, `MotifRail`, `NorenBanner`

Still to build (Phase 6):
- `Lede`, `StatStrip`, `WeeklySpark`
- `AccountPill`, `SpotifyPill` (refactor of existing `ConnectionPill`)

---

## 6. Why this differs from handoff §13

| Handoff §13 | This plan | Why |
|---|---|---|
| 4 weeks total | ~6 weeks | §13 is aspirational. Auth + ingestion alone is 2 weeks. |
| Single auth phase | Phase 1 (Google) + Phase 2 (Spotify) | Two-layer auth requires two acceptance gates. |
| Backfill not a phase | Phase 5 | Without it, week-1 users see empty charts. |
| Subthemes deferred to Phase 三 | Subtheme QA at Phase 6 (gate) | Tokens already exist; what's missing is *verification*. |
| Obs/GDPR/security in Phase 四 | Cross-cutting from Phase 1 | These are nearly impossible to retrofit cleanly. |
| Vercel + Fly.io | Cloud Run + Cloud SQL + Cloud Tasks | Hard requirement: GCP. |
| NextAuth Spotify provider | NextAuth Google + custom Spotify PKCE | Hard requirement: Google sign-in. |

---

## 7. Immediate next actions

See [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) for sequenced ops steps. Phase 1 starts at Stage 0 of the runbook.
