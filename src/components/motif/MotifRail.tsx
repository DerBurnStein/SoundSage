import type { TabId } from '../../types';
export function MotifRail({ tab }: { tab: TabId }) {
  return <div style={{ borderTop: '1px dashed var(--rule)', paddingTop: 8, fontFamily: 'var(--font-mono)', fontSize: 10 }}>motif: {tab}</div>;
}
