// SoundSage — SettingsButton
// Gear chip in the masthead that opens a popover with every user-tunable
// preference and account action. Reads/writes via the ThemeProvider context
// so changes apply instantly across the whole tree and persist in
// localStorage. Sync / disconnect / export hit the matching API routes.

'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { Caps, Mono } from './primitives';
import { useTheme } from './ThemeProvider';
import type {
  ThemeId, DensityId, AccentId, NumberFormatId,
} from '../types';

const THEME_OPTIONS:    { id: ThemeId;        label: string }[] = [
  { id: 'paper',    label: 'Paper'    },
  { id: 'midnight', label: 'Midnight' },
];
const DENSITY_OPTIONS:  { id: DensityId;      label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'regular', label: 'Regular' },
  { id: 'roomy',   label: 'Roomy'   },
];
// Three accent slots, named generically. The actual colours come from
// per-tab CSS variables (`--ink`, `--ember`, `--moss`), so each tab theme
// gets its own three-colour palette automatically.
const ACCENT_OPTIONS: { id: AccentId; swatch: string; label: string }[] = [
  { id: 'ink',   swatch: 'var(--ink)',   label: 'Ink'   },
  { id: 'ember', swatch: 'var(--ember)', label: 'Warm'  },
  { id: 'moss',  swatch: 'var(--moss)',  label: 'Cool'  },
];
const NUMBER_FORMAT_OPTIONS: { id: NumberFormatId; label: string }[] = [
  { id: 'grouped', label: '1,234' },
  { id: 'plain',   label: '1234'  },
];

interface SpotifyConnInfo {
  connected: boolean;
  displayName?: string | null;
  spotifyUserId?: string;
}

