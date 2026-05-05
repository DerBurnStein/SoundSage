import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    userId: string;
    user: DefaultSession['user'];
    // True when the session was synthesized from a demo cookie rather than
    // a real authenticated NextAuth user. Read-paths use the demo userId
    // exactly like a real session; write-paths must reject demo sessions
    // so visitors can't mutate the shared demo data.
    demo?: boolean;
  }
}
