// SoundSage — First-login onboarding modal
//
// Spotify's API only exposes the last 24 hours of plays, so a brand-new
// user lands on a dashboard full of empty charts. This modal asks them how
// they want to populate it:
//
//   1. Upload Extended Streaming History ZIP (gold standard, 30-day Spotify wait)
//   2. Connect Last.FM scrobbles (instant + accurate IF they scrobble already)
//   3. Use estimated/synthetic data (instant, labeled, replaced when real data arrives)
//
// Shown automatically when /api/onboarding/state returns
// { completed: false, spotifyConnected: true }. Dismissible via "Skip"; can
// be re-opened from Settings later.

'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Caps } from './primitives';
import type { OnboardingState } from '@/app/api/onboarding/state/route';

type Tab = 'esh' | 'lastfm' | 'synthetic';

export function OnboardingModal() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<OnboardingState>({
    queryKey: ['onboarding-state'],
    queryFn: async () => {
      const r = await fetch('/api/onboarding/state');
      if (!r.ok) throw new Error('failed');
      return (await r.json()) as OnboardingState;
    },
    staleTime: 60_000,
  });

  const [forceOpen, setForceOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('esh');
  const [busyMsg, setBusyMsg] = useState<string | null>(null);

  // Open whenever the user is logged in + Spotify-connected + hasn't picked
  // a path yet. Also when the user opens it explicitly from Settings via
  // a `soundsage:open-onboarding` event (see SettingsButton).
  useEffect(() => {
    function onOpen() {
      setForceOpen(true);
    }
    window.addEventListener('soundsage:open-onboarding', onOpen);
    return () => window.removeEventListener('soundsage:open-onboarding', onOpen);
  }, []);

  if (isLoading || !data) return null;

  const shouldShow = forceOpen || (!data.completed && data.spotifyConnected);
  if (!shouldShow) return null;

  async function dismiss(choice: 'skip') {
    await fetch('/api/onboarding/state', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice }),
    }).catch(() => undefined);
    setForceOpen(false);
    queryClient.invalidateQueries({ queryKey: ['onboarding-state'] });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Set up your listening history"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(20, 18, 14, 0.55)',
        backdropFilter: 'blur(2px)',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 640,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          padding: 28,
          fontFamily: 'var(--font-sans)',
          color: 'var(--ink)',
        }}
      >
        <Caps>Welcome — let's fill in the blanks</Caps>

        <h2
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 22,
            fontWeight: 500,
            margin: '12px 0 8px',
            letterSpacing: '-0.01em',
          }}
        >
          Bring your listening history with you
        </h2>

        <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--muted)', marginBottom: 16 }}>
          Spotify only exposes the last ~24 hours of plays through their live
          API, so most of these charts will look empty until you've used
          SoundSage for a while. Pick how you'd like to fill them in.
        </p>

        {/* Tab selector */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--rule)', marginBottom: 16 }}>
          {([
            { id: 'esh', label: 'Spotify ZIP', sub: 'Most accurate' },
            { id: 'lastfm', label: 'Last.FM', sub: 'If you scrobble' },
            { id: 'synthetic', label: 'Estimate', sub: 'Instant' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: tab === t.id ? 'var(--paper-2)' : 'transparent',
                border: 'none',
                borderBottom: tab === t.id ? '2px solid var(--ink)' : '2px solid transparent',
                cursor: 'pointer',
                color: tab === t.id ? 'var(--ink)' : 'var(--muted)',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                fontWeight: tab === t.id ? 600 : 500,
                textAlign: 'left',
                transition: 'background 120ms, color 120ms, border-color 120ms',
              }}
            >
              <div>{t.label}</div>
              <div style={{ fontSize: 10, color: 'var(--dim)', marginTop: 2 }}>{t.sub}</div>
            </button>
          ))}
        </div>

        {/* Tab body */}
        {tab === 'esh' && <EshTab onBusy={setBusyMsg} onDone={() => setForceOpen(false)} />}
        {tab === 'lastfm' && <LastfmTab onBusy={setBusyMsg} onDone={() => setForceOpen(false)} />}
        {tab === 'synthetic' && (
          <SyntheticTab
            hasSynthetic={data.hasSyntheticData}
            onBusy={setBusyMsg}
            onDone={() => setForceOpen(false)}
          />
        )}

        {busyMsg && (
          <p
            style={{
              marginTop: 14,
              padding: '10px 12px',
              background: 'var(--paper-2)',
              border: '1px solid var(--rule)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: 'var(--muted)',
            }}
          >
            {busyMsg}
          </p>
        )}

        {/* Reassurance footer — appears on every tab */}
        <p
          style={{
            marginTop: 18,
            paddingTop: 14,
            borderTop: '1px dashed var(--rule)',
            fontSize: 11,
            lineHeight: 1.5,
            color: 'var(--dim)',
          }}
        >
          You can always upload your real Extended Streaming History ZIP
          later — it will replace any estimated or imported data with the
          authoritative version from Spotify.
        </p>

        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => dismiss('skip')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted)',
              fontSize: 12,
              cursor: 'pointer',
              padding: '6px 8px',
              fontFamily: 'var(--font-sans)',
            }}
          >
            I'll set this up later →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ESH ZIP tab ─────────────────────────────────────────────────────────────

