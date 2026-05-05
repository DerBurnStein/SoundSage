import NextAuth, { type Session } from 'next-auth';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { cookies } from 'next/headers';
import { db } from './db';

// Public demo account. A pre-seeded user record with curated synthetic
// data so unauthenticated visitors can explore the populated dashboard
// without a Spotify connection. See scripts/seed-demo-user.mjs for the
// data setup. The userId is hard-coded so the seed script and the
// auth wrapper agree on which row to read.
export const DEMO_USER_ID = 'demo-public-2026';
export const DEMO_COOKIE = 'soundsage_demo';

const nextAuth = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  adapter: PrismaAdapter(db),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'database' },
  callbacks: {
    async session({ session, user }) {
      session.userId = user.id;
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

// Wrapped auth(): demo cookie short-circuits NextAuth and returns a
// synthetic session pointing at DEMO_USER_ID. Every existing call to
// auth() in pages and API routes automatically picks up demo support
// because the session shape is identical.
export async function auth(): Promise<Session | null> {
  // cookies() throws when called outside a request scope (e.g. some
  // Next.js build-time module evaluations during static analysis).
  // Wrapping in try keeps the wrapper safe to import anywhere — it
  // just falls through to NextAuth.
  try {
    const cookieStore = await cookies();
    const demoCookie = cookieStore.get(DEMO_COOKIE);
    if (demoCookie?.value === '1') {
      return {
        userId: DEMO_USER_ID,
        user: {
          name: 'Demo Visitor',
          email: 'demo@soundsage.dev',
          image: null,
        },
        demo: true,
        // NextAuth's Session also has expires; set far-future so any
        // expiration check passes.
        expires: new Date(Date.now() + 365 * 86_400_000).toISOString(),
      } satisfies Session;
    }
  } catch {
    // not in a request scope — defer to NextAuth
  }
  return nextAuth.auth();
}
