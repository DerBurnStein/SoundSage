// Generates realistic-looking demo listening data using your REAL Spotify
// library. Track metadata (names, artwork, durations, genres) all comes from
// Spotify itself; only the play timestamps are synthesized.
//
// Run with `tsx`:
//   npx tsx scripts/seed-from-spotify.ts <userId> [eventCount=5000] [daysBack=365]
//
// Examples:
//   # Default: 5000 events over the past year for the given user
//   npx tsx scripts/seed-from-spotify.ts cmoowp1gs0000mzbf6i9nto50
//
//   # Heavier listener: 15000 events over 2 years
//   npx tsx scripts/seed-from-spotify.ts cmoowp1gs0000mzbf6i9nto50 15000 730
//
// Requirements:
//   - User must be signed in and have connected Spotify (so we have a valid token)
//   - Postgres + Redis must be running (the existing dev compose stack)
//
// To undo:
//   docker exec soundsage-postgres-1 psql -U postgres -d soundsage \
//     -c "DELETE FROM listening_events WHERE source = 'demo_seed';"

// Load .env.local the way Next.js itself does. Must run BEFORE any imports
// that read process.env (lib/crypto, lib/db, lib/spotify-tokens).
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { PrismaClient } from '@prisma/client';
import { ensureFreshToken } from '../lib/spotify-tokens';
import { invalidatePrefix } from '../lib/cache';

const db = new PrismaClient();

// ─── Spotify response shapes (subset we use) ──────────────────────────────────

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  duration_ms: number;
}

interface PaginatedResponse<T> {
  items: T[];
  next: string | null;
}

interface SavedTrackItem {
  track: SpotifyTrack;
}

// ─── Spotify API helper (no rate limiter — small one-off script) ─────────────

