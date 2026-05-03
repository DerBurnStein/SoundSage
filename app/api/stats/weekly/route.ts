import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { resolveUserTimezone } from '@/lib/timezone';
import { getWeekly } from '@/lib/page-data';
import type { WeeklySpark } from '@/types';

export async function GET(req: NextRequest): Promise<NextResponse<WeeklySpark>> {
  const { session, error } = await requireAuth();
  if (error) return error as NextResponse<WeeklySpark>;

  const tz = await resolveUserTimezone(session.userId, req.nextUrl.searchParams.get('tz'));
  return NextResponse.json(await getWeekly(session.userId, tz));
}
