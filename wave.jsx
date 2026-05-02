// East Asian decorative elements — no waves. Per-tab motif rail + noren banner.

function MotifRail({ mood = 'overview' }) {
  // A horizontal decorative band with mood-specific motifs.
  // overview: cloud bands (kumo) + enso circle
  // history:  bamboo grove silhouette
  // patterns: sakura sprigs
  // tracks:   torii arches in repetition
  // artists:  gold-leaf seigaiha (overlapping arcs)

  const palette = {
    overview: { bg: 'var(--paper-2)', ink: 'var(--ink)', accent: 'var(--seal)' },
    history: { bg: 'var(--paper-2)', ink: 'var(--ink)', accent: 'var(--seal)' },
    patterns: { bg: 'var(--paper-2)', ink: 'var(--ink)', accent: 'var(--seal)' },
    tracks: { bg: 'var(--paper-2)', ink: 'var(--ink)', accent: 'var(--seal)' },
    artists: { bg: 'var(--paper-2)', ink: 'var(--ink)', accent: 'var(--seal)' }
  };
  const c = palette[mood] || palette.overview;

  return (
    <div style={{
      position: 'relative', width: '100%', height: 96,
      background: c.bg,
      borderTop: '1px solid var(--rule)',
      borderBottom: '1px solid var(--rule)',
      overflow: 'hidden'
    }}>
      <svg viewBox="0 0 1200 96" preserveAspectRatio="xMidYMid slice"
      width="100%" height="100%" style={{ display: 'block' }}>

        {mood === 'overview' && <CloudBands ink={c.ink} accent={c.accent} />}
        {mood === 'history' && <BambooGrove ink={c.ink} accent={c.accent} />}
        {mood === 'patterns' && <SakuraSprigs ink={c.ink} accent={c.accent} />}
        {mood === 'tracks' && <ToriiRow ink={c.ink} accent={c.accent} />}
        {mood === 'artists' && <Seigaiha ink={c.ink} accent={c.accent} />}
      </svg>

      {/* corner kanji label */}
      <div style={{
        position: 'absolute', left: 18, bottom: 8,
        fontFamily: 'Shippori Mincho, "Noto Serif JP", serif',
        fontSize: 10, letterSpacing: '0.4em', textTransform: 'uppercase',
        color: 'var(--muted)',
        background: 'var(--paper-2)',
        padding: '2px 6px'
      }}>
        {{
          overview: '雲 · clouds',
          history: '竹 · bamboo',
          patterns: '桜 · sakura',
          tracks: '鳥居 · torii',
          artists: '青海波 · seigaiha'
        }[mood] || ''}
      </div>
    </div>);

}

// ───────── motif components ─────────

