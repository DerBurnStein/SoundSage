// SoundSage — refined dashboard
// Aesthetic: editorial almanac. Paper, ink, moss, ember.

const { useState, useEffect, useRef, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "paper",
  "accent": "moss",
  "density": "regular",
  "showSync": true,
  "barStyle": "ribbon",
  "headerStyle": "editorial"
}/*EDITMODE-END*/;

// ───────────────────────────────── data ─────────────────────────────────

const TRACKS = [
  { name: 'Dreams', artist: 'Fleetwood Mac',         album: 'Rumours',                  plays: 87, mins: 264, peakHour: 22 },
  { name: 'Night Shift', artist: 'Lucy Dacus',       album: 'Home Video',               plays: 74, mins: 481, peakHour: 23 },
  { name: 'A Hand, A Mouth', artist: 'Big Thief',    album: 'Two Hands',                plays: 68, mins: 199, peakHour: 8  },
  { name: 'Saturn', artist: 'SZA',                   album: 'Lana',                     plays: 61, mins: 173, peakHour: 19 },
  { name: 'Vampire Empire', artist: 'Big Thief',     album: 'Single',                   plays: 55, mins: 215, peakHour: 16 },
  { name: 'Linger', artist: 'The Cranberries',       album: "Everybody Else…",          plays: 52, mins: 247, peakHour: 0  },
  { name: 'Pink + White', artist: 'Frank Ocean',     album: 'Blonde',                   plays: 49, mins: 156, peakHour: 14 },
  { name: 'Motion Sickness', artist: 'Phoebe Bridgers', album: 'Stranger in the Alps',  plays: 47, mins: 189, peakHour: 23 },
];

const ARTISTS = [
  { name: 'Big Thief',          tag: 'indie folk',    plays: 214, share: 12.3 },
  { name: 'Frank Ocean',        tag: 'r&b',           plays: 189, share: 10.9 },
  { name: 'Phoebe Bridgers',    tag: 'indie',         plays: 176, share: 10.1 },
  { name: 'SZA',                tag: 'r&b',           plays: 152, share:  8.7 },
  { name: 'Fleetwood Mac',      tag: 'classic rock',  plays: 134, share:  7.7 },
  { name: 'Lucy Dacus',         tag: 'indie',         plays: 121, share:  7.0 },
];

// 24-hour listening pattern (rough bell, with a late-night peak)
const HOURLY = [
  4, 2, 1, 0, 0, 0, 1, 5, 12, 18, 22, 26, 28, 24, 21, 19, 23, 28, 32, 38, 42, 46, 38, 18,
];

// 7-day daily plays (Mon..Sun)
const DAILY = [
  { day: 'Mon', plays: 58, mins: 184 },
  { day: 'Tue', plays: 71, mins: 226 },
  { day: 'Wed', plays: 49, mins: 152 },
  { day: 'Thu', plays: 88, mins: 271 },
  { day: 'Fri', plays: 102, mins: 318 },
  { day: 'Sat', plays: 64, mins: 199 },
  { day: 'Sun', plays: 95, mins: 297 },
];

// Genre share
const GENRES = [
  { name: 'Indie',   share: 32, color: 'var(--moss)' },
  { name: 'R&B',     share: 22, color: 'var(--ember)' },
  { name: 'Folk',    share: 17, color: 'var(--gold)' },
  { name: 'Classic', share: 14, color: 'var(--plum)' },
  { name: 'Ambient', share:  9, color: 'var(--sky)' },
  { name: 'Other',   share:  6, color: 'var(--dim)' },
];

// 12 weeks of weekly mins for the spark / area chart
const WEEKLY = [612, 588, 705, 642, 580, 720, 810, 690, 754, 822, 690, 786];

const NAV_ITEMS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'history',   label: 'History' },
  { id: 'patterns',  label: 'Patterns' },
  { id: 'tracks',    label: 'Tracks' },
  { id: 'artists',   label: 'Artists' },
];

const TIME_RANGES = [
  { id: '4w',  label: '4 weeks' },
  { id: '6m',  label: '6 months' },
  { id: '1y',  label: '1 year' },
  { id: 'all', label: 'All time' },
];

// ───────────────────────────────── helpers ─────────────────────────────────

