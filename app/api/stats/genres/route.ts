import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { parseRange } from '@/lib/range';
import { getGenres } from '@/lib/page-data';
import type { GenreStats } from '@/types';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

export async function GET(req: NextRequest): Promise<NextResponse<GenreStats>> {
  const { session, error } = await requireAuth({ allowDemo: true });
  if (error) return error as NextResponse<GenreStats>;

  const parsedRange = parseRange(req.nextUrl.searchParams.get('range'));
  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Math.min(
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT,
    MAX_LIMIT
  );
  return NextResponse.json(await getGenres(session.userId, parsedRange, limit));
}
