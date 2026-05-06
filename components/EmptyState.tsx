'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Caps, Display } from './primitives';

// ─── Not signed in ────────────────────────────────────────────────────────────

interface SignInPromptProps {
  /** Component to render below — typically the SignInButton */
  action: React.ReactNode;
}

export function SignInPrompt({ action }: SignInPromptProps) {
  return (
    <section
      style={{
        padding: '80px 28px',
        borderBottom: '1px solid var(--rule)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 24,
      }}
    >
      <Caps>聴 · Begin listening</Caps>
      <Display size={56} weight={500} style={{ maxWidth: '24ch', lineHeight: 1.05 }}>
        Sign in to begin keeping your <em style={{ fontFamily: 'var(--font-mincho)' }}>almanac</em>.
      </Display>
      <p
        style={{
          fontFamily: 'var(--font-mincho)',
          fontStyle: 'italic',
          color: 'var(--muted)',
          fontSize: 17,
          maxWidth: '52ch',
          lineHeight: 1.5,
        }}
      >
        SoundSage records what you have been listening to and remembers
        the patterns of your days.
      </p>
      <div
        style={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
        }}
      >
        {action}
        {/* Demo entry — sets the soundsage_demo cookie via /demo/start
            and redirects home, where the auth wrapper synthesizes a
            session backed by the public demo user. Plain anchor (not
            client-side fetch) so the cookie is set on the same response
            that issues the redirect. */}
        <a
          href="/demo/start"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--muted)',
            textDecoration: 'underline',
            textUnderlineOffset: 4,
            letterSpacing: '0.02em',
          }}
        >
          or try the demo without signing in →
        </a>
      </div>
    </section>
  );
}

// ─── Signed in, but no Spotify connection ────────────────────────────────────

interface ConnectSpotifyPromptProps {
  onConnect?: () => void;
}

export function ConnectSpotifyPrompt({ onConnect }: ConnectSpotifyPromptProps) {
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    if (onConnect) return onConnect();
    setBusy(true);
    try {
      const r = await fetch('/api/spotify/connect/start', { method: 'POST' });
      if (!r.ok) {
        setBusy(false);
        return;
      }
      const { url } = (await r.json()) as { url?: string };
      if (url) window.location.href = url;
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <section
      style={{
        padding: '64px 28px 72px',
        borderBottom: '1px solid var(--rule)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 22,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          background: 'var(--seal)',
          color: 'var(--paper)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mincho)',
          fontWeight: 700,
          fontSize: 32,
          borderRadius: 4,
          transform: 'rotate(-3deg)',
          boxShadow: 'inset 0 0 0 2px var(--paper)',
        }}
      >
        繋
      </div>
      <Caps>Connect a source</Caps>
      <Display size={42} weight={500} style={{ maxWidth: '24ch', lineHeight: 1.05 }}>
        Connect Spotify to begin.
      </Display>
      <p
        style={{
          fontFamily: 'var(--font-mincho)',
          fontStyle: 'italic',
          color: 'var(--muted)',
          fontSize: 16,
          maxWidth: '52ch',
        }}
      >
        Once linked, your recently played tracks flow in automatically every fifteen minutes.
      </p>
      <button
        onClick={handleConnect}
        disabled={busy}
        style={{
          border: '1px solid var(--ink)',
          background: 'var(--ink)',
          color: 'var(--paper)',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.04em',
          padding: '12px 22px',
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
          marginTop: 6,
        }}
      >
        {busy ? '…' : 'Connect Spotify'}
      </button>
    </section>
  );
}

// ─── Connected but waiting on first events ───────────────────────────────────

export function FreshSyncWaiting() {
  // Lightweight progress beat. The previous version did a full
  // window.location.reload() every 5 seconds, which tore down the whole
  // page (masthead, NowPlaying widget, fonts, etc.) on every cycle and
  // looked like an infinite refresh loop to the user.
  //
  // The new version polls /api/sync/status — a cheap DB count — and only
  // calls router.refresh() (Next.js soft RSC re-render, no full reload)
  // when events have actually arrived. The dots animation stays as the
  // visible "we're working" cue.
  const [pulse, setPulse] = useState(0);
  const router = useRouter();

  useEffect(() => {
    // Dots animation — purely cosmetic.
    const dotsId = setInterval(() => setPulse((p) => (p + 1) % 3), 800);

    // Poll sync status every 4s. As soon as the user has events, soft-
    // refresh once so the parent (app/page.tsx) re-renders the dashboard
    // with real data instead of this empty-state. After the soft refresh
    // the page will replace this component with charts and the polling
    // stops with it.
    let cancelled = false;
    const pollId = setInterval(async () => {
      try {
        const r = await fetch('/api/sync/status', { cache: 'no-store' });
        if (!r.ok || cancelled) return;
        const data = (await r.json()) as { eventCount?: number };
        if ((data.eventCount ?? 0) > 0) {
          router.refresh();
        }
      } catch {
        // Network blip — try again on the next tick.
      }
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(dotsId);
      clearInterval(pollId);
    };
  }, [router]);

  return (
    <section
      style={{
        padding: '64px 28px',
        borderBottom: '1px solid var(--rule)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 18,
      }}
    >
      <Caps>First sync running</Caps>
      <Display size={36} weight={500} style={{ maxWidth: '32ch', lineHeight: 1.1 }}>
        Gathering your recent plays<span aria-hidden="true">{'.'.repeat(pulse + 1)}</span>
      </Display>
      <p
        style={{
          fontFamily: 'var(--font-mincho)',
          fontStyle: 'italic',
          color: 'var(--muted)',
          fontSize: 15,
          maxWidth: '46ch',
        }}
      >
        Charts will populate in roughly a minute. The page will update on
        its own as soon as your plays arrive.
      </p>
    </section>
  );
}
