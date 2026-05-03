'use client';

import { signIn } from 'next-auth/react';

export function SignInButton() {
  return (
    <button
      onClick={() => signIn('google', { callbackUrl: '/' })}
      style={{
        background: 'var(--seal)',
        color: '#fff',
        border: 'none',
        padding: '0.6rem 1.2rem',
        fontFamily: 'var(--font-sans)',
        fontSize: '0.875rem',
        cursor: 'pointer',
      }}
    >
      Sign in with Google
    </button>
  );
}
