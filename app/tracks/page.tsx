export const dynamic = 'force-dynamic';

import { auth } from '@/lib/auth';
import { parseRange } from '@/lib/range';
import {
  getSpotifyConnection,
  getTopTracks,
  getRecentlyAddedTracks,
} from '@/lib/page-data';
import type { TimeRange } from '@/types';

import { TabIndex, type TabIndexItem } from '@/components/TabIndex';
import { ViewHeader } from '@/components/ViewHeader';
import { TrackRankList } from '@/components/lists/RankList';
import {
  SignInPrompt,
  ConnectSpotifyPrompt,
} from '@/components/EmptyState';
import { SignInButton } from '@/components/SignInButton';

const TRACK_VIEWS = ['4w', '6m', 'all', 'recent'] as const;
type TrackView = (typeof TRACK_VIEWS)[number];

const VIEW_TITLES: Record<TrackView, { kicker: string; title: string; subtitle: string; chartKicker: string }> = {
  '4w':     { kicker: 'View · Last 4 weeks',  title: 'Most played · last 4 weeks', subtitle: 'Your top fifty over the past month.',          chartKicker: 'Top 五十 — Last 4 weeks' },
  '6m':     { kicker: 'View · 6 months',      title: 'Most played · 6 months',     subtitle: 'A wider lens — half a year of repeats.',       chartKicker: 'Top 五十 — 6 months' },
  'all':    { kicker: 'View · All time',      title: 'Most played · all time',     subtitle: 'Every track that earned its place.',           chartKicker: 'Top 五十 — All time' },
  'recent': { kicker: 'View · Recently added', title: 'Recently added',             subtitle: 'Tracks you heard for the first time, latest first.', chartKicker: 'Latest 五十 — first plays' },
};

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

export default async function TracksPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) return <SignInPrompt action={<SignInButton />} />;

  const conn = await getSpotifyConnection(session.userId);
  if (!conn.connected) return <ConnectSpotifyPrompt />;

  const view = TRACK_VIEWS.includes(searchParams.view as TrackView)
    ? (searchParams.view as TrackView)
    : null;

  // ─── Destination view ──────────────────────────────────────────────────────
  if (view) {
    const meta = VIEW_TITLES[view];
    let items;
    if (view === 'recent') {
      items = await getRecentlyAddedTracks(session.userId, 50);
    } else {
      const range: TimeRange = view; // '4w' | '6m' | 'all'
      const top = await getTopTracks(session.userId, parseRange(range), 50);
      items = top.tracks;
    }
    return (
      <>
        <ViewHeader
          backHref="/tracks"
          kicker={meta.kicker}
          title={meta.title}
          subtitle={meta.subtitle}
        />
        <TrackRankList
          title={view === 'recent' ? 'Latest first plays' : `Top ${items.length}`}
          kicker={meta.chartKicker}
          items={items}
        />
      </>
    );
  }

  // ─── Index ─────────────────────────────────────────────────────────────────
  const parsedRange = parseRange(searchParams.range);
  const top = await getTopTracks(session.userId, parsedRange, 8);
  const indexItems: [TabIndexItem, TabIndexItem, TabIndexItem, TabIndexItem] = [
    { kanji: '一', label: 'Most played · last 4 weeks', href: '/tracks?view=4w' },
    { kanji: '二', label: 'Most played · 6 months',     href: '/tracks?view=6m' },
    { kanji: '三', label: 'Most played · all time',     href: '/tracks?view=all' },
    { kanji: '四', label: 'Recently added',             href: '/tracks?view=recent' },
  ];

  return (
    <>
      <TabIndex
        subtitle="Every song, ranked and sorted."
        items={indexItems}
      />
      <TrackRankList
        title="Most-played tracks"
        kicker={`Top 八 — ${RANGE_LABELS[parsedRange.range]}`}
        items={top.tracks}
      />
    </>
  );
}