async function spotifyApi<T>(path: string, accessToken: string): Promise<T> {
  const url = path.startsWith('https://')
    ? path
    : `https://api.spotify.com/v1${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'SoundSage-DevSeed/1.0',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Spotify ${res.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function fetchAllLikedSongs(
  accessToken: string,
  max: number
): Promise<SpotifyTrack[]> {
  const out: SpotifyTrack[] = [];
  let next: string | null = '/me/tracks?limit=50';
  while (next && out.length < max) {
    let data: PaginatedResponse<SavedTrackItem>;
    try {
      data = await spotifyApi<PaginatedResponse<SavedTrackItem>>(next, accessToken);
    } catch (err) {
      const message = String(err);
      // The user-library-read scope was added recently. Older tokens that
      // were issued before the scope was requested won't have it, and
      // /me/tracks returns 403 with "Insufficient client scope". Skip
      // gracefully — top tracks alone is still a solid pool for the demo.
      if (message.includes('403') || message.includes('Insufficient client scope')) {
        console.warn(
          '   (skipping liked songs: token lacks user-library-read scope.\n' +
          '    To enable, disconnect and reconnect Spotify on the dashboard.)'
        );
        return out;
      }
      throw err;
    }
    for (const item of data.items) {
      out.push(item.track);
      if (out.length >= max) break;
    }
    next = data.next;
  }
  return out;
}

async function fetchTopTracks(accessToken: string): Promise<SpotifyTrack[]> {
  const ranges = ['short_term', 'medium_term', 'long_term'] as const;
  const out: SpotifyTrack[] = [];
  for (const range of ranges) {
    try {
      const data: PaginatedResponse<SpotifyTrack> = await spotifyApi(
        `/me/top/tracks?limit=50&time_range=${range}`,
        accessToken
      );
      out.push(...data.items);
    } catch (err) {
      console.warn(`  warning: top-tracks ${range} failed: ${String(err)}`);
    }
  }
  return out;
}

// ─── Realistic timestamp distribution ────────────────────────────────────────

// Hour-of-day relative weights for picking play hours. Peaks: morning commute
// (8-9), lunch (12-13), and evenings (18-22). Overnight is sparse.
const HOUR_WEIGHTS = [
  /* 0-5  */ 1, 1, 1, 1, 1, 2,
  /* 6-11 */ 4, 8, 10, 7, 6, 5,
  /* 12-17 */ 8, 7, 6, 5, 5, 6,
  /* 18-23 */ 9, 11, 12, 10, 7, 4,
];

function weightedPickIndex(weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function pickHour(): number {
  return weightedPickIndex(HOUR_WEIGHTS);
}

function randomInRange(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

// ─── Track-pool weighting ────────────────────────────────────────────────────

interface PoolEntry {
  track: SpotifyTrack;
  weight: number;
}

function buildWeightedPool(
  liked: SpotifyTrack[],
  top: SpotifyTrack[]
): PoolEntry[] {
  const map = new Map<string, PoolEntry>();
  // Liked songs get baseline weight 5
  for (const t of liked) {
    map.set(t.id, { track: t, weight: 5 });
  }
  // Top tracks bumped to 25 (or stack on top of liked weight)
  for (const t of top) {
    const existing = map.get(t.id);
    if (existing) existing.weight = 25;
    else map.set(t.id, { track: t, weight: 25 });
  }
  return Array.from(map.values());
}

function pickFromPool(pool: PoolEntry[]): SpotifyTrack {
  const weights = pool.map((p) => p.weight);
  return pool[weightedPickIndex(weights)]!.track;
}

// ─── Event generation ────────────────────────────────────────────────────────

interface GeneratedEvent {
  userId: string;
  trackId: string;
  playedAt: Date;
  msPlayed: number;
  source: string;
}

function msPlayedFor(track: SpotifyTrack): number {
  // 85% full plays, 15% partial (still ≥30s threshold)
  if (Math.random() < 0.85) return track.duration_ms;
  const minPartial = Math.max(30_000, Math.floor(track.duration_ms * 0.3));
  return randomInRange(minPartial, track.duration_ms);
}

function generateEvents(
  userId: string,
  pool: PoolEntry[],
  count: number,
  daysBack: number
): GeneratedEvent[] {
  const events: GeneratedEvent[] = [];
  const now = Date.now();
  const dayMs = 86_400_000;

  // Group pool by artistId so we can simulate "session bursts" (consecutive
  // plays from the same artist).
  const byArtist = new Map<string, SpotifyTrack[]>();
  for (const { track } of pool) {
    const aid = track.artists[0]?.id;
    if (!aid) continue;
    if (!byArtist.has(aid)) byArtist.set(aid, []);
    byArtist.get(aid)!.push(track);
  }

  while (events.length < count) {
    // 35% of plays come in "session bursts" of 2-5 tracks from one artist
    const isBurst = Math.random() < 0.35;

    const baseDayOffset = Math.random() * daysBack;
    const hour = pickHour();
    const minute = Math.floor(Math.random() * 60);

    if (isBurst) {
      const seedTrack = pickFromPool(pool);
      const artistTracks =
        byArtist.get(seedTrack.artists[0]?.id ?? '') ?? [seedTrack];
      const burstSize = 2 + Math.floor(Math.random() * 4);
      let cumulativeMs = 0;
      for (let i = 0; i < burstSize && events.length < count; i++) {
        const track =
          artistTracks[Math.floor(Math.random() * artistTracks.length)]!;
        const playedAt = new Date(now - baseDayOffset * dayMs);
        playedAt.setHours(hour, minute, Math.floor(cumulativeMs / 1000) % 60, 0);
        const ms = msPlayedFor(track);
        events.push({
          userId,
          trackId: track.id,
          playedAt: new Date(playedAt.getTime() + cumulativeMs),
          msPlayed: ms,
          source: 'demo_seed',
        });
        cumulativeMs += ms + randomInRange(2_000, 8_000); // gap between songs
      }
    } else {
      const track = pickFromPool(pool);
      const playedAt = new Date(now - baseDayOffset * dayMs);
      playedAt.setHours(hour, minute, Math.floor(Math.random() * 60), 0);
      events.push({
        userId,
        trackId: track.id,
        playedAt,
        msPlayed: msPlayedFor(track),
        source: 'demo_seed',
      });
    }
  }

  return events.slice(0, count);
}

// ─── Persistence ──────────────────────────────────────────────────────────────

async function upsertTracks(pool: PoolEntry[]): Promise<void> {
  // Use createMany skipDuplicates — don't overwrite richer existing rows
  // (e.g. ones already enriched by /me/top/artists harvest).
  await db.track.createMany({
    data: pool.map(({ track }) => ({
      id: track.id,
      name: track.name,
      artistNames: track.artists.map((a) => a.name),
      artistIds: track.artists.map((a) => a.id),
      albumName: track.album.name,
      albumId: track.album.id,
      imageUrl: track.album.images[0]?.url ?? null,
      durationMs: track.duration_ms,
    })),
    skipDuplicates: true,
  });
}

async function upsertArtists(pool: PoolEntry[]): Promise<void> {
  const seen = new Map<string, string>();
  for (const { track } of pool) {
    for (const a of track.artists) {
      if (!seen.has(a.id)) seen.set(a.id, a.name);
    }
  }
  await db.artist.createMany({
    data: Array.from(seen.entries()).map(([id, name]) => ({ id, name })),
    skipDuplicates: true,
  });
}

async function insertEvents(events: GeneratedEvent[]): Promise<number> {
  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < events.length; i += BATCH) {
    const batch = events.slice(i, i + BATCH);
    const result = await db.listeningEvent.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += result.count;
    if ((i / BATCH) % 5 === 0) {
      process.stdout.write(`  ${inserted} / ${events.length}\r`);
    }
  }
  return inserted;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  const userId = process.argv[2];
  const count = parseInt(process.argv[3] ?? '5000', 10);
  const daysBack = parseInt(process.argv[4] ?? '365', 10);

  if (!userId) {
    console.error(
      'Usage: tsx scripts/seed-from-spotify.ts <userId> [eventCount=5000] [daysBack=365]'
    );
    process.exit(1);
  }
  if (!Number.isFinite(count) || count <= 0) {
    console.error('eventCount must be a positive integer');
    process.exit(1);
  }
  if (!Number.isFinite(daysBack) || daysBack <= 0) {
    console.error('daysBack must be a positive integer');
    process.exit(1);
  }

  const account = await db.spotifyAccount.findUnique({ where: { userId } });
  if (!account) {
    console.error(
      `User ${userId} has no SpotifyAccount. Sign in and connect Spotify first.`
    );
    process.exit(1);
  }

  console.log(`Seeding ${count} events over the past ${daysBack} days for ${userId}...\n`);

  console.log('1. Refreshing Spotify access token...');
  const accessToken = await ensureFreshToken(userId);

  console.log('2. Fetching liked songs (paginated, up to 500)...');
  const liked = await fetchAllLikedSongs(accessToken, 500);
  console.log(`   ${liked.length} liked songs`);

  console.log('3. Fetching top tracks (3 time ranges)...');
  const top = await fetchTopTracks(accessToken);
  console.log(`   ${top.length} top track entries (with overlap across ranges)`);

  const pool = buildWeightedPool(liked, top);
  console.log(`\n   Combined pool: ${pool.length} unique tracks`);

  if (pool.length === 0) {
    console.error(
      '   No tracks found. Make sure your Spotify account has top tracks\n' +
      '   (some recent listening history) or liked songs.'
    );
    process.exit(1);
  }
  if (pool.length < 20) {
    console.warn(
      `   warning: pool is small (${pool.length} tracks). Consider listening\n` +
      `   to more music on Spotify before re-running, or reconnect Spotify\n` +
      `   to grant user-library-read for richer results.`
    );
  }

  console.log('\n4. Upserting Track + Artist rows...');
  await upsertTracks(pool);
  await upsertArtists(pool);

  console.log('\n5. Generating events with realistic timestamp distribution...');
  const events = generateEvents(userId, pool, count, daysBack);
  console.log(`   ${events.length} events generated`);

  console.log('\n6. Inserting events...');
  const inserted = await insertEvents(events);

  // Drop any cached aggregates so the dashboard reflects the new data.
  await invalidatePrefix(`stats:${userId}:`);

  console.log(`\n\nDone. Inserted ${inserted} events (rest were duplicates).`);
  console.log(`Cache invalidated for stats:${userId}:*`);
  console.log('\nRecommended next steps:');
  console.log(
    '   curl -X POST http://localhost:3000/api/admin/backfill-genres \\'
  );
  console.log(
    '        -H "Cookie: authjs.session-token=YOUR_SESSION_COOKIE"'
  );
  console.log('   # Then reload the dashboard.');
  console.log('\nTo undo:');
  console.log(
    `   docker exec soundsage-postgres-1 psql -U postgres -d soundsage -c "DELETE FROM listening_events WHERE source = 'demo_seed';"`
  );
}

main()
  .catch((err) => {
    console.error('\nFAILED:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
