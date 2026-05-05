// SoundSage — GenreBar
// Horizontal stacked bar showing genre composition. Each segment hovers to
// surface its name + percentage; the heading swaps to highlight the focus.

'use client';

import { useState } from 'react';
import { Caps, Mono } from '../primitives';
import type { GenreStat } from '../../types';

// Genre → CSS variable mapping. Extend as needed.
const GENRE_COLORS: Record<string, string> = {
  indie:     'var(--moss)',
  'r&b':     'var(--ember)',
  folk:      'var(--gold)',
  classic:   'var(--plum)',
  ambient:   'var(--sky)',
  classical: 'var(--plum)',
  pop:       'var(--ember)',
  rock:      'var(--moss-2)',
  electronic:'var(--sky)',
  other:     'var(--dim)',
};

function genreColor(name: string): string {
  return GENRE_COLORS[name.toLowerCase()] ?? 'var(--dim)';
}

interface GenreBarProps {
  data:     GenreStat[];
  loading?: boolean;
}

export function GenreBar({ data, loading }: GenreBarProps) {
  const [hover, setHover] = useState<number | null>(null);

  if (loading) {
    return (
      <div style={{ padding: '24px 28px', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ height: 56, background: 'var(--paper-2)' }} />
      </div>
    );
  }
  if (!data.length) {
    return (
      <div style={{ padding: '24px 28px', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ marginBottom: 14 }}>
          <Caps>Fig. 三 — Genre composition</Caps>
        </div>
        <div
          style={{
            padding: '32px 24px',
            textAlign: 'center',
            border: '1px dashed var(--rule)',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-mincho)',
              fontStyle: 'italic',
              fontSize: 16,
              color: 'var(--muted)',
              lineHeight: 1.55,
            }}
          >
            No genre signal yet — artist genres haven't been backfilled for this window.
          </p>
        </div>
      </div>
    );
  }

  const focused = hover != null ? data[hover] : null;
  const topGenre = data[0]?.name ?? '—';

  return (
    <div style={{
      padding: '24px 28px',
      borderRight: '1px solid var(--rule)',
      borderBottom: '1px solid var(--rule)',
    }}>
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}>
        <Caps>Fig. 三 — Genre composition</Caps>
        <h3 style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 400,
          fontSize: 22,
          marginTop: 6,
          letterSpacing: '-0.01em',
          minHeight: '1.4em', // prevent text-shift when swapping the heading
        }}>
          {focused ? (
            <>
              <em>{focused.name}</em>
              <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-mincho)', fontStyle: 'italic' }}>
                {' · '}
              </span>
              <Mono style={{ fontSize: 16 }}>{focused.plays.toLocaleString()} plays</Mono>
              <span style={{ color: 'var(--dim)' }}>
                {' · '}
                {(focused.share * 100).toFixed(1)}% of period
              </span>
            </>
          ) : (
            <>One third <em>{topGenre.toLowerCase()}</em>, the rest a mosaic</>
          )}
        </h3>
      </div>

      {/* Stacked bar */}
      <div style={{ display: 'flex', height: 60, width: '100%', border: '1px solid var(--rule)' }}>
        {data.map((g, i) => {
          const pct   = (g.share * 100).toFixed(1);
          const color = genreColor(g.name);
          const isHv  = hover === i;
          return (
            <div key={g.name}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{
                width: `${g.share * 100}%`,
                background: color,
                borderRight: i < data.length - 1 ? '1px solid var(--paper)' : 'none',
                position: 'relative',
                cursor: 'default',
                outline: isHv ? '2px solid var(--ink)' : 'none',
                outlineOffset: isHv ? -2 : 0,
                opacity: hover == null || isHv ? 1 : 0.55,
                transition: 'opacity 0.15s, outline 0.15s, width 500ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {g.share >= 0.10 && (
                <span style={{
                  position: 'absolute', left: 8, bottom: 6,
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--paper)', letterSpacing: '0.05em',
                  pointerEvents: 'none',
                }}>{pct}%</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend grid */}
      <div className="genre-legend" style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px 24px', marginTop: 18,
      }}>
        {data.map((g, i) => {
          const isHv = hover === i;
          return (
            <div
              key={g.name}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 8,
                paddingBottom: 6, borderBottom: '1px dotted var(--rule)',
                cursor: 'default',
                opacity: hover == null || isHv ? 1 : 0.6,
                transition: 'opacity 0.15s',
              }}
            >
              <span style={{ width: 10, height: 10, background: genreColor(g.name), display: 'inline-block', flexShrink: 0 }} />
              <span style={{
                fontFamily: 'var(--font-serif)',
                fontSize: 16,
                color: isHv ? 'var(--ink)' : 'var(--ink)',
                flex: 1,
                fontWeight: isHv ? 600 : 400,
              }}>{g.name}</span>
              <Mono style={{ fontSize: 11, color: 'var(--muted)' }}>{(g.share * 100).toFixed(0)}%</Mono>
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}
