// SoundSage — Synthetic listening-history generator (v2)
//
// Generates a play log that mimics real-world listening patterns when the
// user can't (or won't) wait 30 days for a Spotify ESH export. Designed to
// be replaced wholesale when ESH or Last.FM data lands — every row written
// here is tagged `source: 'synthetic'` and the import paths
// deleteMany({ source: 'synthetic' }) before persisting their own rows.
//
// Why we need this engine at all: Spotify's live API only gives the past
// 24 hours of plays through /recently-played, plus three rank-only
// "Top Items" lists (no counts, no timestamps). On day one the dashboard
// has nothing to chart. Synthesis fills the gap with a plausible play log
// so all the existing chart machinery has data to render.
//
// What "realistic" means here:
//
//   1. Power-law play counts. Real listening histories follow Zipf with
//      exponent ~1.05 — the #1 track is ~3× the #5 track, ~10× the #25,
//      ~30× the #100. We use the user's three rank lists (short / medium /
//      long term) plus their top artists' top tracks to build a pool of
//      ~250 tracks, then assign Zipf-distributed counts.
//
//   2. Long tail. Real listeners have hundreds of tracks with 1-3 plays
//      each. We add filler tracks beyond the snapshot pool by pulling each
//      top artist's top-N tracks from /artists/{id}/top-tracks.
//
//   3. Smooth temporal distribution. We DON'T snap plays to specific
//      weekdays (the v1 bug — every play landed on a Sunday because the
//      user's recently-played fingerprint had a Sunday peak). Instead we
//      pick a uniform random date in the track's window, then a weighted
//      hour-of-day from the fingerprint. Weekday weight is applied as a
//      gentle multiplier (max 1.4× difference), not a hard snap.
//
//   4. Per-day cap. Real users do 30-60 plays/day; we cap at 80 to allow
//      occasional binge days while preventing the 1942-plays-on-one-day
//      glitch v1 produced.
//
//   5. Realistic msPlayed. 78% near-complete (85-100% of duration), 17%
//      partial (50-85%), 5% skipped (30s-50%). Drives the per-day
//      "minutes listened" charts to look like real human behavior.
//
//   6. Recency bias. Tracks ranked highest in short_term get most of their
//      plays in the last 28 days. Tracks only in long_term get most of
//      their plays in the 6-12-month region. Mirrors real usage where
//      "what you listen to changes over time."

import { db } from './db';
import { spotifyGet, type SpotifyTrackDetails, type SpotifyArtistDetails } from './spotify';
import { ensureFreshToken } from './spotify-tokens';
import logger from './logger';

// ─── Tunable constants ───────────────────────────────────────────────────────

const ZIPF_EXPONENT = 1.05;
// Daily-rate floor — even if recently-played returns very few items (the
// user just signed up and hasn't listened today), we generate enough plays
// to populate charts. Spotify's published median active user listens for
// 80-90 minutes/day ≈ 25-30 plays.
const BASE_DAILY_RATE = 32;
// Hard ceiling on synthetic plays per single calendar day. Prevents the
// v1 bug where a Sunday-heavy fingerprint dumped 2000 plays on one date.
const MAX_PLAYS_PER_DAY = 80;
// Number of artist-derived filler tracks per range. Each top artist
// contributes their top tracks (deduped against the user's top-tracks
// list); together they form the long-tail.
const ARTISTS_FOR_FILLER = 25;
const FILLER_TRACKS_PER_ARTIST = 8;
// Fraction of plays in each completion bucket. Loosely calibrated against
// public ESH dumps shared on r/spotify.
const COMPLETION_NEAR_FULL = 0.78;
const COMPLETION_PARTIAL = 0.17;
// remaining 0.05 = skipped (30s-50%)

const RANGE_DAYS = { short_term: 28, medium_term: 180, long_term: 365 } as const;
const RANGE_DAILY_MULTIPLIER = { short_term: 1.3, medium_term: 1.0, long_term: 0.85 } as const;

// ─── Public types ────────────────────────────────────────────────────────────

export interface SyntheticResult {
  totalPlaysGenerated: number;
  uniqueTracks: number;
  earliestPlay: string;
  latestPlay: string;
  byRange: Record<string, number>;
}

// ─── Spotify response shapes ────────────────────────────────────────────────

interface RecentItem {
  played_at: string;
}
interface RecentResponse { items: RecentItem[]; }
interface TopTracksResp { items: SpotifyTrackDetails[]; }
interface TopArtistsResp { items: SpotifyArtistDetails[]; }
interface ArtistTopTracksResp { tracks: SpotifyTrackDetails[]; }

