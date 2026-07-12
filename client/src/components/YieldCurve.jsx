import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { colors, fonts } from '../styles/theme';
import InfoTooltip from './InfoTooltip';

const SERIES_META = [
  { key: 'yield', label: 'today', color: '#FBBF24' },
  { key: 'm1', label: '1m ago', color: '#8899aa' },
  { key: 'y1', label: '1y ago', color: '#4a5d7d' },
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const byKey = Object.fromEntries(payload.map(p => [p.dataKey, p.value]));
  return (
    <div style={{
      background: '#0f1729',
      border: `1px solid ${colors.bg.border}`,
      borderRadius: 6,
      padding: '8px 12px',
      fontSize: 12,
      fontFamily: fonts.mono,
    }}>
      <div style={{ color: colors.text.muted, marginBottom: 4 }}>{label}</div>
      {SERIES_META.filter(s => byKey[s.key] != null).map(s => (
        <div key={s.key} style={{ color: s.key === 'yield' ? colors.text.primary : colors.text.secondary, fontWeight: s.key === 'yield' ? 600 : 400 }}>
          <span style={{ color: s.color }}>●</span> {s.label}: {byKey[s.key].toFixed(2)}%
        </div>
      ))}
    </div>
  );
}

// history: optional { m1: { date, '2y': ... }, y1: {...} } — faded ghost
// curves showing how the curve has shifted over 1 month / 1 year.
export default function YieldCurve({ yields, history }) {
  if (!yields) return null;

  const data = [
    { maturity: '2Y', k: '2y' },
    { maturity: '5Y', k: '5y' },
    { maturity: '10Y', k: '10y' },
    { maturity: '20Y', k: '20y' },
    { maturity: '30Y', k: '30y' },
  ].map(({ maturity, k }) => ({
    maturity,
    yield: yields[k],
    m1: history?.m1?.[k] ?? null,
    y1: history?.y1?.[k] ?? null,
  })).filter(d => d.yield != null);

  const hasGhosts = data.some(d => d.m1 != null || d.y1 != null);

  const spread2s10s = (yields['10y'] != null && yields['2y'] != null)
    ? ((yields['10y'] - yields['2y']) * 100).toFixed(0)
    : null;

  const spread10s30s = (yields['30y'] != null && yields['10y'] != null)
    ? ((yields['30y'] - yields['10y']) * 100).toFixed(0)
    : null;

  return (
    <div style={{
      background: colors.bg.card,
      borderRadius: 12,
      padding: '20px',
      border: `1px solid ${colors.bg.border}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans }}>
          TREASURY YIELD CURVE
        </span>
        <InfoTooltip indicatorKey="yields" />
        {hasGhosts && (
          <span style={{ marginLeft: 12, fontSize: 10, fontFamily: fonts.mono }}>
            {SERIES_META.map(s => (
              <span key={s.key} style={{ color: s.color, marginRight: 10 }}>● {s.label}</span>
            ))}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
          {spread2s10s != null && (
            <span style={{ fontSize: 11, fontFamily: fonts.mono, color: parseInt(spread2s10s) < 0 ? '#EF4444' : colors.text.muted }}>
              2s10s: {spread2s10s}bp
            </span>
          )}
          {spread10s30s != null && (
            <span style={{ fontSize: 11, fontFamily: fonts.mono, color: parseInt(spread10s30s) < 0 ? '#EF4444' : colors.text.muted }}>
              10s30s: {spread10s30s}bp
            </span>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.chart.grid} />
          <XAxis
            dataKey="maturity"
            tick={{ fontSize: 11, fill: colors.chart.axis, fontFamily: fonts.mono }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: colors.chart.axis, fontFamily: fonts.mono }}
            domain={['auto', 'auto']}
            width={40}
            tickFormatter={v => v.toFixed(1)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="y1" stroke="#4a5d7d" strokeWidth={1.5} dot={{ fill: '#4a5d7d', r: 2.5 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="m1" stroke="#8899aa" strokeWidth={1.5} dot={{ fill: '#8899aa', r: 2.5 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
          <Line type="monotone" dataKey="yield" stroke="#FBBF24" strokeWidth={2.5} dot={{ fill: '#FBBF24', r: 4 }} activeDot={{ r: 6 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