export function SettingsButton() {
  const {
    theme, density, accent, numberFormat, reduceMotion,
    setTheme, setDensity, setAccent, setNumberFormat, setReduceMotion,
  } = useTheme();
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen]               = useState(false);
  const [conn, setConn]               = useState<SpotifyConnInfo | null>(null);
  const [syncing, setSyncing]         = useState(false);
  const [syncMsg, setSyncMsg]         = useState<string | null>(null);
  const [syncDone, setSyncDone]       = useState(false);
  // Real sync progress 0..100. Eases toward 88 during the run, snaps to
  // 100 only when /api/sync/status confirms a newer lastSyncAt — never
  // shows a fake "complete" state, matching the SyncCard behaviour.
  const [syncProgress, setSyncProgress] = useState(0);
  // Disconnect flow:
  //   'idle'    — show the "Disconnect Spotify" button.
  //   'confirm' — show an inline "are you sure?" panel explaining the
  //               dashboard will stop updating, with Cancel + Confirm.
  //   'pending' — request in flight; both buttons disabled.
  const [discStage, setDiscStage] =
    useState<'idle' | 'confirm' | 'pending'>('idle');

  // Delete-account flow has the same three stages plus a typed-text gate
  // ("type DELETE") inside the confirm step — high-friction by design,
  // since the action cascades through every row tied to this user.
  const [delStage, setDelStage] =
    useState<'idle' | 'confirm' | 'pending'>('idle');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape so the popover behaves like a normal menu.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Lazy-load connection info the first time the popover opens — avoids a
  // network round-trip on every page if the user never touches Settings.
  useEffect(() => {
    if (!open) return;
    if (status !== 'authenticated') return;
    if (conn) return;
    fetch('/api/spotify/connection')
      .then((r) => r.json())
      .then(setConn)
      .catch(() => setConn({ connected: false }));
  }, [open, status, conn]);

  async function handleSyncNow() {
    setSyncMsg(null);
    setSyncDone(false);
    setSyncProgress(0);

    // Capture the user's current `lastSyncAt` so we can detect a NEWER
    // value once the worker finishes — that's our completion signal.
    let baseline: string | null = null;
    try {
      const s = await fetch('/api/sync/status');
      if (s.ok) baseline = ((await s.json()) as { lastSyncAt: string | null }).lastSyncAt;
    } catch { /* baseline stays null — first poll that returns a value will close the loop */ }

    setSyncing(true);
    try {
      const r = await fetch('/api/sync/trigger', { method: 'POST' });
      if (!r.ok) {
        if (r.status === 429) {
          const ttl = r.headers.get('Retry-After') ?? '60';
          setSyncMsg(`Already syncing — try again in ${ttl}s.`);
        } else {
          setSyncMsg('Sync failed. Try again later.');
        }
        setSyncing(false);
        setSyncProgress(0);
        return;
      }
    } catch {
      setSyncMsg('Network error.');
      setSyncing(false);
      setSyncProgress(0);
      return;
    }

    // Indeterminate ease toward 88% so the bar feels alive but never
    // falsely lands on "done". The poller below is the only thing that
    // can complete it.
    let p = 0;
    const progressTick = setInterval(() => {
      p += (88 - p) * 0.08 + 1.2;
      if (p > 88) p = 88;
      setSyncProgress(p);
    }, 200);

    const finish = (msg: string, done: boolean) => {
      clearInterval(progressTick);
      setSyncProgress(done ? 100 : 0);
      setSyncing(false);
      setSyncMsg(msg);
      setSyncDone(done);
      if (done) {
        // Drop the 100% bar back to 0 once the user has had a moment
        // to register that the sync finished.
        setTimeout(() => setSyncProgress(0), 1200);
      }
    };

    // Poll for completion. Tries every 2s; gives up after ~90s with a
    // gentle "still working" message rather than spinning forever.
    const startedAt = Date.now();
    const TIMEOUT_MS = 90_000;
    const tick = async () => {
      try {
        const s = await fetch('/api/sync/status');
        if (s.ok) {
          const body = (await s.json()) as { lastSyncAt: string | null };
          if (body.lastSyncAt && body.lastSyncAt !== baseline) {
            // refetchQueries forces an immediate network round-trip on the
            // matching subscribers; invalidateQueries only flags stale,
            // which can race with the live RecentStream's polling window.
            queryClient.refetchQueries({ queryKey: ['recent-history'] });
            finish('Synced just now.', true);
            return;
          }
        }
      } catch { /* transient — keep polling */ }

      if (Date.now() - startedAt > TIMEOUT_MS) {
        finish('Still working — give it a bit longer.', false);
        return;
      }
      setTimeout(tick, 2_000);
    };
    setTimeout(tick, 2_000);
  }

  async function handleDeleteAccount() {
    setDelStage('pending');
    try {
      const r = await fetch('/api/account', { method: 'DELETE' });
      if (r.ok || r.status === 204) {
        // Account row is gone; sign the user out of the now-orphaned
        // session and bounce them home.
        await signOut({ callbackUrl: '/' });
      } else {
        setDelStage('confirm');
      }
    } catch {
      setDelStage('confirm');
    }
  }

  async function handleDisconnect() {
    setDiscStage('pending');
    try {
      await fetch('/api/spotify/connection', { method: 'DELETE' });
      // Hard reload so server components re-render with the disconnected
      // state (the masthead, empty-state prompts, etc).
      window.location.reload();
    } catch {
      setDiscStage('confirm');
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Settings"
        title="Settings"
        style={{
          width: 32,
          height: 32,
          background: open ? 'var(--ink)' : 'transparent',
          color:      open ? 'var(--paper)' : 'var(--ink)',
          border: '1px solid var(--rule)',
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GearIcon />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Settings"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 320,
            maxHeight: 'calc(100vh - 120px)',
            overflowY: 'auto',
            background: 'var(--paper)',
            border: '1px solid var(--ink)',
            padding: '16px 18px',
            zIndex: 100,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
          }}
        >
          <Section label="Theme">
            <SegmentedControl
              options={THEME_OPTIONS}
              value={theme}
              onChange={(v) => setTheme(v as ThemeId)}
            />
          </Section>

          <Section label="Density">
            <SegmentedControl
              options={DENSITY_OPTIONS}
              value={density}
              onChange={(v) => setDensity(v as DensityId)}
            />
          </Section>

          <Section label="Accent">
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {ACCENT_OPTIONS.map((opt) => {
                const active = opt.id === accent;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAccent(opt.id)}
                    aria-pressed={active}
                    title={opt.label}
                    style={{
                      flex: 1,
                      height: 32,
                      padding: 0,
                      background: opt.swatch,
                      border: active
                        ? '2px solid var(--ink)'
                        : '1px solid var(--rule)',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        bottom: -16,
                        left: 0,
                        right: 0,
                        textAlign: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: active ? 'var(--ink)' : 'var(--dim)',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ height: 18 }} />
          </Section>

          <Section label="Number format">
            <SegmentedControl
              options={NUMBER_FORMAT_OPTIONS}
              value={numberFormat}
              onChange={(v) => setNumberFormat(v as NumberFormatId)}
            />
          </Section>

          <Section label="Reduce motion">
            <Toggle
              value={reduceMotion}
              onChange={setReduceMotion}
              hint={reduceMotion ? 'Animations disabled' : 'Animations on'}
            />
          </Section>

          {status === 'authenticated' && (
            <>
              <Divider />

              <Section label="Data">
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  <SyncButton
                    onClick={handleSyncNow}
                    syncing={syncing}
                    done={syncDone}
                    progress={syncProgress}
                  />
                  {syncMsg && (
                    <Mono
                      style={{
                        fontSize: 10,
                        color: syncDone ? 'var(--moss)' : 'var(--muted)',
                        marginTop: 2,
                      }}
                    >
                      {syncMsg}
                    </Mono>
                  )}
                </div>
              </Section>

              <Divider />

              <Section label="Account">
                <div
                  style={{
                    marginTop: 8,
                    fontFamily: 'var(--font-mincho)',
                    fontStyle: 'italic',
                    fontSize: 13,
                    color: 'var(--ink)',
                    lineHeight: 1.4,
                  }}
                >
                  {session?.user?.name ?? session?.user?.email ?? 'Signed in'}
                </div>
                {conn?.connected && (
                  <Mono
                    style={{
                      fontSize: 10,
                      color: 'var(--muted)',
                      letterSpacing: '0.05em',
                      marginTop: 4,
                      display: 'block',
                    }}
                  >
                    Spotify · {conn.displayName ?? conn.spotifyUserId ?? 'connected'}
                  </Mono>
                )}

                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  {conn?.connected && discStage === 'idle' && (
                    <ActionButton onClick={() => setDiscStage('confirm')}>
                      Disconnect Spotify
                    </ActionButton>
                  )}

                  {conn?.connected && discStage !== 'idle' && (
                    <DisconnectConfirm
                      pending={discStage === 'pending'}
                      onCancel={() => setDiscStage('idle')}
                      onConfirm={handleDisconnect}
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      signOut({ callbackUrl: '/' });
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'transparent',
                      color: 'var(--seal)',
                      border: '1px solid var(--seal)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    Sign out
                  </button>
                </div>

                {/* Danger zone — visually offset so it can't be mistaken
                    for the everyday actions above it. */}
                <div
                  style={{
                    marginTop: 16,
                    paddingTop: 12,
                    borderTop: '1px dashed var(--rule)',
                  }}
                >
                  {delStage === 'idle' ? (
                    <button
                      type="button"
                      onClick={() => setDelStage('confirm')}
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        background: 'transparent',
                        color: 'var(--muted)',
                        border: '1px dashed var(--rule)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 11,
                        fontWeight: 500,
                        letterSpacing: '0.04em',
                        cursor: 'pointer',
                      }}
                    >
                      Delete account
                    </button>
                  ) : (
                    <DeleteAccountConfirm
                      pending={delStage === 'pending'}
                      onCancel={() => setDelStage('idle')}
                      onConfirm={handleDeleteAccount}
                    />
                  )}
                </div>
              </Section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <Caps>{label}</Caps>
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: 'var(--rule)',
        opacity: 0.4,
        margin: '6px 0 16px',
      }}
    />
  );
}

function GearIcon() {
  // 16px gear, drawn as a single inline SVG so it inherits `currentColor`
  // from the button (which already swaps ink/paper based on open state).
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function DisconnectConfirm({
  pending,
  onCancel,
  onConfirm,
}: {
  pending:   boolean;
  onCancel:  () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="Disconnect Spotify"
      style={{
        border: '1px solid var(--seal)',
        background: 'color-mix(in srgb, var(--seal) 8%, transparent)',
        padding: '12px 12px 10px',
        display: 'grid',
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--ink)',
          lineHeight: 1.35,
        }}
      >
        Disconnect Spotify?
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mincho)',
          fontStyle: 'italic',
          fontSize: 12,
          color: 'var(--muted)',
          lineHeight: 1.45,
        }}
      >
        If you continue, your dashboard will no longer be updated — new
        listens will stop syncing from Spotify. Existing history is
        preserved, and you can reconnect at any time.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          style={{
            flex: 1,
            padding: '8px 10px',
            background: 'transparent',
            color: 'var(--ink)',
            border: '1px solid var(--rule)',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 500,
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.55 : 1,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          style={{
            flex: 1,
            padding: '8px 10px',
            background: 'var(--seal)',
            color: 'var(--paper)',
            border: '1px solid var(--seal)',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
            cursor: pending ? 'progress' : 'pointer',
            opacity: pending ? 0.85 : 1,
          }}
        >
          {pending ? 'Disconnecting…' : 'Disconnect'}
        </button>
      </div>
    </div>
  );
}

function DeleteAccountConfirm({
  pending,
  onCancel,
  onConfirm,
}: {
  pending:   boolean;
  onCancel:  () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const armed = typed.trim().toUpperCase() === 'DELETE';
  return (
    <div
      role="alertdialog"
      aria-label="Delete account"
      style={{
        border: '1px solid var(--seal)',
        background: 'color-mix(in srgb, var(--seal) 10%, transparent)',
        padding: '12px 12px 10px',
        display: 'grid',
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--ink)',
          lineHeight: 1.35,
        }}
      >
        Permanently delete your account?
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mincho)',
          fontStyle: 'italic',
          fontSize: 12,
          color: 'var(--muted)',
          lineHeight: 1.45,
        }}
      >
        This removes your sign-in, your Spotify connection, and every
        listen we&apos;ve recorded for you. There is no undo. Type{' '}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '0.04em',
          }}
        >
          DELETE
        </span>{' '}
        below to confirm.
      </div>
      <input
        autoFocus
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="DELETE"
        aria-label="Type DELETE to confirm"
        spellCheck={false}
        autoCapitalize="characters"
        disabled={pending}
        style={{
          width: '100%',
          padding: '8px 10px',
          background: 'var(--paper)',
          color: 'var(--ink)',
          border: `1px solid ${armed ? 'var(--seal)' : 'var(--rule)'}`,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          letterSpacing: '0.06em',
          outline: 'none',
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            setTyped('');
            onCancel();
          }}
          disabled={pending}
          style={{
            flex: 1,
            padding: '8px 10px',
            background: 'transparent',
            color: 'var(--ink)',
            border: '1px solid var(--rule)',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 500,
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.55 : 1,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!armed || pending}
          style={{
            flex: 1,
            padding: '8px 10px',
            background: armed && !pending ? 'var(--seal)' : 'transparent',
            color: armed && !pending ? 'var(--paper)' : 'var(--dim)',
            border: '1px solid var(--seal)',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.04em',
            cursor: armed && !pending ? 'pointer' : 'not-allowed',
            opacity: armed && !pending ? 1 : 0.55,
          }}
        >
          {pending ? 'Deleting…' : 'Delete account'}
        </button>
      </div>
    </div>
  );
}