// ─── Hour-of-day fingerprint (24 buckets, smoothed with generic curve) ──────

interface HourFingerprint {
  hourWeights: number[];   // length 24
  weekdayWeights: number[]; // length 7 (0=Sun)
}

function genericHourCurve(): number[] {
  // Awake-hours bias with morning + evening peaks, very low overnight.
  const w: number[] = new Array(24).fill(0.05);
  for (let h = 6; h <= 9; h++) w[h] = 0.7;
  for (let h = 10; h <= 11; h++) w[h] = 0.6;
  for (let h = 12; h <= 14; h++) w[h] = 0.85;
  for (let h = 15; h <= 17; h++) w[h] = 0.75;
  for (let h = 18; h <= 22; h++) w[h] = 1.0;
  w[23] = 0.5;
  w[0] = 0.2;
  for (let h = 1; h <= 5; h++) w[h] = 0.05;
  return w;
}

function genericWeekdayCurve(): number[] {
  // Slight weekend lift — listening peaks on Saturday afternoons in most
  // public datasets. Sunday slightly lower than Saturday.
  return [1.05, 0.95, 0.95, 0.95, 0.95, 1.05, 1.15];
}

function buildFingerprint(items: RecentItem[]): HourFingerprint {
  const generic = genericHourCurve();
  const genericDay = genericWeekdayCurve();

  if (items.length < 5) {
    return { hourWeights: generic, weekdayWeights: genericDay };
  }

  const hourCounts = new Array(24).fill(0);
  const dayCounts = new Array(7).fill(0);
  for (const it of items) {
    const d = new Date(it.played_at);
    hourCounts[d.getUTCHours()] += 1;
    dayCounts[d.getUTCDay()] += 1;
  }

  // Heavy smoothing — blend 50/50 with generic so a few clustered samples
  // don't crater every other bucket. Real fingerprints have peaks but
  // never strict zeros across whole halves of the day.
  const hourWeights = generic.map((g, h) => 0.5 * g + 0.5 * (hourCounts[h] / items.length) * 24);
  const weekdayWeights = genericDay.map(
    (g, d) => 0.7 * g + 0.3 * (dayCounts[d] / items.length) * 7
  );

  return { hourWeights, weekdayWeights };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function weightedSample(weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function pickMsPlayed(durationMs: number): number {
  const r = Math.random();
  if (r < COMPLETION_NEAR_FULL) {
    // 85-100% completion
    return Math.round(durationMs * (0.85 + Math.random() * 0.15));
  } else if (r < COMPLETION_NEAR_FULL + COMPLETION_PARTIAL) {
    // 50-85% completion
    return Math.round(durationMs * (0.5 + Math.random() * 0.35));
  } else {
    // Skipped: 30s-50% (Spotify's 30s threshold is the floor)
    const minMs = 30_000;
    const maxMs = Math.max(minMs + 1, Math.round(durationMs * 0.5));
    return minMs + Math.floor(Math.random() * (maxMs - minMs));
  }
}

// ─── Pool building ───────────────────────────────────────────────────────────

interface PooledTrack {
  id: string;
  durationMs: number;
  // "weight" combines all signals: top-tracks rank in any range, plus
  // artist-derived bonus. Drives the Zipf assignment.
  weight: number;
  // Indicator of which range this track is "primarily about" — biases
  // its plays toward that time window. short_term tracks get bunched
  // near today; long_term tracks spread across the full year.
  primaryRange: 'short_term' | 'medium_term' | 'long_term';
}

async function buildTrackPool(
  userId: string,
  accessToken: string
): Promise<{ pool: PooledTrack[]; ensuredTrackIds: string[] }> {
  const ranges: Array<keyof typeof RANGE_DAYS> = ['short_term', 'medium_term', 'long_term'];
  // Recency-weighted: short rank-1 carries more weight than long rank-1
  // because short_term reflects "current obsession" while long_term mixes
  // older fading favorites. These multipliers are tunable.
  const RANGE_WEIGHT = { short_term: 3.0, medium_term: 2.0, long_term: 1.2 };

  const byTrackId = new Map<string, PooledTrack>();
  const ensuredTrackIds: string[] = []; // upsert these into Track table

  for (const range of ranges) {
    const snaps = await db.topTrackSnapshot.findMany({
      where: { userId, range },
      orderBy: { rank: 'asc' },
      include: { track: { select: { id: true, durationMs: true } } },
    });

    let trackList: { id: string; rank: number; durationMs: number | null }[] =
      snaps.map((s) => ({ id: s.trackId, rank: s.rank, durationMs: s.track?.durationMs ?? null }));

    // Cold-start: snapshot empty. Fall back to live API so synth still
    // works on a brand-new account where bootstrap hasn't landed.
    if (trackList.length === 0) {
      try {
        const live = await spotifyGet<TopTracksResp>(
          `/me/top/tracks?time_range=${range}&limit=50`,
          accessToken
        );
        trackList = live.items.map((t, i) => ({
          id: t.id,
          rank: i + 1,
          durationMs: t.duration_ms,
        }));
        // Make sure these Track rows exist before we insert events for them.
        await persistTrackBatch(live.items);
      } catch (err) {
        logger.warn({ userId, range, err: String(err) }, 'synth: live top-tracks fetch failed');
      }
    }

    for (const t of trackList) {
      // Zipf-style weight from rank within this range, scaled by how
      // "current" the range is. Sum across ranges so a track in all three
      // gets credited from all three.
      const rankWeight = 1 / Math.pow(t.rank, 0.85);
      const contribution = RANGE_WEIGHT[range] * rankWeight;
      const existing = byTrackId.get(t.id);
      if (existing) {
        existing.weight += contribution;
        // Earliest range a track appears in is its primary range — short
        // outranks medium outranks long.
        if (
          (range === 'short_term') ||
          (range === 'medium_term' && existing.primaryRange === 'long_term')
        ) {
          existing.primaryRange = range;
        }
      } else {
        byTrackId.set(t.id, {
          id: t.id,
          durationMs: t.durationMs ?? 210_000,
          weight: contribution,
          primaryRange: range,
        });
      }
    }
  }

  // Long-tail filler: each top artist contributes their top-N tracks. Most
  // will be NEW to the pool (the user hadn't ranked them in their top-50
  // tracks list, but they ARE artist-favorites they've heard a few times).
  for (const range of ranges) {
    const artistSnaps = await db.topArtistSnapshot.findMany({
      where: { userId, range },
      orderBy: { rank: 'asc' },
      take: ARTISTS_FOR_FILLER,
    });

    let artistList = artistSnaps.map((a) => ({ id: a.artistId, rank: a.rank }));
    if (artistList.length === 0) {
      try {
        const live = await spotifyGet<TopArtistsResp>(
          `/me/top/artists?time_range=${range}&limit=${ARTISTS_FOR_FILLER}`,
          accessToken
        );
        artistList = live.items.map((a, i) => ({ id: a.id, rank: i + 1 }));
      } catch {
        // Skip silently.
      }
    }

    for (const a of artistList) {
      try {
        const top = await spotifyGet<ArtistTopTracksResp>(
          `/artists/${a.id}/top-tracks?market=from_token`,
          accessToken
        );
        const tracksToAdd = top.tracks.slice(0, FILLER_TRACKS_PER_ARTIST);
        // Persist Track rows so the listening_event FK passes AND so the
        // dashboard has artist names ready (the v1 "Unknown artist" bug
        // came from incomplete Track rows when artistDerived skipped this).
        await persistTrackBatch(tracksToAdd);

        for (let i = 0; i < tracksToAdd.length; i++) {
          const t = tracksToAdd[i];
          const artistRankWeight = 1 / Math.pow(a.rank, 0.7);
          // Filler tracks land on the long-tail with much less weight than
          // ranked tracks. Decay across the artist's track list.
          const positionWeight = 1 / Math.pow(i + 1, 0.5);
          const contribution = 0.4 * artistRankWeight * positionWeight * RANGE_WEIGHT[range];
          const existing = byTrackId.get(t.id);
          if (existing) {
            existing.weight += contribution;
          } else {
            byTrackId.set(t.id, {
              id: t.id,
              durationMs: t.duration_ms,
              weight: contribution,
              primaryRange: range,
            });
            ensuredTrackIds.push(t.id);
          }
        }
      } catch {
        // One bad artist shouldn't kill the whole synth.
      }
    }
  }

  return { pool: Array.from(byTrackId.values()), ensuredTrackIds };
}

async function persistTrackBatch(tracks: SpotifyTrackDetails[]): Promise<void> {
  for (const t of tracks) {
    try {
      await db.track.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          name: t.name,
          // Always populate artist names — empty arrays are what causes
          // "Unknown artist" downstream. If Spotify returned the track at
          // all, it has an artists array.
          artistNames: t.artists.map((a) => a.name),
          artistIds: t.artists.map((a) => a.id),
          albumName: t.album?.name ?? null,
          albumId: t.album?.id ?? null,
          imageUrl: t.album?.images?.[0]?.url ?? null,
          durationMs: t.duration_ms,
        },
        update: {
          name: t.name,
          artistNames: t.artists.map((a) => a.name),
          artistIds: t.artists.map((a) => a.id),
          albumName: t.album?.name ?? null,
          albumId: t.album?.id ?? null,
          imageUrl: t.album?.images?.[0]?.url ?? null,
          durationMs: t.duration_ms,
        },
      });
    } catch (err) {
      logger.warn({ trackId: t.id, err: String(err) }, 'synth: track upsert failed');
    }
  }
}

