import { z } from 'zod';

// Zod schemas mirroring every interface in types.ts. These are the canonical
// runtime contracts every API route is expected to satisfy. CI contract tests
// parse responses against these — drift fails the build.

// ─── Primitives ───────────────────────────────────────────────────────────────

export const TimeRangeSchema = z.enum(['24h', '7d', '4w', '6m', '1y', 'all']);

export const ArtistRefSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const AlbumRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
});

// ─── /api/stats/overview ──────────────────────────────────────────────────────

export const OverviewStatsSchema = z.object({
  totalPlays: z.number().int().nonnegative(),
  uniqueTracks: z.number().int().nonnegative(),
  totalMs: z.number().int().nonnegative(),
  topHour: z.number().int().min(0).max(23),
  newArtists: z.number().int().nonnegative(),
  discoveryRate: z.number().min(0).max(1),
  range: z.object({
    from: z.string(),
    to: z.string(),
  }),
});

// ─── /api/stats/activity ──────────────────────────────────────────────────────

export const ActivityBucketSchema = z.object({
  t: z.string(),
  plays: z.number().int().nonnegative(),
  mins: z.number().nonnegative(),
});

export const ActivityStatsSchema = z.object({
  buckets: z.array(ActivityBucketSchema),
  grain: z.enum(['day', 'week', 'month']),
});

// ─── /api/stats/hourly ────────────────────────────────────────────────────────

export const HourlyBucketSchema = z.object({
  hour: z.number().int().min(0).max(23),
  plays: z.number().int().nonnegative(),
});

export const HourlyStatsSchema = z.object({
  buckets: z.array(HourlyBucketSchema).length(24),
});

// ─── /api/stats/genres ────────────────────────────────────────────────────────

export const GenreStatSchema = z.object({
  name: z.string(),
  plays: z.number().int().nonnegative(),
  share: z.number().min(0).max(1),
});

export const GenreStatsSchema = z.object({
  genres: z.array(GenreStatSchema),
});

// ─── /api/stats/weekly ────────────────────────────────────────────────────────

export const WeeklySparkSchema = z.object({
  weeks: z.array(z.number().nonnegative()).length(12),
});

// ─── /api/tracks/top ──────────────────────────────────────────────────────────

export const TopTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  artists: z.array(ArtistRefSchema),
  album: AlbumRefSchema,
  plays: z.number().int().nonnegative(),
  totalMs: z.number().int().nonnegative(),
  lastPlayedAt: z.string(),
});

export const TopTracksResponseSchema = z.object({
  tracks: z.array(TopTrackSchema),
  range: TimeRangeSchema,
});

// ─── /api/artists/top ─────────────────────────────────────────────────────────

export const TopArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  genres: z.array(z.string()),
  plays: z.number().int().nonnegative(),
  uniqueTracks: z.number().int().nonnegative(),
  share: z.number().min(0).max(1),
});

export const TopArtistsResponseSchema = z.object({
  artists: z.array(TopArtistSchema),
  range: TimeRangeSchema,
});

// ─── /api/history/recent ──────────────────────────────────────────────────────

export const RecentEventSchema = z.object({
  id: z.string(),
  playedAt: z.string(),
  track: z.object({
    id: z.string(),
    name: z.string(),
    artists: z.array(ArtistRefSchema),
    album: AlbumRefSchema,
    durationMs: z.number().int().nonnegative(),
  }),
});

export const RecentHistoryResponseSchema = z.object({
  events: z.array(RecentEventSchema),
  nextCursor: z.string().nullable(),
});

// ─── /api/sync/status ─────────────────────────────────────────────────────────

export const SyncLagSchema = z.enum(['fresh', 'stale', 'broken']);
export const TokenStateSchema = z.enum(['fresh', 'expiring', 'expired']);

export const SyncStatusSchema = z.object({
  lastSyncAt: z.string().nullable(),
  cursor: z.string().nullable(),
  lag: SyncLagSchema,
  failureCount: z.number().int().nonnegative(),
  tokens: TokenStateSchema,
  eventCount: z.number().int().nonnegative(),
  eventsToday: z.number().int().nonnegative(),
});

// ─── /api/sync/trigger ────────────────────────────────────────────────────────

export const TriggerSyncResponseSchema = z.object({
  jobId: z.string(),
});
