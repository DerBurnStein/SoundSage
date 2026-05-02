import { SyncCard } from '../components/SyncCard';
import { NorenBanner } from '../components/motif/NorenBanner';

export default function OverviewPage() {
  return <>
    <NorenBanner kanji="聴" title="Overview" subtitle="Listening almanac" />
    <SyncCard />
  </>;
}
