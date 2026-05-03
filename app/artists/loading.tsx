import { TabIndexSkeleton, RankListSkeleton } from '@/components/skeletons/TabSkeletons';

export default function ArtistsLoading() {
  return (
    <>
      <TabIndexSkeleton />
      <RankListSkeleton rows={6} />
    </>
  );
}
