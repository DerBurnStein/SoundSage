# SoundSage — Engineering Handoff

> Production-implementation guide for the SoundSage listening-almanac dashboard.
> Source design: `SoundSage Dashboard.html` (+ `app.jsx`, `wave.jsx`, `tweaks-panel.jsx`)

---

## 1. Product summary

SoundSage is a personal listening-history dashboard. It pulls a user's plays from Spotify (and optionally other streaming services), stores them in a local database, and renders an editorial "almanac" view of their listening over selectable time ranges.

**Primary surfaces** (5 tabs in the masthead nav):

| Tab        | Purpose                                                     |
|------------|-------------------------------------------------------------|
| Overview   | Lede + KPIs + activity ribbon + hourly clock + top tracks/artists |
| History    | Chronological play log, filterable by date                  |
| Patterns   | Behavioral analytics (weekday/weekend, time-of-day, mood)   |
| Tracks     | Most-played tracks across multiple windows                  |
| Artists    | Most-played artists, discovery trail                        |

The dashboard is read-only — no playback, no library mutation. All write paths are limited to (a) OAuth state, (b) ingestion cursors, (c) user preferences (theme, density).

---

## 2. Tech stack recommendation

The HTML prototype is **React 18 + Babel-in-browser + inline JSX** for fast iteration. For production, port it to a real toolchain. Recommended:

- **Frontend**: Next.js 14+ (App Router) + TypeScript + Tailwind (or keep the existing CSS-variable theme; see §6).
- **Backend**: Next.js API routes for thin endpoints; a separate worker process for ingestion (BullMQ or Inngest).
- **Database**: PostgreSQL 15+ with `pg_partman` for `listening_events` time partitioning.
- **Cache / queue**: Redis (rate-limit buckets, ingestion jobs, OAuth state).
- **Auth**: Auth.js (NextAuth) with Spotify provider.
- **Hosting**: Vercel (web) + Fly.io / Railway (worker + Postgres) or single AWS ECS deployment.

If you prefer a non-Next stack: Remix or Vite + Express both work; the data model and endpoints below are framework-agnostic.

---

## 3. Repository layout

```
soundsage/
├── apps/
│   ├── web/                     # Next.js app (UI + API routes)
│   │   ├── app/
│   │   │   ├── (auth)/login/    # Spotify OAuth landing
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx   # Masthead, theme provider, tab shell
│   │   │   │   ├── page.tsx     # Overview tab
│   │   │   │   ├── history/page.tsx
│   │   │   │   ├── patterns/page.tsx
│   │   │   │   ├── tracks/page.tsx
│   │   │   │   └── artists/page.tsx
│   │   │   ├── api/
│   │   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   │   ├── stats/overview/route.ts
│   │   │   │   ├── stats/activity/route.ts
│   │   │   │   ├── stats/hourly/route.ts
│   │   │   │   ├── stats/genres/route.ts
│   │   │   │   ├── tracks/top/route.ts
│   │   │   │   ├── artists/top/route.ts
│   │   │   │   ├── history/recent/route.ts
│   │   │   │   ├── sync/status/route.ts
│   │   │   │   └── sync/trigger/route.ts
│   │   │   └── globals.css      # Theme variables (see §6)
│   │   ├── components/
│   │   │   ├── masthead/
│   │   │   ├── lede/
│   │   │   ├── charts/          # ActivityRibbon, HourlyClock, GenreBar
│   │   │   ├── lists/           # RankList, RecentStream
│   │   │   ├── motif/           # MotifRail, NorenBanner (from wave.jsx)
│   │   │   └── tweaks/          # TweaksPanel + form controls
│   │   └── lib/
│   │       ├── spotify/         # API client, token refresh
│   │       ├── db/              # Prisma client + queries
│   │       └── theme/           # subtheme tokens, CSS-var helpers
│   └── worker/                  # Ingestion worker (Node/Bun)
│       ├── jobs/
│       │   ├── backfill.ts
│       │   ├── incremental.ts
│       │   └── refreshTokens.ts
│       └── index.ts
├── packages/
│   └── shared/                  # zod schemas, types, constants
├── prisma/
│   └── schema.prisma
└── docker-compose.yml           # Postgres + Redis for local dev
```

---

## 4. Data model

