'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { ErrorFallback } from '../error';

export default function ArtistsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { tab: 'artists' } });
  }, [error]);
  return <ErrorFallback error={error} reset={reset} kanji="師" caption="The hall lights flickered" />;
}
