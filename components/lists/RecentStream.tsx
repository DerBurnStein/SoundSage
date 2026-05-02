// SoundSage — RecentStream
// Chronological timeline of recently played tracks.
// Props-driven: feed it RecentEvent[] from /api/history/recent.

'use client';

import { Caps, Mono } from '../primitives';
import type { RecentEvent } from '../../types';

interface RecentStreamProps {
  events:   RecentEvent[];
  loading?: boolean;
}

export function RecentStream({ events, loading }: RecentStreamProps) {
  if (loading || !events.length) {
    return (
      <div style={{ padding: '24px 28px', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ height: 40, background: 'var(--paper-2)', marginBottom: 8, opacity: 1 - i * 0.15 }} />
        ))}
      </div>
    );
  }

  // Format relative time label
  function relTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div style={{ padding: '24px 28px', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ marginBottom: 16 }}>
        <Caps>Stream — recently played</Caps>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 22, marginTop: 6, letterSpacing: '-0.01em' }}>
          The last <em>moments</em>
        </h3>
      </div>

      <div style={{ position: 'relative' }}>
        {/* Timeline rail */}
        <div style={{
          position: 'absolute', left: 11, top: 6, bottom: 6, width: 1,
          backgroundImage: 'repeating-linear-gradient(to bottom, var(--rule) 0 3px, transparent 3px 6px)',
        }} />

        {events.map((ev, i) => (
          <div key={ev.id} style={{
            display: 'grid', gridTemplateColumns: '24px 1fr auto',
            alignItems: 'center', gap: 12, padding: '8px 0',
          }}>
            <div style={{
              width: 9, height: 9, marginLeft: 7,
              background: i === 0 ? 'var(--ember)' : 'var(--ink)',
              borderRadius: '50%', position: 'relative', zIndex: 1,
              boxShadow: '0 0 0 3px var(--paper)',
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 500,
                color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{ev.track.name}</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--muted)' }}>
                <em style={{ fontFamily: 'var(--font-mincho)', fontSize: 12 }}>
                  {ev.track.artists.map(a => a.name).join(', ')}
                </em>
              </div>
            </div>
            <Mono style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
              {relTime(ev.playedAt)}
            </Mono>
          </div>
        ))}
      </div>
    </div>
  );
}
