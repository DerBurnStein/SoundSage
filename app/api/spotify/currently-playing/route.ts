import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { ensureFreshToken } from '@/lib/spotify-tokens';

// Lightweight shape — strips most of Spotify's verbose response. Used by
// the masthead NowPlaying widget which polls every ~10s while a user is
// active, so we keep the payload tiny.

export interface NowPlayingResponse {
  playing: boolean;
  track?: {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
    album: {
      name: string;
      imageUrl: string | null;
    };
    durationMs: number;
  };
  progressMs?: number;
}

interface SpotifyCurrentlyPlaying {
  is_playing: boolean;
  progress_ms: number | null;
  item: null | {
    id: string;
    name: string;
    duration_ms: number;
    artists: { id: string; name: string }[];
    album: {
      name: string;
      images: { url: string; width: number; height: number }[];
    };
    type?: string; // "track" or "episode"
  };
  currently_playing_type?: string;
}

const NOT_PLAYING: NowPlayingResponse = { playing: false };

export async function GET(): Promise<NextResponse<NowPlayingResponse>> {
  const { session, error } = await requireAuth({ allowDemo: true });
  if (error) return error as NextResponse<NowPlayingResponse>;

  let accessToken: string;
  try {
    accessToken = await ensureFreshToken(session.userId);
  } catch {
    // No Spotify connected, or token revoked
    return NextResponse.json(NOT_PLAYING);
  }

  // Direct fetch (not spotifyGet) — we don't want this to count against the
  // sync rate limiter, and we don't want to retry on 429 here (just return
  // not-playing and let the next poll catch up).
  let res: Response;
  try {
    res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'SoundSage/1.0',
      },
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(NOT_PLAYING);
  }

  // 204 No Content = nothing playing. 202 Accepted = also "nothing useful".
  if (res.status === 204 || res.status === 202) {
    return NextResponse.json(NOT_PLAYING);
  }
  if (!res.ok) {
    return NextResponse.json(NOT_PLAYING);
  }

  let data: SpotifyCurrentlyPlaying;
  try {
    data = (await res.json()) as SpotifyCurrentlyPlaying;
  } catch {
    return NextResponse.json(NOT_PLAYING);
  }

  // Skip podcasts / episodes — we only show track plays in the widget
  if (
    !data.item ||
    !data.is_playing ||
    data.item.type === 'episode' ||
    data.currently_playing_type === 'episode'
  ) {
    return NextResponse.json(NOT_PLAYING);
  }

  return NextResponse.json({
    playing: true,
    track: {
      id: data.item.id,
      name: data.item.name,
      artists: data.item.artists.map((a) => ({ id: a.id, name: a.name })),
      album: {
        name: data.item.album.name,
        imageUrl: data.item.album.images[0]?.url ?? null,
      },
      durationMs: data.item.duration_ms,
    },
    progressMs: data.progress_ms ?? 0,
  });
}
