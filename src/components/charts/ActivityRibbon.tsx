'use client';
import type { ActivityBucket } from '../../types';

export function ActivityRibbon({ data }: { data: ActivityBucket[] }) {
  const max = Math.max(...data.map((d) => d.plays), 1);
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length},1fr)`, gap: 4, alignItems: 'end', height: 120 }}>
    {data.map((d) => <div key={d.t} title={`${d.t}: ${d.plays}`} style={{ background: 'var(--ink)', height: `${(d.plays / max) * 100}%` }} />)}
  </div>;
}
