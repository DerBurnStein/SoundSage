// SoundSage — Synthetic listening-history generator
//
// For users who can't (or won't) wait 30 days for a Spotify Extended
// Streaming History export and don't have a Last.FM account, we synthesize
// a plausible play log from the data that IS available on day one:
//
//   • Top tracks × 3 ranges (short/medium/long, 50 each, ranked)
//   • Top artists × 3 ranges (50 each, ranked)
//   • The last 50 plays from /recently-played (gives us the user's
//     hour-of-day / weekday fingerprint — the trick that makes synthetic
//     output "look like them" instead of generic)
//
// The output is a set of ListeningEvent rows tagged `source: 'synthetic'`.
// The UI labels these as estimates and tells the user they will be REPLACED
// by real data the moment they upload their ESH ZIP or connect Last.FM —
// see runImport / runLastFmImport, which `deleteMany({ source: 'synthetic' })`
// before persisting their own rows.
//
// Quality model:
//   • Play counts per rank follow a Zipfian distribution (rank^-s) with
//     s ≈ 1.0. This matches empirical play-count histograms from public
//     ESH dumps.
//   • Total play volume is calibrated against the user's observed daily
//     rate from /recently-played. If we see 25 plays in the last 24h, the
//     daily rate is 25, and a 4-week short_term has ≈ 700 plays to spread.
//   • Timestamps are sampled from the user's actual hour-of-day × day-of-
//     week histogram (weighted) and randomly within each bucket. Falls back
//     to a generic circadian shape if too few real samples.

import { db } from './db';
import { spotifyGet, type SpotifyTrackDetails } from './spotify';
import { ensureFreshToken } from './spotify-tokens';
import logger from './logger';

// ─── Calibration constants ───────────────────────────────────────────────────

const ZIPF_EXPONENT = 1.0;
// Short / medium / long term coverage windows in days. Spotify's docs say
// short ≈ 4 weeks, medium ≈ 6 months, long ≈ 12 months (their ranking is
// time-decayed, but the bulk of weight falls in these windows).
const RANGE_DAYS = { short_term: 28, medium_term: 180, long_term: 365 } as const;
// Minimum daily play rate when the user has very few /recently-played items.
// Picked to give a non-empty dashboard without overstating volume.
const FALLBACK_DAILY_RATE = 8;
// Cap on synthetic plays per range — keeps the table from blowing up for
// users who left a song on repeat for 24h before signing up.
const MAX_PLAYS_PER_RANGE = 5_000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface RecentItem {
  played_at: string;
  track: { duration_ms: number };
}

interface RecentResponse {
  items: RecentItem[];
}

interface TopTracksResp { items: SpotifyTrackDetails[]; }
interface ArtistTopTracksResp { tracks: SpotifyTrackDetails[]; }

export interface SyntheticResult {
  totalPlaysGenerated: number;
  byRange: Record<string, number>;
}

// ─── Hour×day fingerprint (168-bucket histogram) ─────────────────────────────

interface CircadianFingerprint {
  buckets: number[]; // length 168, weights summing > 0
  totalSamples: number;
}

function emptyFingerprint(): CircadianFingerprint {
  return { buckets: new Array(168).fill(0), totalSamples: 0 };
}

function bucketOf(d: Date): number {
  // 0-167: Sunday 00:00 = 0, Saturday 23:00 = 167.
  return d.getUTCDay() * 24 + d.getUTCHours();
}

function genericCircadian(): CircadianFingerprint {
  const buckets = new Array(168).fill(0);
  // Generic curve: low overnight, peak commute (8am, 6pm), gentle weekend
  // afternoon. Tuned to look reasonable without claiming to be the user's.
  for (let day = 0; day < 7; day++) {
    const isWeekend = day === 0 || day === 6;
    for (let hour = 0; hour < 24; hour++) {
      let w = 0.1;
      if (hour >= 7 && hour <= 9) w = isWeekend ? 0.4 : 1.0;
      else if (hour >= 12 && hour <= 13) w = 0.7;
      else if (hour >= 17 && hour <= 19) w = isWeekend ? 0.7 : 1.2;
      else if (hour >= 20 && hour <= 23) w = 0.9;
      else if (hour >= 10 && hour <= 16) w = isWeekend ? 0.8 : 0.5;
      buckets[day * 24 + hour] = w;
    }
  }
  return { buckets, totalSamples: 0 };
}