// ─── Event generation ────────────────────────────────────────────────────────

interface PlannedEvent {
  trackId: string;
  durationMs: number;
  playedAt: Date;
}

function generateEvents(
  pool: PooledTrack[],
  totalPlays: number,
  fp: HourFingerprint,
  now: Date
): PlannedEvent[] {
  // 1. Zipf assignment of plays to tracks. We rank-order by weight, then
  // distribute totalPlays following rank^-s. Tracks at the long tail get
  // 1-3 plays each — this is the "I heard this track once last spring"
  // pattern that real ESH dumps show.
  const sorted = [...pool].sort((a, b) => b.weight - a.weight);
  const zipfWeights: number[] = [];
  let denom = 0;
  for (let r = 1; r <= sorted.length; r++) {
    const w = 1 / Math.pow(r, ZIPF_EXPONENT);
    zipfWeights.push(w);
    denom += w;
  }
  const counts = zipfWeights.map((w) => Math.max(1, Math.round((w / denom) * totalPlays)));

  // 2. For each track, sample timestamps within its appropriate window.
  // Per-day cap enforced via a running tally so we never get a 2000-plays-
  // on-one-day spike.
  const dayCount = new Map<string, number>(); // YYYY-MM-DD → plays so far
  const events: PlannedEvent[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const c = counts[i];
    const window = recencyWindow(t.primaryRange, i, sorted.length, now);

    let attempts = 0;
    let placed = 0;
    while (placed < c && attempts < c * 3) {
      attempts++;
      const date = sampleDate(window, fp);
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
      const tally = dayCount.get(key) ?? 0;
      if (tally >= MAX_PLAYS_PER_DAY) continue;

      events.push({
        trackId: t.id,
        durationMs: t.durationMs,
        playedAt: date,
      });
      dayCount.set(key, tally + 1);
      placed++;
    }
  }

  return events;
}