function CloudBands({ ink, accent }) {
  // Stylized kumo: horizontal scroll-like cloud shapes
  return (
    <g>
      {/* enso circle on the left — single brushed ring */}
      <g transform="translate(80, 48)">
        <circle cx="0" cy="0" r="32"
        fill="none" stroke={accent} strokeWidth="3"
        strokeDasharray="155 30"
        strokeLinecap="round" transform="rotate(-30)" style={{ stroke: "rgb(193, 39, 45)" }} />
      </g>

      {/* cloud band 1 */}
      <g transform="translate(220, 26)" fill={ink} opacity="0.85">
        <path d="
          M 0 30 Q 0 14, 18 14 Q 28 4, 50 8 Q 70 0, 90 10
          Q 120 4, 130 18 Q 150 14, 154 30
          Q 154 46, 130 44 Q 110 50, 90 44
          Q 70 50, 50 44 Q 28 50, 18 42 Q 0 44, 0 30 Z
        " />




        




        




        




        
        {/* internal ridges */}
        <path d="M 14 30 q 18 -8 36 0 t 36 0 t 36 0 t 32 0"
        fill="none" stroke="var(--paper)" strokeWidth="1.5" opacity="0.6" />
      </g>

      {/* cloud band 2 */}
      <g transform="translate(440, 50)" fill={ink} opacity="0.7">
        <path d="
          M 0 24 Q 0 10, 16 10 Q 24 2, 44 6 Q 62 0, 78 8
          Q 100 4, 110 16 Q 130 14, 132 26
          Q 132 38, 110 38 Q 92 42, 78 36
          Q 60 42, 44 36 Q 24 42, 16 34 Q 0 36, 0 24 Z
        " />




        




        




        




        
        <path d="M 12 24 q 16 -6 32 0 t 32 0 t 32 0 t 24 0"
        fill="none" stroke="var(--paper)" strokeWidth="1.2" opacity="0.55" />
      </g>

      {/* cloud band 3 */}
      <g transform="translate(680, 30)" fill={ink} opacity="0.85">
        <path d="
          M 0 28 Q 0 12, 18 12 Q 28 4, 50 8 Q 70 0, 90 10
          Q 120 4, 130 18 Q 152 14, 156 30
          Q 156 46, 130 44 Q 110 50, 90 44
          Q 70 50, 50 44 Q 28 50, 18 42 Q 0 44, 0 28 Z
        " />




        




        




        




        
        <path d="M 14 28 q 18 -8 36 0 t 36 0 t 36 0 t 32 0"
        fill="none" stroke="var(--paper)" strokeWidth="1.5" opacity="0.6" />
      </g>

      {/* small accent dot — moon */}
      <circle cx="940" cy="36" r="14" fill={accent} opacity="0.85" />
      <circle cx="940" cy="36" r="14" fill="none" stroke={ink} strokeWidth="1" opacity="0.4" />

      {/* tiny floating cloud near moon */}
      <g transform="translate(990, 50)" fill={ink} opacity="0.5">
        <path d="M 0 8 Q 0 0, 10 0 Q 20 -4, 30 4 Q 40 0, 44 8 Q 44 16, 30 16 Q 20 20, 10 14 Q 0 16, 0 8 Z" />
      </g>

      {/* far right — vertical seal column */}
      <g transform="translate(1080, 14)">
        <rect x="0" y="0" width="22" height="64" fill="none" stroke={accent} strokeWidth="1.5" />
        <text x="11" y="22" textAnchor="middle" fontFamily="Shippori Mincho" fontSize="14" fill={accent}>音</text>
        <text x="11" y="40" textAnchor="middle" fontFamily="Shippori Mincho" fontSize="14" fill={accent}>盤</text>
        <text x="11" y="58" textAnchor="middle" fontFamily="Shippori Mincho" fontSize="14" fill={accent}>録</text>
      </g>
    </g>);

}

function BambooGrove({ ink, accent }) {
  // Vertical bamboo stalks with leaves
  const stalks = [60, 130, 230, 310, 410, 530, 640, 760, 860, 1000, 1110];
  return (
    <g>
      {stalks.map((x, i) => {
        const segH = 14 + i % 3 * 4;
        return (
          <g key={i} transform={`translate(${x}, 0)`}>
            {/* main stalk */}
            <rect x="-3" y="0" width="6" height="96" fill={ink} opacity={0.55 + i % 3 * 0.1} />
            {/* node bands */}
            {[14, 32, 52, 74].map((y, j) =>
            <rect key={j} x="-5" y={y} width="10" height="2" fill={ink} opacity="0.85" />
            )}
            {/* leaves */}
            {i % 2 === 0 &&
            <g fill={ink} opacity="0.7">
                <path d={`M 4 ${20 + i % 3 * 4} q 18 -6 26 -18 q -4 14 -22 22 z`} />
                <path d={`M -4 ${42 + i % 3 * 4} q -18 -6 -26 -18 q 4 14 22 22 z`} />
              </g>
            }
          </g>);

      })}
      {/* accent — seal at top-left */}
      <rect x="14" y="14" width="30" height="30" fill={accent} />
      <text x="29" y="36" textAnchor="middle" fontFamily="Shippori Mincho"
      fontSize="20" fontWeight="700" fill="var(--paper)">歴</text>
    </g>);

}

