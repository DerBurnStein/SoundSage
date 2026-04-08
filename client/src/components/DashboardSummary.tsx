import React from 'react';

type Summary = {
  totals: {
    plays: number;
    distinctTracks: number;
    distinctArtists: number;
  };
  busiestHourUtc: number | null;
  busiestWeekdayUtc: number | null;
  averageSessionLengthMinutes: number;
  topTracks: Array<{ trackName: string; plays: number }>;
  topArtists: Array<{ artistName: string; plays: number }>;
};

type Props = {
  summary: Summary;
};

const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function DashboardSummary({ summary }: Props) {
  return (
    <section>
      <h3>Listening Summary</h3>
      <ul>
        <li>Total plays: {summary.totals.plays}</li>
        <li>Distinct tracks: {summary.totals.distinctTracks}</li>
        <li>Distinct artists: {summary.totals.distinctArtists}</li>
        <li>Busiest hour (UTC): {summary.busiestHourUtc ?? 'N/A'}</li>
        <li>
          Busiest weekday (UTC):{' '}
          {summary.busiestWeekdayUtc !== null ? weekdayLabels[summary.busiestWeekdayUtc] : 'N/A'}
        </li>
        <li>Avg session length: {summary.averageSessionLengthMinutes.toFixed(1)} minutes</li>
      </ul>

      <h4>Top Tracks</h4>
      <ol>
        {summary.topTracks.map((track) => (
          <li key={track.trackName}>
            {track.trackName} ({track.plays} plays)
          </li>
        ))}
      </ol>

      <h4>Top Artists</h4>
      <ol>
        {summary.topArtists.map((artist) => (
          <li key={artist.artistName}>
            {artist.artistName} ({artist.plays} plays)
          </li>
        ))}
      </ol>
    </section>
  );
}
