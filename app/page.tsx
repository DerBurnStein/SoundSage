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
  getTopTracks,
  getTopArtists,
  getRecentHistory,
} from '@/lib/page-data';
import type { TimeRange } from '@/types';

import { MotifRail } from '@/components/motif/MotifRail';
import { Lede, describeListening } from '@/components/Lede';
import { StatStrip, type StatTile } from '@/components/StatStrip';
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
import { hourLabel, fmtMs } from '@/components/primitives';

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
    getWeekly(userId, tz),
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

  const lede = describeListening(overview.totalPlays, overview.totalMs);

  const tiles: StatTile[] = [
    {
      label: 'Unique tracks',
      value: overview.uniqueTracks.toLocaleString(),
      footnote: `${parsedRange.range} window`,
    },
    {
      label: 'Listening time',
      value: fmtMs(overview.totalMs),
      footnote: 'audio duration',
    },
    {
      label: 'Peak hour',
      value: hourLabel(overview.topHour),
      footnote: 'most active',
      accent: 'ember',
    },
    {
      label: 'Discovery rate',
      value: `${(overview.discoveryRate * 100).toFixed(0)}%`,
      footnote: `${overview.newArtists} new artists`,
      accent: 'seal',
    },
  ];

  return (
    <>
      <MotifRail tab="overview" />

      <Lede
        eyebrow="A — Plays this period"
        value={lede.value}
        subtitle={lede.subtitle}
        readout={`${overview.range.from.slice(0, 10)} → ${overview.range.to.slice(0, 10)}`}
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
        <RecentStream events={recent.events} />
        <SyncCard />
      </div>
    </>
  );
}