function SakuraSprigs({ ink, accent }) {
  // Cherry blossoms scattered along the band
  const blossoms = [
  { x: 80, y: 30, r: 10 },
  { x: 110, y: 60, r: 8 },
  { x: 220, y: 24, r: 12 },
  { x: 260, y: 56, r: 9 },
  { x: 380, y: 32, r: 11 },
  { x: 420, y: 64, r: 7 },
  { x: 540, y: 28, r: 13 },
  { x: 580, y: 60, r: 9 },
  { x: 700, y: 36, r: 10 },
  { x: 740, y: 64, r: 8 },
  { x: 860, y: 28, r: 12 },
  { x: 900, y: 58, r: 9 },
  { x: 1010, y: 34, r: 11 },
  { x: 1050, y: 62, r: 8 }];


  function petal(angle) {
    const rad = angle * Math.PI / 180;
    return `M 0 0 L ${Math.cos(rad) * 1} ${Math.sin(rad) * 1}`; // unused; we draw via group rotation below
  }

  return (
    <g>
      {/* twiggy branch line */}
      <path d="M 0 76 q 200 -40 400 -8 t 400 0 t 400 -10"
      fill="none" stroke={ink} strokeWidth="1.5" opacity="0.6" />

      {blossoms.map((b, i) =>
      <g key={i} transform={`translate(${b.x}, ${b.y})`}>
          {/* 5-petal blossom */}
          {[0, 72, 144, 216, 288].map((a) =>
        <ellipse key={a}
        cx={Math.cos((a - 90) * Math.PI / 180) * b.r * 0.5}
        cy={Math.sin((a - 90) * Math.PI / 180) * b.r * 0.5}
        rx={b.r * 0.5} ry={b.r * 0.7}
        fill={accent}
        opacity={0.75 + i % 2 * 0.2}
        transform={`rotate(${a} 0 0)`} />
        )}
          {/* center dot */}
          <circle cx="0" cy="0" r={b.r * 0.18} fill={ink} opacity="0.7" />
        </g>
      )}

      {/* falling petals */}
      {[[160, 12], [340, 50], [490, 18], [640, 46], [820, 16], [970, 48]].map(([x, y], i) =>
      <ellipse key={i} cx={x} cy={y} rx="3" ry="5" fill={accent} opacity="0.6"
      transform={`rotate(${i * 23} ${x} ${y})`} />
      )}
    </g>);

}

function ToriiRow({ ink, accent }) {
  // Repeating torii gate silhouettes receding into the distance
  const torii = [
  { x: 80, s: 1.0, o: 1.0 },
  { x: 280, s: 0.85, o: 0.85 },
  { x: 460, s: 0.7, o: 0.7 },
  { x: 620, s: 0.55, o: 0.55 },
  { x: 760, s: 0.45, o: 0.4 },
  { x: 870, s: 0.35, o: 0.3 },
  { x: 960, s: 0.28, o: 0.22 },
  { x: 1030, s: 0.22, o: 0.18 }];


  return (
    <g>
      {/* horizon line */}
      <line x1="0" y1="78" x2="1200" y2="78" stroke={ink} strokeWidth="0.5" opacity="0.3" />

      {torii.map((t, i) => {
        const w = 100 * t.s,h = 70 * t.s;
        const x = t.x,y = 78 - h;
        return (
          <g key={i} fill={accent} opacity={t.o}>
            {/* upper crossbeam (kasagi) — flared */}
            <path d={`M ${x - w * 0.55} ${y} L ${x + w * 0.55} ${y} L ${x + w * 0.5} ${y + h * 0.1} L ${x - w * 0.5} ${y + h * 0.1} Z`} />
            {/* second beam (nuki) */}
            <rect x={x - w * 0.45} y={y + h * 0.22} width={w * 0.9} height={h * 0.08} />
            {/* pillars */}
            <rect x={x - w * 0.4} y={y + h * 0.1} width={w * 0.1} height={h * 0.9} />
            <rect x={x + w * 0.3} y={y + h * 0.1} width={w * 0.1} height={h * 0.9} />
            {/* center plaque */}
            <rect x={x - w * 0.08} y={y + h * 0.12} width={w * 0.16} height={h * 0.1} fill={ink} opacity="0.85" />
          </g>);

      })}

      {/* sun rising behind torii */}
      <circle cx="1080" cy="70" r="22" fill={accent} opacity="0.4" />
    </g>);

}