function buildFingerprint(items: RecentItem[]): CircadianFingerprint {
  if (items.length < 5) return genericCircadian();
  const fp = emptyFingerprint();
  for (const item of items) {
    const d = new Date(item.played_at);
    fp.buckets[bucketOf(d)] += 1;
    fp.totalSamples++;
  }
  // Smooth: blend with generic so empty buckets aren't strict zeros — heavy
  // listeners with all plays in one window would otherwise generate 100% of
  // synthetic plays in that bucket.
  const generic = genericCircadian();
  const blended = fp.buckets.map((v, i) => v + generic.buckets[i] * 0.2);
  return { buckets: blended, totalSamples: fp.totalSamples };
}

function sampleHourDay(fp: CircadianFingerprint): { dayOfWeek: number; hour: number } {
  // Weighted sample over 168 buckets.
  const total = fp.buckets.reduce((s, v) => s + v, 0);
  let r = Math.random() * total;
  for (let i = 0; i < fp.buckets.length; i++) {
    r -= fp.buckets[i];
    if (r <= 0) return { dayOfWeek: Math.floor(i / 24), hour: i % 24 };
  }
  return { dayOfWeek: 0, hour: 12 }; // unreachable, shuts up the type checker
}

// ─── Zipfian play-count assignment ───────────────────────────────────────────

function zipfPlayCounts(items: number, totalPlays: number): number[] {
  // Returns an array of `items` integers (one per rank position 1..N) that
  // sum to ≈ `totalPlays` and follow rank^-s.
  const weights: number[] = [];
  let denom = 0;
  for (let r = 1; r <= items; r++) {
    const w = 1 / Math.pow(r, ZIPF_EXPONENT);
    weights.push(w);
    denom += w;
  }
  const counts = weights.map((w) => Math.max(1, Math.round((w / denom) * totalPlays)));
  return counts;
}

// ─── Timestamp sampling ──────────────────────────────────────────────────────

function pickPlayedAt(fp: CircadianFingerprint, windowStart: Date, windowEnd: Date): Date {
  const { dayOfWeek, hour } = sampleHourDay(fp);
  // Find a date within the window whose day-of-week matches. To avoid an
  // O(window) scan, pick a random offset and snap to the next matching day.
  const span = windowEnd.getTime() - windowStart.getTime();
  const baseOffset = Math.random() * span;
  const candidate = new Date(windowStart.getTime() + baseOffset);
  const currentDay = candidate.getUTCDay();
  const dayDelta = (dayOfWeek - currentDay + 7) % 7;
  candidate.setUTCDate(candidate.getUTCDate() + dayDelta);
  // If the snap pushed us past windowEnd, walk back a week.
  if (candidate.getTime() > windowEnd.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() - 7);
  }
  candidate.setUTCHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);
  return candidate;
}

// ─── Main entrypoint ─────────────────────────────────────────────────────────

