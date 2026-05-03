import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { db } from '@/lib/db';
import type { RecentHistoryResponse, RecentEvent } from '@/types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest): Promise<NextResponse<RecentHistoryResponse>> {
  const { session, error } = await requireAuth();
  if (error) return error as NextResponse<RecentHistoryResponse>;

  const { userId } = session;
  const params = req.nextUrl.searchParams;

  const cursorParam = params.get('cursor');
  const limitParam = parseInt(params.get('limit') ?? '', 10);
  const limit = Math.min(
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT,
    MAX_LIMIT
  );

  const cursorDate = cursorParam ? new Date(cursorParam) : null;
  if (cursorParam && (!cursorDate || isNaN(cursorDate.getTime()))) {
    return NextResponse.json(
      { events: [], nextCursor: null },
      { status: 400 }
    );
  }

  // Fetch limit + 1 to determine if there's a next page
  const rows = await db.listeningEvent.findMany({
    where: {
      userId,
      ...(cursorDate ? { playedAt: { lt: cursorDate } } : {}),
    },
    orderBy: { playedAt: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      trackId: true,
      playedAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? sliced[sliced.length - 1]!.playedAt.toISOString() : null;

  // Batch-fetch tracks for the page
  const trackIds = [...new Set(sliced.map((r) => r.trackId))];
  const tracks = await db.track.findMany({
    where: { id: { in: trackIds } },
    select: {
      id: true,
      name: true,
      artistNames: true,
      artistIds: true,
      albumName: true,
      albumId: true,
      imageUrl: true,
      durationMs: true,
    },
  });
  const trackById = new Map(tracks.map((t) => [t.id, t]));

  const events: RecentEvent[] = sliced.map((row) => {
    const t = trackById.get(row.trackId);
    return {
      id: String(row.id),
      playedAt: row.playedAt.toISOString(),
      track: {
        id: row.trackId,
        name: t?.name ?? 'Unknown track',
        artists: t
          ? t.artistNames.map((name, i) => ({
              id: t.artistIds[i] ?? '',
              name,
            }))
          : [],
        album: {
          id: t?.albumId ?? '',
          name: t?.albumName ?? '',
          imageUrl: t?.imageUrl ?? null,
        },
        durationMs: t?.durationMs ?? 0,
      },
    };
  });

  return NextResponse.json({ events, nextCursor });
}
