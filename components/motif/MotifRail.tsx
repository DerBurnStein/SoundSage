// SoundSage — MotifRail
// Per-tab East Asian decorative band. Pure SVG, no data fetching.
// Renders different motifs based on the current tab.

import type { TabId } from '../../types';

interface MotifRailProps {
  tab: TabId;
}

export function MotifRail({ tab }: MotifRailProps) {
  const LABEL: Record<TabId, string> = {
    overview: '雲 · clouds',
    history:  '竹 · bamboo',
    patterns: '桜 · sakura',
    tracks:   '鳥居 · torii',
    artists:  '青海波 · seigaiha',
  };

  // Per-tab chip palette. The chip's *shape* stays identical across tabs
  // (same size / border weight / padding), but bg + outline + text all
  // pick up that tab's signature palette so the chip feels native to its
  // motif. Hardcoded — pulling from `var(--seal)` etc. would work but
  // ties the chip to the live subtheme overrides; literal hex keeps the
  // masthead feeling stable.
  const CHIP: Record<TabId, { bg: string; border: string; text: string }> = {
    overview: { bg: '#f0e8d6', border: '#14120e', text: '#3a342a' }, // washi + sumi
    history:  { bg: '#e8ecec', border: '#0b2545', text: '#0b2545' }, // ice + Hokusai navy
    patterns: { bg: '#fde7ec', border: '#c8456c', text: '#7a2a44' }, // pastel pink + crimson
    tracks:   { bg: '#f5e6d3', border: '#b8341f', text: '#7a2418' }, // kraft + vermilion
    artists:  { bg: '#f5ecd1', border: '#b08840', text: '#3a2a14' }, // washi + kincha gold
  };
  const chip = CHIP[tab];

  return (
    <div style={{
      position: 'relative', width: '100%', height: 96,
      background: 'var(--paper-2)',
      borderTop: '1px solid var(--rule)',
      borderBottom: '1px solid var(--rule)',
      overflow: 'hidden',
    }}>
      <svg viewBox="0 0 1200 96" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
        {tab === 'overview' && <CloudBands  />}
        {tab === 'history'  && <BambooGrove />}
        {tab === 'patterns' && <SakuraSprigs/>}
        {tab === 'tracks'   && <ToriiRow    />}
        {tab === 'artists'  && <Seigaiha    />}
      </svg>

      {/* Motif label chip — fixed structure (same size, padding, border
          weight) but the bg/outline/text are tab-themed via the CHIP map. */}
      <div style={{
        position: 'absolute', left: 18, bottom: 8,
        fontFamily: 'var(--font-mincho)',
        fontSize: 10, fontWeight: 500,
        letterSpacing: '0.4em', textTransform: 'uppercase',
        color: chip.text,
        background: chip.bg,
        border: `1px solid ${chip.border}`,
        padding: '4px 10px',
        lineHeight: 1.2,
      }}>
        {LABEL[tab] ?? ''}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// SVG sub-components — no props needed; use CSS vars.
// ─────────────────────────────────────────────────────

function CloudBands() {
  return (
    <g>
      <g transform="translate(80, 48)">
        <circle cx="0" cy="0" r="32" fill="none" stroke="var(--seal)" strokeWidth="3"
          strokeDasharray="155 30" strokeLinecap="round" transform="rotate(-30)" />
      </g>
      <g transform="translate(220, 26)" fill="var(--ink)" opacity="0.85">
        <path d="M 0 30 Q 0 14,18 14 Q 28 4,50 8 Q 70 0,90 10 Q 120 4,130 18 Q 150 14,154 30 Q 154 46,130 44 Q 110 50,90 44 Q 70 50,50 44 Q 28 50,18 42 Q 0 44,0 30 Z" />
        <path d="M 14 30 q 18 -8 36 0 t 36 0 t 36 0 t 32 0" fill="none" stroke="var(--paper)" strokeWidth="1.5" opacity="0.6" />
      </g>
      <g transform="translate(440, 50)" fill="var(--ink)" opacity="0.7">
        <path d="M 0 24 Q 0 10,16 10 Q 24 2,44 6 Q 62 0,78 8 Q 100 4,110 16 Q 130 14,132 26 Q 132 38,110 38 Q 92 42,78 36 Q 60 42,44 36 Q 24 42,16 34 Q 0 36,0 24 Z" />
        <path d="M 12 24 q 16 -6 32 0 t 32 0 t 32 0 t 24 0" fill="none" stroke="var(--paper)" strokeWidth="1.2" opacity="0.55" />
      </g>
      <g transform="translate(680, 30)" fill="var(--ink)" opacity="0.85">
        <path d="M 0 28 Q 0 12,18 12 Q 28 4,50 8 Q 70 0,90 10 Q 120 4,130 18 Q 152 14,156 30 Q 156 46,130 44 Q 110 50,90 44 Q 70 50,50 44 Q 28 50,18 42 Q 0 44,0 28 Z" />
        <path d="M 14 28 q 18 -8 36 0 t 36 0 t 36 0 t 32 0" fill="none" stroke="var(--paper)" strokeWidth="1.5" opacity="0.6" />
      </g>
      <circle cx="940" cy="36" r="14" fill="var(--seal)" opacity="0.85" />
      <g transform="translate(1080, 14)">
        <rect x="0" y="0" width="22" height="64" fill="none" stroke="var(--seal)" strokeWidth="1.5" />
        <text x="11" y="22" textAnchor="middle" fontFamily="var(--font-mincho)" fontSize="14" fill="var(--seal)">音</text>
        <text x="11" y="40" textAnchor="middle" fontFamily="var(--font-mincho)" fontSize="14" fill="var(--seal)">盤</text>
        <text x="11" y="58" textAnchor="middle" fontFamily="var(--font-mincho)" fontSize="14" fill="var(--seal)">録</text>
      </g>
    </g>
  );
}

function BambooGrove() {
  const stalks = [60, 130, 230, 310, 410, 530, 640, 760, 860, 1000, 1110];
  return (
    <g>
      {stalks.map((x, i) => (
        <g key={i} transform={`translate(${x}, 0)`}>
          <rect x="-3" y="0" width="6" height="96" fill="var(--ink)" opacity={0.55 + (i % 3) * 0.1} />
          {[14, 32, 52, 74].map((y, j) => <rect key={j} x="-5" y={y} width="10" height="2" fill="var(--ink)" opacity="0.85" />)}
          {i % 2 === 0 && (
            <g fill="var(--ink)" opacity="0.7">
              <path d={`M 4 ${20 + (i%3)*4} q 18 -6 26 -18 q -4 14 -22 22 z`} />
              <path d={`M -4 ${42 + (i%3)*4} q -18 -6 -26 -18 q 4 14 22 22 z`} />
            </g>
          )}
        </g>
      ))}
      <rect x="14" y="14" width="30" height="30" fill="var(--seal)" />
      <text x="29" y="36" textAnchor="middle" fontFamily="var(--font-mincho)" fontSize="20" fontWeight="700" fill="var(--paper)">歴</text>
    </g>
  );
}

function SakuraSprigs() {
  const blossoms = [
    {x:80,y:30,r:10},{x:110,y:60,r:8},{x:220,y:24,r:12},{x:260,y:56,r:9},
    {x:380,y:32,r:11},{x:420,y:64,r:7},{x:540,y:28,r:13},{x:580,y:60,r:9},
    {x:700,y:36,r:10},{x:740,y:64,r:8},{x:860,y:28,r:12},{x:900,y:58,r:9},
    {x:1010,y:34,r:11},{x:1050,y:62,r:8},
  ];
  return (
    <g>
      <path d="M 0 76 q 200 -40 400 -8 t 400 0 t 400 -10" fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity="0.6" />
      {blossoms.map((b, i) => (
        <g key={i} transform={`translate(${b.x}, ${b.y})`}>
          {[0,72,144,216,288].map(a => (
            <ellipse key={a}
              cx={Math.cos((a-90)*Math.PI/180)*b.r*0.5} cy={Math.sin((a-90)*Math.PI/180)*b.r*0.5}
              rx={b.r*0.5} ry={b.r*0.7} fill="var(--seal)" opacity={0.75+(i%2)*0.2}
              transform={`rotate(${a} 0 0)`} />
          ))}
          <circle cx="0" cy="0" r={b.r*0.18} fill="var(--ink)" opacity="0.7" />
        </g>
      ))}
    </g>
  );
}

function ToriiRow() {
  const torii = [{x:80,s:1.0,o:1.0},{x:280,s:0.85,o:0.85},{x:460,s:0.7,o:0.7},
    {x:620,s:0.55,o:0.55},{x:760,s:0.45,o:0.4},{x:870,s:0.35,o:0.3},
    {x:960,s:0.28,o:0.22},{x:1030,s:0.22,o:0.18}];
  return (
    <g>
      <line x1="0" y1="78" x2="1200" y2="78" stroke="var(--ink)" strokeWidth="0.5" opacity="0.3" />
      {torii.map((t, i) => {
        const w=100*t.s, h=70*t.s, x=t.x, y=78-h;
        return (
          <g key={i} fill="var(--seal)" opacity={t.o}>
            <path d={`M ${x-w*.55} ${y} L ${x+w*.55} ${y} L ${x+w*.5} ${y+h*.1} L ${x-w*.5} ${y+h*.1} Z`} />
            <rect x={x-w*.45} y={y+h*.22} width={w*.9} height={h*.08} />
            <rect x={x-w*.4} y={y+h*.1} width={w*.1} height={h*.9} />
            <rect x={x+w*.3} y={y+h*.1} width={w*.1} height={h*.9} />
          </g>
        );
      })}
      <circle cx="1080" cy="70" r="22" fill="var(--seal)" opacity="0.4" />
    </g>
  );
}

function Seigaiha() {
  const cellW=28, cellH=16;
  const cols=Math.ceil(1200/cellW)+2, rows=Math.ceil(96/cellH)+2;
  const arcs=[];
  for (let r=0; r<rows; r++) {
    for (let c=0; c<cols; c++) {
      const cx=c*cellW-(r%2?cellW/2:0), cy=r*cellH;
      arcs.push(
        <g key={`${r}-${c}`}>
          <path d={`M ${cx-cellW*.5} ${cy} a ${cellW*.5} ${cellW*.5} 0 0 1 ${cellW} 0`} fill="none" stroke="var(--seal)" strokeWidth="1" opacity="0.45" />
          <path d={`M ${cx-cellW*.36} ${cy} a ${cellW*.36} ${cellW*.36} 0 0 1 ${cellW*.72} 0`} fill="none" stroke="var(--seal)" strokeWidth="1" opacity="0.35" />
          <path d={`M ${cx-cellW*.22} ${cy} a ${cellW*.22} ${cellW*.22} 0 0 1 ${cellW*.44} 0`} fill="none" stroke="var(--seal)" strokeWidth="1" opacity="0.25" />
        </g>
      );
    }
  }
  return <g>{arcs}</g>;
}