```prisma
// prisma/schema.prisma

model User {
  id          String   @id @default(cuid())
  email       String?  @unique
  spotifyId   String   @unique
  displayName String?
  createdAt   DateTime @default(now())
  prefs       Json     @default("{\"theme\":\"paper\",\"density\":\"regular\"}")
  account     Account?
  events      ListeningEvent[]
}

model Account {
  userId       String   @id
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken  String   // encrypt at rest (see §9)
  refreshToken String
  expiresAt    DateTime
  scope        String
  cursor       DateTime?  // ingestion high-water mark
  lastSyncAt   DateTime?
  failureCount Int        @default(0)
}

model Track {
  id          String   @id            // Spotify URI, e.g. spotify:track:xxxx
  name        String
  durationMs  Int
  popularity  Int?
  audioFeatures Json?                 // valence, energy, tempo, etc.
  album       Album    @relation(fields: [albumId], references: [id])
  albumId     String
  artists     ArtistOnTrack[]
  events      ListeningEvent[]
  @@index([albumId])
}

model Artist {
  id        String   @id
  name      String
  genres    String[]
  imageUrl  String?
  tracks    ArtistOnTrack[]
}

model ArtistOnTrack {
  trackId  String
  artistId String
  position Int                        // 0 = primary
  track    Track  @relation(fields: [trackId], references: [id])
  artist   Artist @relation(fields: [artistId], references: [id])
  @@id([trackId, artistId])
  @@index([artistId])
}

model Album {
  id         String   @id
  name       String
  releaseDate String?
  imageUrl   String?
  tracks     Track[]
}

model ListeningEvent {
  id        BigInt   @id @default(autoincrement())
  userId    String
  trackId   String
  playedAt  DateTime
  msPlayed  Int?                      // null when only "recently-played" data
  context   String?                   // playlist URI, album URI, etc.
  source    String   @default("spotify")
  user      User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  track     Track @relation(fields: [trackId], references: [id])
  @@unique([userId, trackId, playedAt])     // dedupe key
  @@index([userId, playedAt(sort: Desc)])
}
// Partition listening_events BY RANGE (played_at) — month partitions
// via pg_partman. See migrations/.
```

**Why partition `listening_events`** — heavy users hit ~30k rows/month; queries are nearly always windowed by `played_at`. Partition pruning keeps the activity-ribbon and hourly-clock queries sub-100ms even at multi-year scale.

---

## 5. Spotify ingestion

### 5.1 OAuth scopes

Request: `user-read-recently-played`, `user-read-currently-playing`, `user-top-read`, `user-read-email`. Use Auth.js's Spotify provider. Encrypt refresh tokens at rest with AES-256-GCM keyed off an env secret.

### 5.2 Ingestion strategy

Spotify's `/me/player/recently-played` returns at most **50 plays** and only the **last 24 hours**. There is **no historical backfill API**. Plan:

1. **Initial connect** — pull `/me/player/recently-played?limit=50`, `/me/top/tracks?time_range=long_term`, `/me/top/artists?time_range=long_term`. Seed the `Track` / `Artist` / `Album` tables.
2. **Incremental poll** — every 15 minutes, per user, fetch recently-played with `?after=<cursor>` where cursor = max(`played_at`) we've stored. Insert new events, dedupe via the `(userId, trackId, playedAt)` unique index (PostgreSQL `ON CONFLICT DO NOTHING`).
3. **Audio features** — for any new track, batch-fetch `/audio-features?ids=...` (100 per call) and store on `Track.audioFeatures`. This powers the Patterns tab's mood clusters.
4. **Optional history seed** — let users upload a Spotify "Extended Streaming History" zip from their privacy-data export. Parse the JSON, dedupe against existing events.

### 5.3 Worker layout (BullMQ)

```ts
// apps/worker/jobs/incremental.ts
export const incrementalSync = new Queue('incremental-sync', { connection: redis });

new Worker('incremental-sync', async (job) => {
  const { userId } = job.data;
  const account = await db.account.findUnique({ where: { userId } });
  const token = await ensureFreshToken(account);

  const after = account.cursor?.getTime() ?? Date.now() - 24*3600*1000;
  const { items } = await spotify.recentlyPlayed({ token, after, limit: 50 });

  await db.$transaction([
    upsertTracksAndArtists(items),
    db.listeningEvent.createMany({
      data: items.map(toEvent),
      skipDuplicates: true,
    }),
    db.account.update({
      where: { userId },
      data: {
        cursor: maxPlayedAt(items),
        lastSyncAt: new Date(),
        failureCount: 0,
      },
    }),
  ]);
}, { connection: redis, concurrency: 8 });

// Repeatable scheduler
incrementalSync.add('all-users', {}, {
  repeat: { every: 15 * 60 * 1000 },
});
```

A scheduler job runs every 15 min and enqueues one incrementalSync per active user. Stagger by hashing userId to a minute slot so we don't thundering-herd Spotify.

### 5.4 Rate limiting

Spotify allows ~180 req/min per app. Centralize all calls through a token-bucket in Redis (`spotify:bucket`) with refill 3/sec. On HTTP 429 honor `Retry-After`. After 5 consecutive failures, set `Account.failureCount` and back off exponentially (15min → 30 → 1h → 4h → daily).

