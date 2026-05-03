// SoundSage — root error boundary
// Catches render errors from any page that doesn't have its own boundary.
// Reports to Sentry, then shows an editorial fallback with a Try-again
// button (calls Next's reset() to remount the segment).
//
// `error.tsx` MUST be a client component per Next.js App Router contract.

'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: ErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return <ErrorFallback error={error} reset={reset} kanji="止" caption="A pause in transmission" />;
}

// Shared editorial fallback — used by both the root boundary above and the
// per-tab boundaries that delegate visual treatment here.
export function ErrorFallback({
  error,
  reset,
  kanji,
  caption,
}: ErrorProps & {
  kanji:   string;
  caption: string;
}) {
  return (
    <section
      style={{
        padding: '96px 28px 120px',
        textAlign: 'center',
        borderBottom: '1px solid var(--rule)',
        minHeight: 'calc(100vh - 240px)',
      }}
    >
      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        <div
          style={{
            fontFamily: 'var(--font-mincho)',
            fontWeight: 500,
            fontSize: 64,
            color: 'var(--seal)',
            lineHeight: 1,
            marginBottom: 28,
          }}
        >
          {kanji}
        </div>

        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--seal)',
            marginBottom: 12,
          }}
        >
          Something went wrong
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 400,
            fontSize: 32,
            letterSpacing: '-0.01em',
            color: 'var(--ink)',
            marginBottom: 14,
          }}
        >
          <em>{caption}.</em>
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-mincho)',
            fontStyle: 'italic',
            fontSize: 16,
            color: 'var(--muted)',
            lineHeight: 1.5,
            marginBottom: 32,
          }}
        >
          We&apos;ve been notified. The page tripped on an unexpected error
          while rendering. Try once more, or refresh the tab if it persists.
        </p>

        <button
          type="button"
          onClick={() => reset()}
          style={{
            background: 'var(--ink)',
            color: 'var(--paper)',
            border: 'none',
            padding: '10px 20px',
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>

        {error.digest && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--dim)',
              letterSpacing: '0.05em',
              marginTop: 28,
            }}
          >
            ref · {error.digest}
          </div>
        )}
      </div>
    </section>
  );
}
