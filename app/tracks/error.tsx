'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { ErrorFallback } from '../error';

export default function TracksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { tab: 'tracks' } });
  }, [error]);
  return <ErrorFallback error={error} reset={reset} kanji="曲" caption="The chart slipped its bearings" />;
}
