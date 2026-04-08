import { fetchRecentlyPlayed } from './spotifyClient';
import { insertPlayEvents, updateIngestionState } from '../utils/db';

export async function ingestRecentListening(userId: string): Promise<{ fetched: number; inserted: number }> {
  const recent = await fetchRecentlyPlayed(userId, 50);

  const normalized = recent.items
    .filter((item) => item.track?.id)
    .map((item) => ({
      userId,
      spotifyTrackId: item.track.id,
      playedAt: item.played_at,
      trackName: item.track.name,
      artistNames: (item.track.artists ?? []).map((artist) => artist.name ?? 'Unknown Artist'),
      albumName: item.track.album?.name ?? null,
      durationMs: item.track.duration_ms ?? null,
      contextUri: item.context?.uri ?? null,
      rawPayload: item
    }));

  const inserted = await insertPlayEvents(normalized);
  const latestPlayedAt = normalized.length > 0 ? normalized[0].playedAt : null;
  await updateIngestionState(userId, latestPlayedAt, inserted);

  return {
    fetched: normalized.length,
    inserted
  };
}
