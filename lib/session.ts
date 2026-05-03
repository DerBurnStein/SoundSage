import { auth } from './auth';
import { NextResponse } from 'next/server';

type AuthedSession = { userId: string; user: { name?: string | null; email?: string | null } };

/**
 * Validates the current session in a Route Handler.
 * Returns the session on success or a 401 NextResponse if not authenticated.
 */
export async function requireAuth(): Promise<
  { session: AuthedSession; error: null } | { session: null; error: NextResponse }
> {
  const session = await auth();
  if (!session?.userId) {
    return {
      session: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { session: session as AuthedSession, error: null };
}