function recencyWindow(
  primaryRange: 'short_term' | 'medium_term' | 'long_term',
  rankIndex: number,
  poolSize: number,
  now: Date
): { start: Date; end: Date; recentBias: number } {
  // Top-of-pool tracks lean recent; long-tail tracks lean older. Even
  // within a single primary range, we modulate by within-pool rank so
  // the "12-week trace" chart shows growing volume toward today instead
  // of a flat line.
  const positionFraction = rankIndex / Math.max(1, poolSize - 1); // 0 = top, 1 = tail

  let baseDays: number;
  let bias: number;
  switch (primaryRange) {
    case 'short_term':
      baseDays = 28;
      bias = 0.7;
      break;
    case 'medium_term':
      baseDays = 180;
      bias = 0.5;
      break;
    case 'long_term':
      baseDays = 365;
      bias = 0.3;
      break;
  }
  // Very-long-tail tracks get the full year window even if their primary
  // range was short — they shouldn't all pile into 28 days.
  const stretchedDays = baseDays + Math.round(positionFraction * (365 - baseDays));
  return {
    start: new Date(now.getTime() - stretchedDays * 86400_000),
    end: now,
    recentBias: bias,
  };
}

function sampleDate(window: { start: Date; end: Date; recentBias: number }, fp: HourFingerprint): Date {
  // Recency bias: square-rooted random pulls samples toward the END of
  // the window when bias > 0.5, toward the START when < 0.5. With 0.7
  // (short_term), most plays bunch in the last third of the window.
  // With 0.3 (long_term), plays spread across the whole year with light
  // bias toward older dates.
  let r = Math.random();
  if (window.recentBias > 0.5) {
    r = 1 - Math.pow(1 - r, 1 / (1 + window.recentBias));
  } else {
    r = Math.pow(r, 1 / (2 - window.recentBias));
  }
  const span = window.end.getTime() - window.start.getTime();
  const dateMs = window.start.getTime() + r * span;
  const date = new Date(dateMs);

  // Apply weekday weight as a soft accept/reject — scale max to mean ratio
  // of 1.4× so the user's weekday pattern shows up without dominating.
  const weekdayWeight = fp.weekdayWeights[date.getUTCDay()];
  const meanWeekday = fp.weekdayWeights.reduce((s, w) => s + w, 0) / 7;
  if (Math.random() > weekdayWeight / (meanWeekday * 1.4)) {
    // Resample once with uniform weekday bias
    const span2 = window.end.getTime() - window.start.getTime();
    date.setTime(window.start.getTime() + Math.random() * span2);
  }

  // Hour from fingerprint. Random minute + second for natural jitter.
  const hour = weightedSample(fp.hourWeights);
  date.setUTCHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
  return date;
}

