// SoundSage — SyncCard
// Ingestion pipeline status + manual sync trigger + live activity stream.
//
// Three pieces:
//   1. Status grid — current oauth/cursor/event-count/last-sync from
//      /api/sync/status. Refreshed on mount and after each sync.
//   2. Progress bar — driven by /api/sync/progress (real stage-based
//      percent, not a fake easing curve). Polls 700ms while a sync is
//      in flight, drops to 30s once settled.
//   3. Activity stream — last ~20 lines from /api/sync/activity, shows
//      what's happening behind the scenes (Spotify calls, DB inserts,
//      cache invalidations). Visible while a sync is running and for
//      a short cooldown after.

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Caps, Mono } from './primitives';
import type { SyncStatus } from '../types';

interface SyncProgressBody {
  progress: {
    stage:     string;
    percent:   number;
    msg:       string;
    startedAt: number;
    updatedAt: number;
    done:      boolean;
    error?:    string;
  } | null;
}

interface ActivityLine {
  ts:   number;
  kind: '→' | '✓' | '⚠' | '↻' | '…';
  msg:  string;
}

interface ActivityBody {
  lines: ActivityLine[];
}

const POLL_FAST_MS = 700;
const POLL_SLOW_MS = 30_000;
const ACTIVITY_LINGER_MS = 20_000; // keep showing the feed for 20s after `done`

