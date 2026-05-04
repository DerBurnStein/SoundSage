// SoundSage — Last.FM scrobble import
//
// For users who already scrobble Spotify → Last.FM (very common among music
// nerds), this is the instant historical-data path: no 30-day ESH wait, no
// inferred synthesis. Last.FM exposes user.getRecentTracks paginated to ALL
// scrobbles, going back to account creation.
//
// We fetch in batches of 200 (Last.FM's per-page max), resolve each scrobble
// to a Spotify track ID via /search, and write events with
// `source: 'lastfm_import'`. Tracks that don't match anything on Spotify are
// dropped — we need a Spotify track ID to satisfy the FK and to share the
// metadata pipeline with the rest of the app.
//
// Rate limiting reuses the same Redis sliding-window limiter as the genre
// backfill so concurrent jobs across Cloud Run instances stay under 4 req/s.

import { redis } from './redis';
import { db } from './db';
import { invalidatePrefix } from './cache';
import { spotifyGet, type SpotifyTrackDetails } from './spotify';
import { ensureFreshToken } from './spotify-tokens';
import logger from './logger';

const BASE = 'https://ws.audioscrobbler.com/2.0/';
const PAGE_SIZE = 200;
const MIN_PLAY_MS = 30_000; // mirror Spotify's "counts as a play" floor

// Rate limiter copy of getLastFmArtistInfo's helper. Keeping it inline
// avoids exporting an internal-only API from lib/lastfm.ts.
const RATE_KEY = 'lastfm:ratelimit';
const RATE_LIMIT = 4;
const WINDOW_MS = 1000;
const MAX_WAIT_MS = 5000;

async function acquireRateSlot(): Promise<void> {
  const startedAt = Date.now();
  while (true) {
    const now = Date.now();
    await redis.zremrangebyscore(RATE_KEY, 0, now - WINDOW_MS);
    const count = await redis.zcard(RATE_KEY);
    if (count < RATE_LIMIT) {
      await redis.zadd(RATE_KEY, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
      await redis.expire(RATE_KEY, 5);
      return;
    }
    if (now - startedAt > MAX_WAIT_MS) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

// ─── Job state in Redis (mirrors import-runner's pattern) ────────────────────

export type LastFmJobStatus = 'running' | 'complete' | 'failed';

export interface LastFmJobState {
  status: LastFmJobStatus;
  userId: string;
  username: string;
  startedAt: string;
  completedAt?: string;
  totalScrobbles: number;
  pagesProcessed: number;
  totalPages: number;
  resolvedTracks: number;
  unresolvedTracks: number;
  inserted: number;
  errorMessage?: string;
}

const JOB_TTL = 24 * 60 * 60;

function jobKey(jobId: string): string {
  return `lastfm-import:${jobId}`;
}

export async function getLastFmJob(jobId: string): Promise<LastFmJobState | null> {
  const raw = await redis.get(jobKey(jobId)).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LastFmJobState;
  } catch {
    return null;
  }
}

async function writeJob(jobId: string, state: LastFmJobState): Promise<void> {
  await redis
    .set(jobKey(jobId), JSON.stringify(state), 'EX', JOB_TTL)
    .catch((err) => logger.warn({ jobId, err: String(err) }, 'lastfm: writeJob failed'));
}

// ─── Last.FM API shapes ──────────────────────────────────────────────────────

interface LastFmTrack {
  artist: { '#text': string } | string;
  name: string;
  album?: { '#text': string };
  date?: { uts: string };
  '@attr'?: { nowplaying?: string };
}

interface LastFmRecentTracksResponse {
  recenttracks?: {
    track: LastFmTrack | LastFmTrack[];
    '@attr': {
      page: string;
      total: string;
      totalPages: string;
      perPage: string;
    };
  };
  error?: number;
  message?: string;
}

interface NormalizedScrobble {
  trackName: string;
  artistName: string;
  albumName: string;
  playedAt: Date;
}

function normalizeScrobble(t: LastFmTrack): NormalizedScrobble | null {
  if (t['@attr']?.nowplaying === 'true') return null; // skip "now playing" placeholder
  if (!t.date?.uts) return null;
  const artistName =
    typeof t.artist === 'string' ? t.artist : (t.artist?.['#text'] ?? '');
  if (!t.name || !artistName) return null;
  return {
    trackName: t.name,
    artistName,
    albumName: t.album?.['#text'] ?? '',
    playedAt: new Date(parseInt(t.date.uts, 10) * 1000),
  };
}

async function fetchRecentTracksPage(
  username: string,
  apiKey: string,
  page: number
): Promise<LastFmRecentTracksResponse> {
  await acquireRateSlot();
  const url =
    `${BASE}?method=user.getrecenttracks` +
    `&user=${encodeURIComponent(username)}` +
    `&api_key=${apiKey}` +
    `&format=json` +
    `&limit=${PAGE_SIZE}` +
    `&page=${page}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SoundSage/1.0' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Last.fm API ${res.status} on user.getrecenttracks page ${page}`);
  }
  return (await res.json()) as LastFmRecentTracksResponse;
}

