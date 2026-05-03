'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { ErrorFallback } from '../error';

export default function PatternsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { tab: 'patterns' } });
  }, [error]);
  return <ErrorFallback error={error} reset={reset} kanji="型" caption="The patterns are unsettled" />;
}
