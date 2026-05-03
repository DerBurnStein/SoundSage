// Renders the persistent history-tab chrome (MotifRail + NorenBanner) outside
// of the page's Suspense boundary, so the banner never flashes a placeholder.
// Children (page.tsx or loading.tsx) render below.

import { MotifRail } from '@/components/motif/MotifRail';
import { NorenBanner } from '@/components/motif/NorenBanner';

export default function HistoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MotifRail tab="history" />
      <NorenBanner kanji="歴" title="Listening History" subtitle="Section · history" />
      {children}
    </>
  );
}
