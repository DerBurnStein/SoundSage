import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { parseRange } from '@/lib/range';
import { getTopTracks } from '@/lib/page-data';
import type { TopTracksResponse } from '@/types';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest): Promise<NextResponse<TopTracksResponse>> {
  const { session, error } = await requireAuth();
  if (error) return error as NextResponse<TopTracksResponse>;

  const parsedRange = parseRange(req.nextUrl.searchParams.get('range'));
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Math.min(
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT,
    MAX_LIMIT
  );
  return NextResponse.json(await getTopTracks(session.userId, parsedRange, limit));
}
