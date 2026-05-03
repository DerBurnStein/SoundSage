import { MotifRail } from '@/components/motif/MotifRail';
import { NorenBanner } from '@/components/motif/NorenBanner';

export default function PatternsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MotifRail tab="patterns" />
      <NorenBanner kanji="型" title="Patterns & Habits" subtitle="Section · patterns" />
      {children}
    </>
  );
}
