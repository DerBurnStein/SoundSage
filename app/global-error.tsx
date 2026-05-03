// SoundSage — last-resort error boundary
// Catches crashes in the root layout itself (which app/error.tsx cannot,
// since error.tsx renders inside the layout). This file MUST render its
// own <html>/<body> because it replaces the whole tree when it fires.
//
// Per Sentry's Next.js guide we reach for the bundled error component so
// the captured event includes Next's structured error metadata.

'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'global' } });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f0e8d6',
          color: '#14120e',
          fontFamily: 'ui-serif, Georgia, serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'ui-serif, Georgia, serif',
              fontSize: 64,
              color: '#c1272d',
              fontWeight: 600,
              marginBottom: 24,
              lineHeight: 1,
            }}
          >
            事
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 400, margin: '0 0 12px' }}>
            <em>The page could not load.</em>
          </h1>
          <p style={{ fontStyle: 'italic', color: '#6b6450', margin: '0 0 28px', lineHeight: 1.5 }}>
            We&apos;ve been notified. Try again, or reload the page if the
            problem persists.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: 'transparent',
                color: '#14120e',
                border: '1px solid #14120e',
                padding: '10px 22px',
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
              style={{
                background: '#14120e',
                color: '#f0e8d6',
                border: '1px solid #14120e',
                padding: '10px 22px',
                fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Reload page
            </button>
          </div>
          {error.digest && (
            <div
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: 9,
                color: '#948c75',
                letterSpacing: '0.05em',
                marginTop: 24,
              }}
            >
              ref · {error.digest}
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