// ─── Main entrypoint ─────────────────────────────────────────────────────────

export async function generateSyntheticHistory(userId: string): Promise<SyntheticResult> {
  // Replace, don't merge.
  await db.listeningEvent.deleteMany({ where: { userId, source: 'synthetic' } });

  const accessToken = await ensureFreshToken(userId);

  // 1. Fingerprint from real recently-played samples.
  let recent: RecentResponse;
  try {
    recent = await spotifyGet<RecentResponse>('/me/player/recently-played?limit=50', accessToken);
  } catch (err) {
    logger.warn({ userId, err: String(err) }, 'synth: recently-played fetch failed');
    recent = { items: [] };
  }
  const fingerprint = buildFingerprint(recent.items);

  // 2. Daily-rate calibration. recently-played covers ~24h, so item count
  // is a rough plays-per-day estimate. Floor with BASE_DAILY_RATE so a
  // user who hasn't listened today still gets a populated dashboard.
  const observedDailyRate = Math.max(recent.items.length, BASE_DAILY_RATE);

  // 3. Build the unified pool from snapshots + artist top-tracks.
  const { pool } = await buildTrackPool(userId, accessToken);
  if (pool.length === 0) {
    logger.warn({ userId }, 'synth: empty pool — nothing to generate');
    return {
      totalPlaysGenerated: 0,
      uniqueTracks: 0,
      earliestPlay: '',
      latestPlay: '',
      byRange: { short_term: 0, medium_term: 0, long_term: 0 },
    };
  }

  // 4. Compute total target plays. Use long_term as the umbrella window
  // (365 days) and let recency bias distribute plays naturally toward
  // recent dates. Each range's daily-rate multiplier modulates the curve
  // shape; the umbrella total is calibrated against observed rate.
  const now = new Date();
  const totalPlaysTarget = Math.round(observedDailyRate * 365 * 0.95);

  // 5. Generate timestamped events with per-day cap.
  const events = generateEvents(pool, totalPlaysTarget, fingerprint, now);

  // 6. Insert in chunks.
  let inserted = 0;
  const CHUNK = 1000;
  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK);
    const result = await db.listeningEvent.createMany({
      data: chunk.map((e) => ({
        userId,
        trackId: e.trackId,
        playedAt: e.playedAt,
        msPlayed: pickMsPlayed(e.durationMs),
        source: 'synthetic',
      })),
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  // 7. Reporting — bucket by primary range for diagnostics.
  const byRange: Record<string, number> = { short_term: 0, medium_term: 0, long_term: 0 };
  const cutoff28 = new Date(now.getTime() - 28 * 86400_000).getTime();
  const cutoff180 = new Date(now.getTime() - 180 * 86400_000).getTime();
  for (const e of events) {
    const ms = e.playedAt.getTime();
    if (ms >= cutoff28) byRange.short_term++;
    else if (ms >= cutoff180) byRange.medium_term++;
    else byRange.long_term++;
  }

  const sorted = [...events].sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
  const earliestPlay = sorted[0]?.playedAt.toISOString() ?? '';
  const latestPlay = sorted[sorted.length - 1]?.playedAt.toISOString() ?? '';

  logger.info(
    { userId, inserted, uniqueTracks: pool.length, byRange, earliestPlay, latestPlay },
    'synth: generation complete'
  );

  return {
    totalPlaysGenerated: inserted,
    uniqueTracks: pool.length,
    earliestPlay,
    latestPlay,
    byRange,
  };
}
