'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';

// Inline SVG of Spotify's logo: green circle + three white sound-wave arcs.
// Self-contained so we don't pull in @icons or asset bundling.
function SpotifyLogo({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 168 168"
      aria-label="Spotify"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <circle cx="84" cy="84" r="84" fill="#1ED760" />
      <path
        d="M132.7 121.5c-1.9 3.1-6 4-9.1 2.1-24.9-15.2-56.2-18.6-93-10.2-3.5.8-7-1.4-7.8-4.9-.8-3.5 1.4-7 4.9-7.8 40.4-9.2 75.1-5.2 103.1 11.7 3.1 1.9 4 6 2.1 9.1zM146.8 95c-2.4 3.9-7.5 5.1-11.4 2.7-28.5-17.5-72-22.6-105.7-12.4-4.3 1.3-8.9-1.1-10.2-5.4-1.3-4.3 1.1-8.9 5.4-10.2 38.5-11.7 86.7-6 119.4 14 3.9 2.4 5.1 7.5 2.7 11.3zM148 67.3C113.9 47 57.3 45 24.6 54.9c-5.2 1.6-10.7-1.4-12.3-6.6-1.6-5.2 1.4-10.7 6.6-12.3 37.5-11.4 100-9 139.3 14.3 4.7 2.8 6.2 8.9 3.4 13.5-2.7 4.7-8.8 6.2-13.6 3.5z"
        fill="#000"
      />
    </svg>
  );
}

interface SpotifyConnection {
  connected: boolean;
  spotifyUserId?: string;
  displayName?: string | null;
  imageUrl?: string | null;
  lastSyncAt?: string | null;
  needsReconnect?: boolean;
}

export function ConnectionPill() {
  const { data: session, status } = useSession();
  const [spotify, setSpotify] = useState<SpotifyConnection | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch('/api/spotify/connection')
      .then((r) => r.json())
      .then(setSpotify)
      .catch(() => setSpotify({ connected: false }));
  }, [status]);

  const handleConnectSpotify = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/spotify/connect/start', { method: 'POST' });
      if (!res.ok) {
        const text = await res.text();
        console.error('Connect Spotify failed:', res.status, text);
        setConnecting(false);
        return;
      }
      const body = (await res.json()) as { url?: string };
      if (!body.url) {
        console.error('Connect Spotify: no URL in response', body);
        setConnecting(false);
        return;
      }
      window.location.href = body.url;
    } catch (err) {
      console.error('Connect Spotify error:', err);
      setConnecting(false);
    }
  };

  if (status === 'unauthenticated') return null;

  // Two loading states are visually identical — the masthead width stays
  // stable as we transition through them:
  //   1. session is still 'loading'
  //   2. session is 'authenticated' but the /api/spotify/connection fetch
  //      hasn't resolved yet (spotify === null)
  const isLoading = status === 'loading' || spotify === null;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ height: 18, width: 130, background: 'var(--paper-2)', marginBottom: 4 }} />
          <div style={{ height: 14, width: 160, background: 'var(--paper-2)' }} />
        </div>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            background: 'var(--paper-2)',
            flexShrink: 0,
          }}
        />
      </div>
    );
  }

  const name = session?.user?.name ?? session?.user?.email ?? 'User';

  // Prefer the user's Spotify avatar when connected (it's the source of
  // truth for "this is your music identity"), fall back to their Google
  // avatar otherwise. Both are external URLs, both safe to <img>.
  const avatarUrl =
    (spotify?.connected && !spotify.needsReconnect ? spotify.imageUrl : null) ??
    session?.user?.image ??
    null;

  // Past this point: status is 'authenticated' AND spotify is non-null.
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {!spotify.connected || spotify.needsReconnect ? (
          <button
            onClick={handleConnectSpotify}
            disabled={connecting}
            style={{
              border: '1px solid var(--ink)',
              background: 'var(--ink)',
              color: 'var(--paper)',
              fontFamily: 'var(--font-sans)',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.04em',
              padding: '8px 16px',
              cursor: 'pointer',
              opacity: connecting ? 0.6 : 1,
            }}
          >
            {connecting ? '…' : spotify.needsReconnect ? 'Reconnect Spotify' : 'Connect Spotify'}
          </button>
        ) : (
          <div style={{ textAlign: 'right' }}>
            <div style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
            }}>
              {name}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--muted)',
              letterSpacing: '0.05em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 3,
            }}>
              <SpotifyLogo size={18} />
              linked
            </div>
          </div>
        )}

      {/* Google account avatar — click to sign out */}
      <button
        onClick={() => signOut({ callbackUrl: '/' })}
        title={`Signed in as ${session?.user?.email ?? ''} — click to sign out`}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          background: 'var(--ink)',
          color: 'var(--paper)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-serif)',
          fontWeight: 600,
          fontSize: 16,
          overflow: 'hidden',
          padding: 0,
          flexShrink: 0,
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          name.charAt(0).toUpperCase()
        )}
      </button>

    </div>
  );
}