function Seigaiha({ ink, accent }) {
  // Overlapping concentric arcs — classic "blue ocean wave" pattern, used here for Artists tab.
  const cellW = 28,cellH = 16;
  const cols = Math.ceil(1200 / cellW) + 2;
  const rows = Math.ceil(96 / cellH) + 2;
  const arcs = [];
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const cx = col * cellW - (r % 2 ? cellW / 2 : 0);
      const cy = r * cellH;
      arcs.push(
        <g key={`${r}-${col}`}>
          <path d={`M ${cx - cellW * 0.5} ${cy} a ${cellW * 0.5} ${cellW * 0.5} 0 0 1 ${cellW} 0`}
          fill="none" stroke={accent} strokeWidth="1" opacity="0.45" />
          <path d={`M ${cx - cellW * 0.36} ${cy} a ${cellW * 0.36} ${cellW * 0.36} 0 0 1 ${cellW * 0.72} 0`}
          fill="none" stroke={accent} strokeWidth="1" opacity="0.35" />
          <path d={`M ${cx - cellW * 0.22} ${cy} a ${cellW * 0.22} ${cellW * 0.22} 0 0 1 ${cellW * 0.44} 0`}
          fill="none" stroke={accent} strokeWidth="1" opacity="0.25" />
        </g>
      );
    }
  }
  return <g>{arcs}</g>;
}

// ───────── Noren banner — fabric divider over content ─────────

function NorenBanner({ title, subtitle, kanji }) {
  // Hanging fabric panels with a vertical slit, traditional shop curtain
  return (
    <div style={{
      position: 'relative', width: '100%',
      background: 'var(--seal)',
      color: 'var(--paper)',
      borderTop: '4px solid var(--ink)',
      borderBottom: '4px solid var(--ink)',
      padding: '28px 28px 32px',
      overflow: 'hidden'
    }}>
      {/* vertical slit */}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2,
        background: 'var(--ink)', opacity: 0.2
      }} />
      {/* hanging stitch pattern */}
      <div style={{
        position: 'absolute', top: 4, left: 0, right: 0, height: 1,
        backgroundImage: 'repeating-linear-gradient(90deg, var(--paper) 0 8px, transparent 8px 16px)',
        opacity: 0.5
      }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{
            width: 56, height: 56,
            border: '2px solid var(--paper)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Shippori Mincho, "Noto Serif JP", serif',
            fontSize: 30, fontWeight: 700
          }}>{kanji}</div>
          <div>
            <div style={{
              fontFamily: 'JetBrains Mono', fontSize: 10,
              letterSpacing: '0.3em', textTransform: 'uppercase',
              opacity: 0.75
            }}>{subtitle}</div>
            <div style={{
              fontFamily: 'Shippori Mincho, "Noto Serif JP", serif',
              fontSize: 36, fontWeight: 600, letterSpacing: '-0.01em',
              marginTop: 4
            }}>{title}</div>
          </div>
        </div>
        {/* mon (family crest) circle on right */}
        <svg width="64" height="64" viewBox="0 0 64 64" style={{ flexShrink: 0 }}>
          <circle cx="32" cy="32" r="30" fill="none" stroke="var(--paper)" strokeWidth="1.5" />
          <circle cx="32" cy="32" r="22" fill="none" stroke="var(--paper)" strokeWidth="1" opacity="0.6" />
          {/* 8-petal floral */}
          {Array.from({ length: 8 }).map((_, i) =>
          <ellipse key={i} cx="32" cy="14" rx="4" ry="9"
          fill="var(--paper)" opacity="0.85"
          transform={`rotate(${i * 45} 32 32)`} />
          )}
          <circle cx="32" cy="32" r="4" fill="var(--paper)" />
        </svg>
      </div>
    </div>);

}