function fmtMins(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}m`;
  return `${h}h ${min.toString().padStart(2, '0')}m`;
}
function pad2(n) { return n.toString().padStart(2, '0'); }
function hourLabel(h) {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

// ───────────────────────────────── primitives ─────────────────────────────────

function Rule({ thick = false, dashed = false, style }) {
  return (
    <div style={{
      height: thick ? 2 : 1,
      background: dashed ? 'transparent' : 'var(--rule)',
      backgroundImage: dashed
        ? 'repeating-linear-gradient(90deg, var(--rule) 0 4px, transparent 4px 8px)'
        : 'none',
      width: '100%',
      ...style
    }} />
  );
}

function Caps({ children, style }) {
  return (
    <span style={{
      fontFamily: 'Inter',
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: 'var(--seal)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      ...style
    }}>
      <span aria-hidden="true" style={{
        width: 2, height: 11, background: 'var(--seal)', display: 'inline-block',
      }} />
      {children}
    </span>
  );
}

function Mono({ children, style }) {
  return <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontVariantNumeric: 'tabular-nums', ...style }}>{children}</span>;
}

function Display({ children, size = 64, weight = 500, italic = false, opsz = 96, style }) {
  return (
    <span style={{
      fontFamily: italic ? 'Shippori Mincho, "Noto Serif JP", serif' : 'Noto Serif JP, serif',
      fontSize: size,
      fontWeight: weight,
      fontStyle: italic ? 'italic' : 'normal',
      letterSpacing: '-0.02em',
      lineHeight: 0.95,
      color: 'var(--ink)',
      display: 'inline-block',
      ...style
    }}>{children}</span>
  );
}

// ───────────────────────────────── header / masthead ─────────────────────────────────

function Masthead({ today, onNavTo, active, density }) {
  return (
    <header style={{
      borderBottom: '1px solid var(--rule)',
      background: 'var(--paper)',
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      {/* top bar — almanac strip */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 28px',
        borderBottom: '1px solid var(--rule)',
        fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--muted)',
      }}>
        <span>Vol. III · No. 17 · Spring</span>
        <span>聴 · A Listening Almanac · 録</span>
        <span>{today}</span>
      </div>

      {/* masthead */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        padding: '22px 28px 18px', gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {/* hanko seal mark */}
          <div style={{
            width: 56, height: 56,
            background: 'var(--seal)',
            color: 'var(--paper)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Shippori Mincho, "Noto Serif JP", serif',
            fontWeight: 700, fontSize: 30,
            borderRadius: 4,
            transform: 'rotate(-3deg)',
            boxShadow: 'inset 0 0 0 2px var(--paper), inset 0 0 0 3px var(--seal)',
            lineHeight: 1, flexShrink: 0,
          }}>聴</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <span style={{
                fontFamily: 'Shippori Mincho, "Noto Serif JP", serif',
                fontWeight: 600, fontSize: 40,
                letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--ink)',
              }}>SoundSage</span>
              <span style={{
                fontFamily: 'Noto Serif JP', fontWeight: 500, fontSize: 13,
                color: 'var(--seal)', letterSpacing: '0.5em',
              }}>音盤録</span>
            </div>
            <span style={{
              color: 'var(--muted)',
              fontFamily: 'Shippori Mincho, "Noto Serif JP", serif',
              fontStyle: 'italic', fontSize: 14, fontWeight: 400,
            }}>
              a record of the things you have been hearing
            </span>
          </div>
        </div>
        <ConnectionPill />
      </div>

      {/* nav */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        borderTop: '1px solid var(--rule)',
        padding: '0 16px',
      }}>
        {NAV_ITEMS.map((n, i) => (
          <button key={n.id}
            onClick={() => onNavTo(n.id)}
            style={{
              border: 'none',
              background: active === n.id ? 'var(--ink)' : 'transparent',
              color:      active === n.id ? 'var(--paper)' : 'var(--ink)',
              fontFamily: 'Inter', fontSize: 12, fontWeight: 500,
              letterSpacing: '0.04em',
              padding: '12px 18px',
              cursor: 'pointer',
              borderRight: i < NAV_ITEMS.length - 1 ? '1px solid var(--rule)' : 'none',
              transition: 'background .12s, color .12s',
            }}
            onMouseEnter={(e) => { if (active !== n.id) e.currentTarget.style.background = 'var(--paper-2)'; }}
            onMouseLeave={(e) => { if (active !== n.id) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, opacity: 0.6, marginRight: 8 }}>
              {pad2(i + 1)}
            </span>
            {n.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <TimeRangePicker />
      </div>
    </header>
  );
}

function TimeRangePicker() {
  const [range, setRange] = useState('4w');
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', borderLeft: '1px solid var(--rule)' }}>
      {TIME_RANGES.map((r, i) => (
        <button key={r.id}
          onClick={() => setRange(r.id)}
          style={{
            border: 'none',
            background: range === r.id ? 'var(--paper-3)' : 'transparent',
            color: range === r.id ? 'var(--ink)' : 'var(--muted)',
            fontFamily: 'Inter', fontSize: 11, fontWeight: range === r.id ? 600 : 400,
            padding: '0 14px',
            cursor: 'pointer',
            borderRight: i < TIME_RANGES.length - 1 ? '1px solid var(--rule)' : 'none',
            letterSpacing: '0.02em',
          }}>
          {r.label}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────────────── connection pill ─────────────────────────────────

function ConnectionPill() {
  // Reads the same /auth/spotify/me endpoint the original used; falls back to a mock connected state.
  const [auth, setAuth] = useState({
    loading: true, connected: false, name: 'Not connected', persisted: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/auth/spotify/me', { signal: AbortSignal.timeout?.(1500) });
        if (!r.ok) throw 0;
        const d = await r.json();
        if (cancelled) return;
        if (d.authenticated && d.user) {
          setAuth({
            loading: false, connected: true,
            name: d.user.displayName || d.user.spotifyUserId,
            persisted: !!d.user.persisted,
          });
          return;
        }
        throw 0;
      } catch {
        if (cancelled) return;
        // Demo fallback so the dashboard renders meaningfully in preview.
        setAuth({ loading: false, connected: true, name: 'Demo Listener', persisted: true, demo: true });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (auth.loading) {
    return <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--muted)' }}>·  ·  ·</span>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {auth.demo && (
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--gold)',
          border: '1px solid var(--gold)', padding: '2px 6px', borderRadius: 2,
        }}>Demo data</span>
      )}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
          {auth.name}
        </div>
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'var(--muted)', letterSpacing: '0.05em' }}>
          {auth.connected ? '● linked · last sync 2m ago' : '○ not linked'}
        </div>
      </div>
      <div style={{
        width: 36, height: 36, borderRadius: 18,
        background: 'var(--ink)', color: 'var(--paper)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Noto Serif JP', fontWeight: 600, fontSize: 16,
      }}>{auth.name.charAt(0).toUpperCase()}</div>
    </div>
  );
}

// ───────────────────────────────── lede / hero ─────────────────────────────────

function Lede({ density }) {
  // The "this week, in numbers" hero.
  // Uses big editorial numerals + a mini sparkline.

  const totalMins = DAILY.reduce((a, b) => a + b.mins, 0);
  const totalPlays = DAILY.reduce((a, b) => a + b.plays, 0);
  const peak = DAILY.reduce((a, b) => b.mins > a.mins ? b : a, DAILY[0]);
  const peakHour = HOURLY.indexOf(Math.max(...HOURLY));

  return (
    <section style={{
      padding: density === 'compact' ? '32px 28px 24px' : '56px 28px 40px',
      borderBottom: '1px solid var(--rule)',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 48, alignItems: 'end' }}>
        <div>
          <Caps>This week's listening</Caps>
          <h2 style={{
            fontFamily: 'Noto Serif JP', fontWeight: 400,
            fontSize: 'clamp(36px, 4.6vw, 64px)',
            lineHeight: 1.18,
            letterSpacing: '-0.025em',
            margin: '14px 0 0',
            color: 'var(--ink)',
            textWrap: 'pretty',
          }}>
            You spent{' '}
            <Display size={'clamp(36px, 4.6vw, 64px)'} italic weight={500} style={{ color: 'var(--moss)', lineHeight: 1.18 }}>
              {Math.floor(totalMins / 60)}h {totalMins % 60}m
            </Display>
            {' '}listening to{' '}
            <Mono style={{ fontSize: 'clamp(32px, 4vw, 56px)', color: 'var(--ember)' }}>{totalPlays}</Mono>
            {' '}tracks across{' '}
            <Display size={'clamp(36px, 4.6vw, 64px)'} italic weight={500} style={{ lineHeight: 1.18 }}>seven days</Display>
            <span style={{ color: 'var(--muted)' }}>.</span>
          </h2>

          <p style={{
            marginTop: 18,
            fontFamily: 'Shippori Mincho', fontSize: 18, fontStyle: 'italic',
            color: 'var(--muted)', maxWidth: '50ch', lineHeight: 1.4,
          }}>
            Mostly indie folk, mostly after dinner. Your peak listening hour was{' '}
            <span style={{ color: 'var(--ink)', fontStyle: 'normal', fontWeight: 600 }}>{hourLabel(peakHour)}</span>{' '}
            and your busiest day was{' '}
            <span style={{ color: 'var(--ink)', fontStyle: 'normal', fontWeight: 600 }}>{peak.day}day</span>.
          </p>
        </div>

        <WeeklySpark />
      </div>
    </section>
  );
}

function WeeklySpark() {
  // 12-week area chart with annotations
  const w = 480, h = 180, padX = 8, padY = 16;
  const max = Math.max(...WEEKLY);
  const min = Math.min(...WEEKLY);
  const stepX = (w - padX * 2) / (WEEKLY.length - 1);
  const yFor = (v) => padY + (1 - (v - min) / (max - min)) * (h - padY * 2);

  const pts = WEEKLY.map((v, i) => [padX + i * stepX, yFor(v)]);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
  const area = `${path} L ${pts[pts.length-1][0]} ${h - padY} L ${pts[0][0]} ${h - padY} Z`;

  const last = WEEKLY[WEEKLY.length - 1];
  const prev = WEEKLY[WEEKLY.length - 2];
  const delta = ((last - prev) / prev) * 100;

  return (
    <div style={{
      border: '1px solid var(--rule)',
      background: 'var(--paper-2)',
      padding: '18px 20px',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <Caps>Weekly minutes — last 12 weeks</Caps>
        <Mono style={{ fontSize: 11, color: delta >= 0 ? 'var(--moss)' : 'var(--ember)' }}>
          {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% wow
        </Mono>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
        <defs>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--moss)" strokeWidth="1" opacity="0.35" />
          </pattern>
        </defs>
        {/* baseline grid */}
        {[0.25, 0.5, 0.75].map(t => (
          <line key={t} x1={padX} x2={w - padX} y1={padY + t * (h - padY * 2)} y2={padY + t * (h - padY * 2)}
            stroke="var(--rule)" strokeOpacity="0.15" strokeDasharray="2 4" />
        ))}
        <path d={area} fill="url(#hatch)" />
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4 : 2}
            fill={i === pts.length - 1 ? 'var(--ember)' : 'var(--ink)'} />
        ))}
        {/* end label */}
        <text x={pts[pts.length - 1][0] - 6} y={pts[pts.length - 1][1] - 10}
          textAnchor="end" fontFamily="JetBrains Mono" fontSize="10" fill="var(--ink)">
          {last}m
        </text>
      </svg>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginTop: 6, fontFamily: 'JetBrains Mono', fontSize: 9,
        color: 'var(--dim)', letterSpacing: '0.05em',
      }}>
        <span>wk−12</span><span>wk−6</span><span>now</span>
      </div>
    </div>
  );
}

// ───────────────────────────────── stat strip ─────────────────────────────────

function StatStrip() {
  const stats = [
    { k: 'Listening time', v: '761h 18m',  s: 'avg 124m / day',     d: '+12% vs last month' },
    { k: 'Plays',          v: '3,421',     s: '2,184 unique',       d: 'dedupe ratio 0.64' },
    { k: 'Artists',        v: '287',       s: '24 new this month',  d: '8% discovery rate' },
    { k: 'Top hour',       v: '9pm',       s: 'evening listener',   d: '38% after 7pm' },
  ];

  return (
    <section style={{ borderBottom: '1px solid var(--rule)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {stats.map((s, i) => (
          <div key={s.k} style={{
            padding: '24px 28px',
            borderRight: i < stats.length - 1 ? '1px solid var(--rule)' : 'none',
            position: 'relative',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Caps>{s.k}</Caps>
              <Mono style={{ fontSize: 10, color: 'var(--dim)' }}>{pad2(i + 1)}</Mono>
            </div>
            <div style={{ marginTop: 12 }}>
              <Display size={40} weight={500}>{s.v}</Display>
            </div>
            <div style={{ marginTop: 10, fontFamily: 'Shippori Mincho', fontStyle: 'italic', fontSize: 14, color: 'var(--muted)' }}>
              {s.s}
            </div>
            <div style={{ marginTop: 6 }}>
              <Mono style={{ fontSize: 10, color: 'var(--dim)' }}>{s.d}</Mono>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ───────────────────────────────── activity ribbon (daily bars) ─────────────────────────────────

function ActivityRibbon({ style }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(...DAILY.map(d => d.mins));
  const W = 700, H = 220, padL = 36, padR = 12, padT = 16, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const stepX = innerW / DAILY.length;

  return (
    <div style={{
      borderRight: '1px solid var(--rule)',
      borderBottom: '1px solid var(--rule)',
      padding: '24px 28px',
      gridColumn: 'span 2',
      ...style,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
        <div>
          <Caps>Fig. 一 — Daily listening</Caps>
          <h3 style={{ fontFamily: 'Noto Serif JP', fontWeight: 400, fontSize: 28, marginTop: 6, letterSpacing: '-0.01em' }}>
            <span style={{ fontStyle: 'italic' }}>Friday</span> was your loudest day
          </h3>
        </div>
        <Mono style={{ color: 'var(--dim)', fontSize: 10 }}>min · plays</Mono>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {/* y-axis ticks */}
        {[0, 0.5, 1].map(t => {
          const y = padT + (1 - t) * innerH;
          const v = Math.round(t * max);
          return (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y} y2={y}
                stroke="var(--rule)" strokeOpacity={t === 0 ? 0.6 : 0.15}
                strokeDasharray={t === 0 ? '0' : '2 4'} />
              <text x={padL - 8} y={y + 3} textAnchor="end"
                fontFamily="JetBrains Mono" fontSize="9" fill="var(--dim)">{v}</text>
            </g>
          );
        })}

        {DAILY.map((d, i) => {
          const x = padL + i * stepX + stepX * 0.18;
          const bw = stepX * 0.64;
          const bh = (d.mins / max) * innerH;
          const y = padT + innerH - bh;
          const isHover = hover === i;
          const isPeak = d.mins === max;
          return (
            <g key={d.day}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* hit area */}
              <rect x={padL + i * stepX} y={padT} width={stepX} height={innerH} fill="transparent" />
              {/* bar */}
              <rect x={x} y={y} width={bw} height={bh}
                fill={isPeak ? 'var(--ember)' : (isHover ? 'var(--moss-2)' : 'var(--ink)')}
                style={{ transition: 'fill .12s' }} />
              {/* annotation for peak */}
              {isPeak && (
                <g>
                  <line x1={x + bw / 2} y1={y - 8} x2={x + bw / 2} y2={y - 22}
                    stroke="var(--ember)" strokeWidth="0.75" />
                  <text x={x + bw / 2} y={y - 26} textAnchor="middle"
                    fontFamily="Fraunces" fontStyle="italic" fontSize="11" fill="var(--ember)">
                    peak — {d.mins}m
                  </text>
                </g>
              )}
              {/* x label */}
              <text x={x + bw / 2} y={H - padB + 16} textAnchor="middle"
                fontFamily="Inter" fontSize="11" fontWeight={isHover ? 600 : 400}
                fill={isHover ? 'var(--ink)' : 'var(--muted)'}>{d.day}</text>
              <text x={x + bw / 2} y={H - padB + 28} textAnchor="middle"
                fontFamily="JetBrains Mono" fontSize="9"
                fill="var(--dim)">{d.plays}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ───────────────────────────────── hourly clock (radial) ─────────────────────────────────

function HourlyClock({ style }) {
  const [hover, setHover] = useState(null);
  const size = 280;
  const cx = size / 2, cy = size / 2;
  const rOuter = 120, rInner = 40;
  const max = Math.max(...HOURLY);

  // 24 wedges, top = 12am, clockwise
  const slice = (2 * Math.PI) / 24;
  return (
    <div style={{
      padding: '24px 28px',
      borderBottom: '1px solid var(--rule)',
      ...style,
    }}>
      <div style={{ marginBottom: 12 }}>
        <Caps>Fig. 二 — By hour of day</Caps>
        <h3 style={{ fontFamily: 'Noto Serif JP', fontWeight: 400, fontSize: 22, marginTop: 6, letterSpacing: '-0.01em' }}>
          A <span style={{ fontStyle: 'italic' }}>night-owl</span> profile
        </h3>
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: size, margin: '0 auto' }}>
        <svg viewBox={`0 0 ${size} ${size}`} width="100%">
          {/* clock face */}
          <circle cx={cx} cy={cy} r={rOuter + 12} fill="none" stroke="var(--rule)" strokeOpacity="0.3" />
          <circle cx={cx} cy={cy} r={rInner} fill="var(--paper-2)" stroke="var(--rule)" strokeOpacity="0.4" />

          {HOURLY.map((v, h) => {
            const a0 = -Math.PI / 2 + h * slice;
            const a1 = a0 + slice;
            const r = rInner + ((rOuter - rInner) * (v / max));
            const x0 = cx + Math.cos(a0) * rInner, y0 = cy + Math.sin(a0) * rInner;
            const x1 = cx + Math.cos(a0) * r,      y1 = cy + Math.sin(a0) * r;
            const x2 = cx + Math.cos(a1) * r,      y2 = cy + Math.sin(a1) * r;
            const x3 = cx + Math.cos(a1) * rInner, y3 = cy + Math.sin(a1) * rInner;
            const path = `M ${x0} ${y0} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 0 0 ${x0} ${y0} Z`;

            const isPeak = v === max;
            const isHover = hover === h;
            return (
              <path key={h} d={path}
                fill={isPeak ? 'var(--ember)' : (isHover ? 'var(--moss-2)' : 'var(--ink)')}
                stroke="var(--paper)" strokeWidth="1"
                onMouseEnter={() => setHover(h)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer', transition: 'fill .12s' }} />
            );
          })}

          {/* hour labels at cardinal positions */}
          {[0, 6, 12, 18].map(h => {
            const a = -Math.PI / 2 + h * slice;
            const r = rOuter + 22;
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r;
            return (
              <text key={h} x={x} y={y + 4} textAnchor="middle"
                fontFamily="JetBrains Mono" fontSize="10" fill="var(--muted)">{hourLabel(h)}</text>
            );
          })}

          {/* center label */}
          <text x={cx} y={cy - 4} textAnchor="middle"
            fontFamily="Fraunces" fontSize="20" fontWeight="500"
            fill="var(--ink)">
            {hover != null ? `${HOURLY[hover]}` : `${Math.max(...HOURLY)}`}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle"
            fontFamily="JetBrains Mono" fontSize="9" fill="var(--muted)" letterSpacing="0.1em">
            {hover != null ? hourLabel(hover).toUpperCase() : 'PEAK · 9PM'}
          </text>
        </svg>
      </div>
    </div>
  );
}

// ───────────────────────────────── genre bar (stacked) ─────────────────────────────────

function GenreBar({ style }) {
  return (
    <div style={{
      padding: '24px 28px',
      borderRight: '1px solid var(--rule)',
      borderBottom: '1px solid var(--rule)',
      ...style,
    }}>
      <div style={{ marginBottom: 18 }}>
        <Caps>Fig. 三 — Genre composition</Caps>
        <h3 style={{ fontFamily: 'Noto Serif JP', fontWeight: 400, fontSize: 22, marginTop: 6, letterSpacing: '-0.01em' }}>
          One third <span style={{ fontStyle: 'italic' }}>indie</span>, the rest a mosaic
        </h3>
      </div>

      {/* horizontal stacked bar */}
      <div style={{
        display: 'flex', height: 56, width: '100%',
        border: '1px solid var(--rule)',
      }}>
        {GENRES.map((g, i) => (
          <div key={g.name}
            title={`${g.name} — ${g.share}%`}
            style={{
              width: `${g.share}%`,
              background: g.color,
              borderRight: i < GENRES.length - 1 ? '1px solid var(--paper)' : 'none',
              position: 'relative',
              cursor: 'default',
            }}>
            {g.share >= 14 && (
              <span style={{
                position: 'absolute', left: 8, bottom: 6,
                fontFamily: 'JetBrains Mono', fontSize: 10,
                color: g.name === 'Folk' ? 'var(--ink)' : 'var(--paper)',
                letterSpacing: '0.05em',
              }}>{g.share}%</span>
            )}
          </div>
        ))}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '8px 24px', marginTop: 18,
      }}>
        {GENRES.map(g => (
          <div key={g.name} style={{
            display: 'flex', alignItems: 'baseline', gap: 8,
            paddingBottom: 6, borderBottom: '1px dotted var(--rule)',
          }}>
            <span style={{ width: 10, height: 10, background: g.color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontFamily: 'Noto Serif JP', fontSize: 16, color: 'var(--ink)', flex: 1 }}>{g.name}</span>
            <Mono style={{ fontSize: 11, color: 'var(--muted)' }}>{g.share}%</Mono>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────── ranking lists ─────────────────────────────────

function RankList({ title, kicker, items, kind }) {
  // kind: 'tracks' | 'artists'
  const max = Math.max(...items.map(i => i.plays));
  return (
    <div style={{
      padding: '24px 28px',
      borderBottom: '1px solid var(--rule)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <Caps>{kicker}</Caps>
          <h3 style={{ fontFamily: 'Noto Serif JP', fontWeight: 400, fontSize: 22, marginTop: 6, letterSpacing: '-0.01em' }}>
            {title}
          </h3>
        </div>
        <a href="#" style={{
          fontFamily: 'Inter', fontSize: 11, color: 'var(--ink)',
          borderBottom: '1px solid var(--ink)', paddingBottom: 1,
          textDecoration: 'none', fontWeight: 500,
        }}>See full chart →</a>
      </div>

      <div>
        {items.map((it, i) => {
          const pct = (it.plays / max) * 100;
          return (
            <div key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr auto',
                alignItems: 'center',
                gap: 16,
                padding: '14px 0',
                borderBottom: i < items.length - 1 ? '1px solid var(--rule)' : 'none',
                position: 'relative',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--paper-2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontFamily: 'Noto Serif JP', fontSize: 28, fontWeight: 400, color: i === 0 ? 'var(--ember)' : 'var(--ink)', lineHeight: 1 }}>
                {pad2(i + 1)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontFamily: 'Noto Serif JP', fontSize: 18, fontWeight: 500,
                  letterSpacing: '-0.01em', color: 'var(--ink)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {it.name}
                </div>
                <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {kind === 'tracks' ? <>by <span style={{ fontStyle: 'italic', fontFamily: 'Shippori Mincho', fontSize: 13 }}>{it.artist}</span> · <Mono style={{ fontSize: 11 }}>{it.album}</Mono></>
                                     : <>{it.tag} · <Mono style={{ fontSize: 11 }}>{it.share}% of plays</Mono></>}
                </div>
                {/* play bar */}
                <div style={{ marginTop: 8, height: 2, background: 'var(--paper-3)', position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: 2,
                    width: `${pct}%`,
                    background: i === 0 ? 'var(--ember)' : 'var(--ink)',
                  }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 80 }}>
                <Mono style={{ fontSize: 16, color: 'var(--ink)', fontWeight: 500 }}>{it.plays}</Mono>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: 'var(--dim)', letterSpacing: '0.05em', marginTop: 2 }}>
                  PLAYS
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────── recently played stream ─────────────────────────────────

const RECENT = [
  { title: 'Saturn',                 artist: 'SZA',                ago: '4m ago',  hour: 19 },
  { title: 'Pink + White',           artist: 'Frank Ocean',        ago: '8m ago',  hour: 19 },
  { title: 'A Hand, A Mouth',        artist: 'Big Thief',          ago: '12m ago', hour: 19 },
  { title: 'Night Shift',            artist: 'Lucy Dacus',         ago: '17m ago', hour: 19 },
  { title: 'Vampire Empire',         artist: 'Big Thief',          ago: '21m ago', hour: 18 },
  { title: 'Dreams',                 artist: 'Fleetwood Mac',      ago: '25m ago', hour: 18 },
  { title: 'Linger',                 artist: 'The Cranberries',    ago: '30m ago', hour: 18 },
  { title: 'Motion Sickness',        artist: 'Phoebe Bridgers',    ago: '34m ago', hour: 18 },
];

function RecentStream() {
  return (
    <div style={{ padding: '24px 28px', borderRight: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ marginBottom: 16 }}>
        <Caps>Stream — recently played</Caps>
        <h3 style={{ fontFamily: 'Noto Serif JP', fontWeight: 400, fontSize: 22, marginTop: 6, letterSpacing: '-0.01em' }}>
          The last <span style={{ fontStyle: 'italic' }}>34 minutes</span>
        </h3>
      </div>
      <div style={{ position: 'relative' }}>
        {/* timeline rail */}
        <div style={{
          position: 'absolute', left: 11, top: 6, bottom: 6, width: 1,
          backgroundImage: 'repeating-linear-gradient(to bottom, var(--rule) 0 3px, transparent 3px 6px)',
        }} />
        {RECENT.map((t, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '24px 1fr auto',
            alignItems: 'center', gap: 12, padding: '8px 0',
          }}>
            <div style={{
              width: 9, height: 9, marginLeft: 7,
              background: i === 0 ? 'var(--ember)' : 'var(--ink)',
              borderRadius: '50%', position: 'relative', zIndex: 1,
              boxShadow: '0 0 0 3px var(--paper)',
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'Noto Serif JP', fontSize: 15, fontWeight: 500,
                color: 'var(--ink)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{t.title}</div>
              <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--muted)' }}>
                <span style={{ fontStyle: 'italic', fontFamily: 'Shippori Mincho', fontSize: 12 }}>{t.artist}</span>
              </div>
            </div>
            <Mono style={{ fontSize: 10, color: 'var(--dim)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
              {t.ago}
            </Mono>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────── sync status / ingestion ─────────────────────────────────

function SyncCard() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState([
    { t: '12:04:21', m: 'cursor advanced → 2026-04-26T19:04:11Z' },
    { t: '12:04:20', m: 'inserted 14 events · 0 dupes' },
    { t: '12:04:19', m: 'fetched /me/player/recently-played (50)' },
  ]);

  function runSync() {
    if (running) return;
    setRunning(true);
    setProgress(0);
    let p = 0;
    const id = setInterval(() => {
      p += 8 + Math.random() * 18;
      if (p >= 100) {
        p = 100;
        clearInterval(id);
        const now = new Date();
        const t = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
        setLog(l => [
          { t, m: 'cursor advanced · 7 events · 0 dupes' },
          ...l,
        ].slice(0, 6));
        setTimeout(() => { setRunning(false); setProgress(0); }, 600);
      }
      setProgress(p);
    }, 220);
  }

  return (
    <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <Caps>Ingestion</Caps>
          <h3 style={{ fontFamily: 'Noto Serif JP', fontWeight: 400, fontSize: 22, marginTop: 6, letterSpacing: '-0.01em' }}>
            Pipeline status
          </h3>
        </div>
        <button
          onClick={runSync}
          disabled={running}
          style={{
            border: '1px solid var(--ink)',
            background: running ? 'var(--paper-2)' : 'var(--ink)',
            color: running ? 'var(--ink)' : 'var(--paper)',
            fontFamily: 'Inter', fontSize: 12, fontWeight: 500,
            letterSpacing: '0.04em',
            padding: '8px 16px', cursor: running ? 'wait' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: running ? 'var(--ember)' : 'var(--paper)',
            animation: running ? 'pulse 1s ease-in-out infinite' : 'none',
          }} />
          {running ? 'Syncing…' : 'Run sync now'}
        </button>
      </div>

      {/* status grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        border: '1px solid var(--rule)',
        marginBottom: 14,
      }}>
        {[
          ['oauth_tokens',    'fresh',     'expires in 2h 14m'],
          ['ingestion_state', 'cursor',    '2026-04-26 19:04Z'],
          ['listening_events','3,421 rows','+47 today'],
          ['last sync',       '2 min ago', 'every 15 min'],
        ].map(([k, v, s], i) => (
          <div key={k} style={{
            padding: '14px 16px',
            borderRight: i < 3 ? '1px solid var(--rule)' : 'none',
          }}>
            <Mono style={{ fontSize: 9, color: 'var(--dim)', letterSpacing: '0.08em' }}>
              {k.toUpperCase()}
            </Mono>
            <div style={{ fontFamily: 'Noto Serif JP', fontSize: 18, marginTop: 6, fontWeight: 500 }}>{v}</div>
            <Mono style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginTop: 4 }}>{s}</Mono>
          </div>
        ))}
      </div>

      {/* progress strip */}
      <div style={{
        height: 4, background: 'var(--paper-3)', position: 'relative', marginBottom: 14,
      }}>
        <div style={{
          height: '100%', width: `${progress}%`,
          background: 'var(--ember)',
          transition: 'width .2s ease-out',
        }} />
      </div>

      {/* log */}
      <div style={{ background: 'var(--paper-2)', border: '1px solid var(--rule)', padding: '10px 14px' }}>
        {log.map((l, i) => (
          <div key={i} style={{
            display: 'flex', gap: 14,
            fontFamily: 'JetBrains Mono', fontSize: 11,
            color: i === 0 ? 'var(--ink)' : 'var(--muted)',
            padding: '3px 0',
            opacity: i === 0 ? 1 : Math.max(0.45, 1 - i * 0.12),
          }}>
            <span style={{ color: 'var(--dim)' }}>{l.t}</span>
            <span>{l.m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────── footer / colophon ─────────────────────────────────

function Colophon() {
  return (
    <footer style={{
      padding: '24px 28px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.06em',
      color: 'var(--dim)', textTransform: 'uppercase',
    }}>
      <span>SoundSage · A Listening Almanac</span>
      <span>Source: Spotify · Persisted in postgres</span>
      <span>{new Date().getFullYear()}</span>
    </footer>
  );
}

// ───────────────────────────────── app ─────────────────────────────────

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [active, setActive] = useState('overview');
  const today = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }, []);

  // apply theme + tab subtheme
  useEffect(() => {
    document.documentElement.dataset.theme = t.theme === 'midnight' ? 'midnight' : 'paper';
    document.documentElement.dataset.tab = active;
  }, [t.theme, t.accent, active]);

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>
      <Masthead today={today} active={active} onNavTo={setActive} density={t.density} />

      {active === 'overview' && (
        <>
          <WaveHero mood="overview" />
          <Lede density={t.density} />
          <StatStrip />

          <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr' }}>
            <ActivityRibbon />
            <HourlyClock />
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr' }}>
            <GenreBar />
            <RecentStream />
          </section>

          <section style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            borderBottom: '1px solid var(--rule)',
          }}>
            <div style={{ borderRight: '1px solid var(--rule)' }}>
              <RankList title="Most-played tracks" kicker="Top 八 — last 4 weeks" items={TRACKS} kind="tracks" />
            </div>
            <RankList title="Most-played artists" kicker="Top 六 — last 4 weeks" items={ARTISTS} kind="artists" />
          </section>

          {t.showSync && <SyncCard />}
        </>
      )}

      {active !== 'overview' && (
        <>
          <WaveHero mood={active} height={220} />
          <TabContent tab={active} />
          {active === 'tracks' && (
            <section style={{ borderBottom: '1px solid var(--rule)' }}>
              <RankList title="Most-played tracks" kicker="Top 八 — last 4 weeks" items={TRACKS} kind="tracks" />
            </section>
          )}
          {active === 'artists' && (
            <section style={{ borderBottom: '1px solid var(--rule)' }}>
              <RankList title="Most-played artists" kicker="Top 六 — last 4 weeks" items={ARTISTS} kind="artists" />
            </section>
          )}
          {active === 'history' && (
            <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr' }}>
              <ActivityRibbon />
              <RecentStream />
            </section>
          )}
          {active === 'patterns' && (
            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <HourlyClock />
              <GenreBar />
            </section>
          )}
        </>
      )}

      <Colophon />

      {/* corner tatami markers */}
      <div aria-hidden="true" style={{
        position: 'fixed', top: 0, left: 0, width: 14, height: 14,
        borderTop: '2px solid var(--seal)', borderLeft: '2px solid var(--seal)',
        zIndex: 200, pointerEvents: 'none',
      }} />
      <div aria-hidden="true" style={{
        position: 'fixed', top: 0, right: 0, width: 14, height: 14,
        borderTop: '2px solid var(--seal)', borderRight: '2px solid var(--seal)',
        zIndex: 200, pointerEvents: 'none',
      }} />
      <div aria-hidden="true" style={{
        position: 'fixed', bottom: 0, left: 0, width: 14, height: 14,
        borderBottom: '2px solid var(--seal)', borderLeft: '2px solid var(--seal)',
        zIndex: 200, pointerEvents: 'none',
      }} />
      <div aria-hidden="true" style={{
        position: 'fixed', bottom: 0, right: 0, width: 14, height: 14,
        borderBottom: '2px solid var(--seal)', borderRight: '2px solid var(--seal)',
        zIndex: 200, pointerEvents: 'none',
      }} />

      {/* Tweaks */}
      <TweaksPanel>
        <TweakSection label="Surface" />
        <TweakRadio label="Theme" value={t.theme}
          options={['paper', 'midnight']}
          onChange={(v) => setTweak('theme', v)} />
        <TweakRadio label="Density" value={t.density}
          options={['compact', 'regular', 'roomy']}
          onChange={(v) => setTweak('density', v)} />
        <TweakSection label="Modules" />
        <TweakToggle label="Show ingestion pipeline" value={t.showSync}
          onChange={(v) => setTweak('showSync', v)} />
      </TweaksPanel>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        a { color: inherit; }
        @media (max-width: 1100px) {
          section[style*="grid-template-columns: 2fr 1fr"],
          section[style*="grid-template-columns: 1.4fr 1fr"],
          section[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
