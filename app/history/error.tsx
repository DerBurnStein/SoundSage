'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { ErrorFallback } from '../error';

export default function HistoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { tab: 'history' } });
  }, [error]);
  return <ErrorFallback error={error} reset={reset} kanji="歴" caption="The chronicle is briefly out of reach" />;
}
