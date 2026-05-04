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

        <div
          className="tab-index-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            border: '1px solid var(--rule)',
          }}
        >
          {items.map((item, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            return (
              <TabCard
                key={i}
                item={item}
                borderLeft={col === 1}
                borderTop={row === 1}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TabCard({
  item,
  borderLeft,
  borderTop,
}: {
  item: TabIndexItem;
  borderLeft: boolean;
  borderTop: boolean;
}) {
  return (
    <Link
      href={item.href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        borderLeft: borderLeft ? '1px solid var(--rule)' : 'none',
        borderTop: borderTop ? '1px solid var(--rule)' : 'none',
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
