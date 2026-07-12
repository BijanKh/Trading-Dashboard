import React from 'react';
import { colors, fonts } from '../styles/theme';
import { fmtPrice } from '../lib/format';
import Pct from './Pct';
import Sparkline from './Sparkline';

function fgColor(score) {
  if (score == null) return colors.text.muted;
  if (score <= 25) return colors.regime.CRISIS;      // extreme fear
  if (score <= 45) return colors.regime.STRESS;      // fear
  if (score <= 55) return colors.text.secondary;     // neutral
  if (score <= 75) return colors.regime.CALM;        // greed
  return colors.regime.ELEVATED;                     // extreme greed
}

// Ordinal suffix for percentile display: 28th, 91st, 2nd.
function pctileLabel(p) {
  if (p == null) return null;
  const mod10 = p % 10, mod100 = p % 100;
  const suffix = mod10 === 1 && mod100 !== 11 ? 'st'
    : mod10 === 2 && mod100 !== 12 ? 'nd'
    : mod10 === 3 && mod100 !== 13 ? 'rd' : 'th';
  return `${p}${suffix} %ile 1y`;
}

// Volatility & sentiment: VIX, VIX3M, term structure ratio, MOVE, Fear & Greed.
// history: optional 30d series bundle for sparklines.
// pctiles: optional 1y percentile context per value.
export default function VolPanel({ volatility, fearGreed, history, pctiles }) {
  const bySym = Object.fromEntries((volatility || []).map(q => [q.symbol, q]));
  const vix = bySym['^VIX'];
  const vix3m = bySym['^VIX3M'];
  const move = bySym['^MOVE'];

  const termRatio = vix?.price && vix3m?.price ? vix.price / vix3m.price : null;
  const backwardation = termRatio != null && termRatio > 1;

  const cell = (label, valueNode, subNode, spark, pctile) => (
    <div key={label} style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.sans, marginBottom: 2, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: colors.text.primary, fontFamily: fonts.mono }}>{valueNode}</div>
      {subNode && <div style={{ fontSize: 10, fontFamily: fonts.mono, marginTop: 1 }}>{subNode}</div>}
      {pctile != null && (
        <div style={{ fontSize: 9, fontFamily: fonts.mono, color: pctile >= 80 ? colors.regime.STRESS : colors.text.muted, marginTop: 1, whiteSpace: 'nowrap' }}>
          {pctileLabel(pctile)}
        </div>
      )}
      {spark && <div style={{ marginTop: 4 }}>{spark}</div>}
    </div>
  );

  return (
    <div style={{
      background: colors.bg.card,
      border: `1px solid ${colors.bg.border}`,
      borderRadius: 12,
      padding: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 12 }}>
        VOLATILITY &amp; SENTIMENT
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 14 }}>
        {cell('VIX', fmtPrice(vix?.price), <Pct value={vix?.dayPct} size={10} />,
          <Sparkline data={history?.vix} />, pctiles?.vix)}
        {cell('VIX 3M', fmtPrice(vix3m?.price), <Pct value={vix3m?.dayPct} size={10} />, null, pctiles?.vix3m)}
        {cell('VIX/VIX3M',
          <span style={{ color: backwardation ? colors.regime.STRESS : colors.text.primary }}>
            {termRatio != null ? termRatio.toFixed(3) : '--'}
          </span>,
          <span style={{ color: backwardation ? colors.regime.STRESS : colors.text.muted }}>
            {termRatio == null ? '' : backwardation ? 'BACKWARDATION — stress' : 'contango — normal'}
          </span>,
          <Sparkline data={history?.termRatio} color={backwardation ? colors.regime.STRESS : colors.text.accent} />,
          pctiles?.termRatio
        )}
        {cell('MOVE', fmtPrice(move?.price), <Pct value={move?.dayPct} size={10} />,
          <Sparkline data={history?.move} />, pctiles?.move)}
        {fearGreed && cell('Fear & Greed',
          <span style={{ color: fgColor(fearGreed.score) }}>{fearGreed.score}</span>,
          <span style={{ color: colors.text.secondary, textTransform: 'uppercase' }}>
            {fearGreed.rating}{fearGreed.previousWeek != null ? ` · wk ago ${fearGreed.previousWeek}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
