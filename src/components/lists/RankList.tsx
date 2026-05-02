import type { TopTrack, TopArtist } from '../../types';

export function TrackRankList({ items }: { items: TopTrack[] }) {
  return <ol>{items.map((t) => <li key={t.id}>{t.name} — {t.plays}</li>)}</ol>;
}

export function ArtistRankList({ items }: { items: TopArtist[] }) {
  return <ol>{items.map((a) => <li key={a.id}>{a.name} — {a.plays}</li>)}</ol>;
}
