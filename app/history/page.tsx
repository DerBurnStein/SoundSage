// Force per-request rendering so the demo cookie + any time-range
// search-param change always re-evaluate session state. Without this
// Next.js can serve a cached "no session" payload after the cookie is
// set, leaving the layout's demo banner showing while the page body
// renders SignInPrompt.
export const dynamic = 'force-dynamic';

import { auth } from '@/lib/auth';
import { parseRange } from '@/lib/range';
import { resolveUserTimezone } from '@/lib/timezone';
import {
  getSpotifyConnection,
  getHistoryCounts,
  getActivity,
  getEventsBetween,
  historyWindow,
} from '@/lib/page-data';

import { TabIndex, type TabIndexItem } from '@/components/TabIndex';
import { ViewHeader } from '@/components/ViewHeader';
import { ActivityRibbon } from '@/components/charts/ActivityRibbon';
import { RecentStream } from '@/components/lists/RecentStream';
import {
  SignInPrompt,
  ConnectSpotifyPrompt,
} from '@/components/EmptyState';
import { SignInButton } from '@/components/SignInButton';

const HISTORY_VIEWS = ['today', 'yesterday', 'this-week', 'last-week'] as const;
type HistoryView = (typeof HISTORY_VIEWS)[number];

interface PageProps {
  searchParams: { view?: string };
}

export default async function HistoryPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session) return <SignInPrompt action={<SignInButton />} />;

  const conn = await getSpotifyConnection(session.userId);
  if (!conn.connected) return <ConnectSpotifyPrompt />;

  const tz = await resolveUserTimezone(session.userId, null);
  const view = HISTORY_VIEWS.includes(searchParams.view as HistoryView)
    ? (searchParams.view as HistoryView)
    : null;

  // ─── Destination view ──────────────────────────────────────────────────────
  if (view) {
    const win = historyWindow(view, tz);
    const events = await getEventsBetween(session.userId, win.from, win.to, 500);
    return (
      <>
        <ViewHeader
          backHref="/history"
          kicker={`View · ${win.label}`}
          title={win.label}
          subtitle={`${events.length.toLocaleString()} plays in this window.`}
        />
        {events.length > 0 ? (
          <RecentStream events={events} live={view === 'today'} />
        ) : (
          <EmptyView label={win.label} />
        )}
      </>
    );
  }

  // ─── Index ─────────────────────────────────────────────────────────────────
  const parsedRange = parseRange('4w');
  const [counts, activity] = await Promise.all([
    getHistoryCounts(session.userId, tz),
    getActivity(session.userId, parsedRange, 'day', tz),
  ]);

  const items: [TabIndexItem, TabIndexItem, TabIndexItem, TabIndexItem] = [
    { kanji: '一', label: 'Today',     hint: `${counts.today.toLocaleString()} plays`,     href: '/history?view=today' },
    { kanji: '二', label: 'Yesterday', hint: `${counts.yesterday.toLocaleString()} plays`, href: '/history?view=yesterday' },
    { kanji: '三', label: 'This week', hint: `${counts.thisWeek.toLocaleString()} plays`,  href: '/history?view=this-week' },
    { kanji: '四', label: 'Last week', hint: `${counts.lastWeek.toLocaleString()} plays`,  href: '/history?view=last-week' },
  ];

  return (
    <>
      <TabIndex
        subtitle="A chronicle of every play, in tide order."
        items={items}
      />
      <ActivityRibbon data={activity.buckets} grain={activity.grain} />
    </>
  );
}

function EmptyView({ label }: { label: string }) {
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
        No plays recorded for {label.toLowerCase()} yet.
      </p>
    </section>
  );
}