// ─── Spotify resolution ──────────────────────────────────────────────────────
// Last.FM gives us free-text "artist + track name". We need a Spotify track ID
// to satisfy the FK and to participate in metadata pipelines. /v1/search/track
// is the cheapest way; we cache resolutions in Redis so re-runs (or repeated
// scrobbles of the same song) don't re-query.

interface SpotifySearchResponse {
  tracks?: { items: SpotifyTrackDetails[] };
}

const RESOLVE_TTL = 30 * 24 * 60 * 60; // 30 days

function resolveCacheKey(artist: string, track: string): string {
  // Lowercase + trim normalizes minor punctuation differences without being
  // aggressive about diacritics. Hash if we ever worry about long keys.
  return `lastfm:resolve:${artist.toLowerCase().trim()}::${track.toLowerCase().trim()}`;
}

async function resolveOnSpotify(
  scrobble: NormalizedScrobble,
  accessToken: string
): Promise<SpotifyTrackDetails | null> {
  const cached = await redis.get(resolveCacheKey(scrobble.artistName, scrobble.trackName)).catch(() => null);
  if (cached === '__none__') return null;
  if (cached) {
    try {
      return JSON.parse(cached) as SpotifyTrackDetails;
    } catch {
      // fall through and re-resolve
    }
  }

  const q = `track:"${scrobble.trackName.replace(/"/g, '')}" artist:"${scrobble.artistName.replace(/"/g, '')}"`;
  let result: SpotifySearchResponse;
  try {
    result = await spotifyGet<SpotifySearchResponse>(
      `/search?type=track&limit=1&q=${encodeURIComponent(q)}`,
      accessToken
    );
  } catch (err) {
    logger.warn({ err: String(err), q }, 'lastfm: search failed');
    return null;
  }
  const hit = result.tracks?.items?.[0] ?? null;

  await redis
    .set(
      resolveCacheKey(scrobble.artistName, scrobble.trackName),
      hit ? JSON.stringify(hit) : '__none__',
      'EX',
      RESOLVE_TTL
    )
    .catch(() => undefined);

  return hit;
}

// ─── Runner ──────────────────────────────────────────────────────────────────

