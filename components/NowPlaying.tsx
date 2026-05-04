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

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Caps, Mono, cleanTrackName, cleanAlbumName, pad2 } from './primitives';
import type { NowPlayingResponse } from '@/app/api/spotify/currently-playing/route';

// Poll cadences:
//   • FAST while music is playing (or recently was)
//   • SLOW after IDLE_THRESHOLD of nothing-playing — saves API quota when
//     the user has stopped listening but left the tab open. The tab returns
//     to FAST as soon as something starts playing or the window regains
//     focus (refetchOnWindowFocus triggers a fresh request, and a focus
//     listener resets the idle timer so the next interval lookup uses FAST).
const POLL_FAST       = 5_000;
const POLL_SLOW       = 30_000;
const IDLE_THRESHOLD  = 2 * 60 * 1000;
const ART_SIZE        = 56;

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${pad2(s)}`;
}

export function NowPlaying() {
  const { status } = useSession();
  const queryClient = useQueryClient();

  // Cheap connection check so we don't poll currently-playing once the
  // user has disconnected Spotify from the Settings menu. /api/spotify/
  // connection is a single DB lookup and is allowed to go stale for
  // minutes — the only thing that flips it is a user-initiated connect
  // or disconnect, both of which trigger a hard reload.
  const { data: connData } = useQuery<{ connected: boolean }>({
    queryKey: ['spotify-connection'],
    queryFn: async () => {
      const r = await fetch('/api/spotify/connection');
      if (!r.ok) return { connected: false };
      return (await r.json()) as { connected: boolean };
    },
    enabled: status === 'authenticated',
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const connected = connData?.connected ?? false;

  // Records the last time the user was actively listening. Used by the
  // dynamic refetchInterval to back off after IDLE_THRESHOLD of silence.
  // Initialised to "now" so a freshly-mounted widget always polls FAST
  // for the first IDLE_THRESHOLD window.
  const lastActiveAtRef = useRef<number>(Date.now());

  const { data } = useQuery<NowPlayingResponse>({
    queryKey: ['now-playing'],
    queryFn: async () => {
      const r = await fetch('/api/spotify/currently-playing', { cache: 'no-store' });
      if (!r.ok) return { playing: false };
      return (await r.json()) as NowPlayingResponse;
    },
    enabled: status === 'authenticated' && connected,
    // Function form so React Query re-evaluates the cadence after every
    // poll based on the freshest "playing" / "idle" signal.
    refetchInterval: (query) => {
      const d = query.state.data as NowPlayingResponse | undefined;
      if (d?.playing) return POLL_FAST;
      const idleMs = Date.now() - lastActiveAtRef.current;
      return idleMs > IDLE_THRESHOLD ? POLL_SLOW : POLL_FAST;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  // When the API confirms playback, refresh the activity timestamp so the
  // FAST cadence keeps running. (When playback stops we deliberately keep
  // lastActiveAtRef where it is so the IDLE_THRESHOLD timer can age out.)
  useEffect(() => {
    if (data?.playing) lastActiveAtRef.current = Date.now();
  }, [data?.playing]);

  // Transition detection: when the active track changes (A → B, or A → idle),
  // promote A as a finished play immediately. Spotify's /recently-played API
  // trails reality by 30s-2min; this closes that gap and matches stats.fm-
  // grade currency. Quota-free — we're piggy-backing on the existing 5s poll.
  //
  // We track the LAST observed playing track in a ref. We need both the track
  // identity (to detect changes) and the most recent observed progressMs (so
  // we can pass msPlayed to the server, mirroring Spotify's >=30s threshold).
  const lastSeenRef = useRef<{
    track: NonNullable<NowPlayingResponse['track']>;
    lastProgressMs: number;
  } | null>(null);

  useEffect(() => {
    const prev = lastSeenRef.current;
    const current = data?.playing && data.track ? data.track : null;

    // Update memo first — the rest of this effect only fires the promote
    // request, never short-circuits the memo update.
    if (current) {
      lastSeenRef.current = {
        track: current,
        lastProgressMs: data!.progressMs ?? prev?.lastProgressMs ?? 0,
      };
    } else {
      lastSeenRef.current = null;
    }

    // No transition to act on if we hadn't seen anything previously.
    if (!prev) return;

    const prevId = prev.track.id;
    const currId = current?.id ?? null;
    if (prevId === currId) return; // same track, nothing to promote

    // Track changed (or stopped). Treat the previous track as finished. We
    // pass the last-observed progressMs as msPlayed; the server enforces
    // the >=30s minimum so a brief skip won't be recorded.
    const body = {
      track: {
        id: prev.track.id,
        name: prev.track.name,
        artists: prev.track.artists.map((a) => ({ id: a.id, name: a.name })),
        album: { name: prev.track.album.name, imageUrl: prev.track.album.imageUrl },
        durationMs: prev.track.durationMs,
      },
      msPlayed: prev.lastProgressMs,
      endedAt: Date.now(),
    };
    fetch('/api/listening/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(() => {
        // The Recently-played list now has a new entry — refetch so the
        // dashboard reflects it without waiting for the next 15-min sync.
        queryClient.invalidateQueries({ queryKey: ['recent-history'] });
      })
      .catch(() => undefined); // network blips: next transition will retry
  }, [data?.playing, data?.track, data?.progressMs, queryClient]);

  // On window focus: bump the activity timestamp and force an immediate
  // refetch. Together this guarantees that returning to the tab always
  // shows fresh state and resumes FAST polling for at least IDLE_THRESHOLD,
  // regardless of how long the tab was idle.
  useEffect(() => {
    if (status !== 'authenticated') return;
    function onFocus() {
      lastActiveAtRef.current = Date.now();
      queryClient.invalidateQueries({ queryKey: ['now-playing'] });
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [status, queryClient]);

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
    status === 'authenticated' &&
    connected &&
    data?.playing === true &&
    data.track != null;
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