// ───────── Tab content (kept from before) ─────────

function TabContent({ tab }) {
  if (tab === 'overview') return null;

  const COPY = {
    history: {
      kanji: '歴', en: 'Listening History', sub: 'A chronicle of every play, in tide order',
      sections: ['Today · 47 plays', 'Yesterday · 64 plays', 'This week · 521 plays', 'Last week · 488 plays']
    },
    patterns: {
      kanji: '型', en: 'Patterns & Habits', sub: 'How your listening blooms across the week',
      sections: ['Weekday vs weekend split', 'Morning · midday · night ratios', 'Genre shifts by season', 'Mood clusters from audio features']
    },
    tracks: {
      kanji: '曲', en: 'Tracks', sub: 'Every song, ranked and sorted',
      sections: ['Most played · last 4 weeks', 'Most played · 6 months', 'Most played · all time', 'Recently added']
    },
    artists: {
      kanji: '師', en: 'Artists', sub: 'Voices you keep returning to',
      sections: ['Top 50 by play count', 'New this month', 'Genres you orbit', 'Discovery trail']
    }
  };
  const c = COPY[tab];
  if (!c) return null;

  return (
    <>
      <NorenBanner kanji={c.kanji} title={c.en} subtitle={`Section · ${tab}`} />
      <section style={{ padding: '36px 28px 48px', borderBottom: '1px solid var(--rule)' }}>
        <p style={{
          fontFamily: 'Shippori Mincho, "Noto Serif JP", serif', fontStyle: 'italic',
          fontSize: 22, color: 'var(--muted)', maxWidth: '52ch', lineHeight: 1.5,
          marginBottom: 28
        }}>{c.sub}.</p>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
          border: '1px solid var(--rule)'
        }}>
          {c.sections.map((s, i) =>
          <div key={i} style={{
            padding: '22px 24px',
            borderRight: i % 2 === 0 ? '1px solid var(--rule)' : 'none',
            borderBottom: i < c.sections.length - 2 ? '1px solid var(--rule)' : 'none',
            display: 'flex', alignItems: 'baseline', gap: 14
          }}>
              <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 11,
              color: 'var(--seal)', letterSpacing: '0.1em'
            }}>{['一', '二', '三', '四'][i]}</span>
              <span style={{
              fontFamily: 'Shippori Mincho, "Noto Serif JP", serif',
              fontSize: 20, color: 'var(--ink)', flex: 1
            }}>{s}</span>
              <span style={{ color: 'var(--seal)', fontFamily: 'Inter', fontSize: 12 }}>→</span>
            </div>
          )}
        </div>
      </section>
    </>);

}

// Backwards-compat alias so app.jsx WaveHero references still resolve
function WaveHero(props) {return <MotifRail mood={props.mood} />;}
function WaveRule() {
  return (
    <div style={{ height: 14, width: '100%', borderTop: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', overflow: 'hidden' }}>
      <svg viewBox="0 0 1200 14" width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
        <path d="M 0 7 q 30 -7 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0"
        fill="none" stroke="var(--seal)" strokeWidth="1" opacity="0.55" />
      </svg>
    </div>);

}

Object.assign(window, { MotifRail, NorenBanner, WaveHero, WaveRule, TabContent });