function SyncButton({
  onClick,
  syncing,
  done,
  progress,
}: {
  onClick:  () => void;
  syncing:  boolean;
  done:     boolean;
  progress: number; // 0..100, polled real progress
}) {
  // The button doubles as a progress indicator. While the worker runs an
  // ink-tinted fill grows from 0 → ~88 % under the label, then snaps to
  // 100 % only when /api/sync/status confirms a newer lastSyncAt. On
  // completion the button border switches to moss/green so the button
  // itself reads as the success indicator.
  const label = syncing
    ? `Syncing… ${Math.round(progress)}%`
    : done
      ? 'Synced'
      : 'Re-sync now';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={syncing}
      style={{
        position: 'relative',
        overflow: 'hidden',
        width: '100%',
        padding: '8px 10px',
        background: done ? 'color-mix(in srgb, var(--moss) 22%, transparent)' : 'transparent',
        color: 'var(--ink)',
        border: `1px solid ${done ? 'var(--moss)' : 'var(--rule)'}`,
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        fontWeight: 500,
        cursor: syncing ? 'progress' : 'pointer',
        textAlign: 'left',
        transition: 'background 0.25s, border-color 0.25s',
      }}
    >
      {/* Real-progress fill driven by the polled state. Sits below the
          label and never intercepts pointer events. */}
      {(syncing || progress > 0) && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress}%`,
            background: 'color-mix(in srgb, var(--ink) 14%, transparent)',
            transition: 'width 200ms linear',
            pointerEvents: 'none',
          }}
        />
      )}
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
        {done && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--moss)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
        {label}
      </span>
    </button>
  );
}

function ActionButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '8px 10px',
        background: 'transparent',
        color: 'var(--ink)',
        border: '1px solid var(--rule)',
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        textAlign: 'left',
      }}
    >
      {children}
    </button>
  );
}

function Toggle({
  value,
  onChange,
  hint,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 8,
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          width: 36,
          height: 20,
          padding: 2,
          background: value ? 'var(--ink)' : 'var(--paper-2)',
          border: '1px solid var(--rule)',
          borderRadius: 999,
          cursor: 'pointer',
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 18 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: 'var(--paper)',
            transition: 'left 0.18s ease',
          }}
        />
      </button>
      {hint && (
        <Mono style={{ fontSize: 10, color: 'var(--muted)' }}>{hint}</Mono>
      )}
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact,
}: {
  options: { id: T; label: string }[];
  value:    T;
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        marginTop: 8,
        border: '1px solid var(--rule)',
      }}
    >
      {options.map((opt, i) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            style={{
              flex: 1,
              padding: compact ? '6px 4px' : '8px 6px',
              background: active ? 'var(--ink)' : 'transparent',
              color:      active ? 'var(--paper)' : 'var(--ink)',
              borderLeft: i === 0 ? 'none' : '1px solid var(--rule)',
              borderTop: 'none',
              borderRight: 'none',
              borderBottom: 'none',
              fontFamily: 'var(--font-sans)',
              fontSize: compact ? 10 : 11,
              fontWeight: active ? 600 : 400,
              letterSpacing: '0.04em',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
