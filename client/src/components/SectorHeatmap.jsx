import React, { useRef, useState } from 'react';
import { colors, fonts } from '../styles/theme';
import { fmtPct } from '../lib/format';
import HoverChart from './HoverChart';

// Diverging polarity tiles: green–neutral–red around 0, alpha scaled by |pct|
// capped per horizon (±3% daily/weekly, ±20% YTD). Every tile shows its
// signed value, so color is never the only encoding.
function tileBg(pct, cap) {
  if (pct == null || !isFinite(pct)) return colors.bg.card;
  const t = Math.min(Math.abs(pct), cap) / cap;
  const alpha = 0.08 + t * 0.42;
  return pct >= 0
    ? `rgba(16, 185, 129, ${alpha.toFixed(3)})`
    : `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
}

export default function SectorHeatmap({ quotes, mode = 'day', compact = false }) {
  const field = mode === 'wtd' ? 'wtdPct' : mode === 'ytd' ? 'ytdPct' : 'dayPct';
  const cap = mode === 'ytd' ? 0.20 : 0.03;
  // Tiles with a `spark` OHLC tail show an instant candle popover on hover
  // (after a short delay so sweeping the grid doesn't flicker).
  const [hover, setHover] = useState(null); // { q, x, y }
  const hoverTimer = useRef(null);

  function onTileEnter(q, e) {
    if (!q.spark) return;
    const x = e.clientX, y = e.clientY;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover({ q, x, y }), 180);
  }
  function onTileLeave() {
    clearTimeout(hoverTimer.current);
    setHover(null);
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? 96 : 128}px, 1fr))`,
      gap: 6,
    }}>
      {quotes.map(q => (
        <div
          key={q.symbol}
          onMouseEnter={q.spark ? (e) => onTileEnter(q, e) : undefined}
          onMouseLeave={q.spark ? onTileLeave : undefined}
          style={{
            background: tileBg(q[field], cap),
            border: `1px solid ${colors.bg.border}`,
            borderRadius: 8,
            padding: compact ? '8px 10px' : '12px 12px',
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: compact ? 11 : 12, fontWeight: 600, color: colors.text.primary, fontFamily: fonts.mono }}>
            {q.symbol}
          </div>
          {!compact && (
            <div style={{ fontSize: 10, color: colors.text.secondary, fontFamily: fonts.sans, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {q.label}
            </div>
          )}
          <div style={{ fontSize: compact ? 11 : 13, color: colors.text.primary, fontFamily: fonts.mono, marginTop: 2 }}>
            {fmtPct(q[field])}
          </div>
        </div>
      ))}
      {hover && (
        <HoverChart
          symbol={hover.q.symbol}
          closes={hover.q.spark}
          tf={hover.q.sparkTf}
          x={hover.x}
          y={hover.y}
        />
      )}
    </div>
  );
}