export function SyncCard() {
  const [status,    setStatus]    = useState<SyncStatus | null>(null);
  const [running,   setRunning]   = useState(false);
  const [percent,   setPercent]   = useState(0);
  const [stageMsg,  setStageMsg]  = useState<string | null>(null);
  const [activity,  setActivity]  = useState<ActivityLine[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const queryClient = useQueryClient();
  const lastDoneAtRef = useRef<number | null>(null);

  // ─── Pipeline status (header grid) ─────────────────────────────────────────
  const fetchStatus = useCallback(async (): Promise<SyncStatus | null> => {
    const r = await fetch('/api/sync/status');
    if (!r.ok) return null;
    const body = (await r.json()) as SyncStatus;
    setStatus(body);
    return body;
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // ─── Progress + activity polling ───────────────────────────────────────────
  // Single effect that pulls both endpoints together. Cadence:
  //   • While a sync is in flight (progress.done === false): every 700ms.
  //   • Just-finished (within ACTIVITY_LINGER_MS): every 700ms still, so
  //     the trailing log lines render before we hide the feed.
  //   • Idle: every 30s — keeps the status grid roughly fresh without
  //     hammering Redis.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const [pRes, aRes] = await Promise.all([
          fetch('/api/sync/progress', { cache: 'no-store' }),
          fetch('/api/sync/activity', { cache: 'no-store' }),
        ]);
        if (pRes.ok) {
          const body = (await pRes.json()) as SyncProgressBody;
          const p = body.progress;
          if (p) {
            setPercent(p.percent);
            setStageMsg(p.msg);
            setRunning(!p.done);
            setShowActivity(true);
            if (p.done && lastDoneAtRef.current === null) {
              lastDoneAtRef.current = Date.now();
              // Refresh status grid + invalidate dependent live queries
              fetchStatus();
              queryClient.refetchQueries({ queryKey: ['recent-history'] });
            }
            // After ACTIVITY_LINGER_MS in 'done', hide the feed and reset.
            if (
              p.done &&
              lastDoneAtRef.current !== null &&
              Date.now() - lastDoneAtRef.current > ACTIVITY_LINGER_MS
            ) {
              setShowActivity(false);
              setPercent(0);
              setStageMsg(null);
              lastDoneAtRef.current = null;
            }
          } else {
            // No progress key in Redis — sync hasn't run recently.
            if (running) setRunning(false);
          }
        }
        if (aRes.ok) {
          const body = (await aRes.json()) as ActivityBody;
          setActivity(body.lines);
        }
      } catch {
        // Transient — ignore, next tick will try again.
      }
      if (cancelled) return;
      const fast =
        running ||
        (lastDoneAtRef.current !== null &&
          Date.now() - lastDoneAtRef.current < ACTIVITY_LINGER_MS);
      timer = setTimeout(tick, fast ? POLL_FAST_MS : POLL_SLOW_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [running, fetchStatus, queryClient]);

  // ─── Manual trigger ────────────────────────────────────────────────────────
  async function triggerSync() {
    if (running) return;
    setRunning(true);
    lastDoneAtRef.current = null;
    setShowActivity(true);
    setPercent(5);
    setStageMsg('Sync queued');
    setActivity([]);
    const r = await fetch('/api/sync/trigger', { method: 'POST' });
    if (!r.ok) {
      setRunning(false);
      setStageMsg('Could not queue sync');
      return;
    }
    // The polling loop above takes over from here — it'll see progress
    // arrive in Redis and drive the bar.
  }

  // ─── Header grid + button ──────────────────────────────────────────────────
  const statusGrid: [string, string, string][] = status ? [
    ['oauth_tokens',     status.tokens,                                 status.tokens === 'fresh' ? 'valid' : 'needs refresh'],
    ['ingestion_state',  'cursor',                                      status.cursor ?? 'none'],
    ['listening_events', `${status.eventCount.toLocaleString()} rows`,  `+${status.eventsToday} today`],
    ['last sync',        status.lastSyncAt ? relTime(status.lastSyncAt) : 'never', 'every 15 min'],
  ] : [];

  return (
    <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <Caps>Ingestion</Caps>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 22, marginTop: 6, letterSpacing: '-0.01em' }}>
            Pipeline status
          </h3>
        </div>
        <button
          onClick={triggerSync}
          disabled={running}
          style={{
            border: '1px solid var(--ink)',
            background: running ? 'var(--paper-2)' : 'var(--ink)',
            color:      running ? 'var(--ink)'     : 'var(--paper)',
            fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 500,
            letterSpacing: '0.04em', padding: '8px 16px',
            cursor: running ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: running ? 'var(--ember)' : 'var(--paper)',
            animation: running ? 'pulse 1s ease-in-out infinite' : 'none',
          }} />
          {running ? `Syncing… ${Math.round(percent)}%` : 'Run sync now'}
        </button>
      </div>

      {/* Status cells. Fixed 4-up at desktop, collapses to 2-up via CSS at
          ≤720px (see globals.css `.sync-status-grid` rule). The values
          inside have `min-width: 0` so the cursor timestamp + listening-
          events count can wrap or ellipsis instead of pushing the cell
          past the viewport. */}
      {statusGrid.length > 0 && (
        <div className="sync-status-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1px solid var(--rule)', marginBottom: 14 }}>
          {statusGrid.map(([k, v, s], i) => (
            <div key={k} className="sync-status-cell" style={{ padding: '14px 16px', borderRight: i < 3 ? '1px solid var(--rule)' : 'none', minWidth: 0 }}>
              <Mono style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: '0.08em', display: 'block' }}>
                {k.toUpperCase()}
              </Mono>
              <div style={{
                fontFamily: 'var(--font-serif)', fontSize: 18, marginTop: 6, fontWeight: 500,
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }}>{v}</div>
              <Mono style={{
                fontSize: 10, color: 'var(--muted)', display: 'block', marginTop: 4,
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }}>{s}</Mono>
            </div>
          ))}
        </div>
      )}

      {/* Progress strip — driven by real stage percent from Redis */}
      <div style={{ height: 4, background: 'var(--paper-3)', position: 'relative', marginBottom: stageMsg ? 6 : 14 }}>
        <div style={{
          height: '100%',
          width: `${percent}%`,
          background: 'var(--ember)',
          transition: 'width 250ms ease-out',
        }} />
      </div>
      {stageMsg && (
        <Mono style={{
          display: 'block',
          fontSize: 10, color: 'var(--muted)', letterSpacing: '0.04em',
          marginBottom: 14,
        }}>
          {stageMsg}
        </Mono>
      )}

      {/* Activity stream — what's happening behind the scenes right now.
          Visible during + briefly after a sync; collapses once idle so
          the static grid above doesn't get crowded by stale logs. */}
      {showActivity && activity.length > 0 && (
        <div style={{
          background: 'var(--paper-2)',
          border: '1px solid var(--rule)',
          padding: '10px 14px',
          maxHeight: 220,
          overflowY: 'auto',
        }}>
          <Mono style={{
            display: 'block',
            fontSize: 9, color: 'var(--dim)',
            letterSpacing: '0.1em',
            marginBottom: 6,
          }}>
            ACTIVITY
          </Mono>
          {activity.map((l, i) => (
            <div
              key={l.ts + ':' + i}
              style={{
                display: 'grid',
                gridTemplateColumns: '60px 14px minmax(0, 1fr)',
                gap: 10,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: i === 0 ? 'var(--ink)' : 'var(--muted)',
                padding: '2px 0',
                opacity: Math.max(0.5, 1 - i * 0.04),
              }}
            >
              <span style={{ color: 'var(--dim)' }}>
                {new Date(l.ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span style={{ color: kindColor(l.kind), fontWeight: 600 }}>{l.kind}</span>
              {/* minmax(0, 1fr) on the column + min-width: 0 here let long
                  URLs in the message ellipsis instead of forcing the row
                  wider than the card. */}
              <span style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{l.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function kindColor(kind: ActivityLine['kind']): string {
  switch (kind) {
    case '→': return 'var(--seal)';
    case '✓': return 'var(--moss)';
    case '⚠': return 'var(--ember)';
    case '↻': return 'var(--gold)';
    case '…':
    default:  return 'var(--dim)';
  }
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}