function EshTab({
  onBusy,
  onDone,
}: {
  onBusy: (m: string | null) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{
    inserted: number;
    totalEntries: number;
    status: string;
  } | null>(null);

  async function upload() {
    if (!file) return;
    onBusy('Uploading ZIP — this can take a minute for large libraries.');
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/import/spotify-zip', { method: 'POST', body: fd });
    if (!r.ok) {
      onBusy(`Upload failed: ${await r.text()}`);
      return;
    }
    const { jobId } = (await r.json()) as { jobId: string };

    // Poll status until terminal.
    onBusy('Processing your history…');
    const start = Date.now();
    while (Date.now() - start < 10 * 60_000) {
      await new Promise((r) => setTimeout(r, 1500));
      const sr = await fetch(`/api/import/spotify-zip/status?jobId=${jobId}`);
      if (!sr.ok) break;
      const state = (await sr.json()) as {
        status: string;
        inserted: number;
        totalEntries: number;
        errorMessage?: string;
      };
      setProgress({
        inserted: state.inserted,
        totalEntries: state.totalEntries,
        status: state.status,
      });
      if (state.status === 'complete') {
        onBusy(`Done — imported ${state.inserted.toLocaleString()} plays.`);
        queryClient.invalidateQueries({ queryKey: ['onboarding-state'] });
        queryClient.invalidateQueries({ queryKey: ['recent-history'] });
        setTimeout(onDone, 1500);
        return;
      }
      if (state.status === 'failed') {
        onBusy(`Import failed: ${state.errorMessage ?? 'unknown error'}`);
        return;
      }
    }
    onBusy('Import is taking longer than expected. You can close this and check Settings later.');
  }

  return (
    <div>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink)', marginBottom: 10 }}>
        Spotify can email you a ZIP of every play since your account began.
        It takes about <strong>30 days</strong> to arrive — but once you have
        it, this is the most accurate possible history.
      </p>
      <ol style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--muted)', paddingLeft: 18, marginBottom: 14 }}>
        <li>
          Go to{' '}
          <a
            href="https://www.spotify.com/account/privacy/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--ink)' }}
          >
            spotify.com/account/privacy
          </a>
        </li>
        <li>Request "Extended streaming history" (under "Download your data")</li>
        <li>Wait ~30 days; Spotify emails the ZIP</li>
        <li>Come back here and upload it below</li>
      </ol>

      <input
        type="file"
        accept=".zip,application/zip"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        style={{ fontSize: 12, marginBottom: 10, display: 'block' }}
      />

      <button
        onClick={upload}
        disabled={!file}
        style={primaryButton(!!file)}
      >
        Upload ZIP
      </button>

      {progress && progress.status === 'running' && (
        <p style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
          processed {progress.inserted.toLocaleString()} / ~{progress.totalEntries.toLocaleString()} plays…
        </p>
      )}
    </div>
  );
}

// ─── Last.FM tab ─────────────────────────────────────────────────────────────

