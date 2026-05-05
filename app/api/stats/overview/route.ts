import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { parseRange } from '@/lib/range';
import { resolveUserTimezone } from '@/lib/timezone';
import { getOverview } from '@/lib/page-data';
import type { OverviewStats } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<OverviewStats>> {
  const { session, error } = await requireAuth({ allowDemo: true });
  if (error) return error as NextResponse<OverviewStats>;

  const parsedRange = parseRange(req.nextUrl.searchParams.get('range'));
  const tz = await resolveUserTimezone(session.userId, req.nextUrl.searchParams.get('tz'));

  return NextResponse.json(await getOverview(session.userId, parsedRange, tz));
}
