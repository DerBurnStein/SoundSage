import type { TimeRange } from '@/types';

export interface ParsedRange {
  range: TimeRange;
  from: Date;
  to: Date;
  /** Bucket size implied by the range — used by activity/weekly aggregations */
  grain: 'hour' | 'day' | 'week' | 'month';
}

const VALID_RANGES: ReadonlySet<TimeRange> = new Set([
  '24h',
  '7d',
  '4w',
  '6m',
  '1y',
  'all',
]);

export function isTimeRange(v: string | null | undefined): v is TimeRange {
  return !!v && VALID_RANGES.has(v as TimeRange);
}

/**
 * Parses a `?range=` query param into a concrete date window + a sensible
 * default bucket grain. `to` is always "now".
 *
 * For `all`: `from` is the Unix epoch — caller should clamp to the user's
 * earliest event if needed. The Postgres planner handles the wide range fine
 * with our `(userId, playedAt DESC)` index.
 */
export function parseRange(input: string | null | undefined): ParsedRange {
  const range: TimeRange = isTimeRange(input) ? input : '4w';
  const to = new Date();
  const from = new Date(to);

  switch (range) {
    case '24h':
      from.setUTCHours(from.getUTCHours() - 24);
      return { range, from, to, grain: 'hour' };
    case '7d':
      from.setUTCDate(from.getUTCDate() - 7);
      return { range, from, to, grain: 'day' };
    case '4w':
      from.setUTCDate(from.getUTCDate() - 28);
      return { range, from, to, grain: 'day' };
    case '6m':
      from.setUTCMonth(from.getUTCMonth() - 6);
      return { range, from, to, grain: 'week' };
    case '1y':
      from.setUTCFullYear(from.getUTCFullYear() - 1);
      return { range, from, to, grain: 'week' };
    case 'all':
      return { range, from: new Date(0), to, grain: 'month' };
  }
}
