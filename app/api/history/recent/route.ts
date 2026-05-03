import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { getRecentHistory } from '@/lib/page-data';
import type { RecentHistoryResponse } from '@/types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest): Promise<NextResponse<RecentHistoryResponse>> {
  const { session, error } = await requireAuth();
  if (error) return error as NextResponse<RecentHistoryResponse>;

  const params = req.nextUrl.searchParams;
  const cursorParam = params.get('cursor');
  const limitParam = parseInt(params.get('limit') ?? '', 10);
  const limit = Math.min(
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT,
    MAX_LIMIT
  );

  const cursor = cursorParam ? new Date(cursorParam) : null;
  if (cursorParam && (!cursor || isNaN(cursor.getTime()))) {
    return NextResponse.json({ events: [], nextCursor: null }, { status: 400 });
  }

  return NextResponse.json(await getRecentHistory(session.userId, cursor, limit));
}
