import React from 'react';
import { AreaChart, Area, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer } from 'recharts';
import { colors, fonts } from '../styles/theme';
import InfoTooltip from './InfoTooltip';

// Diverging fill: red (−1) ← neutral near-surface → blue (+1).
// Poles validated ≥5:1 against the light in-cell ink (dataviz contrast check).
const NEUTRAL = [21, 30, 51];    // #151e33
const POLE_POS = [29, 78, 216];  // #1d4ed8
const POLE_NEG = [185, 28, 28];  // #b91c1c

function cellColor(corr) {
  if (corr == null) return colors.bg.card;
  const pole = corr >= 0 ? POLE_POS : POLE_NEG;
  const t = Math.min(1, Math.abs(corr)) ** 0.9;
  const rgb = NEUTRAL.map((n, i) => Math.round(n + (pole[i] - n) * t));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function cellInk(corr) {
  return corr != null && Math.abs(corr) >= 0.25 ? colors.text.primary : colors.text.secondary;
}

function fmtCorr(corr) {
  if (corr == null) return '·';
  const s = Math.abs(corr).toFixed(2).replace(/^0/, '');
  return `${corr < 0 ? '−' : ''}${s}`;
}

// Cross-asset correlation heatmap: 30d daily-return correlations. The fast
// read: is TLT still hedging SPX (negative = yes), is BTC trading like NDX,
// is gold moving with or against the dollar.
export default function CorrelationMatrix({ correlations }) {
  if (!correlations?.assets?.length) {
    return (
      <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 20, fontSize: 12, color: colors.text.muted, fontFamily: fonts.mono }}>
        CROSS-ASSET CORRELATIONS — computing (available after the daily history pass).
      </div>
    );
  }

  const { assets, matrix, window: win } = correlations;
  const n = assets.length;

  return (
    <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans }}>
          CROSS-ASSET CORRELATIONS — {win}D
          <InfoTooltip indicatorKey="correlations" />
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9, color: colors.text.muted, fontFamily: fonts.mono }}>
          −1
          <span style={{
            width: 90, height: 8, borderRadius: 4,
            background: `linear-gradient(90deg, ${cellColor(-1)}, ${cellColor(0)} 50%, ${cellColor(1)})`,
          }} />
          +1
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: `56px repeat(${n}, minmax(40px, 1fr))`,
          gap: 2,
          minWidth: n * 44 + 56,
        }}>
          <div />
          {assets.map(a => (
            <div key={`c-${a.symbol}`} style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.mono, textAlign: 'center', padding: '2px 0' }}>
              {a.label}
            </div>
          ))}
          {assets.map((row, i) => (
            <React.Fragment key={`r-${row.symbol}`}>
              <div style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.mono, display: 'flex', alignItems: 'center' }}>
                {row.label}
              </div>
              {assets.map((col, j) => {
                const corr = matrix[i][j];
                const diagonal = i === j;
                return (
                  <div
                    key={`${row.symbol}-${col.symbol}`}
                    title={diagonal ? row.label : `${row.label} vs ${col.label}: ${corr == null ? 'n/a' : (corr >= 0 ? '+' : '') + corr.toFixed(2)} (${win}d returns)`}
                    style={{
                      background: diagonal ? colors.bg.secondary : cellColor(corr),
                      color: diagonal ? colors.text.muted : cellInk(corr),
                      fontSize: 9.5,
                      fontFamily: fonts.mono,
                      textAlign: 'center',
                      padding: '7px 0',
                      borderRadius: 3,
                    }}
                  >
                    {diagonal ? '—' : fmtCorr(corr)}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.sans, marginTop: 8, lineHeight: 1.4 }}>
        Blue = move together, red = move opposite. Key reads: SPX·TLT red means bonds still hedge stocks;
        SPX·TLT blue with both falling is the 2022-style everything-drawdown; BTC·NDX blue means crypto is trading as a risk asset.
      </div>

      <SpxTltRegime spxTlt={correlations.spxTlt} />
    </div>
  );
}

function RegimeTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div style={{ background: '#0f1729', border: `1px solid ${colors.bg.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, fontFamily: fonts.mono, whiteSpace: 'nowrap' }}>
      <div style={{ color: colors.text.muted }}>{p.d}</div>
      <div style={{ color: colors.text.primary }}>{(p.v >= 0 ? '+' : '') + p.v.toFixed(2)}</div>
    </div>
  );
}

// Rolling 30-session SPX·TLT correlation: the stock-bond regime line. Above
// zero, Treasuries stop hedging equities — the single most important
// correlation for a duration playbook.
function SpxTltRegime({ spxTlt }) {
  if (!spxTlt?.series?.length) return null;
  const positive = spxTlt.value > 0;
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${colors.bg.border}`, paddingTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans }}>
          SPX·TLT ROLLING 30D — STOCK-BOND REGIME
        </span>
        <span style={{ fontSize: 11, fontFamily: fonts.mono, color: positive ? colors.regime.STRESS : colors.regime.CALM }}>
          {(spxTlt.value >= 0 ? '+' : '') + spxTlt.value.toFixed(2)} — {positive ? 'bonds NOT hedging stocks' : 'bonds hedge stocks'}
        </span>
      </div>
      <div style={{ height: 90, margin: '4px -6px 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={spxTlt.series} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
            <YAxis hide domain={[-1, 1]} />
            <XAxis hide dataKey="d" />
            <ReferenceLine y={0} stroke={colors.text.muted} strokeWidth={1} />
            <Tooltip content={<RegimeTooltip />} cursor={{ stroke: colors.text.muted, strokeWidth: 1 }} isAnimationActive={false} />
            <Area
              type="monotone" dataKey="v"
              stroke={colors.text.accent} strokeWidth={2}
              fill={colors.text.accent} fillOpacity={0.1}
              dot={false} activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
              baseValue={0}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 2 }}>
        <span>{spxTlt.series[0]?.d}</span>
        <span>above 0 = 2022-style regime · below 0 = normal hedge</span>
        <span>{spxTlt.series[spxTlt.series.length - 1]?.d}</span>
      </div>
    </div>
  );
}
