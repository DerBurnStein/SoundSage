import { z } from 'zod';
import { ApiError } from './errors.js';

export const queryRangeSchema = z.object({
  range: z.enum(['24h', '7d', '4w', '6m', '1y', 'all']).optional(),
});

export const queryPaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().datetime().optional(),
});

export const syncIngestSchema = z.object({
  events: z.array(z.object({
    spotifyTrackId: z.string().min(1),
    trackName: z.string().min(1),
    artistNames: z.array(z.string()).min(1),
    playedAt: z.string().datetime(),
    msPlayed: z.number().int().positive().optional(),
    genre: z.string().nullable().optional(),
  })).min(1),
});

export function parseOrThrow(schema, data, source = 'request') {
  const out = schema.safeParse(data);
  if (!out.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', `Invalid ${source}`, out.error.flatten());
  }
  return out.data;
}
