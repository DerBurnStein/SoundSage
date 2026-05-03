import { type NextRequest, NextResponse } from 'next/server';
import { incrementalSync } from '@/lib/sync';
import logger from '@/lib/logger';

/**
 * Cloud Tasks worker endpoint.
 *
 * In production this is invoked by Cloud Tasks with an OIDC bearer token and
 * the X-CloudTasks-QueueName header. In development, lib/tasks.ts calls
 * incrementalSync directly instead of hitting this route.
 *
 * Return 2xx on success OR permanent failure (so Cloud Tasks doesn't retry
 * indefinitely). Only return 5xx for transient errors that should be retried.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // In production require the Cloud Tasks queue header as a basic gate.
  // Full OIDC token verification should be added before opening to traffic.
  if (process.env.NODE_ENV === 'production') {
    const queueName = req.headers.get('X-CloudTasks-QueueName');
    if (!queueName) {
      logger.warn('sync-user: rejected request missing queue header');
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  let body: { userId?: string };
  try {
    body = (await req.json()) as { userId?: string };
  } catch {
    return new NextResponse('Bad Request: invalid JSON', { status: 400 });
  }

  const { userId } = body;
  if (!userId || typeof userId !== 'string') {
    return new NextResponse('Bad Request: missing userId', { status: 400 });
  }

  try {
    const result = await incrementalSync(userId);
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ userId, err: String(err) }, 'sync-user task failed');
    // 500 signals Cloud Tasks to retry
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
