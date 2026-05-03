// SoundSage — LegalPage / Section
// Editorial layout for /privacy and /terms. Static, server-rendered, no
// data fetching. Centred 720px column on a paper background, serif body
// copy, mono date stamp at the top, sumi-style numbered sections.

import { Caps, Mono } from './primitives';

interface LegalPageProps {
  kicker:      string;
  title:       string;
  tagline:     string;
  lastUpdated: string;          // ISO yyyy-mm-dd
  children:    React.ReactNode;
}

export function LegalPage({
  kicker,
  title,
  tagline,
  lastUpdated,
  children,
}: LegalPageProps) {
  return (
    <article
      style={{
        padding: '64px 28px 96px',
        maxWidth: 760,
        margin: '0 auto',
        color: 'var(--ink)',
      }}
    >
      <header style={{ marginBottom: 40 }}>
        <Caps>{kicker}</Caps>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontWeight: 400,
            fontSize: 44,
            marginTop: 12,
            letterSpacing: '-0.015em',
            lineHeight: 1.1,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-mincho)',
            fontStyle: 'italic',
            fontSize: 18,
            color: 'var(--muted)',
            marginTop: 12,
          }}
        >
          {tagline}
        </p>
        <Mono
          style={{
            fontSize: 10,
            color: 'var(--dim)',
            letterSpacing: '0.1em',
            display: 'block',
            marginTop: 18,
          }}
        >
          Last updated · {lastUpdated}
        </Mono>
      </header>
      {children}
    </article>
  );
}

interface SectionProps {
  heading:  string;
  children: React.ReactNode;
}

export function Section({ heading, children }: SectionProps) {
  return (
    <section
      style={{
        marginBottom: 36,
        paddingBottom: 24,
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 500,
          fontSize: 22,
          letterSpacing: '-0.005em',
          marginBottom: 16,
          color: 'var(--ink)',
        }}
      >
        {heading}
      </h2>
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 400,
          fontSize: 15,
          lineHeight: 1.7,
          color: 'var(--ink-2)',
        }}
      >
        <SectionBody>{children}</SectionBody>
      </div>
    </section>
  );
}

function SectionBody({ children }: { children: React.ReactNode }) {
  return (
    <div
      // Hand-rolled spacing for paragraph / ul rhythm. CSS `:where` would be
      // cleaner but we'd need a stylesheet; inline keeps it self-contained.
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}
