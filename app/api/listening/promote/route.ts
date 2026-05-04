// SoundSage — Currently-playing → ListeningEvent promotion
//
// The dashboard's NowPlaying widget polls /me/player/currently-playing every
// few seconds. When it sees the active track change (track A → track B, or
// playback stopping), it knows track A just finished. Spotify's
// /recently-played endpoint trails reality by 30s-2min, so without this
// promotion the dashboard's "Recently played" list would lag the user's ears
// by minutes — the comparison-point for stats.fm-grade currency.
//
// We trust the client's transition detection and write the play immediately.
// The next /recently-played sync will see the same play; the fuzzy-dedupe
// in lib/sync.ts (±90s window on userId+trackId) keeps us from inserting
// it twice when Spotify finally indexes it.

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import { invalidatePrefix } from '@/lib/cache';
import logger from '@/lib/logger';

interface PromoteBody {
  track: {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
    album?: { name?: string | null; imageUrl?: string | null };
    durationMs: number;
  };
  // ms of audio the client observed before the transition
  msPlayed: number;
  // client clock ms-since-epoch at the moment we detected the transition
  endedAt: number;
}

// Spotify track IDs are base62, 22 chars. Reject anything else so a bad
// client (or attacker) can't pollute the table with junk rows.
const SPOTIFY_ID = /^[A-Za-z0-9]{16,32}$/;

// Spotify itself only counts a track as "played" once it crosses 30 seconds.
// We mirror that threshold so a 5-second skip doesn't pollute play counts.
const MIN_PLAY_MS = 30_000;

// If we already have an event for (user, track) within this window, treat
// the incoming one as a duplicate — typically the same play that the
// recently-played sync just inserted, or a double-fire from a poller race.
const DEDUPE_WINDOW_MS = 90_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { session, error } = await requireAuth();
  if (error) return error;

  let body: PromoteBody;
  try {
    body = (await req.json()) as PromoteBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const { track, msPlayed, endedAt } = body ?? {};
  if (!track || !SPOTIFY_ID.test(track.id) || !track.name) {
    return NextResponse.json({ error: 'invalid track' }, { status: 400 });
  }
  if (!Array.isArray(track.artists) || track.artists.length === 0) {
    return NextResponse.json({ error: 'missing artists' }, { status: 400 });
  }
  if (typeof msPlayed !== 'number' || msPlayed < 0) {
    return NextResponse.json({ error: 'invalid msPlayed' }, { status: 400 });
  }
  if (msPlayed < MIN_PLAY_MS) {
    // Below the Spotify threshold — record nothing, but 200 so the client
    // doesn't retry. Mirrors Spotify's own "skipped before 30s" behavior.
    return NextResponse.json({ inserted: false, reason: 'below_threshold' });
  }

  // Use server time for playedAt — the client's `endedAt` is advisory only,
  // since clock skew between browser and server can be tens of seconds. Cap
  // at server-now in case the client sent something silly.
  const now = Date.now();
  const clientEnded = typeof endedAt === 'number' && endedAt > 0 ? endedAt : now;
  const playedAt = new Date(Math.min(clientEnded, now));

  const { userId } = session;

  // Fuzzy dedupe: if any event for this (userId, trackId) lands within the
  // dedupe window, don't insert again. This catches the recently-played
  // sync racing the promote endpoint, and double-fires from focus events.
  const since = new Date(playedAt.getTime() - DEDUPE_WINDOW_MS);
  const until = new Date(playedAt.getTime() + DEDUPE_WINDOW_MS);
  const existing = await db.listeningEvent.findFirst({
    where: {
      userId,
      trackId: track.id,
      playedAt: { gte: since, lte: until },
    },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ inserted: false, reason: 'duplicate' });
  }

  // Make sure the Track row exists before inserting the event — the
  // RecentStream join on Track.id needs to succeed for the just-played
  // track to render with a real name instead of "Unknown". Upsert is
  // idempotent and uses the freshest payload from currently-playing.
  try {
    await db.track.upsert({
      where: { id: track.id },
      create: {
        id: track.id,
        name: track.name,
        artistNames: track.artists.map((a) => a.name),
        artistIds: track.artists.map((a) => a.id),
        albumName: track.album?.name ?? null,
        albumId: null,
        imageUrl: track.album?.imageUrl ?? null,
        durationMs: track.durationMs,
      },
      update: {
        name: track.name,
        artistNames: track.artists.map((a) => a.name),
        artistIds: track.artists.map((a) => a.id),
        albumName: track.album?.name ?? null,
        imageUrl: track.album?.imageUrl ?? null,
        durationMs: track.durationMs,
      },
    });
  } catch (err) {
    logger.warn(
      { userId, trackId: track.id, err: String(err) },
      'promote: track upsert failed (continuing)'
    );
  }

  try {
    await db.listeningEvent.create({
      data: {
        userId,
        trackId: track.id,
        playedAt,
        msPlayed: Math.min(msPlayed, track.durationMs),
        source: 'currently_playing',
      },
    });
  } catch (err) {
    // Race: another writer (sync, another tab) inserted the same composite
    // key in the gap between our findFirst and create. Treat as duplicate.
    logger.info(
      { userId, trackId: track.id, err: String(err) },
      'promote: insert lost dedupe race'
    );
    return NextResponse.json({ inserted: false, reason: 'race' });
  }

  // Stats caches keyed by user are now stale — invalidate so the next page
  // load reflects the new event. Fire-and-forget; cache misses are cheap.
  invalidatePrefix(`stats:${userId}:`).catch(() => undefined);

  logger.info(
    { userId, trackId: track.id, msPlayed, playedAt: playedAt.toISOString() },
    'promote: inserted real-time event'
  );

  return NextResponse.json({ inserted: true });
}
