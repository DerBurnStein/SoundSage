# SoundSage — Developer Handoff

> **Design reference:** `SoundSage Dashboard.html`
> **Scaffold files:** `handoff/` folder
> **Framework:** Next.js 14+ · TypeScript · CSS Variables
> **Date:** May 2026

---

## Status — 2026-05-05

**This document is the original design + spec handoff. Most of it is still accurate** — the design tokens, component vocabulary, schema philosophy, and tab subthemes shipped almost verbatim. A handful of sections have been superseded or extended by post-launch work; this banner flags those so a reader doesn't follow stale guidance.

**Currency map**:

| Section | Status | Notes |
|---|---|---|
| §1 Overview, §2 Tech Stack, §4 Design Tokens, §6 Tab Subthemes | ✅ Current | Implemented as designed. |
| §3 Repository Layout | ⚠️ Partly stale | `server/` directory is deprecated — there is no separate Express/BullMQ backend; the app is a single Next.js project. |
| §5 Components | ⚠️ Mostly current | Originally planned `ConnectionPill` split into `AccountPill` + `SpotifyPill` was never executed; one component proved sufficient. New components added post-launch: `OnboardingModal`, `DemoBanner`. |
| §7 Data Schema | ⚠️ Extended | Added `TopTrackSnapshot`, `TopArtistSnapshot`, `User.onboardingCompletedAt`, `User.onboardingChoice`, `SpotifyAccount.needsReconnect`, `SpotifyAccount.failureCount`. The `ListeningEvent.source` enum now includes `synthetic`, `lastfm_import`, `currently_playing` alongside the original `recently_played` and `extended_history`. |
| §8 Spotify Ingestion | ⚠️ Extended | Two new ingestion paths added: real-time `currently-playing` → `ListeningEvent` promotion (closes Spotify's 30-90s indexer lag), and Spotify Top Items bootstrap on connect (populates `TopTrackSnapshot` / `TopArtistSnapshot`). Last.FM scrobble import (`/api/import/lastfm`) and synthetic data generator (`/api/import/synthetic`) are also new. |
| §9 API Routes | ⚠️ Extended | Added: `/api/listening/promote`, `/api/import/lastfm[+/status]`, `/api/import/synthetic`, `/api/onboarding/state`, `/api/sync/progress`, `/api/sync/activity`. |
| §10 Auth Setup, §11 Next.js Wiring, §12 Data Fetching | ✅ Current | Implemented as designed. |
| §13 Phased Rollout (4 weeks) | ❌ Superseded | See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — the 4-week sketch was unrealistic; actual delivery was ~2 weeks of focused work to live + ongoing feature work. |
| §14 Gotchas | ⚠️ Extended | Production-discovered gotchas (cookie-on-redirect, Link prefetch, sticky vs overflow, Spotify Dev Mode 403) live in [PHASE_7_LAUNCH.md → Notable production gotchas](PHASE_7_LAUNCH.md) and [LAUNCH_RUNBOOK.md → §11.9](LAUNCH_RUNBOOK.md). |

For the current architecture in one place, see [README.md](README.md). For ops procedures see [LAUNCH_RUNBOOK.md → §11 Post-launch operations](LAUNCH_RUNBOOK.md).

The original handoff continues below.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Repository Layout](#3-repository-layout)
4. [Design Tokens](#4-design-tokens)
5. [Components](#5-components)
6. [Tab Subthemes](#6-tab-subthemes)
7. [Data Schema](#7-data-schema)
8. [Spotify Ingestion](#8-spotify-ingestion)
9. [API Routes](#9-api-routes)
10. [Auth Setup](#10-auth-setup)
11. [Next.js Wiring](#11-nextjs-wiring)
12. [Data Fetching](#12-data-fetching)
13. [Phased Rollout](#13-phased-rollout)
14. [Gotchas & Notes](#14-gotchas--notes)

---

## 1. Overview

SoundSage is a **read-only** personal listening-history dashboard. It pulls play data from Spotify, stores it in PostgreSQL, and renders an editorial "almanac" view. There is no playback, no library mutation — only reading and displaying what the user has listened to.

### Five tabs, five subthemes

| Tab | Path | Kanji | Theme palette | Primary content |
|---|---|---|---|---|
| Overview | `/` | — | Washi cream + vermilion | Lede, KPIs, charts, top tracks/artists |
| History | `/history` | 歴 | Prussian blue + gold | Chronological play log |
| Patterns | `/patterns` | 型 | Sakura rose + plum | Behavioral analytics, mood clusters |
| Tracks | `/tracks` | 曲 | Kraft paper + torii red | Full track rankings, multiple time windows |
| Artists | `/artists` | 師 | Gold leaf on lacquer black | Artist rankings, discovery trail |

### Aesthetic vocabulary

The design draws from East Asian print traditions: washi paper, sumi ink, vermilion seal stamps (hanko), cloud bands (kumo), bamboo, sakura, torii gates, and seigaiha (overlapping arc) textile patterns.

**Typography:**
- `Shippori Mincho` + `Noto Serif JP` — display, editorial headlines, kanji accents
- `Inter` — UI labels, body copy, buttons
- `JetBrains Mono` — data values, timestamps, axis ticks, metadata

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend framework | Next.js 14+ (App Router) | Server components for data; Client for interactivity |
| Language | TypeScript | All scaffold files are `.tsx` / `.ts` |
| Styling | CSS variables in `globals.css` | No CSS-in-JS, no Tailwind required |
| Data fetching | React Query + `fetch` | `QUERY_KEYS` from `lib/api.ts` |
| Auth | Auth.js (NextAuth v5) + Spotify provider | See §10 |
| Database | PostgreSQL 15+ + Prisma | Schema in §7 |
| Cache / queue | Redis (Upstash or self-hosted) | Rate limiting + ingestion job queue |
| Worker | BullMQ (or Inngest) | Incremental Spotify sync every 15 min |
| Hosting | Vercel (web) + Fly.io / Railway (worker + DB) | Or any Docker environment |

> **Note:** Scaffold files use no framework-specific imports except Next.js `Link`, `usePathname`, `useRouter`, and `useSearchParams`. If you prefer Remix or Vite + React Router, swap those four imports — the rest is identical.

---

## 3. Repository Layout

```
your-app/
└── src/
    ├── globals.css                        ← copy from handoff/globals.css
    ├── types/index.ts                     ← copy from handoff/types.ts
    ├── components/
    │   ├── primitives.tsx                 Rule, Caps, Mono, Display, helpers
    │   ├── Masthead.tsx                   Sticky header, nav, time-range picker
    │   ├── ConnectionPill.tsx             Spotify auth state in header
    │   ├── ThemeProvider.tsx              Sets data-theme / data-tab on <html>
    │   ├── SyncCard.tsx                   Ingestion pipeline status + trigger
    │   ├── charts/
    │   │   ├── ActivityRibbon.tsx         Daily bar chart
    │   │   ├── HourlyClock.tsx            24-hour radial chart
    │   │   └── GenreBar.tsx               Stacked genre bar + legend
    │   ├── lists/
    │   │   ├── RankList.tsx               TrackRankList + ArtistRankList
    │   │   └── RecentStream.tsx           Timeline of recent plays
    │   └── motif/
    │       ├── MotifRail.tsx              Per-tab decorative SVG band
    │       └── NorenBanner.tsx            Noren curtain tab header
    ├── lib/
    │   ├── api.ts                         Typed fetch wrappers + React Query keys
    │   ├── auth.ts                        Auth.js config — you write this
    │   └── db.ts                          Prisma client singleton — you write this
    └── app/
        ├── layout.tsx                     Mount ThemeProvider + Masthead
        ├── page.tsx                       Overview tab
        ├── history/page.tsx
        ├── patterns/page.tsx
        ├── tracks/page.tsx
        ├── artists/page.tsx
        └── api/
            ├── auth/[...nextauth]/route.ts
            ├── stats/{overview,activity,hourly,genres,weekly}/route.ts
            ├── tracks/top/route.ts
            ├── artists/top/route.ts
            ├── history/recent/route.ts
            └── sync/{status,trigger}/route.ts
```

---

## 4. Design Tokens

All styling is driven by CSS custom properties on `:root`. **Never hardcode hex values in components** — always use a token. Full token set is in `globals.css`.

### Core palette (paper / washi theme)

| Token | Value | Meaning |
|---|---|---|
| `--paper` | `#f0e8d6` | Page background — washi / kinari |
| `--paper-2` | `#e6dcc4` | Card / surface background |
| `--paper-3` | `#d8cbab` | Active state, progress track |
| `--rule` | `#1a1815` | Borders, dividers, axis lines |
| `--ink` | `#14120e` | Primary text, bars, filled elements |
| `--muted` | `#6b6450` | Secondary text, labels |
| `--dim` | `#948c75` | Tertiary text, axis ticks |
| `--seal` | `#c1272d` | Primary accent — vermilion hanko stamp |
| `--moss` | `#5a7a5a` | Positive / growth indicators |
| `--ember` | `#c1272d` | Peak highlights, #1 rank |
| `--gold` | `#b08840` | Warnings, delta labels |
| `--sky` | `#345876` | Links, aizome indigo |

### Font tokens

| Token | Family | Used for |
|---|---|---|
| `--font-sans` | Inter | UI labels, body, buttons |
| `--font-mono` | JetBrains Mono | Data, metadata, timestamps |
| `--font-serif` | Noto Serif JP | Section headings, rank numerals |
| `--font-mincho` | Shippori Mincho | Display headlines, italic text, kanji |

When using `next/font/google`, match variable names to these tokens:

```ts
const inter  = Inter({ subsets: ['latin'], variable: '--font-sans' });
const mono   = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });
const notoJp = Noto_Serif_JP({ subsets: ['latin'], weight: ['500','700'], variable: '--font-serif' });
const mincho = Shippori_Mincho({ subsets: ['latin'], weight: ['500','700'], variable: '--font-mincho' });
```

---

## 5. Components

All scaffold components are **props-driven with no internal data fetching** (exceptions: `ConnectionPill` reads NextAuth session; `SyncCard` calls the sync API). Pass data down from page-level server or client components.

### Component inventory

| Component | File | Props | Notes |
|---|---|---|---|
| `Rule` | `primitives.tsx` | `thick?`, `dashed?` | Horizontal divider |
| `Caps` | `primitives.tsx` | `children` | Uppercase kicker with 2px vertical-rule prefix |
| `Mono` | `primitives.tsx` | `children`, `style?` | Tabular-numeral monospace span |
| `Display` | `primitives.tsx` | `size`, `weight`, `italic?` | Large editorial serif; italic → Shippori Mincho |
| `Masthead` | `Masthead.tsx` | `today: string` | Sticky header; reads route via `usePathname` |
| `ConnectionPill` | `ConnectionPill.tsx` | — | Reads `useSession()`; shows sign-in or avatar |
| `ThemeProvider` | `ThemeProvider.tsx` | `theme?`, `density?` | Sets `data-*` attrs on `<html>` |
| `ActivityRibbon` | `charts/ActivityRibbon.tsx` | `data: ActivityBucket[]` | SVG bar chart; hover state; peak annotation |
| `HourlyClock` | `charts/HourlyClock.tsx` | `data: HourlyBucket[24]` | 24-wedge radial; centre readout on hover |
| `GenreBar` | `charts/GenreBar.tsx` | `data: GenreStat[]` | Stacked bar + 3-col legend grid |
| `TrackRankList` | `lists/RankList.tsx` | `items: TopTrack[]` | #1 highlighted in `--ember` |
| `ArtistRankList` | `lists/RankList.tsx` | `items: TopArtist[]` | Same shell as TrackRankList |
| `RecentStream` | `lists/RecentStream.tsx` | `events: RecentEvent[]` | Dashed rail, dot markers, relative timestamps |
| `SyncCard` | `SyncCard.tsx` | — | Fetches `/api/sync/status`; POST trigger |
| `MotifRail` | `motif/MotifRail.tsx` | `tab: TabId` | Clouds / bamboo / sakura / torii / seigaiha |
| `NorenBanner` | `motif/NorenBanner.tsx` | `kanji`, `title`, `subtitle` | Vermilion noren curtain header |

### Skeleton states

Every data-driven component renders a skeleton when `loading={true}` or `data` is empty. Uses `var(--paper-2)` rectangles — no third-party library needed.

---

## 6. Tab Subthemes

`ThemeProvider` sets `data-tab` on `<html>` whenever the route changes. Each tab has its own CSS variable overrides in `globals.css`. A 0.35s transition on all color properties creates a smooth crossfade between tabs.

```css
/* In globals.css */
[data-tab="history"] {
  --paper:  #e8ecec;
  --ink:    #0b2545;   /* Prussian blue becomes the ink */
  --seal:   #0b2545;
  --ember:  #d4a017;   /* Gold accent replaces vermilion */
}
```

```ts
// ThemeProvider sets this on route change
document.documentElement.dataset.tab = 'history';
```

### Subtheme palette summary

| Tab | `--paper` | `--ink` | `--seal` | `--ember` | Mood |
|---|---|---|---|---|---|
| Overview | `#f0e8d6` | `#14120e` | `#c1272d` | `#c1272d` | Washi cream |
| History | `#e8ecec` | `#0b2545` | `#0b2545` | `#d4a017` | Prussian blue |
| Patterns | `#fbe8e7` | `#3a1422` | `#c8456c` | `#a83d5d` | Sakura rose |
| Tracks | `#f5e6d3` | `#1f110a` | `#b8341f` | `#b8341f` | Kraft/torii |
| Artists | `#1a1612` | `#f0dca8` | `#d4a017` | `#c1272d` | Lacquer/gold |

> ⚠️ **Artists tab** uses a very dark `--paper` (`#1a1612`). Any component that hardcodes a light background will visually break on this tab. Always use `var(--paper)` — never a literal hex.

---

## 7. Data Schema

Full Prisma schema is included in the scaffold. Key models:

```prisma
model User {
  id          String   @id @default(cuid())
  spotifyId   String   @unique
  displayName String?
  prefs       Json     @default("{\"theme\":\"paper\",\"density\":\"regular\"}")
  account     Account?
  events      ListeningEvent[]
}

model Account {
  userId       String   @id
  accessToken  String   // encrypt at rest
  refreshToken String
  expiresAt    DateTime
  cursor       DateTime?  // ingestion high-water mark
  lastSyncAt   DateTime?
  failureCount Int        @default(0)
}

model ListeningEvent {
  id        BigInt   @id @default(autoincrement())
  userId    String
  trackId   String
  playedAt  DateTime
  msPlayed  Int?
  // Dedupe key — prevents double-ingestion:
  @@unique([userId, trackId, playedAt])
  @@index([userId, playedAt(sort: Desc)])
}
```

### Performance: partition `listening_events`

Use `pg_partman` to partition by month on `played_at`. Heavy users hit ~30k rows/month; windowed queries (last 4 weeks, last 6 months) benefit from partition pruning. The compound index `(userId, played_at DESC)` is the primary query path for all stats.

---

## 8. Spotify Ingestion

### Required scopes

```ts
const SCOPES = [
  'user-read-recently-played',
  'user-read-currently-playing',
  'user-top-read',
  'user-read-email',
].join(' ');
```

### Incremental sync (run every 15 min per user)

```ts
async function incrementalSync(userId: string) {
  const account = await db.account.findUnique({ where: { userId } });
  const token   = await ensureFreshToken(account);

  const after   = account.cursor?.getTime() ?? Date.now() - 86_400_000;
  const { items } = await spotify.recentlyPlayed({ token, after, limit: 50 });

  await db.$transaction([
    upsertTracksAndArtists(items),
    db.listeningEvent.createMany({ data: items.map(toEvent), skipDuplicates: true }),
    db.account.update({ where: { userId }, data: { cursor: maxPlayedAt(items) } }),
  ]);
}
```

> ⚠️ **Spotify's recently-played API returns at most 50 plays and only the last 24 hours.** There is no historical backfill endpoint. Encourage users to upload their Spotify Extended Streaming History zip (from Spotify's privacy portal) to populate historical data.

### Rate limiting

- ~180 req/min per app across all users
- Centralize calls through a Redis token-bucket: 3 tokens/sec, burst 30
- On HTTP 429: honor `Retry-After` header
- After 5 consecutive failures: exponential backoff (15m → 30m → 1h → 4h → 24h), set `Account.failureCount`

### Token refresh

```ts
async function ensureFreshToken(account: Account) {
  // Refresh 5 min before expiry
  if (account.expiresAt > new Date(Date.now() + 5 * 60_000)) {
    return account.accessToken;
  }
  const fresh = await refreshSpotifyToken(account.refreshToken);
  await db.account.update({ where: { userId: account.userId }, data: { ...fresh } });
  return fresh.accessToken;
}
```

---

## 9. API Routes

All routes live under `app/api/`. All accept `?range=24h|7d|4w|6m|1y|all`. Authenticate via session cookie — return 401 if missing.

| Method | Route | Returns | Used by |
|---|---|---|---|
| GET | `/api/stats/overview?range=` | `OverviewStats` | Lede, StatStrip |
| GET | `/api/stats/activity?range=&grain=` | `ActivityStats` | ActivityRibbon |
| GET | `/api/stats/hourly?range=` | `HourlyStats` (24 buckets) | HourlyClock |
| GET | `/api/stats/genres?range=&limit=` | `GenreStats` | GenreBar |
| GET | `/api/stats/weekly` | `WeeklySpark` (12 weeks) | WeeklySpark chart |
| GET | `/api/tracks/top?range=&limit=` | `TopTracksResponse` | TrackRankList |
| GET | `/api/artists/top?range=&limit=` | `TopArtistsResponse` | ArtistRankList |
| GET | `/api/history/recent?cursor=&limit=` | `RecentHistoryResponse` | RecentStream |
| GET | `/api/sync/status` | `SyncStatus` | SyncCard |
| POST | `/api/sync/trigger` | `{ jobId }` | SyncCard button |

All response shapes are typed in `handoff/types.ts`.

### Caching

Cache all GET responses in Redis:
- Key: `stats:{userId}:{endpoint}:{range}`
- TTL: 5 min for recent ranges (`4w`, `7d`), 1 hour for historical (`6m`, `1y`, `all`)
- Invalidate on sync completion

---

## 10. Auth Setup

```ts
// app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import SpotifyProvider from 'next-auth/providers/spotify';

export const { handlers, auth } = NextAuth({
  providers: [
    SpotifyProvider({
      clientId:     process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: { params: { scope: SCOPES } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        // Persist encrypted tokens to DB
        await persistAccount(token.sub!, account);
      }
      return token;
    },
    async session({ session, token }) {
      session.userId = token.sub;
      return session;
    },
  },
});
```

> ⚠️ **Encrypt refresh tokens at rest** using AES-256-GCM keyed from `TOKEN_ENCRYPTION_KEY` env var. Never store plaintext tokens. Never log them.

### Required environment variables

```env
DATABASE_URL=postgres://...
REDIS_URL=rediss://...
NEXTAUTH_URL=https://soundsage.app
NEXTAUTH_SECRET=...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
TOKEN_ENCRYPTION_KEY=base64-32-bytes
```

---

## 11. Next.js Wiring

### Root layout

```tsx
// app/layout.tsx
import { auth }          from '@/lib/auth';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Masthead }      from '@/components/Masthead';
import '@/globals.css';

export default async function RootLayout({ children }) {
  const session = await auth();
  const prefs   = session?.user?.prefs ?? {};
  const today   = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  return (
    <html lang="en">
      <body>
        <ThemeProvider theme={prefs.theme} density={prefs.density}>
          <Masthead today={today} />
          <main>{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### Overview page (server component)

```tsx
// app/page.tsx
import { fetchOverview, fetchActivity, fetchHourly, fetchGenres,
         fetchTopTracks, fetchTopArtists, fetchRecent } from '@/lib/api';
import { MotifRail }      from '@/components/motif/MotifRail';
import { ActivityRibbon } from '@/components/charts/ActivityRibbon';
// ...etc

export default async function OverviewPage({ searchParams }) {
  const range = searchParams.range ?? '4w';
  const [overview, activity, hourly, genres, tracks, artists, recent] =
    await Promise.all([
      fetchOverview(range),
      fetchActivity(range),
      fetchHourly(range),
      fetchGenres(range),
      fetchTopTracks(range, 8),
      fetchTopArtists(range, 6),
      fetchRecent(),
    ]);

  return (
    <>
      <MotifRail tab="overview" />
      <ActivityRibbon data={activity.buckets} />
      <HourlyClock data={hourly.buckets} />
      <GenreBar data={genres.genres} />
      <TrackRankList title="Most-played tracks" kicker="Top 八 — last 4 weeks" items={tracks.tracks} />
      <ArtistRankList title="Most-played artists" kicker="Top 六 — last 4 weeks" items={artists.artists} />
    </>
  );
}
```

### Non-overview tab pages

```tsx
// app/history/page.tsx
import { NorenBanner } from '@/components/motif/NorenBanner';
import { MotifRail }   from '@/components/motif/MotifRail';

export default async function HistoryPage({ searchParams }) {
  const events = await fetchRecent();
  return (
    <>
      <MotifRail tab="history" />
      <NorenBanner kanji="歴" title="Listening History" subtitle="Section · history" />
      <RecentStream events={events.events} />
    </>
  );
}
```

---

## 12. Data Fetching

Use **server components** for initial render (no loading flash). Use **React Query** on the client only for components needing live updates.

### React Query (client)

```ts
// SyncCard — live polling every 30s
const { data: status } = useQuery({
  queryKey:       QUERY_KEYS.syncStatus(),
  queryFn:        fetchSyncStatus,
  refetchInterval: 30_000,
  staleTime:      25_000,
});

// History — infinite scroll
const { data, fetchNextPage } = useInfiniteQuery({
  queryKey:         QUERY_KEYS.recent(),
  queryFn:          ({ pageParam }) => fetchRecent(pageParam),
  getNextPageParam: (last) => last.nextCursor,
});
```

### Server-side revalidation (App Router)

```ts
// 5-minute ISR on stats endpoints
const r = await fetch(url, { next: { revalidate: 300 } });
```

---

## 13. Phased Rollout

| Phase | 一 | 二 | 三 | 四 |
|---|---|---|---|---|
| **Week** | 1 | 2 | 3 | 4 |
| **Focus** | Auth + Ingestion | Overview Tab | All Tabs + Subthemes | Polish + Production |
| **Deliverables** | Spotify OAuth, schema, migrations, worker, `/api/sync/status` | Masthead, Lede, StatStrip, all charts, top lists | History/Patterns/Tracks/Artists pages, MotifRail, NorenBanner, subtheme CSS | User prefs, SyncCard, error boundaries, skeletons, observability, GDPR delete |

---

## 14. Gotchas & Notes

### Spotify API limits

- `recently-played` returns **max 50 items, past 24h only** — not a history API
- `played_at` truncates to seconds — fine for the unique index
- "Currently playing" and "recently played" can overlap — the `@@unique` constraint dedupes silently via `skipDuplicates: true`
- Audio features are missing for local files, podcasts, and some markets — default to `null`, skip in mood-cluster logic

### Timezone handling

Store user `timezone` (IANA string, e.g. `America/New_York`) and pass it through every stats query. The activity-ribbon "busiest day" and the hourly-clock "peak hour" must be in **local time**, not UTC. DST transitions create 23h/25h days — render them honestly, do not normalize.

### Artists tab dark theme

The Artists subtheme sets `--paper: #1a1612` (very dark). All scaffold components use `var(--paper)` correctly. If you add any new component that hardcodes a light background color, it will visually break on the Artists tab only — watch for it in QA.

### Preventing theme-transition flash on first load

`globals.css` applies a 0.35s color transition to all elements. This can cause a flicker on initial load as values transition from browser defaults. Suppress it:

```ts
// In ThemeProvider, after setting data-tab:
document.documentElement.classList.add('no-transitions');
requestAnimationFrame(() => {
  document.documentElement.classList.remove('no-transitions');
});
```

```css
/* In globals.css */
.no-transitions * { transition: none !important; }
```

### Security checklist

- Encrypt `Account.refreshToken` at rest (AES-256-GCM, key from env/KMS)
- HTTPS everywhere, HSTS preload
- CSP: `default-src 'self'; img-src 'self' i.scdn.co; font-src 'self' data:; script-src 'self'`
- Rate-limit `POST /api/sync/trigger` to 1/min per user via Redis
- Never log raw access/refresh tokens; redact in error reporters
- Provide `DELETE /api/account` for GDPR right-to-erasure — cascade deletes all events

### Observability (recommended)

Structured logs (pino) with `userId`, `jobId`, `endpoint`, `latencyMs`. Key metrics:
- `ingest_events_total{userId, source}`
- `ingest_lag_seconds` (now − cursor)
- `spotify_429_total`, `spotify_5xx_total`
- `api_request_duration_seconds{route}`

Alert on: ingestion lag > 1h for >5% of users, 429 rate > 10/min, refresh-token failure spike.

---

*SoundSage · Developer Handoff · 2026*  
*Design reference: `SoundSage Dashboard.html` · Scaffold: `handoff/` folder*
