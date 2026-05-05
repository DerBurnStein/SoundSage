import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { parseRange } from '@/lib/range';
import { resolveUserTimezone } from '@/lib/timezone';
import { getHourly } from '@/lib/page-data';
import type { HourlyStats } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<HourlyStats>> {
  const { session, error } = await requireAuth({ allowDemo: true });
  if (error) return error as NextResponse<HourlyStats>;

  const parsedRange = parseRange(req.nextUrl.searchParams.get('range'));
  const tz = await resolveUserTimezone(session.userId, req.nextUrl.searchParams.get('tz'));
  return NextResponse.json(await getHourly(session.userId, parsedRange, tz));
}
