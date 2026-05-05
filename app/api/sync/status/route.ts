import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import type { SyncStatus, SyncLag, TokenState } from '@/types';

const FRESH_MS = 30 * 60 * 1000; // synced within last 30 min
const STALE_MS = 6 * 60 * 60 * 1000; // synced within last 6h
const TOKEN_EXPIRING_MS = 10 * 60 * 1000; // <10 min until token expires

function deriveLag(lastSyncAt: Date | null, failureCount: number, needsReconnect: boolean): SyncLag {
  if (needsReconnect || failureCount >= 5) return 'broken';
  if (!lastSyncAt) return 'broken';
  const age = Date.now() - lastSyncAt.getTime();
  if (age < FRESH_MS) return 'fresh';
  if (age < STALE_MS) return 'stale';
  return 'broken';
}

function deriveTokens(expiresAt: Date | null): TokenState {
  if (!expiresAt) return 'expired';
  const remaining = expiresAt.getTime() - Date.now();
  if (remaining <= 0) return 'expired';
  if (remaining < TOKEN_EXPIRING_MS) return 'expiring';
  return 'fresh';
}

export async function GET(): Promise<NextResponse<SyncStatus>> {
  const { session, error } = await requireAuth({ allowDemo: true });
  if (error) return error as NextResponse<SyncStatus>;

  const { userId } = session;

  const account = await db.spotifyAccount.findUnique({
    where: { userId },
    select: {
      lastSyncAt: true,
      cursor: true,
      failureCount: true,
      needsReconnect: true,
      expiresAt: true,
    },
  });

  // Today (UTC midnight to now). Activity in the user's local tz is a UI
  // concern; this metric is "rough volume" and UTC is fine.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [eventCount, eventsToday] = await Promise.all([
    db.listeningEvent.count({ where: { userId } }),
    db.listeningEvent.count({ where: { userId, playedAt: { gte: todayStart } } }),
  ]);

  const body: SyncStatus = {
    lastSyncAt: account?.lastSyncAt?.toISOString() ?? null,
    cursor: account?.cursor?.toISOString() ?? null,
    lag: account
      ? deriveLag(account.lastSyncAt, account.failureCount, account.needsReconnect)
      : 'broken',
    failureCount: account?.failureCount ?? 0,
    tokens: deriveTokens(account?.expiresAt ?? null),
    eventCount,
    eventsToday,
  };

  return NextResponse.json(body);
}
