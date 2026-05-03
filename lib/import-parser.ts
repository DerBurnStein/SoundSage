// Streaming parser for Spotify's Extended Streaming History ZIP exports.
//
// The export contains JSON files like:
//   - Streaming_History_Audio_2018-2019_0.json
//   - Streaming_History_Audio_2019-2020_1.json
//   - endsong_2020.json (older format, same shape)
//
// Each file is a JSON array of play events with this shape (subset shown):
//   {
//     "ts": "2021-01-01T12:34:56Z",
//     "ms_played": 234567,
//     "master_metadata_track_name": "...",
//     "master_metadata_album_artist_name": "...",
//     "master_metadata_album_album_name": "...",
//     "spotify_track_uri": "spotify:track:abc123",
//     "spotify_episode_uri": null,         // present for podcasts
//     "audiobook_uri": null                // present for audiobooks
//   }
//
// Memory note: an unbounded JSON.parse() of a 100MB+ history file OOMs the
// 512MB Cloud Run instance. We stream the array elements one at a time via
// stream-json, so peak memory stays small regardless of file size.

import unzipper from 'unzipper';
import { parser as jsonParser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { chain } from 'stream-chain';

export interface ParsedHistoryEvent {
  trackId: string;
  trackName: string;
  artistName: string;
  albumName: string;
  playedAt: Date;
  msPlayed: number;
}

interface RawSpotifyEntry {
  ts: string;
  ms_played: number;
  master_metadata_track_name: string | null;
  master_metadata_album_artist_name: string | null;
  master_metadata_album_album_name: string | null;
  spotify_track_uri: string | null;
  spotify_episode_uri?: string | null;
  audiobook_uri?: string | null;
}

// Spotify counts a play if ≥30s. Same threshold for our event filter.
const MIN_MS_PLAYED = 30_000;

const FILENAME_RE = /(?:Streaming_History_Audio_.*|endsong_.*)\.json$/i;
const TRACK_URI_PREFIX = 'spotify:track:';

export interface ParseStats {
  filesProcessed: number;
  totalEntries: number;
  filteredOut: {
    podcast: number;
    audiobook: number;
    incomplete: number; // missing track URI or metadata
    tooShort: number; // ms_played < 30s
  };
  yielded: number;
}

export interface ParseOptions {
  /** Called with each batch of valid events. Awaited before parsing continues. */
  onBatch: (events: ParsedHistoryEvent[]) => Promise<void>;
  /** Called periodically with progress (running totals). Best-effort. */
  onProgress?: (stats: ParseStats) => void | Promise<void>;
  batchSize?: number;
  progressEveryN?: number;
}

/**
 * Streams through a Spotify Extended History ZIP and emits batches of
 * normalized events. Returns final stats.
 */
export async function parseSpotifyHistoryZip(
  zipBuffer: Buffer,
  options: ParseOptions
): Promise<ParseStats> {
  const batchSize = options.batchSize ?? 1000;
  const progressEveryN = options.progressEveryN ?? 5000;

  const stats: ParseStats = {
    filesProcessed: 0,
    totalEntries: 0,
    filteredOut: { podcast: 0, audiobook: 0, incomplete: 0, tooShort: 0 },
    yielded: 0,
  };

  let batch: ParsedHistoryEvent[] = [];
  let entriesSinceProgress = 0;

  const directory = await unzipper.Open.buffer(zipBuffer);

  for (const file of directory.files) {
    if (!FILENAME_RE.test(file.path)) continue;
    stats.filesProcessed++;

    // chain composes the streams with cooperating types: unzipper's Node
    // Readable → stream-json parser → array streamer.
    const pipeline = chain([file.stream(), jsonParser(), streamArray()]);

    for await (const item of pipeline) {
      const entry = (item as { value: RawSpotifyEntry }).value;
      stats.totalEntries++;
      entriesSinceProgress++;

      // Filter podcasts and audiobooks early
      if (entry.spotify_episode_uri) {
        stats.filteredOut.podcast++;
        continue;
      }
      if (entry.audiobook_uri) {
        stats.filteredOut.audiobook++;
        continue;
      }
      if (
        !entry.spotify_track_uri ||
        !entry.spotify_track_uri.startsWith(TRACK_URI_PREFIX) ||
        !entry.master_metadata_track_name ||
        !entry.master_metadata_album_artist_name ||
        !entry.ts
      ) {
        stats.filteredOut.incomplete++;
        continue;
      }
      if (entry.ms_played < MIN_MS_PLAYED) {
        stats.filteredOut.tooShort++;
        continue;
      }

      batch.push({
        trackId: entry.spotify_track_uri.slice(TRACK_URI_PREFIX.length),
        trackName: entry.master_metadata_track_name,
        artistName: entry.master_metadata_album_artist_name,
        albumName: entry.master_metadata_album_album_name ?? '',
        playedAt: new Date(entry.ts),
        msPlayed: entry.ms_played,
      });
      stats.yielded++;

      if (batch.length >= batchSize) {
        await options.onBatch(batch);
        batch = [];
      }
      if (entriesSinceProgress >= progressEveryN) {
        entriesSinceProgress = 0;
        await options.onProgress?.(stats);
      }
    }
  }

  if (batch.length > 0) {
    await options.onBatch(batch);
  }
  await options.onProgress?.(stats);

  return stats;
}
