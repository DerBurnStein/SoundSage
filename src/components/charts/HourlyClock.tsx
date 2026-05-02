import type { HourlyBucket } from '../../types';

export function HourlyClock({ data }: { data: HourlyBucket[] }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6 }}>
    {data.map((d) => <div key={d.hour} style={{ padding: 6, border: '1px solid var(--rule)' }}>{d.hour}:00 · {d.plays}</div>)}
  </div>;
}
