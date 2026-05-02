// SoundSage — GenreBar
// Horizontal stacked bar showing genre composition.
// Props-driven: feed it GenreStat[] from /api/stats/genres.

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
  if (loading || !data.length) {
    return (
      <div style={{ padding: '24px 28px', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ height: 56, background: 'var(--paper-2)' }} />
      </div>
    );
  }

  const topGenre = data[0]?.name ?? '—';

  return (
    <div style={{
      padding: '24px 28px',
      borderRight: '1px solid var(--rule)',
      borderBottom: '1px solid var(--rule)',
    }}>
      <div style={{ marginBottom: 18 }}>
        <Caps>Fig. 三 — Genre composition</Caps>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 22, marginTop: 6, letterSpacing: '-0.01em' }}>
          One third <em>{topGenre.toLowerCase()}</em>, the rest a mosaic
        </h3>
      </div>

      {/* Stacked bar */}
      <div style={{ display: 'flex', height: 56, width: '100%', border: '1px solid var(--rule)' }}>
        {data.map((g, i) => {
          const pct   = (g.share * 100).toFixed(1);
          const color = genreColor(g.name);
          return (
            <div key={g.name}
              title={`${g.name} — ${pct}%`}
              style={{
                width: `${g.share * 100}%`,
                background: color,
                borderRight: i < data.length - 1 ? '1px solid var(--paper)' : 'none',
                position: 'relative', cursor: 'default',
              }}
            >
              {g.share >= 0.14 && (
                <span style={{
                  position: 'absolute', left: 8, bottom: 6,
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--paper)', letterSpacing: '0.05em',
                }}>{pct}%</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px 24px', marginTop: 18,
      }}>
        {data.map(g => (
          <div key={g.name} style={{
            display: 'flex', alignItems: 'baseline', gap: 8,
            paddingBottom: 6, borderBottom: '1px dotted var(--rule)',
          }}>
            <span style={{ width: 10, height: 10, background: genreColor(g.name), display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--ink)', flex: 1 }}>{g.name}</span>
            <Mono style={{ fontSize: 11, color: 'var(--muted)' }}>{(g.share * 100).toFixed(0)}%</Mono>
          </div>
        ))}
      </div>
    </div>
  );
}
