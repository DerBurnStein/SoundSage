// SoundSage — NorenBanner
// Fabric noren (shop curtain) header for each non-overview tab.
// Pure presentational — no data fetching.

interface NorenBannerProps {
  kanji:    string;   // e.g. '歴'
  title:    string;   // e.g. 'Listening History'
  subtitle: string;   // e.g. 'Section · history'
}

export function NorenBanner({ kanji, title, subtitle }: NorenBannerProps) {
  return (
    <div style={{
      position: 'relative', width: '100%',
      background: 'var(--seal)', color: 'var(--paper)',
      borderTop: '4px solid var(--ink)', borderBottom: '4px solid var(--ink)',
      padding: '28px 28px 32px', overflow: 'hidden',
    }}>
      {/* Vertical centre slit */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, background: 'var(--ink)', opacity: 0.2 }} />
      {/* Stitch pattern */}
      <div style={{
        position: 'absolute', top: 4, left: 0, right: 0, height: 1,
        backgroundImage: 'repeating-linear-gradient(90deg, var(--paper) 0 8px, transparent 8px 16px)',
        opacity: 0.5,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{
            width: 56, height: 56, border: '2px solid var(--paper)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-mincho)', fontSize: 30, fontWeight: 700,
          }}>{kanji}</div>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', opacity: 0.75 }}>
              {subtitle}
            </div>
            <div style={{ fontFamily: 'var(--font-mincho)', fontSize: 36, fontWeight: 600, letterSpacing: '-0.01em', marginTop: 4 }}>
              {title}
            </div>
          </div>
        </div>

        {/* Mon (family crest) */}
        <svg width="64" height="64" viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
          <circle cx="32" cy="32" r="30" fill="none" stroke="var(--paper)" strokeWidth="1.5" />
          <circle cx="32" cy="32" r="22" fill="none" stroke="var(--paper)" strokeWidth="1" opacity="0.6" />
          {Array.from({ length: 8 }).map((_, i) => (
            <ellipse key={i} cx="32" cy="14" rx="4" ry="9"
              fill="var(--paper)" opacity="0.85"
              transform={`rotate(${i * 45} 32 32)`} />
          ))}
          <circle cx="32" cy="32" r="4" fill="var(--paper)" />
        </svg>
      </div>
    </div>
  );
}
