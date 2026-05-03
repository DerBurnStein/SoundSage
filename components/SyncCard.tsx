// SoundSage — SyncCard
// Ingestion pipeline status and manual sync trigger.
// Fetches /api/sync/status on mount; POST /api/sync/trigger on button click.

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Caps, Mono, pad2 } from './primitives';
import type { SyncStatus } from '../types';

export function SyncCard() {
  const [status,   setStatus]   = useState<SyncStatus | null>(null);
  const [running,  setRunning]  = useState(false);
  const [progress, setProgress] = useState(0);
  const [log,      setLog]      = useState<{ t: string; m: string }[]>([]);
  const queryClient = useQueryClient();

  const fetchStatus = useCallback(async (): Promise<SyncStatus | null> => {
    const r = await fetch('/api/sync/status');
    if (!r.ok) return null;
    const body = (await r.json()) as SyncStatus;
    setStatus(body);
    return body;
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  async function triggerSync() {
    if (running) return;
    setRunning(true);
    setProgress(0);

    // Capture baseline lastSyncAt — we'll watch for it to change as the
    // canonical "the worker actually finished" signal. Without this we'd
    // be guessing how long a sync takes and showing "complete" too early.
    const baseline = (await fetchStatus())?.lastSyncAt ?? null;

    const r = await fetch('/api/sync/trigger', { method: 'POST' });
    if (!r.ok) { setRunning(false); return; }

    // Indeterminate progress: ease toward 90%, then snap to 100% only when
    // a real status poll proves lastSyncAt has advanced. We never sit at
    // 100 unless the worker truly finished.
    const startedAt = Date.now();
    const TIMEOUT_MS = 90_000;

    let progressTickId: ReturnType<typeof setInterval> | null = null;
    let p = 0;
    progressTickId = setInterval(() => {
      // Asymptote at ~88% so the bar feels alive but never falsely lands
      // on "done". The poller below is the only thing that can complete it.
      p += (88 - p) * 0.08 + 1.2;
      if (p > 88) p = 88;
      setProgress(p);
    }, 200);

    const finish = (msg: string) => {
      if (progressTickId) clearInterval(progressTickId);
      setProgress(100);
      const now = new Date();
      const t = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
      setLog(l => [{ t, m: msg }, ...l].slice(0, 6));
      setTimeout(() => { setRunning(false); setProgress(0); }, 600);
    };

    const poll = async () => {
      const fresh = await fetchStatus();
      if (fresh?.lastSyncAt && fresh.lastSyncAt !== baseline) {
        // refetchQueries forces an immediate network round-trip on the
        // matching subscribers — invalidateQueries only marks them stale,
        // which can race with the live RecentStream's own 30s polling
        // window and end up with no visible refresh until the next tick.
        queryClient.refetchQueries({ queryKey: ['recent-history'] });
        finish('sync complete — cursor advanced');
        return;
      }
      if (Date.now() - startedAt > TIMEOUT_MS) {
        finish('still working — give it a bit longer');
        return;
      }
      setTimeout(poll, 1500);
    };
    setTimeout(poll, 1500);
  }

  const statusGrid: [string, string, string][] = status ? [
    ['oauth_tokens',     status.tokens,                   status.tokens === 'fresh' ? 'valid' : 'needs refresh'],
    ['ingestion_state',  'cursor',                        status.cursor ?? 'none'],
    ['listening_events', `${status.eventCount.toLocaleString()} rows`, `+${status.eventsToday} today`],
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
            color: running ? 'var(--ink)' : 'var(--paper)',
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
          {running ? 'Syncing…' : 'Run sync now'}
        </button>
      </div>

      {/* Status cells */}
      {statusGrid.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', border: '1px solid var(--rule)', marginBottom: 14 }}>
          {statusGrid.map(([k, v, s], i) => (
            <div key={k} style={{ padding: '14px 16px', borderRight: i < 3 ? '1px solid var(--rule)' : 'none' }}>
              <Mono style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: '0.08em', display: 'block' }}>
                {k.toUpperCase()}
              </Mono>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, marginTop: 6, fontWeight: 500 }}>{v}</div>
              <Mono style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginTop: 4 }}>{s}</Mono>
            </div>
          ))}
        </div>
      )}

      {/* Progress strip */}
      <div style={{ height: 4, background: 'var(--paper-3)', position: 'relative', marginBottom: 14 }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'var(--ember)', transition: 'width .2s ease-out' }} />
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div style={{ background: 'var(--paper-2)', border: '1px solid var(--rule)', padding: '10px 14px' }}>
          {log.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: i === 0 ? 'var(--ink)' : 'var(--muted)', padding: '3px 0', opacity: Math.max(0.45, 1 - i * 0.12) }}>
              <span style={{ color: 'var(--dim)' }}>{l.t}</span>
              <span>{l.m}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}
