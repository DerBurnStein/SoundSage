// SoundSage — Root loading state
// Rendered instantly when navigating to any route while the server fetches
// data. Next.js wraps each route in a Suspense boundary using this file as
// the fallback, so the user sees acknowledgement of their click in <50ms
// even if the actual page takes a few hundred ms to render.

export default function Loading() {
  return (
    <>
      {/* Motif rail placeholder — same 96px height as the real bands so the
          layout doesn't jump when content arrives. */}
      <div
        style={{
          height: 96,
          background: 'var(--paper-2)',
          borderTop: '1px solid var(--rule)',
          borderBottom: '1px solid var(--rule)',
        }}
      />

      {/* Hero/Lede skeleton — matches the dimensions of the Overview page's
          opening block, the most common destination. Other pages get a
          slightly oversized skeleton briefly; cheap visual cost, big win on
          perceived speed. */}
      <section
        style={{
          padding: '40px 28px 48px',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <Bar w={100} h={14} mb={18} />
        <Bar w={320} h={96} mb={18} />
        <Bar w={480} h={18} />
      </section>

      {/* StatStrip skeleton */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              padding: '24px 24px 26px',
              borderRight: i < 3 ? '1px solid var(--rule)' : 'none',
            }}
          >
            <Bar w={80} h={12} mb={12} />
            <Bar w={120} h={38} mb={10} />
            <Bar w={60} h={10} />
          </div>
        ))}
      </section>

      {/* Wide chart skeleton (covers ActivityRibbon / WeeklySpark / etc) */}
      <div
        style={{
          padding: '24px 28px',
          borderBottom: '1px solid var(--rule)',
        }}
      >
        <Bar w={180} h={20} mb={18} />
        <Bar w="100%" h={180} />
      </div>
    </>
  );
}

function Bar({
  w,
  h,
  mb = 0,
}: {
  w: number | string;
  h: number;
  mb?: number;
}) {
  return (
    <div
      style={{
        width: typeof w === 'number' ? `${w}px` : w,
        height: h,
        background: 'var(--paper-2)',
        marginBottom: mb,
      }}
    />
  );
}
