import { auth } from '@/lib/auth';
import { parseRange } from '@/lib/range';
import { resolveUserTimezone } from '@/lib/timezone';
import {
  getSpotifyConnection,
  getHourly,
  getGenres,
  getWeekly,
  weeksForRange,
  getActivity,
  getWeekdayWeekend,
  getTimeOfDay,
  getSeasonalGenres,
  getMoodPoints,
} from '@/lib/page-data';

import { TabIndex, type TabIndexItem } from '@/components/TabIndex';
import { ViewHeader } from '@/components/ViewHeader';
import { HourlyMountain } from '@/components/charts/HourlyMountain';
import { GenreBar } from '@/components/charts/GenreBar';
import { WeeklySpark } from '@/components/charts/WeeklySpark';
import { ActivityRibbon } from '@/components/charts/ActivityRibbon';
import {
  WeekdayWeekendChart,
  TimeOfDayChart,
  SeasonalGenreGrid,
  MoodCloudChart,
  MoodProfile,
  TrackQuadrantBreakdown,
} from '@/components/charts/PatternViews';
import {
  SignInPrompt,
  ConnectSpotifyPrompt,
} from '@/components/EmptyState';
import { SignInButton } from '@/components/SignInButton';

const PATTERN_VIEWS = [
  'weekday-weekend',
  'time-of-day',
  'seasonal-genres',
  'mood-clusters',
] as const;
type PatternView = (typeof PATTERN_VIEWS)[number];

interface PageProps {
  searchParams: { view?: string; range?: string };
}

export default async function PatternsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) return <SignInPrompt action={<SignInButton />} />;

  const conn = await getSpotifyConnection(session.userId);
  if (!conn.connected) return <ConnectSpotifyPrompt />;

  const tz = await resolveUserTimezone(session.userId, null);
  const view = PATTERN_VIEWS.includes(searchParams.view as PatternView)
    ? (searchParams.view as PatternView)
    : null;

  // ─── Destination views ─────────────────────────────────────────────────────
  if (view) {
    return await renderPatternView(session.userId, tz, view);
  }

  // ─── Index ─────────────────────────────────────────────────────────────────
  const parsedRange = parseRange(searchParams.range);
  // Pick a sensible activity grain for each range. parseRange already gives
  // us a default ('hour' for 24h, 'week' for 6m/1y, 'month' for all) — we
  // remap 'hour' → 'day' here because the ribbon never uses hour grain.
  const grain: 'day' | 'week' | 'month' =
    parsedRange.grain === 'hour' ? 'day' : parsedRange.grain;
  const [hourly, genres, weekly, activity] = await Promise.all([
    getHourly(session.userId, parsedRange, tz),
    getGenres(session.userId, parsedRange, 12),
    getWeekly(session.userId, tz, weeksForRange(parsedRange.range)),
    getActivity(session.userId, parsedRange, grain, tz),
  ]);

  const items: [TabIndexItem, TabIndexItem, TabIndexItem, TabIndexItem] = [
    { kanji: '一', label: 'Weekday vs weekend split',          href: '/patterns?view=weekday-weekend' },
    { kanji: '二', label: 'Morning · midday · night ratios',   href: '/patterns?view=time-of-day' },
    { kanji: '三', label: 'Genre shifts by season',            href: '/patterns?view=seasonal-genres' },
    { kanji: '四', label: 'Mood clusters from audio features', href: '/patterns?view=mood-clusters' },
  ];

  return (
    <>
      <TabIndex
        subtitle="How your listening blooms across the week."
        items={items}
      />

      <HourlyMountain data={hourly.buckets} />
      <GenreBar data={genres.genres} />
      <WeeklySpark data={weekly} />
      <ActivityRibbon data={activity.buckets} grain={activity.grain} />
    </>
  );
}

async function renderPatternView(userId: string, tz: string, view: PatternView) {
  const parsedRange = parseRange('4w');

  switch (view) {
    case 'weekday-weekend': {
      const stats = await getWeekdayWeekend(userId, parsedRange, tz);
      return (
        <>
          <ViewHeader
            backHref="/patterns"
            kicker="View · Weekday vs weekend"
            title="Weekday vs weekend split"
            subtitle="How the music cleaves between five days of work and two of rest."
          />
          <WeekdayWeekendChart {...stats} />
        </>
      );
    }
    case 'time-of-day': {
      const stats = await getTimeOfDay(userId, parsedRange, tz);
      return (
        <>
          <ViewHeader
            backHref="/patterns"
            kicker="View · Time of day"
            title="Morning · midday · evening · night"
            subtitle="The hours your headphones come alive."
          />
          <TimeOfDayChart {...stats} />
        </>
      );
    }
    case 'seasonal-genres': {
      const stats = await getSeasonalGenres(userId, tz);
      return (
        <>
          <ViewHeader
            backHref="/patterns"
            kicker="View · Genres by season"
            title="Genre shifts by season"
            subtitle="Each quarter of the year keeps its own colour."
          />
          <SeasonalGenreGrid seasons={stats.seasons} />
        </>
      );
    }
    case 'mood-clusters': {
      // Pull the user's top tracks (all-time) and score each on the energy
      // × valence plane via lib/mood.ts. Track-level gives a denser,
      // less-clustered scatter than genre-level, and the breakdown panel
      // can list real songs instead of broad genres.
      const points = await getMoodPoints(userId, 300);
      return (
        <>
          <ViewHeader
            backHref="/patterns"
            kicker="View · Mood clusters"
            title="Mood clusters"
            subtitle="Where each track falls on the energy × valence plane."
          />
          <MoodProfile             points={points} />
          <MoodCloudChart          points={points} />
          <TrackQuadrantBreakdown  points={points} />
        </>
      );
    }
  }
}
