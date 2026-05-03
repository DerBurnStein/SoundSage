// SoundSage — Terms of Service
// Editorial static page. Pairs with /privacy for the Spotify Extended
// Quota requirements and standard responsible-launch checklist.

import { LegalPage, Section } from '@/components/LegalPage';

export const metadata = {
  title: 'Terms of Service — SoundSage',
};

const LAST_UPDATED = '2026-05-03';

export default function TermsPage() {
  return (
    <LegalPage
      kicker="Terms"
      title="Terms of Service"
      tagline="The shape of the agreement."
      lastUpdated={LAST_UPDATED}
    >
      <Section heading="Acceptance">
        <p>
          By signing in to SoundSage you agree to these terms. If you do
          not agree, do not sign in. The Privacy Policy is part of this
          agreement.
        </p>
      </Section>

      <Section heading="The service">
        <p>
          SoundSage is a personal dashboard that visualises your Spotify
          listening history. It reads your play history through the
          Spotify Web API under the OAuth scope you grant. It does not
          play music, modify your library, or write to your Spotify
          account.
        </p>
      </Section>

      <Section heading="Your account">
        <p>
          You are responsible for the security of the Google and Spotify
          accounts you use to sign in. Don&apos;t share them. If you
          believe an unauthorised party has accessed your SoundSage data,
          email{' '}
          <a
            href="mailto:security@soundsage.app"
            style={{ color: 'var(--seal)', textDecoration: 'underline' }}
          >
            security@soundsage.app
          </a>{' '}
          and revoke the relevant OAuth grants from Google and Spotify.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>access or attempt to access another user&apos;s account or data,</li>
          <li>scrape the dashboard at scale, attempt to overwhelm the API, or circumvent rate limits,</li>
          <li>use the service for commercial resale of listening data,</li>
          <li>reverse-engineer the service to extract Spotify data on others&apos; behalf.</li>
        </ul>
        <p>
          We reserve the right to suspend accounts that violate this
          section or that put the service&apos;s integrity at risk.
        </p>
      </Section>

      <Section heading="Spotify and Google">
        <p>
          Your use of SoundSage involves third-party services that have
          their own terms:
        </p>
        <ul>
          <li>
            <a
              href="https://www.spotify.com/legal/end-user-agreement/"
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: 'var(--seal)', textDecoration: 'underline' }}
            >
              Spotify End User Agreement
            </a>
          </li>
          <li>
            <a
              href="https://policies.google.com/terms"
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: 'var(--seal)', textDecoration: 'underline' }}
            >
              Google Terms of Service
            </a>
          </li>
        </ul>
        <p>
          Anything they restrict, we restrict too. SoundSage is not
          endorsed by, sponsored by, or affiliated with Spotify or
          Google.
        </p>
      </Section>

      <Section heading="No warranty">
        <p>
          SoundSage is provided &quot;as is.&quot; The dashboard depends
          on Spotify&apos;s APIs, which can rate-limit, change, or go
          down without notice. We make no guarantees of uptime,
          completeness of history, or accuracy of derived statistics. If
          a chart looks wrong, it probably is — please tell us.
        </p>
      </Section>

      <Section heading="Limitation of liability">
        <p>
          To the maximum extent permitted by applicable law, SoundSage
          and its operators are not liable for indirect, incidental, or
          consequential damages arising from your use of the service.
          Our aggregate liability for any claim arising from these terms
          is limited to the amount you have paid us in the previous
          twelve months — which, since SoundSage is currently free, is
          zero.
        </p>
      </Section>

      <Section heading="Termination">
        <p>
          You may delete your account at any time from Settings → Delete
          account. We may suspend or terminate accounts for violations
          of the acceptable-use section above, or if continued operation
          would put the service at risk.
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If we change these terms materially, the date at the top of
          this page will move and we will surface the change in-app
          before the next time you sign in.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions:{' '}
          <a
            href="mailto:hello@soundsage.app"
            style={{ color: 'var(--seal)', textDecoration: 'underline' }}
          >
            hello@soundsage.app
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
