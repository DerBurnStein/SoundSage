import { auth } from '@/lib/auth';
import { SignInButton } from '@/components/SignInButton';

// Temporary proof-of-life stub — replaced in Phase 6 with the real Overview page.
export default async function Home() {
  const session = await auth();

  if (!session) {
    return (
      <main style={{ padding: '2rem', fontFamily: 'var(--font-sans)' }}>
        <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>
          Sign in to view your listening history.
        </p>
        <SignInButton />
      </main>
    );
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'var(--font-sans)' }}>
      <p style={{ color: 'var(--muted)', marginBottom: '0.5rem' }}>
        Signed in as <strong>{session.user?.email}</strong>
      </p>
      <pre
        style={{
          background: 'var(--paper-2)',
          padding: '1rem',
          overflow: 'auto',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--ink)',
        }}
      >
        {JSON.stringify(session, null, 2)}
      </pre>
    </main>
  );
}
