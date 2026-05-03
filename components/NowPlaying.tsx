// SoundSage — NowPlaying widget
// Live Spotify "currently playing" card embedded in the Masthead. Polls
// /api/spotify/currently-playing every 3s while the tab is focused; ticks a
// local progress counter every second between polls so the bar moves
// smoothly without hammering the API.
//
// The widget always renders its outer container so the masthead height
// stays constant — when nothing's playing we just swap the inner content
// for an idle placeholder. That avoids the layout shift that happens when
// playback starts/stops.

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { Caps, Mono, cleanTrackName, cleanAlbumName, pad2 } from './primitives';
import type { NowPlayingResponse } from '@/app/api/spotify/currently-playing/route';

const POLL_INTERVAL = 3_000;
const ART_SIZE = 56;

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${pad2(s)}`;
}

export function NowPlaying() {
  const { status } = useSession();

  const { data } = useQuery<NowPlayingResponse>({
    queryKey: ['now-playing'],
    queryFn: async () => {
      const r = await fetch('/api/spotify/currently-playing', { cache: 'no-store' });
      if (!r.ok) return { playing: false };
      return (await r.json()) as NowPlayingResponse;
    },
    enabled: status === 'authenticated',
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Local progress ticker. Resets on each poll; advances 1s per second so
  // the progress bar reads smoothly between server updates.
  const [localProgress, setLocalProgress] = useState(0);
  useEffect(() => {
    if (!data?.playing || !data.track) return;
    setLocalProgress(data.progressMs ?? 0);
    const id = setInterval(() => {
      setLocalProgress((p) => Math.min(p + 1000, data.track!.durationMs));
    }, 1000);
    return () => clearInterval(id);
  }, [data?.playing, data?.progressMs, data?.track]);

  // No widget at all when signed out — no music identity to surface.
  // For 'loading' (the brief moment after page load before session resolves)
  // we still render the placeholder so the masthead height is stable from
  // the very first frame — otherwise the header would grow when auth lands.
  if (status === 'unauthenticated') return null;

  const isPlaying =
    status === 'authenticated' && data?.playing === true && data.track != null;
  const track = isPlaying ? data!.track! : null;

  const progressPct = isPlaying && track
    ? Math.min(100, (localProgress / track.durationMs) * 100)
    : 0;
  const remaining = isPlaying && track ? track.durationMs - localProgress : 0;
  const artistLine = track ? track.artists.map((a) => a.name).join(', ') : '';

  return (
    <div
      style={{
        // Inline in the masthead logo row, between hanko/title and the
        // connection pill. Always rendered (even when idle) so the row
        // height is stable.
        flex: '1 1 auto',
        minWidth: 0,
        maxWidth: 506,
        margin: '0 24px',
        padding: '10px 14px',
        background: 'var(--paper-2)',
        border: '1px solid var(--rule)',
        display: 'grid',
        gridTemplateColumns: `${ART_SIZE}px 1fr auto`,
        alignItems: 'center',
        gap: 14,
      }}
    >
      {/* Album art (or 聴 placeholder when idle / no image) */}
      <div
        style={{
          width: ART_SIZE,
          height: ART_SIZE,
          background: 'var(--ink)',
          border: '1px solid var(--rule)',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isPlaying && track?.album.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.album.imageUrl}
            alt=""
            width={ART_SIZE}
            height={ART_SIZE}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span
            style={{
              fontFamily: 'var(--font-mincho)',
              color: 'var(--paper)',
              fontSize: 26,
              opacity: 0.85,
            }}
          >
            聴
          </span>
        )}
      </div>

      {/* Title block */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: isPlaying ? 'var(--ember)' : 'var(--dim)',
              animation: isPlaying ? 'pulse 1.6s ease-in-out infinite' : 'none',
              flexShrink: 0,
            }}
          />
          <Caps>Now playing</Caps>
        </div>

        {/* Always render two lines — title + sub — so the title block is
            the same height in both playing and idle states. */}
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 500,
            fontSize: 16,
            color: isPlaying ? 'var(--ink)' : 'var(--dim)',
            fontStyle: isPlaying ? 'normal' : 'italic',
            letterSpacing: '-0.005em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={
            isPlaying && track
              ? `${cleanTrackName(track.name)} — ${artistLine}`
              : undefined
          }
        >
          {isPlaying && track ? cleanTrackName(track.name) : 'Nothing currently playing'}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mincho)',
            fontStyle: 'italic',
            fontSize: 12,
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            marginTop: 1,
            // Non-breaking space keeps the line height when no content
            minHeight: '1em',
          }}
        >
          {isPlaying && track ? (
            <>
              {artistLine}
              {track.album.name && (
                <>
                  {' · '}
                  <span style={{ color: 'var(--dim)' }}>{cleanAlbumName(track.album.name)}</span>
                </>
              )}
            </>
          ) : (
            ' '
          )}
        </div>

        {/* Progress bar — always present so the title block height is stable */}
        <div
          style={{
            position: 'relative',
            height: 2,
            marginTop: 8,
            background: 'var(--paper-3)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              height: '100%',
              width: `${progressPct}%`,
              background: 'var(--ember)',
              transition: 'width 1s linear',
            }}
          />
        </div>
      </div>

      {/* Time readouts */}
      <div
        style={{
          textAlign: 'right',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          flexShrink: 0,
        }}
      >
        <Mono style={{ fontSize: 11, color: isPlaying ? 'var(--ink)' : 'var(--dim)' }}>
          {isPlaying ? formatTime(localProgress) : '—:——'}
        </Mono>
        <Mono style={{ fontSize: 10, color: 'var(--dim)' }}>
          {isPlaying ? `−${formatTime(remaining)}` : '—:——'}
        </Mono>
      </div>
    </div>
  );
}
