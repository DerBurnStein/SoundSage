// SoundSage — API client helpers
// Typed fetch wrappers for every dashboard endpoint.
// Use these in server components (no cache key = no SWR) OR
// pass the fetcher to React Query on the client.

import type {
  TimeRange,
  OverviewStats,
  ActivityStats,
  HourlyStats,
  GenreStats,
  WeeklySpark,
  TopTracksResponse,
  TopArtistsResponse,
  RecentHistoryResponse,
  SyncStatus,
  TriggerSyncResponse,
} from '../types';

// ─────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? '';

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), {
    // In App Router server components, add `next: { revalidate: 300 }` for ISR.
    next: { revalidate: 300 },
    credentials: 'include',
  });
  if (!r.ok) throw new Error(`API ${path} returned ${r.status}`);
  return r.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`API ${path} returned ${r.status}`);
  return r.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────

/** Overview KPIs */
export const fetchOverview = (range: TimeRange) =>
  get<OverviewStats>('/api/stats/overview', { range });

/** Daily / weekly activity buckets */
export const fetchActivity = (range: TimeRange, grain: 'day' | 'week' = 'day') =>
  get<ActivityStats>('/api/stats/activity', { range, grain });

/** 24-hour play distribution */
export const fetchHourly = (range: TimeRange) =>
  get<HourlyStats>('/api/stats/hourly', { range });

/** Genre composition */
export const fetchGenres = (range: TimeRange, limit = 8) =>
  get<GenreStats>('/api/stats/genres', { range, limit: String(limit) });

/** 12-week sparkline */
export const fetchWeeklySpark = () =>
  get<WeeklySpark>('/api/stats/weekly');

/** Top tracks */
export const fetchTopTracks = (range: TimeRange, limit = 20) =>
  get<TopTracksResponse>('/api/tracks/top', { range, limit: String(limit) });

/** Top artists */
export const fetchTopArtists = (range: TimeRange, limit = 20) =>
  get<TopArtistsResponse>('/api/artists/top', { range, limit: String(limit) });

/** Recent play history (cursor-paginated) */
export const fetchRecent = (cursor?: string, limit = 50) =>
  get<RecentHistoryResponse>('/api/history/recent', {
    ...(cursor ? { cursor } : {}),
    limit: String(limit),
  });

/** Ingestion pipeline status */
export const fetchSyncStatus = () =>
  get<SyncStatus>('/api/sync/status');

/** Trigger a manual sync job */
export const triggerSync = () =>
  post<TriggerSyncResponse>('/api/sync/trigger');

// ─────────────────────────────────────────────────────
// React Query keys (use these in useQuery calls)
// ─────────────────────────────────────────────────────
export const QUERY_KEYS = {
  overview:    (range: TimeRange) => ['stats', 'overview', range] as const,
  activity:    (range: TimeRange) => ['stats', 'activity', range] as const,
  hourly:      (range: TimeRange) => ['stats', 'hourly',   range] as const,
  genres:      (range: TimeRange) => ['stats', 'genres',   range] as const,
  weeklySpark: ()                  => ['stats', 'weekly']          as const,
  topTracks:   (range: TimeRange) => ['tracks', 'top',     range] as const,
  topArtists:  (range: TimeRange) => ['artists', 'top',    range] as const,
  recent:      ()                  => ['history', 'recent']        as const,
  syncStatus:  ()                  => ['sync', 'status']           as const,
};