export async function generateSyntheticHistory(userId: string): Promise<SyntheticResult> {
  // Replace, don't merge — if synthesis runs twice, the second run wins.
  // This keeps duplicate-key churn down and matches the "source of truth"
  // semantics ESH/Last.FM use when they delete synthetic data on import.
  await db.listeningEvent.deleteMany({ where: { userId, source: 'synthetic' } });

  const accessToken = await ensureFreshToken(userId);

  // 1. Fingerprint from recently-played (best signal for THIS user).
  let recent: RecentResponse;
  try {
    recent = await spotifyGet<RecentResponse>('/me/player/recently-played?limit=50', accessToken);
  } catch (err) {
    logger.warn({ userId, err: String(err) }, 'synthetic: recently-played fetch failed; using generic circadian');
    recent = { items: [] };
  }
  const fingerprint = buildFingerprint(recent.items);

  // 2. Daily rate calibration from observed plays in /recently-played.
  // recently-played covers up to ~24h, so item count ≈ daily rate.
  const observedDailyRate = Math.max(recent.items.length, FALLBACK_DAILY_RATE);

  // 3. Pull the snapshots we already bootstrapped — synth uses ranking, not
  // a fresh fetch from Spotify (cheaper, consistent with what charts will
  // read against). If snapshots are missing we fall back to a fresh top-
  // items pull so synth still works on a clean account.
  const ranges: Array<keyof typeof RANGE_DAYS> = ['short_term', 'medium_term', 'long_term'];
  const byRange: Record<string, number> = { short_term: 0, medium_term: 0, long_term: 0 };
  let total = 0;

  // Cumulative window: long_term spans the past 365 days. Within that we
  // distribute long_term plays across days 365..180, medium across 180..28,
  // short across 28..0 — so short_term plays are the most recent and the
  // long-term ones are sparse and old. Mirrors empirical patterns where a
  // top-365 track was probably heard last month, NOT yesterday.
  const now = new Date();
  const windows: Record<keyof typeof RANGE_DAYS, { start: Date; end: Date }> = {
    short_term: { start: new Date(now.getTime() - 28 * 86400_000), end: now },
    medium_term: { start: new Date(now.getTime() - 180 * 86400_000), end: new Date(now.getTime() - 28 * 86400_000) },
    long_term: { start: new Date(now.getTime() - 365 * 86400_000), end: new Date(now.getTime() - 180 * 86400_000) },
  };

  for (const range of ranges) {
    const inserted = await synthesizeRange(
      userId,
      range,
      windows[range],
      fingerprint,
      observedDailyRate,
      accessToken
    );
    byRange[range] = inserted;
    total += inserted;
  }

  logger.info({ userId, total, byRange }, 'synthetic: generation complete');
  return { totalPlaysGenerated: total, byRange };
}

