import React, { useState } from 'react';
import { colors, fonts } from '../styles/theme';
import { fmtPrice } from '../lib/format';

// Inline SVG candle chart with the 12 EMA and horizontal structure levels
// (last higher low = "hold", last lower high = "break"). Same drawing
// approach as HoverChart, sized for a panel instead of a popover.

const PAD_L = 8, PAD_R = 62, PAD_T = 10, PAD_B = 22;

export default function CandleChart({ title, sub, bars, ema12, levels = [], height = 260 }) {
  const [hover, setHover] = useState(null);
  if (!bars || bars.length < 5) return null;
  const W = 640, H = height;
  const n = bars.length;
  const highs = bars.map(b => b[2]), lows = bars.map(b => b[3]);
  const lvlVals = levels.filter(l => l.price != null).map(l => l.price);
  const all = [...highs, ...lows, ...ema12.filter(v => v != null), ...lvlVals];
  let min = Math.min(...all), max = Math.max(...all);
  const padY = (max - min) * 0.04 || 1;
  min -= padY; max += padY;
  const span = max - min;
  const px = (i) => PAD_L + (i / (n - 1)) * (W - PAD_L - PAD_R);
  const py = (v) => PAD_T + (1 - (v - min) / span) * (H - PAD_T - PAD_B);
  const step = (W - PAD_L - PAD_R) / (n - 1);
  const bodyW = Math.max(1.5, Math.min(9, step * 0.7));
  const last = bars[n - 1][4];

  const emaPath = ema12.reduce((d, v, i) => v == null ? d : d + `${d ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)} `, '');

  // x-axis ticks: ~6 dates
  const tickIdx = Array.from({ length: 6 }, (_, k) => Math.round(k * (n - 1) / 5));
  const dstr = (t) => new Date(t).toISOString().slice(0, 10);

  function onMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const i = Math.round((x - PAD_L) / step);
    setHover(i >= 0 && i < n ? i : null);
  }

  const hb = hover != null ? bars[hover] : null;

  return (
    <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: '10px 12px 6px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 12 }}>
        <span style={{ fontFamily: fonts.sans, fontSize: 13, fontWeight: 600, color: colors.text.primary }}>
          {title}<span style={{ marginLeft: 8, fontWeight: 400, fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono }}>{sub}</span>
        </span>
        <span style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.text.muted, whiteSpace: 'nowrap' }}>
          {hb ? `${dstr(hb[0])}  O ${fmtPrice(hb[1])} H ${fmtPrice(hb[2])} L ${fmtPrice(hb[3])} C ${fmtPrice(hb[4])}` : `last ${fmtPrice(last)}`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {/* levels */}
        {levels.filter(l => l.price != null).map((l, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={W - PAD_R} y1={py(l.price)} y2={py(l.price)} stroke={l.color} strokeWidth="1" strokeDasharray={l.dash || '4 3'} opacity="0.85" />
            <text x={W - PAD_R + 4} y={py(l.price) + 3} fill={l.color} fontSize="9" fontFamily={fonts.mono}>{l.label} {fmtPrice(l.price)}</text>
          </g>
        ))}
        {/* candles */}
        {bars.map(([t, o, h, l, c], i) => {
          const cx = px(i);
          const color = c >= o ? colors.updown.up : colors.updown.down;
          const top = py(Math.max(o, c)), bot = py(Math.min(o, c));
          return (
            <g key={i} opacity={hover == null || hover === i ? 1 : 0.75}>
              <line x1={cx} x2={cx} y1={py(h)} y2={py(l)} stroke={color} strokeWidth="1" />
              <rect x={cx - bodyW / 2} y={top} width={bodyW} height={Math.max(1, bot - top)} fill={color} />
            </g>
          );
        })}
        <path d={emaPath} fill="none" stroke={colors.regime.ELEVATED} strokeWidth="1.4" opacity="0.9" />
        {hover != null && <line x1={px(hover)} x2={px(hover)} y1={PAD_T} y2={H - PAD_B} stroke={colors.text.muted} strokeWidth="1" strokeDasharray="2 3" />}
        {/* last price */}
        <line x1={PAD_L} x2={W - PAD_R} y1={py(last)} y2={py(last)} stroke={colors.text.secondary} strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
        <text x={W - PAD_R + 4} y={py(last) + 3} fill={colors.text.secondary} fontSize="9" fontFamily={fonts.mono}>{fmtPrice(last)}</text>
        {/* x ticks */}
        {tickIdx.map(i => (
          <text key={i} x={px(i)} y={H - 6} fill={colors.text.muted} fontSize="9" fontFamily={fonts.mono} textAnchor="middle">{dstr(bars[i][0]).slice(0, 7)}</text>
        ))}
      </svg>
      <div style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.text.muted, marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span><span style={{ color: colors.regime.ELEVATED }}>—</span> 12 EMA</span>
        {levels.filter(l => l.price != null).map((l, i) => <span key={i}><span style={{ color: l.color }}>- -</span> {l.legend || l.label}</span>)}
      </div>
    </div>
  );
}
