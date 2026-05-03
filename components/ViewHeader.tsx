// SoundSage — ViewHeader
// Header for tab destination pages. Shows a back-link to the tab index plus
// kicker + title for the current view. Pure presentational.

import Link from 'next/link';
import { Caps } from './primitives';

interface ViewHeaderProps {
  /** Tab index path to return to, e.g. "/history" */
  backHref: string;
  /** Short caption — e.g. "View · Today" */
  kicker:   string;
  /** Editorial title — e.g. "Today" */
  title:    string;
  /** Optional italic subtitle line */
  subtitle?: string;
}

export function ViewHeader({ backHref, kicker, title, subtitle }: ViewHeaderProps) {
  return (
    <section
      style={{
        padding: '24px 28px 22px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Link
          href={backHref}
          style={{
            display: 'inline-block',
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            color: 'var(--muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            marginBottom: 14,
          }}
        >
          ← Back to index
        </Link>
        <Caps>{kicker}</Caps>
        <h2
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 500,
            fontSize: 36,
            marginTop: 8,
            letterSpacing: '-0.015em',
            color: 'var(--ink)',
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            style={{
              fontFamily: 'var(--font-mincho)',
              fontStyle: 'italic',
              fontSize: 17,
              color: 'var(--muted)',
              marginTop: 8,
              lineHeight: 1.4,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
