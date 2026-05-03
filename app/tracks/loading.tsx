import { TabIndexSkeleton, RankListSkeleton } from '@/components/skeletons/TabSkeletons';

export default function TracksLoading() {
  return (
    <>
      <TabIndexSkeleton />
      <RankListSkeleton rows={8} />
    </>
  );
}
