// SoundSage — Privacy Policy
// Editorial static page. Spotify Extended Quota requires a public privacy
// policy describing what user data is collected, stored, and how it can
// be deleted; this is that page. Keep the language plain and accurate —
// every claim here must reflect what the app actually does.

import { LegalPage, Section } from '@/components/LegalPage';

export const metadata = {
  title: 'Privacy Policy — SoundSage',
};

const LAST_UPDATED = '2026-05-03';

export default function PrivacyPage() {
  return (
    <LegalPage
      kicker="Privacy"
      title="Privacy Policy"
      tagline="What we collect, why, and how to make us forget."
      lastUpdated={LAST_UPDATED}
    >
      <Section heading="Who this applies to">
        <p>
          SoundSage is a personal listening dashboard. This policy covers
          everyone who signs in. If you have not signed in, we do not have
          any data about you.
        </p>
      </Section>

      <Section heading="What we collect">
        <p>When you sign in with Google, we receive and store:</p>
        <ul>
          <li>your Google account ID, name, email address, and avatar URL,</li>
          <li>a session cookie used to keep you signed in.</li>
        </ul>
        <p>When you connect Spotify, we additionally receive and store:</p>
        <ul>
          <li>your Spotify user ID and display name,</li>
          <li>your Spotify access and refresh tokens (encrypted at rest),</li>
          <li>
            every track play we read from Spotify&apos;s
            <em> recently played</em> and <em>currently playing</em> APIs —
            track ID, played-at timestamp, and minimal track metadata
            (name, artist, album, duration).
          </li>
        </ul>
        <p>
          We do not collect your password, your contacts, your location,
          or anything you have not explicitly granted via Google or
          Spotify&apos;s OAuth consent screens.
        </p>
      </Section>

      <Section heading="Why we collect it">
        <p>
          The dashboard you see — top tracks, top artists, listening
          patterns by hour and week, mood clusters, the recently-played
          stream — is computed entirely from the Spotify play history we
          ingest for you. None of it is sent to advertisers, brokers, or
          third-party analytics. We do not build profiles for resale and
          we do not run experiments on you.
        </p>
      </Section>

      <Section heading="Where it lives">
        <p>
          Your data is stored in a managed PostgreSQL database and a
          managed Redis cache, both hosted in the United States. Backups
          are taken daily and retained for thirty days.
        </p>
        <p>
          Spotify access tokens are encrypted with AES-256-GCM before
          they are written to the database. The encryption key lives in a
          separate Secret Manager vault — a database-only compromise does
          not yield decryptable tokens.
        </p>
      </Section>

      <Section heading="Who we share it with">
        <p>
          We do not sell, rent, or share your data with third parties for
          their marketing or analytics. The only places your data leaves
          our servers are:
        </p>
        <ul>
          <li>
            <strong>Spotify</strong> — to authorise your account and read
            your play history. Spotify&apos;s privacy policy applies to
            anything that crosses that boundary.
          </li>
          <li>
            <strong>Google</strong> — to authenticate your sign-in. Same
            applies.
          </li>
          <li>
            <strong>Sentry</strong> — when the app crashes, an error
            report is sent. Reports include the error message, a stack
            trace, and your user ID. They do not include your tokens or
            your play history.
          </li>
        </ul>
      </Section>

      <Section heading="How long we keep it">
        <p>
          As long as your account exists, your play history accumulates.
          Sessions expire after thirty days of inactivity. When you
          delete your account (Settings → Delete account, type{' '}
          <em>DELETE</em> to confirm), every row tied to your user is
          cascade-deleted from the live database within seconds. Backups
          age out within thirty days.
        </p>
      </Section>

      <Section heading="Your controls">
        <ul>
          <li>
            <strong>Disconnect Spotify</strong> — Settings → Disconnect
            Spotify. Stops further sync, deletes the access tokens, but
            keeps the play history we already have so you can still see
            past charts.
          </li>
          <li>
            <strong>Delete account</strong> — Settings → Delete account.
            Cascade-deletes everything: Google identity, Spotify tokens,
            every recorded play, every session. There is no undo.
          </li>
          <li>
            <strong>Export</strong> — coming soon. In the meantime, email
            the address below for a one-off data export.
          </li>
        </ul>
      </Section>

      <Section heading="Cookies">
        <p>
          We set one cookie: an HTTP-only, SameSite=Lax session cookie
          for keeping you signed in. We do not set advertising or
          analytics cookies.
        </p>
      </Section>

      <Section heading="Children">
        <p>
          SoundSage is not directed at children under 13 and we do not
          knowingly collect data from them. Spotify and Google handle
          their own minimum-age gates upstream.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If we change this policy materially, the date at the top of
          this page will move and we will surface the change in-app
          before the next time you sign in.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions, deletion requests, or data exports:{' '}
          <a
            href="mailto:privacy@soundsage.app"
            style={{ color: 'var(--seal)', textDecoration: 'underline' }}
          >
            privacy@soundsage.app
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
