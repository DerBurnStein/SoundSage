// SoundSage — ConnectionPill
// Shows Spotify auth state in the masthead.
// In production: replace the fetch with useSession() from next-auth/react.

'use client';

import { useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

interface AuthState {
  loading:   boolean;
  connected: boolean;
  name:      string;
  demo:      boolean;
}

export function ConnectionPill() {
  const { data: session, status } = useSession();

  const auth: AuthState = {
    loading:   status === 'loading',
    connected: status === 'authenticated',
    name:      session?.user?.name ?? 'Not connected',
    demo:      false,
  };

  if (auth.loading) {
    return (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
        ·  ·  ·
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {!auth.connected ? (
        <button
          onClick={() => signIn('spotify')}
          style={{
            border: '1px solid var(--ink)',
            background: 'var(--ink)', color: 'var(--paper)',
            fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.04em', padding: '8px 16px', cursor: 'pointer',
          }}
        >
          Connect Spotify
        </button>
      ) : (
        <>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
              {auth.name}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.05em' }}>
              ● linked · syncing every 15m
            </div>
          </div>
          <button
            onClick={() => signOut()}
            style={{
              width: 36, height: 36, borderRadius: 18,
              background: 'var(--ink)', color: 'var(--paper)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 16,
            }}
          >
            {auth.name.charAt(0).toUpperCase()}
          </button>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// NOTE: Wire up next-auth Spotify provider in:
//   app/api/auth/[...nextauth]/route.ts
//
//   import NextAuth from 'next-auth';
//   import SpotifyProvider from 'next-auth/providers/spotify';
//
//   export const { handlers, auth } = NextAuth({
//     providers: [
//       SpotifyProvider({
//         clientId:     process.env.SPOTIFY_CLIENT_ID!,
//         clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
//         authorization: {
//           params: {
//             scope: [
//               'user-read-recently-played',
//               'user-read-currently-playing',
//               'user-top-read',
//               'user-read-email',
//             ].join(' '),
//           },
//         },
//       }),
//     ],
//     callbacks: {
//       async jwt({ token, account }) {
//         if (account) {
//           token.accessToken  = account.access_token;
//           token.refreshToken = account.refresh_token;
//           token.expiresAt    = account.expires_at;
//         }
//         return token;
//       },
//       async session({ session, token }) {
//         session.accessToken = token.accessToken as string;
//         return session;
//       },
//     },
//   });
// ─────────────────────────────────────────────────────
