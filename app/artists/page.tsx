import { auth } from '@/lib/auth';
import { parseRange } from '@/lib/range';
import { resolveUserTimezone } from '@/lib/timezone';
import {
  getSpotifyConnection,
  getTopArtists,
  getDiscoveryTrail,
  getNewArtistsThisMonth,
  getGenres,
  type DiscoveryEntry,
} from '@/lib/page-data';
import type { TimeRange } from '@/types';

import { TabIndex, type TabIndexItem } from '@/components/TabIndex';
import { ViewHeader } from '@/components/ViewHeader';
import { ArtistRankList } from '@/components/lists/RankList';
import { GenreBar } from '@/components/charts/GenreBar';
import { Caps, Display, Mono, pad2 } from '@/components/primitives';
import {
  SignInPrompt,
  ConnectSpotifyPrompt,
} from '@/components/EmptyState';
import { SignInButton } from '@/components/SignInButton';

const ARTIST_VIEWS = ['top50', 'new-month', 'genres', 'discovery'] as const;
type ArtistView = (typeof ARTIST_VIEWS)[number];

interface PageProps {
  searchParams: { view?: string; range?: string };
}

const RANGE_LABELS: Record<TimeRange, string> = {
  '24h': 'Last 24 hours',
  '7d':  'Last 7 days',
  '4w':  'Last 4 weeks',
  '6m':  '6 months',
  '1y':  '1 year',
  'all': 'All time',
};

export default async function ArtistsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) return <SignInPrompt action={<SignInButton />} />;

  const conn = await getSpotifyConnection(session.userId);
  if (!conn.connected) return <ConnectSpotifyPrompt />;

  const view = ARTIST_VIEWS.includes(searchParams.view as ArtistView)
    ? (searchParams.view as ArtistView)
    : null;

  // ─── Destination views ─────────────────────────────────────────────────────
  if (view) {
    return await renderArtistView(session.userId, view);
  }

  // ─── Index ─────────────────────────────────────────────────────────────────
  const parsedRange = parseRange(searchParams.range);
  const top = await getTopArtists(session.userId, parsedRange, 6);
  const items: [TabIndexItem, TabIndexItem, TabIndexItem, TabIndexItem] = [
    { kanji: '一', label: 'Top 50 by play count', href: '/artists?view=top50' },
    { kanji: '二', label: 'New this month',       href: '/artists?view=new-month' },
    { kanji: '三', label: 'Genres you orbit',     href: '/artists?view=genres' },
    { kanji: '四', label: 'Discovery trail',      href: '/artists?view=discovery' },
  ];

  return (
    <>
      <TabIndex
        subtitle="Voices you keep returning to."
        items={items}
      />
      <ArtistRankList
        title="Most-played artists"
        kicker={`Top 六 — ${RANGE_LABELS[parsedRange.range]}`}
        items={top.artists}
      />
    </>
  );
}

async function renderArtistView(userId: string, view: ArtistView) {
  switch (view) {
    case 'top50': {
      const top = await getTopArtists(userId, parseRange('all'), 50);
      return (
        <>
          <ViewHeader
            backHref="/artists"
            kicker="View · Top 50"
            title="Top 50 by play count"
            subtitle="The voices you have leaned on most, all-time."
          />
          <ArtistRankList
            title={`Top ${top.artists.length}`}
            kicker="All-time chart"
            items={top.artists}
          />
        </>
      );
    }
    case 'new-month': {
      const tz = await resolveUserTimezone(userId, null);
      const entries = await getNewArtistsThisMonth(userId, tz, 50);
      return (
        <>
          <ViewHeader
            backHref="/artists"
            kicker="View · New this month"
            title="New this month"
            subtitle={`${entries.length.toLocaleString()} fresh names entered the rotation.`}
          />
          <DiscoveryList items={entries} secondaryLabel="first heard" emptyMessage="No new artists yet this month." />
        </>
      );
    }
    case 'discovery': {
      const entries = await getDiscoveryTrail(userId, 50);
      return (
        <>
          <ViewHeader
            backHref="/artists"
            kicker="View · Discovery trail"
            title="Discovery trail"
            subtitle="The order you met them, latest first."
          />
          <DiscoveryList items={entries} secondaryLabel="first heard" emptyMessage="No discoveries logged yet." />
        </>
      );
    }
    case 'genres': {
      const all = await getGenres(userId, parseRange('all'), 24);
      return (
        <>
          <ViewHeader
            backHref="/artists"
            kicker="View · Genres"
            title="Genres you orbit"
            subtitle="The constellations your listening drifts between."
          />
          <GenreBar data={all.genres} />
        </>
      );
    }
  }
}

// ─── Local list component for discovery / new-month views ────────────────────

function DiscoveryList({
  items, secondaryLabel, emptyMessage,
}: {
  items:          DiscoveryEntry[];
  secondaryLabel: string;
  emptyMessage:   string;
}) {
  if (items.length === 0) {
    return (
      <section style={{ padding: '64px 28px', textAlign: 'center' }}>
        <p
          style={{
            fontFamily: 'var(--font-mincho)',
            fontStyle: 'italic',
            fontSize: 18,
            color: 'var(--muted)',
          }}
        >
          {emptyMessage}
        </p>
      </section>
    );
  }
  return (
    <section style={{ padding: '24px 28px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <Caps>{secondaryLabel.toUpperCase()}</Caps>
        </div>
        {items.map((it, i) => (
          <div
            key={it.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr auto',
              alignItems: 'center',
              gap: 16,
              padding: '14px 0',
              borderBottom: '1px solid var(--rule)',
            }}
          >
            <Display
              size={28}
              weight={400}
              style={{ color: i === 0 ? 'var(--ember)' : 'var(--ink)', lineHeight: 1 }}
            >
              {pad2(i + 1)}
            </Display>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 18,
                  fontWeight: 500,
                  color: 'var(--ink)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {it.name}
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {it.genres.slice(0, 2).join(' · ')}
              </div>
            </div>
            <div style={{ textAlign: 'right', minWidth: 120 }}>
              <Mono style={{ fontSize: 13, color: 'var(--ink)' }}>
                {formatDate(it.firstHeardAt)}
              </Mono>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--dim)', letterSpacing: '0.05em', marginTop: 2 }}>
                {it.plays.toLocaleString()} PLAYS
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