export async function runLastFmImport(
  jobId: string,
  userId: string,
  username: string
): Promise<void> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    logger.error({ jobId }, 'lastfm: LASTFM_API_KEY not set');
    return;
  }

  const start: LastFmJobState = {
    status: 'running',
    userId,
    username,
    startedAt: new Date().toISOString(),
    totalScrobbles: 0,
    pagesProcessed: 0,
    totalPages: 0,
    resolvedTracks: 0,
    unresolvedTracks: 0,
    inserted: 0,
  };
  await writeJob(jobId, start);

  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(userId);
  } catch (err) {
    logger.error({ jobId, userId, err: String(err) }, 'lastfm: no Spotify token');
    await writeJob(jobId, {
      ...start,
      status: 'failed',
      completedAt: new Date().toISOString(),
      errorMessage: 'Spotify connection required to resolve scrobbles',
    });
    return;
  }

  // Replacement-on-real-import: we treat Last.FM as authoritative historical
  // data, so any synthetic events for this user are now superseded. Same
  // logic runs in the ESH runner. Fail-soft — a delete error shouldn't kill
  // the import.
  await db.listeningEvent
    .deleteMany({ where: { userId, source: 'synthetic' } })
    .catch((err) => logger.warn({ userId, err: String(err) }, 'lastfm: synthetic cleanup failed'));

  let state = { ...start };
  try {
    // First page: also tells us totalPages so we can show progress.
    const first = await fetchRecentTracksPage(username, apiKey, 1);
    if (first.error || !first.recenttracks) {
      throw new Error(`Last.fm error ${first.error ?? '?'}: ${first.message ?? 'unknown'}`);
    }
    const totalPages = parseInt(first.recenttracks['@attr'].totalPages, 10);
    const totalScrobbles = parseInt(first.recenttracks['@attr'].total, 10);
    state = { ...state, totalPages, totalScrobbles };
    await writeJob(jobId, state);

    for (let page = 1; page <= totalPages; page++) {
      const data = page === 1 ? first : await fetchRecentTracksPage(username, apiKey, page);
      if (!data.recenttracks) break;

      const tracksRaw = data.recenttracks.track;
      const tracks = Array.isArray(tracksRaw) ? tracksRaw : [tracksRaw];
      const scrobbles = tracks
        .map(normalizeScrobble)
        .filter((s): s is NormalizedScrobble => s !== null);

      // Resolve each scrobble to a Spotify track. Sequential, not parallel —
      // Spotify's /search has a 1-call-per-second softlimit per user token.
      const resolvedEvents: {
        spotifyTrack: SpotifyTrackDetails;
        playedAt: Date;
      }[] = [];
      for (const s of scrobbles) {
        const hit = await resolveOnSpotify(s, accessToken);
        if (hit) {
          resolvedEvents.push({ spotifyTrack: hit, playedAt: s.playedAt });
          state.resolvedTracks++;
        } else {
          state.unresolvedTracks++;
        }
      }

      // Persist this page's resolved events.
      if (resolvedEvents.length > 0) {
        const inserted = await persistLastFmBatch(userId, resolvedEvents);
        state.inserted += inserted;
      }

      state.pagesProcessed = page;
      await writeJob(jobId, state);
    }

    await writeJob(jobId, {
      ...state,
      status: 'complete',
      completedAt: new Date().toISOString(),
    });

    await invalidatePrefix(`stats:${userId}:`);

    logger.info(
      {
        jobId,
        userId,
        username,
        inserted: state.inserted,
        resolved: state.resolvedTracks,
        unresolved: state.unresolvedTracks,
      },
      'lastfm: import complete'
    );
  } catch (err) {
    logger.error({ jobId, userId, err: String(err) }, 'lastfm: import failed');
    await writeJob(jobId, {
      ...state,
      status: 'failed',
      completedAt: new Date().toISOString(),
      errorMessage: String(err),
    });
  }
}

async function persistLastFmBatch(
  userId: string,
  events: { spotifyTrack: SpotifyTrackDetails; playedAt: Date }[]
): Promise<number> {
  // Dedupe Track upserts within the batch.
  const trackById = new Map<string, SpotifyTrackDetails>();
  for (const e of events) {
    if (!trackById.has(e.spotifyTrack.id)) {
      trackById.set(e.spotifyTrack.id, e.spotifyTrack);
    }
  }

  await db.track.createMany({
    data: Array.from(trackById.values()).map((t) => ({
      id: t.id,
      name: t.name,
      artistNames: t.artists.map((a) => a.name),
      artistIds: t.artists.map((a) => a.id),
      albumName: t.album.name,
      albumId: t.album.id,
      imageUrl: t.album.images[0]?.url ?? null,
      durationMs: t.duration_ms,
    })),
    skipDuplicates: true,
  });

  // Insert events; dedupe on (userId, trackId, playedAt). Skip plays under
  // 30s — Last.FM tracks scrobbles regardless of duration but Spotify's
  // ranking and our own rules use the 30s threshold.
  const result = await db.listeningEvent.createMany({
    data: events
      .filter((e) => (e.spotifyTrack.duration_ms ?? 0) >= MIN_PLAY_MS)
      .map((e) => ({
        userId,
        trackId: e.spotifyTrack.id,
        playedAt: e.playedAt,
        msPlayed: e.spotifyTrack.duration_ms,
        source: 'lastfm_import',
      })),
    skipDuplicates: true,
  });

  return result.count;
}
