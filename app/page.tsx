// SoundSage — Overview tab
// Server component. Fetches all required data in parallel via DIRECT lib
// calls (no HTTP roundtrip, no redundant auth checks). Empty states for
// unsigned / unconnected / fresh-sync.

import { auth } from '@/lib/auth';
import { parseRange } from '@/lib/range';
import { resolveUserTimezone } from '@/lib/timezone';
import {
  getSpotifyConnection,
  getOverview,
  getActivity,
  getHourly,
  getGenres,
  getWeekly,
  weeksForRange,
  getTopTracks,
  getTopArtists,
  getRecentHistory,
} from '@/lib/page-data';
import type { TimeRange } from '@/types';

import { MotifRail } from '@/components/motif/MotifRail';
import { Lede, type LedeHighlight, LedeHighlights } from '@/components/Lede';
import { StatStrip, type StatTile } from '@/components/StatStrip';
import { TweenNumber } from '@/components/TweenNumber';
import { ActivityRibbon } from '@/components/charts/ActivityRibbon';
import { HourlyMountain } from '@/components/charts/HourlyMountain';
import { GenreBar } from '@/components/charts/GenreBar';
import { WeeklySpark } from '@/components/charts/WeeklySpark';
import { TrackRankList, ArtistRankList } from '@/components/lists/RankList';
import { RecentStream } from '@/components/lists/RecentStream';
import { SyncCard } from '@/components/SyncCard';
import {
  SignInPrompt,
  ConnectSpotifyPrompt,
  FreshSyncWaiting,
} from '@/components/EmptyState';
import { SignInButton } from '@/components/SignInButton';
import { cleanTrackName } from '@/components/primitives';

interface PageProps {
  searchParams: { range?: string };
}

