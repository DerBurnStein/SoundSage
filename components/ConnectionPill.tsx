'use client';

import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';

interface SpotifyConnection {
  connected: boolean;
  spotifyUserId?: string;
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

  if (status === 'loading') {
    return (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
        · · ·
      </span>
    );
  }

  if (status === 'unauthenticated') return null;

  const name = session?.user?.name ?? session?.user?.email ?? 'User';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

      {/* Spotify status — hidden while loading connection state */}
      {spotify !== null && (
        !spotify.connected || spotify.needsReconnect ? (
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
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink)',
            }}>
              {name}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--muted)',
              letterSpacing: '0.05em',
            }}>
              ● linked · syncing every 15m
            </div>
          </div>
        )
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
        {session?.user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
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