function LastfmTab({
  onBusy,
  onDone,
}: {
  onBusy: (m: string | null) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');

  async function start() {
    if (!username.trim()) return;
    onBusy('Importing scrobbles from Last.FM…');
    const r = await fetch('/api/import/lastfm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim() }),
    });
    if (!r.ok) {
      onBusy(`Import failed: ${await r.text()}`);
      return;
    }
    const { jobId } = (await r.json()) as { jobId: string };

    const startedAt = Date.now();
    while (Date.now() - startedAt < 30 * 60_000) {
      await new Promise((r) => setTimeout(r, 2000));
      const sr = await fetch(`/api/import/lastfm/status?jobId=${jobId}`);
      if (!sr.ok) break;
      const state = (await sr.json()) as {
        status: string;
        inserted: number;
        pagesProcessed: number;
        totalPages: number;
        resolvedTracks: number;
        unresolvedTracks: number;
        errorMessage?: string;
      };
      onBusy(
        `Processing page ${state.pagesProcessed} / ${state.totalPages}` +
          ` — ${state.inserted.toLocaleString()} plays imported,` +
          ` ${state.unresolvedTracks} couldn't be matched on Spotify`
      );
      if (state.status === 'complete') {
        onBusy(`Done — imported ${state.inserted.toLocaleString()} plays from Last.FM.`);
        queryClient.invalidateQueries({ queryKey: ['onboarding-state'] });
        queryClient.invalidateQueries({ queryKey: ['recent-history'] });
        setTimeout(onDone, 1500);
        return;
      }
      if (state.status === 'failed') {
        onBusy(`Import failed: ${state.errorMessage ?? 'unknown error'}`);
        return;
      }
    }
    onBusy('Import is still running — check Settings later for status.');
  }

  return (
    <div>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink)', marginBottom: 10 }}>
        If you already scrobble Spotify plays to Last.FM, we can pull every
        scrobble in your account history. Each one is matched to its Spotify
        track and recorded as a real play.
      </p>
      <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        Tracks that aren't on Spotify (rare imports, region-locked songs)
        are skipped — they'd have nowhere to link to.
      </p>

      <label style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
        Last.FM username
      </label>
      <input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="e.g. yournamehere"
        style={{
          width: '100%',
          padding: '8px 10px',
          fontSize: 13,
          background: 'var(--paper-2)',
          border: '1px solid var(--rule)',
          color: 'var(--ink)',
          fontFamily: 'var(--font-mono)',
          marginBottom: 12,
        }}
      />

      <button onClick={start} disabled={!username.trim()} style={primaryButton(!!username.trim())}>
        Import scrobbles
      </button>
    </div>
  );
}

// ─── Synthetic tab ───────────────────────────────────────────────────────────

function SyntheticTab({
  hasSynthetic,
  onBusy,
  onDone,
}: {
  hasSynthetic: boolean;
  onBusy: (m: string | null) => void;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();

  async function generate() {
    onBusy('Generating estimates from your top tracks and artists…');
    const r = await fetch('/api/import/synthetic', { method: 'POST' });
    if (!r.ok) {
      onBusy(`Failed: ${await r.text()}`);
      return;
    }
    const result = (await r.json()) as { totalPlaysGenerated: number };
    onBusy(`Done — generated ${result.totalPlaysGenerated.toLocaleString()} estimated plays. Charts populated.`);
    queryClient.invalidateQueries({ queryKey: ['onboarding-state'] });
    queryClient.invalidateQueries({ queryKey: ['recent-history'] });
    setTimeout(onDone, 1500);
  }

  return (
    <div>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink)', marginBottom: 10 }}>
        We'll generate a plausible play log from your Spotify top-tracks and
        top-artists rankings, distributed across the past year using your
        actual hour-of-day listening pattern from the last 24 hours.
      </p>
      <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 14 }}>
        Estimated plays are <strong>labeled</strong> on every chart so you'll
        always know what's real and what's inferred. They're replaced
        instantly when you upload your real ESH ZIP or connect Last.FM.
      </p>

      <button onClick={generate} style={primaryButton(true)}>
        {hasSynthetic ? 'Regenerate estimates' : 'Generate estimates'}
      </button>
    </div>
  );
}

// ─── Shared button style ─────────────────────────────────────────────────────

function primaryButton(enabled: boolean): React.CSSProperties {
  return {
    padding: '9px 16px',
    background: enabled ? 'var(--ink)' : 'var(--paper-3)',
    color: enabled ? 'var(--paper)' : 'var(--dim)',
    border: 'none',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    letterSpacing: '0.02em',
    cursor: enabled ? 'pointer' : 'not-allowed',
    transition: 'opacity 120ms',
  };
}
