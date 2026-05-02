// SoundSage — RankList
// Generic ranked list — used for both Top Tracks and Top Artists.
// Accepts either TopTrack[] or TopArtist[] via the union prop.

'use client';

import Link from 'next/link';
import { Caps, Mono, Display, pad2 } from '../primitives';
import type { TopTrack, TopArtist } from '../../types';

// ─────────────────────────────────────────────────────
// Track list
// ─────────────────────────────────────────────────────
interface TrackListProps {
  title:    string;
  kicker:   string;
  items:    TopTrack[];
  loading?: boolean;
}
export function TrackRankList({ title, kicker, items, loading }: TrackListProps) {
  if (loading || !items.length) return <RankListSkeleton />;
  const max = Math.max(...items.map(i => i.plays));
  return (
    <RankListShell title={title} kicker={kicker} seeAllHref="/tracks">
      {items.map((it, i) => (
        <RankRow key={it.id} rank={i} plays={it.plays} max={max}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {it.name}
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            by <em style={{ fontFamily: 'var(--font-mincho)', fontSize: 13 }}>{it.artists.map(a => a.name).join(', ')}</em>
            {' · '}
            <Mono style={{ fontSize: 11 }}>{it.album.name}</Mono>
          </div>
        </RankRow>
      ))}
    </RankListShell>
  );
}

// ─────────────────────────────────────────────────────
// Artist list
// ─────────────────────────────────────────────────────
interface ArtistListProps {
  title:    string;
  kicker:   string;
  items:    TopArtist[];
  loading?: boolean;
}
export function ArtistRankList({ title, kicker, items, loading }: ArtistListProps) {
  if (loading || !items.length) return <RankListSkeleton />;
  const max = Math.max(...items.map(i => i.plays));
  return (
    <RankListShell title={title} kicker={kicker} seeAllHref="/artists">
      {items.map((it, i) => (
        <RankRow key={it.id} rank={i} plays={it.plays} max={max}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {it.name}
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {it.genres.slice(0, 2).join(' · ')}
            {' · '}
            <Mono style={{ fontSize: 11 }}>{(it.share * 100).toFixed(1)}% of plays</Mono>
          </div>
        </RankRow>
      ))}
    </RankListShell>
  );
}

// ─────────────────────────────────────────────────────
// Shared shell + row
// ─────────────────────────────────────────────────────
function RankListShell({ title, kicker, seeAllHref, children }: {
  title:      string;
  kicker:     string;
  seeAllHref: string;
  children:   React.ReactNode;
}) {
  return (
    <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <Caps>{kicker}</Caps>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 22, marginTop: 6, letterSpacing: '-0.01em' }}>
            {title}
          </h3>
        </div>
        <Link href={seeAllHref} style={{
          fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink)',
          borderBottom: '1px solid var(--ink)', paddingBottom: 1,
          textDecoration: 'none', fontWeight: 500,
        }}>See full chart →</Link>
      </div>
      <div>{children}</div>
    </div>
  );
}

function RankRow({ rank, plays, max, children }: {
  rank:     number;
  plays:    number;
  max:      number;
  children: React.ReactNode;
}) {
  const pct = (plays / max) * 100;
  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: '36px 1fr auto',
        alignItems: 'center', gap: 16,
        padding: '14px 0',
        borderBottom: '1px solid var(--rule)',
        cursor: 'default',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <Display size={28} weight={400} style={{ color: rank === 0 ? 'var(--ember)' : 'var(--ink)', lineHeight: 1 }}>
        {pad2(rank + 1)}
      </Display>
      <div style={{ minWidth: 0 }}>
        {children}
        {/* Relative play bar */}
        <div style={{ marginTop: 8, height: 2, background: 'var(--paper-3)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: 2, width: `${pct}%`, background: rank === 0 ? 'var(--ember)' : 'var(--ink)' }} />
        </div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 80 }}>
        <Mono style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 500 }}>{plays.toLocaleString()}</Mono>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--dim)', letterSpacing: '0.05em', marginTop: 2 }}>PLAYS</div>
      </div>
    </div>
  );
}

function RankListSkeleton() {
  return (
    <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--rule)' }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ height: 60, background: 'var(--paper-2)', marginBottom: 8, opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}