---

## 6. Theming — the per-tab subthemes

The dashboard ships **5 subthemes**, one per tab, each repainting the page via CSS variables. Lift the variable blocks out of `SoundSage Dashboard.html` into `globals.css` verbatim — the design tokens are the contract.

```ts
// lib/theme/ThemeProvider.tsx
'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const TAB_FROM_PATH: Record<string, string> = {
  '/': 'overview',
  '/history':  'history',
  '/patterns': 'patterns',
  '/tracks':   'tracks',
  '/artists':  'artists',
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  useEffect(() => {
    document.documentElement.dataset.tab = TAB_FROM_PATH[path] ?? 'overview';
  }, [path]);
  return <>{children}</>;
}
```

User-level prefs (`theme: paper | midnight`, `density: compact | regular | roomy`, `accent`) live on `User.prefs` and are pushed onto `<html data-theme>` / `<html data-density>` from a server component so first paint is correct (no flash-of-unstyled-content).

**Fonts** — use `next/font/google`:

```ts
import { Inter, JetBrains_Mono, Shippori_Mincho, Noto_Serif_JP } from 'next/font/google';
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono  = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });
const mincho = Shippori_Mincho({ subsets: ['latin'], weight: ['500','700'], variable: '--font-mincho' });
const notoJp = Noto_Serif_JP({ subsets: ['latin'], weight: ['500','700'], variable: '--font-noto-jp' });
```

---

## 7. API contract

All endpoints return JSON. All accept `?range=24h|7d|4w|6m|1y|all`. Authenticate via the session cookie; respond 401 if absent.

```ts
// GET /api/stats/overview?range=4w
{
  totalPlays: 3421,
  uniqueTracks: 2184,
  totalMs: 98320000,
  topHour: 21,                   // 0-23
  newArtists: 24,
  discoveryRate: 0.08,
  range: { from: '2026-04-03T00:00:00Z', to: '2026-05-01T00:00:00Z' }
}

// GET /api/stats/activity?range=4w&grain=day
{ buckets: [{ t: '2026-04-03', plays: 47, mins: 152 }, ...] }

// GET /api/stats/hourly?range=4w
{ buckets: Array<{ hour: 0..23, plays: number }> }   // length 24

// GET /api/stats/genres?range=4w&limit=8
{ genres: [{ name: 'ambient', plays: 482, share: 0.14 }, ...] }

// GET /api/tracks/top?range=4w&limit=20
{ tracks: [{ id, name, artists: [{id,name}], album: {id,name,imageUrl}, plays, lastPlayedAt }, ...] }

// GET /api/artists/top?range=4w&limit=20
{ artists: [{ id, name, imageUrl, plays, uniqueTracks }, ...] }

// GET /api/history/recent?cursor=<iso>&limit=50
{ events: [{ id, playedAt, track: {...} }], nextCursor: '2026-04-29T18:14:00Z' }

// GET /api/sync/status
{ lastSyncAt, cursor, lag: 'fresh'|'stale', failureCount, tokens: 'fresh'|'expiring'|'expired' }

// POST /api/sync/trigger
{ jobId: 'job_xyz' }    // 202 — enqueues an incrementalSync
```

Validate query params with **zod** in shared package; reuse the schemas client-side for fetcher typing.

---

## 8. Query patterns

The dashboard is read-heavy. Materialize the expensive aggregates rather than computing them per request.

- **`mv_user_daily_stats`** — refresh hourly via `pg_cron`. Columns: `user_id, day, plays, unique_tracks, total_ms, top_hour`.
- **`mv_user_genre_share`** — refresh nightly. Columns: `user_id, genre, plays_4w, plays_6m, plays_all`.
- **Top-N tracks/artists** — compute live on a partitioned scan; with the `(user_id, played_at)` index it's fast for ranges ≤ 6 months. For "all-time" hit the materialized view.

Cache API responses in Redis with key `stats:{userId}:{endpoint}:{range}` and TTL = 5 min for live ranges, 1 hour for historical.

---

## 9. Security checklist

- Encrypt `Account.refreshToken` at rest (AES-256-GCM, key from KMS or env).
- HTTPS everywhere; HSTS preload.
- Rotate session secret + token-encryption key independently.
- CSP: `default-src 'self'; img-src 'self' i.scdn.co; font-src 'self' data:; script-src 'self'`.
- Rate-limit `POST /api/sync/trigger` to 1/min per user.
- Never log raw access/refresh tokens. Redact in error reporting.
- DSR / GDPR: provide `DELETE /api/account` that purges User + cascades to all events.

---

## 10. Observability

