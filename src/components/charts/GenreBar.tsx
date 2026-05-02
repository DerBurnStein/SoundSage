import type { GenreStat } from '../../types';

export function GenreBar({ data }: { data: GenreStat[] }) {
  return <div>
    {data.map((g) => <div key={g.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 80 }}>{g.name}</span><div style={{ height: 8, background: 'var(--ink)', width: `${Math.round(g.share * 100)}%` }} /></div>)}
  </div>;
}
