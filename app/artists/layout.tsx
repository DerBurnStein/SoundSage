import { MotifRail } from '@/components/motif/MotifRail';
import { NorenBanner } from '@/components/motif/NorenBanner';

export default function ArtistsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MotifRail tab="artists" />
      <NorenBanner kanji="師" title="Artists" subtitle="Section · artists" />
      {children}
    </>
  );
}
