import React from 'react';
import { colors, fonts } from '../styles/theme';
import { fmtPrice } from '../lib/format';

// Instant chart popover for table-row hover: candles (when the row ships
// [o,h,l,c] tuples) or a close line (legacy close-only series) + 12 EMA
// overlay, rendered from a series tail shipped with the row (no network).
// Positioned near the cursor, clamped to the viewport.

const W = 420, H = 170, PAD = 8;

function emaSeries(values, period = 12) {
  if (values.length < period) return [];
  const out = new Array(period - 1).fill(null);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(e);
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

export default function HoverChart({ symbol, closes, tf, x, y }) {
  if (!closes || closes.length < 15) return null;
  const weekly = tf === 'week' || tf === 'swing';

  const ohlc = Array.isArray(closes[0]);
  const candles = ohlc ? closes : null;
  const closeVals = ohlc ? closes.map(c => c[3]) : closes;

  const ema = emaSeries(closeVals);
  const all = [
    ...(ohlc ? candles.flatMap(c => [c[1], c[2]]) : closeVals),
    ...ema.filter(v => v != null),
  ];
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const px = (i) => PAD + (i / (closeVals.length - 1)) * (W - 2 * PAD);
  const py = (v) => H - PAD - ((v - min) / span) * (H - 2 * PAD);
  const path = (vals) => {
    let d = '', started = false;
    vals.forEach((v, i) => {
      if (v == null) return;
      d += `${started ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)} `;
      started = true;
    });
    return d;
  };

  const last = closeVals[closeVals.length - 1];
  const first = closeVals[0];
  const chg = last / first - 1;
  const up = last >= first;

  // Candle geometry: body fills most of the per-bar step, min 1px
  const step = (W - 2 * PAD) / (closeVals.length - 1);
  const bodyW = Math.max(1, Math.min(6, step - 1.2));

  // Clamp popover inside the viewport, offset from the cursor
  const vw = window.innerWidth, vh = window.innerHeight;
  const left = Math.min(x + 18, vw - W - 24);
  const top = Math.min(y + 14, vh - H - 70);

  return (
    <div style={{
      position: 'fixed', left, top, zIndex: 30000, pointerEvents: 'none',
      background: colors.bg.card, border: `1px solid ${colors.bg.border}`,
      borderRadius: 10, padding: '8px 10px', boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, gap: 16 }}>
        <span style={{ fontFamily: fonts.mono, fontSize: 12, fontWeight: 700, color: colors.text.primary }}>
          {symbol}
          <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 10, color: colors.text.muted }}>
            {weekly ? `W · ${closeVals.length} wks` : `D · ${closeVals.length} sess`}
          </span>
        </span>
        <span style={{ fontFamily: fonts.mono, fontSize: 11, color: up ? colors.updown.up : colors.updown.down }}>
          {fmtPrice(last, 2)} ({chg >= 0 ? '+' : ''}{(chg * 100).toFixed(1)}% period)
        </span>
      </div>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <line x1={PAD} x2={W - PAD} y1={py(last)} y2={py(last)}
          stroke={colors.text.muted} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        {ohlc ? candles.map(([o, h, l, c], i) => {
          const cx = px(i);
          const color = c >= o ? colors.updown.up : colors.updown.down;
          const top = py(Math.max(o, c)), bot = py(Math.min(o, c));
          return (
            <g key={i}>
              <line x1={cx} x2={cx} y1={py(h)} y2={py(l)} stroke={color} strokeWidth="1" opacity="0.85" />
              <rect x={cx - bodyW / 2} y={top} width={bodyW}
                height={Math.max(1, bot - top)} fill={color} />
            </g>
          );
        }) : (
          <path d={path(closeVals)} fill="none" stroke={up ? colors.updown.up : colors.updown.down} strokeWidth="1.6" strokeLinejoin="round" />
        )}
        <path d={path(ema)} fill="none" stroke={colors.regime.ELEVATED} strokeWidth="1.3" opacity="0.9" />
      </svg>
      <div style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.text.muted, marginTop: 3 }}>
        <span style={{ color: colors.regime.ELEVATED }}>—</span> 12 EMA ({weekly ? 'weekly' : 'daily'})
      </div>
    </div>
  );
}
