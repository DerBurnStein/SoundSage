import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/session';
import { parseRange } from '@/lib/range';
import { resolveUserTimezone } from '@/lib/timezone';
import { getActivity } from '@/lib/page-data';
import type { ActivityStats } from '@/types';

const ALLOWED_GRAIN = new Set(['day', 'week', 'month']);

export async function GET(req: NextRequest): Promise<NextResponse<ActivityStats>> {
  const { session, error } = await requireAuth();
  if (error) return error as NextResponse<ActivityStats>;

  const params = req.nextUrl.searchParams;
  const parsedRange = parseRange(params.get('range'));
  const requested = params.get('grain');
  const grain: 'day' | 'week' | 'month' = ALLOWED_GRAIN.has(requested ?? '')
    ? (requested as 'day' | 'week' | 'month')
    : parsedRange.grain === 'hour'
    ? 'day'
    : (parsedRange.grain as 'day' | 'week' | 'month');

  const tz = await resolveUserTimezone(session.userId, params.get('tz'));
  return NextResponse.json(await getActivity(session.userId, parsedRange, grain, tz));
}
