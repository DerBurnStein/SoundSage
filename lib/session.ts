import { auth } from './auth';
import { NextResponse } from 'next/server';

type AuthedSession = {
  userId: string;
  user: { name?: string | null; email?: string | null };
  // When `true`, the session is a synthesized demo session backed by the
  // shared public demo user. Read-only routes accept demo sessions; write
  // routes should reject via `requireAuth({ allowDemo: false })`, which
  // is the default.
  demo?: boolean;
};

interface RequireAuthOptions {
  /**
   * When true, demo sessions (anonymous visitors browsing pre-seeded
   * data) are accepted. Reads on stats/history/top endpoints can opt in.
   * Writes (sync, settings, imports) must leave this false so that demo
   * visitors don't mutate shared demo data or trigger Spotify calls
   * against a fake account that has no real refresh token.
   * Default: false.
   */
  allowDemo?: boolean;
}

/**
 * Validates the current session in a Route Handler.
 * Returns the session on success or a 401/403 NextResponse on failure.
 */
export async function requireAuth(
  options: RequireAuthOptions = {}
): Promise<
  { session: AuthedSession; error: null } | { session: null; error: NextResponse }
> {
  const session = await auth();
  if (!session?.userId) {
    return {
      session: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  if (session.demo && !options.allowDemo) {
    return {
      session: null,
      error: NextResponse.json(
        {
          error: 'Demo mode — sign in with Google to perform this action.',
          code: 'demo_session',
        },
        { status: 403 }
      ),
    };
  }
  return { session: session as AuthedSession, error: null };
}
