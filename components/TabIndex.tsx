// SoundSage — TabIndex
// 2×2 landing grid used by every non-Overview tab. Compact single-row cards:
// kanji numeral, label · hint, → arrow. Sits below an italic mincho subtitle.

import Link from 'next/link';

export interface TabIndexItem {
  /** Kanji numeral marker — 一, 二, 三, 四 */
  kanji: string;
  /** Primary label, set in serif */
  label: string;
  /** Optional secondary hint, appended after a · separator */
  hint?: string;
  /** Destination route */
  href: string;
}

interface TabIndexProps {
  /** Editorial caption above the grid (italic mincho) */
  subtitle: string;
  /** Exactly four cards — order matches reading order (top-left → bottom-right) */
  items: [TabIndexItem, TabIndexItem, TabIndexItem, TabIndexItem];
}

export function TabIndex({ subtitle, items }: TabIndexProps) {
  return (
    <section
      style={{
        padding: '24px 28px 28px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <p
          style={{
            fontFamily: 'var(--font-mincho)',
            fontStyle: 'italic',
            fontSize: 18,
            color: 'var(--muted)',
            marginBottom: 18,
            lineHeight: 1.4,
            letterSpacing: '-0.005em',
          }}
        >
          {subtitle}
        </p>

        {/* Grid borders are drawn entirely by CSS in globals.css using
            :nth-child selectors on the grid items. That way the 2-up
            desktop layout shows internal vertical + horizontal dividers,
            and the 1-up mobile layout (collapsed via media query) shows
            only horizontal dividers — no stray left borders left over
            from card 1/3 having a desktop-only left rule. */}
        <div
          className="tab-index-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            border: '1px solid var(--rule)',
          }}
        >
          {items.map((item, i) => (
            <TabCard key={i} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TabCard({ item }: { item: TabIndexItem }) {
  return (
    <Link
      href={item.href}
      className="tab-index-card"
      // minWidth: 0 lets the grid cell shrink below the label's
      // intrinsic min-content width — without it the long Patterns
      // labels ("Mood clusters from audio features") force the grid
      // wider than the viewport on mobile and the label's ellipsis
      // never engages.
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        minWidth: 0,
        color: 'var(--ink)',
        textDecoration: 'none',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-mincho)',
          fontSize: 18,
          fontWeight: 500,
          color: 'var(--seal)',
          flexShrink: 0,
          width: 18,
          textAlign: 'center',
        }}
      >
        {item.kanji}
      </span>

      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: 'var(--font-serif)',
          fontSize: 18,
          fontWeight: 400,
          letterSpacing: '-0.005em',
          color: 'var(--ink)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {item.label}
        {item.hint && (
          <span style={{ color: 'var(--muted)' }}>
            {' · '}
            {item.hint}
          </span>
        )}
      </span>

      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 18,
          color: 'var(--seal)',
          flexShrink: 0,
        }}
      >
        →
      </span>
    </Link>
  );
}
