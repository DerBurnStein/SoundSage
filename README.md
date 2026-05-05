# SoundSage

> A personal Spotify listening almanac with an editorial East Asian print aesthetic.
> **Live:** [soundsage.dev](https://soundsage.dev) · **Demo (no sign-in):** [soundsage.dev/demo/start](https://soundsage.dev/demo/start)

SoundSage records what you've been listening to on Spotify and renders the patterns of your days as a five-tab dashboard. The visual language draws from washi paper, sumi ink, vermilion hanko seals, and three-peak kanji-sectioned editorial layouts.

---

## What's here

- **Five tabs**, each with its own colour palette and section motifs:
  - **Overview** (washi cream / vermilion) — lede, KPIs, daily/hourly/genre charts, top tracks + artists
  - **History** (Hokusai blue / gold) — chronological play log, today / yesterday / week views
  - **Patterns** (sakura rose / plum) — weekday-vs-weekend split, time-of-day ratios, seasonal genre shifts, audio-feature mood clusters
  - **Tracks** (kraft paper / torii red) — full track rankings, multiple time windows, recently-added
  - **Artists** (gold leaf / lacquer black) — artist rankings, discovery trail, genres orbited
- **Real-time NowPlaying widget** — polls Spotify's `currently-playing` and *promotes* track-end transitions into `ListeningEvent` rows immediately, closing the 30-90s lag in Spotify's `recently-played` indexer
- **First-login onboarding** — pick how to populate the dashboard:
  1. **Spotify Extended Streaming History ZIP** (most accurate, requires ~30-day request to Spotify)
  2. **Last.FM scrobble import** (instant, accurate, if the user already scrobbles)
  3. **Synthetic data engine** (instant, marked as estimate, replaced when real data arrives)
- **Demo mode** — anonymous visitors hit `/demo/start` and explore a populated dashboard backed by a pre-seeded public user, no Google/Spotify account required
- **Mobile-responsive** layout — masthead, tabs, charts, and lists all collapse correctly down to ~360px viewports
- **Vermilion 聴 favicon** that ties the brand identity to the in-app hanko stamp

---

## Architecture (current)

| Layer | Choice |
|---|---|
| Framework | Next.js 14 App Router (TypeScript), `output: 'standalone'` for Cloud Run |
| Auth | Auth.js v5 with Google provider, Postgres session strategy |
| Spotify access | Custom PKCE OAuth (Spotify is a linkable data source, not a login provider) |
| Database | Cloud SQL Postgres 15 (Unix socket via Cloud SQL Auth Proxy) |
| ORM | Prisma 5 |
| Cache + sync progress + Last.FM rate-limit | Upstash Redis (`rediss://`, TLS) |
| Periodic sync | Cloud Scheduler `*/15 * * * *` → Cloud Run `/api/tasks/sync-all` → enqueues per-user Cloud Tasks |
| Hosting | Cloud Run, scale-to-zero, custom domain `soundsage.dev` with managed SSL |
| Errors | Sentry (server + client) |
| Secrets | Google Secret Manager (mounted as env vars on Cloud Run) |
| CI/CD | `gcloud run deploy --source .` direct from local for now; GitHub Actions WIF wired but not always primary |

The repo is a single Next.js app — there is no separate backend service. Earlier scaffolding (`server/` directory referencing BullMQ + Express) is **deprecated** and not used by the deployed app.

---

## Schema (current)

```
User
  id (cuid)              email                onboardingCompletedAt
  name                   image                onboardingChoice    -- 'esh' | 'lastfm' | 'synthetic' | 'skip'
  prefs (json)           timezone             createdAt
  → spotify (1:1)
  → events (many ListeningEvent)
  → topTrackSnaps (many)
  → topArtistSnaps (many)

SpotifyAccount (1:1 with User)
  spotifyUserId          displayName       imageUrl
  accessToken (enc)      refreshToken (enc)
  expiresAt              scopes
  cursor                 lastSyncAt
  failureCount           needsReconnect

ListeningEvent
  userId, trackId, playedAt, msPlayed
  source: 'recently_played' | 'currently_playing' | 'extended_history' | 'lastfm_import' | 'synthetic'
  @@unique([userId, trackId, playedAt])
  @@index([userId, playedAt(sort: Desc)])

Track          id, name, artistNames[], artistIds[], albumName, albumId, imageUrl, durationMs
Artist         id, name, imageUrl, genres[], genresSynced
TopTrackSnapshot   userId, range ∈ {short_term, medium_term, long_term}, rank, trackId
TopArtistSnapshot  userId, range, rank, artistId
```

The `source` column is the audit trail that makes it safe to ingest real data later: every ESH/Last.FM import deletes synthetic events for that user before persisting its own.

---

## Local development

```bash
# 1. Boot local Postgres + Redis
docker compose up -d

# 2. Install deps + generate Prisma client
npm install
npx prisma generate

# 3. Run migrations against local DB
npx prisma migrate dev

# 4. Copy .env.example → .env.local and fill in values
#    Required: GOOGLE_CLIENT_ID/SECRET, SPOTIFY_CLIENT_ID/SECRET,
#    NEXTAUTH_SECRET, TOKEN_ENCRYPTION_KEY (openssl rand -base64 32),
#    DATABASE_URL, REDIS_URL, SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/auth/spotify/callback

# 5. Run dev server
npm run dev
# http://127.0.0.1:3000
```

---

## Operational scripts

Located in `scripts/`. Each runs against a `DATABASE_URL` you set in the shell, typically pointed at a local Cloud SQL Auth Proxy on `localhost:15433` for prod operations.

| Script | What it does |
|---|---|
| `seed-demo-user.mjs <sourceUserId>` | Copies snapshots + listening events from a real user into the public `demo-public-2026` account so anonymous visitors get a populated dashboard. |
| `regen-synthetic.mjs <userId>` | Re-runs the synthetic engine for one user and prints distribution diagnostics (top track share, top artist share, daily variance, hour-of-day histogram) to verify caps are holding. |
| `run-bootstrap.mjs <userId>` | One-off invocation of `bootstrapTopItems()` for diagnosis. |
| `count-snapshots.mjs` | Diagnostic — dumps snapshot row counts and Spotify account state. |
| `test-bootstrap.mjs` | Same as `run-bootstrap` but via the `tsx` subprocess pattern. |

Connect to prod DB:

```bash
# In one terminal
gcloud sql instances describe soundsage-prod --project=soundsage-prod --format='value(connectionName)'
cloud-sql-proxy <CONNECTION_NAME> --port 15433

# In another
DATABASE_URL="postgresql://soundsage:<DB_PASS>@localhost:15433/soundsage" \
  npx tsx scripts/regen-synthetic.mjs <userId>
```

---

## Deploy

```bash
gcloud run deploy soundsage-web --source . --region us-central1 --quiet
```

The Cloud Run service is already configured with all secrets mounted from Secret Manager and a Cloud SQL connection. Each `gcloud run deploy` builds a new container image, runs build-time `next build`, and rolls traffic to the new revision.

---

## Synthetic data engine (v4)

When a user picks "Estimate" in onboarding, `lib/synthetic-history.ts` generates a year of plausible listening events using a layered model:

1. **Daily intensity** — base rate × weekday × seasonal sine × weekly sine × mean-reverting mood walk × gaussian noise × random day-type events (8% quiet, 5% binge, 1% mega-binge), clamped at 75 plays/day
2. **Track lifecycles** — every track in the pool gets a peak day + sigma. Top short-term tracks peak in the last 28 days with tight 8-22 day sigma; long-term tracks peak 1-12 months ago with broad 50-130 day sigma
3. **Per-day track sampling** — for each day, sample N tracks weighted by `amplitude × gaussian_kernel(day - peak_day, sigma)`
4. **Hour-of-day** — 24-bucket fingerprint smoothed with circular gaussian (σ ≈ 1.6h), blended 75% generic / 25% user, three peaks (morning / lunch / evening)
5. **Completion** — 78% near-full, 17% partial, 5% skipped (≥30s)
6. **Caps** — per-track ≤ 4% of total plays, per-artist ≤ 38% (rejection sampling during step 3)
7. **Pool** — top tracks (3 ranges × 50) + top artists' top-tracks + saved tracks, ~180 unique items

Verification on the seeded demo user shows top-track share 2.04%, top-artist share 3.81%, daily distribution p10=17 / p50=37 / p90=75, three-peak hour curve.

---

## Demo mode internals

- `/demo/start` — sets `soundsage_demo=1` cookie (HttpOnly, SameSite=Lax, Secure, 30d) and redirects to `/`
- `/demo/exit` — deletes the cookie and redirects to `/`
- `lib/auth.ts` wraps NextAuth's `auth()` — when the demo cookie is present, returns a synthetic session pointing at `DEMO_USER_ID = 'demo-public-2026'`
- `requireAuth({ allowDemo: true })` opts read endpoints into demo support; the default rejects demo with 403
- The vermilion banner is server-rendered when `session.demo === true`
- **Important**: the demo banner's "Sign in to track your own" link uses a plain `<a>` rather than `next/link` because `<Link>` automatically prefetches its destination on render, which would silently fire `/demo/exit` and clear the cookie ~270ms after the page loaded.

---

## Documentation index

| Doc | Purpose |
|---|---|
| [SoundSage_Dev_Handoff.md](SoundSage_Dev_Handoff.md) | Original spec — design tokens, components, schema, API contracts, type system. Most still accurate; some sections superseded by post-launch additions described here. |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Original phased plan (Phases 1-7). All phases complete. |
| [PHASES.md](PHASES.md) | Detailed work breakdowns per phase. Historical reference. |
| [LAUNCH_RUNBOOK.md](LAUNCH_RUNBOOK.md) | Stage-by-stage ops checklist for first deploy. Stages 0-10 complete. |
| [PHASE_7_LAUNCH.md](PHASE_7_LAUNCH.md) | Phase 7 launch instructions. Live at soundsage.dev. |
