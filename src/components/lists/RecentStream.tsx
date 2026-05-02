import type { RecentEvent } from '../../types';

export function RecentStream({ events }: { events: RecentEvent[] }) {
  return <ul>{events.map((e) => <li key={e.id}>{new Date(e.playedAt).toLocaleString()} — {e.track.name}</li>)}</ul>;
}
