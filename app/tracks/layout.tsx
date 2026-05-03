import { MotifRail } from '@/components/motif/MotifRail';
import { NorenBanner } from '@/components/motif/NorenBanner';

export default function TracksLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MotifRail tab="tracks" />
      <NorenBanner kanji="曲" title="Tracks" subtitle="Section · tracks" />
      {children}
    </>
  );
}
