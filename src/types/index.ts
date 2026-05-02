// SoundSage — shared TypeScript types
// Place in: packages/shared/types.ts  OR  src/types/index.ts

// ─────────────────────────────────────────────────────
// Domain types — mirror the Prisma schema
// ─────────────────────────────────────────────────────

export type TimeRange = '24h' | '7d' | '4w' | '6m' | '1y' | 'all';
export type TabId = 'overview' | 'history' | 'patterns' | 'tracks' | 'artists';
export type ThemeId = 'paper' | 'midnight';
export type DensityId = 'compact' | 'regular' | 'roomy';

export interface UserPrefs {
  theme:   ThemeId;
  density: DensityId;
  showSync: boolean;
}

// ─────────────────────────────────────────────────────
// API response shapes — mirror the API contract exactly
// ─────────────────────────────────────────────────────

/** GET /api/stats/overview */
export interface OverviewStats {
  totalPlays:      number;
  uniqueTracks:    number;
  totalMs:         number;
  topHour:         number;   // 0–23
  newArtists:      number;
  discoveryRate:   number;   // 0–1
  range: {
    from: string;            // ISO 8601
    to:   string;
  };
}

/** GET /api/stats/activity  (grain: day | week | month) */
export interface ActivityBucket {
  t:     string;             // ISO date string for the bucket start
  plays: number;
  mins:  number;
}
export interface ActivityStats {
  buckets: ActivityBucket[];
  grain:   'day' | 'week' | 'month';
}

/** GET /api/stats/hourly */
export interface HourlyBucket {
  hour:  number;             // 0–23
  plays: number;
}
export interface HourlyStats {
  buckets: HourlyBucket[];   // always 24 elements
}

/** GET /api/stats/genres */
export interface GenreStat {
  name:  string;
  plays: number;
  share: number;             // 0–1
}
export interface GenreStats {
  genres: GenreStat[];
}

/** GET /api/stats/weekly (12-week sparkline) */
export interface WeeklySpark {
  weeks: number[];           // 12 elements, mins per week
}

/** GET /api/tracks/top */
export interface ArtistRef {
  id:   string;
  name: string;
}
export interface AlbumRef {
  id:       string;
  name:     string;
  imageUrl: string | null;
}
export interface TopTrack {
  id:           string;      // Spotify URI
  name:         string;
  artists:      ArtistRef[];
  album:        AlbumRef;
  plays:        number;
  totalMs:      number;
  lastPlayedAt: string;
}
export interface TopTracksResponse {
  tracks: TopTrack[];
  range:  TimeRange;
}

/** GET /api/artists/top */
export interface TopArtist {
  id:           string;
  name:         string;
  imageUrl:     string | null;
  genres:       string[];
  plays:        number;
  uniqueTracks: number;
  share:        number;      // fraction of total plays in range
}
export interface TopArtistsResponse {
  artists: TopArtist[];
  range:   TimeRange;
}

/** GET /api/history/recent */
export interface RecentEvent {
  id:       string;
  playedAt: string;
  track: {
    id:      string;
    name:    string;
    artists: ArtistRef[];
    album:   AlbumRef;
    durationMs: number;
  };
}
export interface RecentHistoryResponse {
  events:     RecentEvent[];
  nextCursor: string | null;
}

/** GET /api/sync/status */
export type SyncLag    = 'fresh' | 'stale' | 'broken';
export type TokenState = 'fresh' | 'expiring' | 'expired';
export interface SyncStatus {
  lastSyncAt:    string | null;
  cursor:        string | null;
  lag:           SyncLag;
  failureCount:  number;
  tokens:        TokenState;
  eventCount:    number;
  eventsToday:   number;
}

/** POST /api/sync/trigger */
export interface TriggerSyncResponse {
  jobId: string;
}