export default async function OverviewPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session) {
    return (
      <>
        <MotifRail tab="overview" />
        <SignInPrompt action={<SignInButton />} />
      </>
    );
  }

  const userId = session.userId;
  const conn = await getSpotifyConnection(userId);
  if (!conn.connected) {
    return (
      <>
        <MotifRail tab="overview" />
        <ConnectSpotifyPrompt />
      </>
    );
  }

  const parsedRange = parseRange(searchParams.range);
  const tz = await resolveUserTimezone(userId, null);
  const grain: 'day' | 'week' | 'month' =
    parsedRange.grain === 'hour' ? 'day' : parsedRange.grain;

  // All 8 fetches in parallel — direct DB hits or Redis cache hits, no HTTP.
  const [
    overview,
    activity,
    hourly,
    genres,
    weekly,
    topTracks,
    topArtists,
    recent,
  ] = await Promise.all([
    getOverview(userId, parsedRange, tz),
    getActivity(userId, parsedRange, grain, tz),
    getHourly(userId, parsedRange, tz),
    getGenres(userId, parsedRange, 12),
    getWeekly(userId, tz, weeksForRange(parsedRange.range)),
    getTopTracks(userId, parsedRange, 8),
    getTopArtists(userId, parsedRange, 6),
    getRecentHistory(userId, null, 10),
  ]);

  // Connected but the first sync hasn't populated anything yet
  if (overview.totalPlays === 0) {
    return (
      <>
        <MotifRail tab="overview" />
        <FreshSyncWaiting />
        <SyncCard />
      </>
    );
  }

  // Every numeric readout on Overview is rendered through <TweenNumber>,
  // so the digits roll smoothly between values whenever the time-range
  // picker swaps datasets. Format keys are strings (not functions) because
  // <TweenNumber> is a client component and Next.js can't serialise
  // function props across the server-client boundary; the formatter table
  // lives inside lib/TweenNumber.tsx.
  const totalMins  = Math.round(overview.totalMs / 60_000);
  const totalPlays = Math.max(1, overview.totalPlays);

  // Period highlights for the right side of the Lede — fills the editorial
  // white space next to the giant play-count number with three quick reads:
  // top track / top artist / top genre. Each uses the same data we already
  // fetched for the rest of the page, so no extra round-trips.
  const top1Track  = topTracks.tracks[0];
  const top1Artist = topArtists.artists[0];
  const top1Genre  = genres.genres[0];
  const highlights: LedeHighlight[] = [];
  if (top1Track) {
    highlights.push({
      kicker: 'B — Top track',
      name:   cleanTrackName(top1Track.name),
      byline: top1Track.artists[0]?.name,
      stat:   (
        <>
          <TweenNumber value={top1Track.plays} format="count" /> plays ·{' '}
          <TweenNumber value={top1Track.plays / totalPlays} format="percent" />
        </>
      ),
      share:  top1Track.plays / totalPlays,
      color:  'var(--ink)',
    });
  }
  if (top1Artist) {
    highlights.push({
      kicker: 'C — Top artist',
      name:   top1Artist.name,
      byline: top1Artist.genres.slice(0, 2).join(' · ') || undefined,
      stat:   (
        <>
          <TweenNumber value={top1Artist.plays} format="count" /> plays ·{' '}
          <TweenNumber value={top1Artist.share} format="percent" />
        </>
      ),
      share:  top1Artist.share,
      color:  'var(--ember)',
    });
  }
  if (top1Genre) {
    highlights.push({
      kicker: 'D — Top genre',
      name:   top1Genre.name,
      byline: undefined,
      stat:   (
        <>
          <TweenNumber value={top1Genre.share} format="pctInt" /> of period
        </>
      ),
      share:  top1Genre.share,
      color:  'var(--seal)',
    });
  }
  highlights.push({
    kicker: 'E — Discovery',
    name:   (
      <>
        <TweenNumber value={overview.newArtists} format="count" /> new artists
      </>
    ),
    byline: 'first heard this period',
    stat:   (
      <>
        <TweenNumber value={overview.discoveryRate} format="pctInt" /> discovery rate
      </>
    ),
    share:  overview.discoveryRate,
    color:  'var(--gold)',
  });

  const tiles: StatTile[] = [
    {
      label: 'Unique tracks',
      value: <TweenNumber value={overview.uniqueTracks} format="count" />,
      footnote: `${parsedRange.range} window`,
    },
    {
      label: 'Listening time',
      value: <TweenNumber value={overview.totalMs} format="ms" />,
      footnote: 'audio duration',
    },
    {
      label: 'Peak hour',
      value: <TweenNumber value={overview.topHour} format="hour" />,
      footnote: 'most active',
      accent: 'ember',
    },
    {
      label: 'Discovery rate',
      value: <TweenNumber value={overview.discoveryRate} format="pctInt" />,
      footnote: (
        <>
          <TweenNumber value={overview.newArtists} format="count" /> new artists
        </>
      ),
      accent: 'seal',
    },
  ];

  return (
    <>
      <MotifRail tab="overview" />

      <Lede
        eyebrow="A — Plays this period"
        value={<TweenNumber value={overview.totalPlays} format="count" />}
        subtitle={
          <>
            <TweenNumber value={totalMins} format="mins" /> of audio ·{' '}
            <TweenNumber value={overview.totalPlays} format="count" /> plays
          </>
        }
        readout={`${overview.range.from.slice(0, 10)} → ${overview.range.to.slice(0, 10)}`}
        aside={highlights.length > 0 ? <LedeHighlights items={highlights} /> : undefined}
      />

      <StatStrip tiles={tiles} />

      <ActivityRibbon data={activity.buckets} grain={activity.grain} />

      {/* Mountain landscape — full width because the painting needs room
          to breathe. Genre composition follows below in its own band. */}
      <HourlyMountain data={hourly.buckets} />

      <GenreBar data={genres.genres} />

      <WeeklySpark data={weekly} />

      <TrackRankList title="Most played" kicker="Top tracks" items={topTracks.tracks} />
      <ArtistRankList title="Listened to most" kicker="Top artists" items={topArtists.artists} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '3fr 2fr',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <RecentStream events={recent.events} live />
        <SyncCard />
      </div>
    </>
  );
}
