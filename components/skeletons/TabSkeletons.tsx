// SoundSage — shared skeleton fragments for tab loading states.
// These mirror the actual rendered structure pixel-for-pixel so the page
// doesn't reflow when content arrives.

export function TabIndexSkeleton() {
  return (
    <section
      style={{
        padding: '24px 28px 28px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Italic subtitle line — height matches mincho 18/1.4 */}
        <div
          style={{
            height: 22,
            width: 320,
            background: 'var(--paper-2)',
            marginBottom: 18,
          }}
        />
        {/* 2x2 grid of cards — same border + cell heights as TabIndex */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            border: '1px solid var(--rule)',
          }}
        >
          {[0, 1, 2, 3].map((i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            return (
              <div
                key={i}
                style={{
                  padding: '14px 18px',
                  borderLeft: col === 1 ? '1px solid var(--rule)' : 'none',
                  borderTop: row === 1 ? '1px solid var(--rule)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  height: 50,
                }}
              >
                <div style={{ width: 18, height: 18, background: 'var(--paper-2)', flexShrink: 0 }} />
                <div style={{ flex: 1, height: 18, background: 'var(--paper-2)' }} />
                <div style={{ width: 18, height: 18, background: 'var(--paper-2)', flexShrink: 0 }} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div
      style={{
        padding: '24px 28px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div style={{ maxWidth: 1380, margin: '0 auto' }}>
        <div
          style={{
            height: 14,
            width: 180,
            background: 'var(--paper-2)',
            marginBottom: 8,
          }}
        />
        <div
          style={{
            height: 28,
            width: 320,
            background: 'var(--paper-2)',
            marginBottom: 18,
          }}
        />
        <div style={{ height, background: 'var(--paper-2)' }} />
      </div>
    </div>
  );
}

export function RankListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      style={{
        padding: '24px 28px',
        borderBottom: '1px solid var(--rule)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ height: 12, width: 180, background: 'var(--paper-2)', marginBottom: 8 }} />
          <div style={{ height: 26, width: 240, background: 'var(--paper-2)' }} />
        </div>
        <div style={{ height: 14, width: 100, background: 'var(--paper-2)' }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr 80px',
            gap: 16,
            padding: '14px 0',
            borderBottom: '1px solid var(--rule)',
            alignItems: 'center',
          }}
        >
          <div style={{ height: 28, width: 28, background: 'var(--paper-2)' }} />
          <div>
            <div style={{ height: 18, width: '40%', background: 'var(--paper-2)', marginBottom: 6 }} />
            <div style={{ height: 12, width: '28%', background: 'var(--paper-2)', marginBottom: 8 }} />
            <div style={{ height: 2, background: 'var(--paper-3)' }} />
          </div>
          <div style={{ height: 22, width: 60, background: 'var(--paper-2)', justifySelf: 'end' }} />
        </div>
      ))}
    </div>
  );
}
