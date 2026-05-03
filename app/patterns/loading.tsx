import { TabIndexSkeleton, ChartSkeleton } from '@/components/skeletons/TabSkeletons';

export default function PatternsLoading() {
  return (
    <>
      <TabIndexSkeleton />
      <ChartSkeleton height={280} />
      <ChartSkeleton height={140} />
      <ChartSkeleton height={280} />
      <ChartSkeleton height={280} />
    </>
  );
}