- Structured logs (pino) with `userId`, `jobId`, `endpoint`, `latencyMs`.
- Metrics (OpenTelemetry → Grafana / Datadog):
  - `ingest_events_total{user, source}`
  - `ingest_lag_seconds` (now − cursor)
  - `spotify_429_total`, `spotify_5xx_total`
  - `api_request_duration_seconds{route}`
- Alert on: ingestion lag > 1h for >5% of users, 429 rate > 10/min, refresh-token failure spike.

---

## 11. Component porting notes

When porting `app.jsx` → `components/`:

| Source component   | Target file                           | Notes |
|--------------------|---------------------------------------|-------|
| `Masthead`         | `components/masthead/Masthead.tsx`    | Replace `useState('overview')` with Next router; nav becomes `<Link>` |
| `Lede`             | `components/lede/Lede.tsx`            | Driven by `/api/stats/overview` |
| `StatStrip`        | `components/lede/StatStrip.tsx`       | Same data source |
| `ActivityRibbon`   | `components/charts/ActivityRibbon.tsx`| Driven by `/api/stats/activity` |
| `HourlyClock`      | `components/charts/HourlyClock.tsx`   | Driven by `/api/stats/hourly` |
| `GenreBar`         | `components/charts/GenreBar.tsx`      | Driven by `/api/stats/genres` |
| `RankList`         | `components/lists/RankList.tsx`       | Generic — feed it tracks or artists |
| `RecentStream`     | `components/lists/RecentStream.tsx`   | Driven by `/api/history/recent` (paginated) |
| `SyncCard`         | `components/admin/SyncCard.tsx`       | Driven by `/api/sync/status`; admin-only or behind a settings flag |
| `MotifRail`        | `components/motif/MotifRail.tsx`      | Pure SVG, no data — keep as-is |
| `NorenBanner`      | `components/motif/NorenBanner.tsx`    | Pure presentational — keep as-is |
| `TweaksPanel`      | DROP for production                   | Replace with a real Settings page |

Wrap each data-driven component with **React Query** (`@tanstack/react-query`) — `useQuery(['stats','overview',range], fetchOverview)`. Set `staleTime: 5*60*1000` to match the cache TTL. Show a subtle skeleton (1px hatched rule + dim text) on loading; the design has space for it.

---

## 12. Testing

- **Unit**: zod schemas, dedupe logic, token refresh, rate limiter.
- **Integration**: spin up Postgres + Redis in CI; run ingestion against a fixture Spotify response (record real responses via `nock`).
- **E2E**: Playwright. Smoke test = login → dashboard renders → switch tabs → subtheme repaints. Snapshot the masthead + lede per tab.
- **Visual regression**: Chromatic or Percy on the per-tab pages with seeded fixture data.

---

## 13. Deployment

```
# .env (production)
DATABASE_URL=postgres://...
REDIS_URL=rediss://...
NEXTAUTH_URL=https://soundsage.app
NEXTAUTH_SECRET=...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
TOKEN_ENCRYPTION_KEY=base64-32-bytes
SENTRY_DSN=...
```

CI: GitHub Actions → lint, typecheck, test, prisma migrate, deploy. Web → Vercel. Worker → separate Fly.io app with a single process; scale by user count (rule of thumb: 1 worker per ~5k active users).

---

## 14. Phased rollout

1. **Phase 1 — auth + ingestion** (1 week). Spotify OAuth, schema, incremental worker, no UI beyond a sync-status page.
2. **Phase 2 — Overview tab** (1 week). Lede, StatStrip, ActivityRibbon, top tracks/artists.
3. **Phase 3 — remaining tabs + subthemes** (1 week). History, Patterns, Tracks, Artists, MotifRail, NorenBanner.
4. **Phase 4 — polish** (1 week). Settings, theme prefs, history-zip import, observability, error states.
5. **Phase 5 — beyond Spotify** (optional). Apple Music, Last.fm scrobble import, multi-account merge.

---

## 15. Known gotchas

- Spotify's `played_at` truncates to seconds; the unique index works but be careful joining on it.
- "Currently playing" plays may overlap with "recently played" — the unique key dedupes them.
- `audio-features` is missing for some local files / podcasts. Default null and skip in mood clusters.
- Time-range labels in the UI ("4 weeks") map to inclusive day boundaries in user's tz, not UTC. Store user `timezone` and pass through every stats query.
- Daylight-saving transitions create 23h/25h days in the activity ribbon — render them honestly, don't normalize.

---

End of handoff. Reference files in this project: `SoundSage Dashboard.html`, `app.jsx`, `wave.jsx`, `tweaks-panel.jsx`. The HTML prototype is the visual spec; this document is the implementation spec.
