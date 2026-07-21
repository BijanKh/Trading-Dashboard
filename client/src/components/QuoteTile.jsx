import React from 'react';
import { colors, fonts } from '../styles/theme';
import { fmtPrice } from '../lib/format';
import Pct from './Pct';
import { useChartModal } from '../context/ChartModalContext';
import { toTvSymbol } from '../lib/tv';

// Compact stat tile: label, price, day %, optional WTD % underneath.
// badge: small amber tag (e.g. "E 3d" for earnings in 3 days).
// Click opens a TradingView chart for the symbol.
export default function QuoteTile({ quote, showWtd = false, badge = null }) {
  const { open } = useChartModal();
  if (!quote) return null;
  return (
    <div onClick={() => open(toTvSymbol(quote.symbol), quote.price ?? null)} style={{
      background: colors.bg.card,
      border: `1px solid ${colors.bg.border}`,
      borderRadius: 10,
      padding: '10px 14px',
      minWidth: 0,
      cursor: 'pointer',
    }}>
      <div style={{
        fontSize: 11,
        color: colors.text.secondary,
        fontFamily: fonts.sans,
        marginBottom: 4,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {quote.label}
        {badge && (
          <span style={{
            marginLeft: 6,
            color: colors.regime.ELEVATED,
            fontFamily: fonts.mono,
            fontSize: 9,
            fontWeight: 700,
            border: `1px solid ${colors.regime.ELEVATED}`,
            borderRadius: 4,
            padding: '1px 4px',
            verticalAlign: 'middle',
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: colors.text.primary, fontFamily: fonts.mono }}>
          {fmtPrice(quote.price, quote.dec)}
        </span>
        <Pct value={quote.dayPct} />
      </div>
      {showWtd && (
        <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 2 }}>
          <div>WTD <Pct value={quote.wtdPct} size={10} /></div>
          <div>YTD <Pct value={quote.ytdPct} size={10} /></div>
        </div>
      )}
    </div>
  );
}