async function synthesizeRange(
  userId: string,
  range: 'short_term' | 'medium_term' | 'long_term',
  window: { start: Date; end: Date },
  fp: CircadianFingerprint,
  observedDailyRate: number,
  accessToken: string
): Promise<number> {
  // Total plays in this window = daily rate × days. Older ranges decay
  // because users typically listened a bit less in months past (and rough
  // novelty factor — they didn't have THESE artists in heavy rotation a
  // year ago).
  const days = (window.end.getTime() - window.start.getTime()) / 86400_000;
  const decay = range === 'short_term' ? 1.0 : range === 'medium_term' ? 0.6 : 0.35;
  const totalPlaysTarget = Math.min(
    Math.round(observedDailyRate * days * decay),
    MAX_PLAYS_PER_RANGE
  );

  // Pull the snapshot for this range (already populated by bootstrap).
  const trackSnap = await db.topTrackSnapshot.findMany({
    where: { userId, range },
    orderBy: { rank: 'asc' },
    select: { trackId: true, rank: true },
  });

  // If the snapshot is missing (cold-start user where bootstrap hasn't
  // landed yet), fetch top tracks live as a fallback. Safe because synth
  // is only triggered after the user has connected Spotify.
  let tracks: { id: string; rank: number; durationMs: number | null }[];
  if (trackSnap.length === 0) {
    try {
      const live = await spotifyGet<TopTracksResp>(
        `/me/top/tracks?time_range=${range}&limit=50`,
        accessToken
      );
      tracks = live.items.map((t, i) => ({
        id: t.id,
        rank: i + 1,
        durationMs: t.duration_ms,
      }));
    } catch {
      return 0;
    }
  } else {
    // Look up durations from our Track table.
    const trackRows = await db.track.findMany({
      where: { id: { in: trackSnap.map((t) => t.trackId) } },
      select: { id: true, durationMs: true },
    });
    const durMap = new Map(trackRows.map((t) => [t.id, t.durationMs]));
    tracks = trackSnap.map((t) => ({
      id: t.trackId,
      rank: t.rank,
      durationMs: durMap.get(t.trackId) ?? null,
    }));
  }
  if (tracks.length === 0) return 0;

  // Top artists: use their /artists/{id}/top-tracks to add a few more tracks
  // per top artist that the user probably listens to but aren't in their
  // top-tracks list. Caps the total artist-derived tracks to avoid blowing
  // out the synthesized payload.
  const artistSnap = await db.topArtistSnapshot.findMany({
    where: { userId, range },
    orderBy: { rank: 'asc' },
    take: 20, // top 20 artists per range — enough flavor without exploding cost
    select: { artistId: true, rank: true },
  });

  const knownTrackIds = new Set(tracks.map((t) => t.id));
  const artistDerived: { id: string; rank: number; durationMs: number | null }[] = [];
  let artistDerivedRankCounter = tracks.length + 1;
  for (const a of artistSnap.slice(0, 10)) {
    try {
      const top = await spotifyGet<ArtistTopTracksResp>(
        `/artists/${a.artistId}/top-tracks?market=from_token`,
        accessToken
      );
      // Take 2 tracks per artist that aren't already in the user's top-
      // tracks list. These get artist-rank-derived ranking so they
      // contribute proportionally less than direct top tracks.
      let added = 0;
      for (const t of top.tracks) {
        if (added >= 2) break;
        if (knownTrackIds.has(t.id)) continue;
        knownTrackIds.add(t.id);
        // Make sure the Track row exists so the FK passes.
        await db.track
          .upsert({
            where: { id: t.id },
            create: {
              id: t.id,
              name: t.name,
              artistNames: t.artists.map((aa) => aa.name),
              artistIds: t.artists.map((aa) => aa.id),
              albumName: t.album.name,
              albumId: t.album.id,
              imageUrl: t.album.images[0]?.url ?? null,
              durationMs: t.duration_ms,
            },
            update: {},
          })
          .catch(() => undefined);
        artistDerived.push({
          id: t.id,
          rank: artistDerivedRankCounter++,
          durationMs: t.duration_ms,
        });
        added++;
      }
    } catch {
      // Skip artists we can't fetch; log spam not worth it for 50/range.
    }
  }

  const allTracks = [...tracks, ...artistDerived];
  if (allTracks.length === 0) return 0;

  const counts = zipfPlayCounts(allTracks.length, totalPlaysTarget);

  // Build event rows. Spread across the time window using the fingerprint
  // for hour-of-day weighting.
  const events: { trackId: string; playedAt: Date; msPlayed: number }[] = [];
  for (let i = 0; i < allTracks.length; i++) {
    const t = allTracks[i];
    const c = counts[i];
    const dur = t.durationMs ?? 210_000; // 3:30 default if Spotify didn't give us a length
    const msPlayedTypical = Math.round(dur * 0.85); // assume 85% completion on average
    for (let j = 0; j < c; j++) {
      events.push({
        trackId: t.id,
        playedAt: pickPlayedAt(fp, window.start, window.end),
        msPlayed: msPlayedTypical,
      });
    }
  }

  // Insert in chunks of 1000 to keep memory and DB roundtrips reasonable.
  // skipDuplicates handles the rare collision on (userId, trackId, playedAt).
  let inserted = 0;
  const CHUNK = 1000;
  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK);
    const result = await db.listeningEvent.createMany({
      data: chunk.map((e) => ({
        userId,
        trackId: e.trackId,
        playedAt: e.playedAt,
        msPlayed: e.msPlayed,
        source: 'synthetic',
      })),
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  return inserted;
}
