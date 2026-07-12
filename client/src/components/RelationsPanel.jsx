import React from 'react';
import { AreaChart, Area, YAxis, XAxis, ReferenceLine, Tooltip, ResponsiveContainer } from 'recharts';
import { colors, fonts, changeColor } from '../styles/theme';
import { fmtPct } from '../lib/format';
import { useChartModal } from '../context/ChartModalContext';
import { toTvSymbol } from '../lib/tv';
import Pct from './Pct';
import InfoTooltip from './InfoTooltip';

// Ratio magnitudes vary wildly (SPY/TLT ~7, copper/gold ~0.001, BTC/gold ~35):
// keep ~4 significant digits whatever the scale.
export function fmtRatio(v) {
  if (v == null || !isFinite(v)) return '--';
  if (v >= 100) return v.toFixed(1);
  if (v >= 10) return v.toFixed(2);
  if (v >= 1) return v.toFixed(3);
  return v.toPrecision(3);
}

function RatioTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div style={{ background: '#0f1729', border: `1px solid ${colors.bg.border}`, borderRadius: 6, padding: '6px 10px', fontSize: 11, fontFamily: fonts.mono, whiteSpace: 'nowrap' }}>
      <div style={{ color: colors.text.muted }}>{p.d}</div>
      <div style={{ color: colors.text.primary }}>{fmtRatio(p.v)}</div>
    </div>
  );
}

function RelationCard({ rel }) {
  const { open } = useChartModal();
  const series = rel.series || [];
  const values = series.map(p => p.v);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = (max - min || max * 0.02 || 1) * 0.08;
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

  const rising = rel.pct20d != null ? rel.pct20d >= 0 : null;
  const meaning = rising == null ? null : rising ? rel.up : rel.down;
  const tvSym = `${toTvSymbol(rel.num)}/${toTvSymbol(rel.den)}`;

  return (
    <div
      onClick={() => open(tvSym)}
      title={`Open ${rel.label} chart`}
      style={{
        background: colors.bg.card,
        border: `1px solid ${colors.bg.border}`,
        borderRadius: 12,
        padding: '14px 16px 10px',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, letterSpacing: 0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {rel.title.toUpperCase()}
        </div>
        <div style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.mono, whiteSpace: 'nowrap' }}>{rel.label}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '4px 0 2px' }}>
        <span style={{ fontSize: 17, fontWeight: 600, color: colors.text.primary, fontFamily: fonts.mono }}>
          {fmtRatio(rel.value)}
        </span>
        <Pct value={rel.dayPct} size={10} />
        <span style={{ fontSize: 10, fontFamily: fonts.mono, color: changeColor(rel.pct20d) }}>
          {fmtPct(rel.pct20d, 1)} <span style={{ color: colors.text.muted }}>20d</span>
        </span>
      </div>

      {series.length >= 3 ? (
        <div style={{ height: 64, margin: '2px -6px 0' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 6, bottom: 0, left: 6 }}>
              <YAxis hide domain={[min - pad, max + pad]} />
              <XAxis hide dataKey="d" />
              {mean != null && (
                <ReferenceLine y={mean} stroke={colors.chart.grid} strokeWidth={1} />
              )}
              <Tooltip content={<RatioTooltip />} cursor={{ stroke: colors.text.muted, strokeWidth: 1 }} isAnimationActive={false} />
              <Area
                type="monotone" dataKey="v"
                stroke={colors.text.accent} strokeWidth={2}
                fill={colors.text.accent} fillOpacity={0.1}
                dot={false} activeDot={{ r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono }}>
          history loading…
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 2 }}>
        <span>{series[0]?.d ?? ''}</span>
        <span>{series[series.length - 1]?.d ?? ''}</span>
      </div>

      {meaning && (
        <div style={{ fontSize: 10, fontFamily: fonts.sans, color: colors.text.secondary, marginTop: 6, lineHeight: 1.35 }}>
          <span style={{ color: changeColor(rel.pct20d), fontFamily: fonts.mono }}>{rising ? '▲' : '▼'}</span>{' '}
          {meaning}
        </div>
      )}
    </div>
  );
}

// Market Relations: the classic cross-asset ratios as small-multiple trend
// charts — what is leading what, over the last ~60 sessions.
export default function RelationsPanel({ relations }) {
  const macro = (relations || []).filter(r => r.group === 'macro' && (r.value != null || r.series));
  if (!macro.length) {
    return (
      <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 20, fontSize: 12, color: colors.text.muted, fontFamily: fonts.mono }}>
        MARKET RELATIONS — computing (available after the daily history pass, ~15 min after server start).
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 600, color: colors.text.muted, fontFamily: fonts.sans, letterSpacing: 1, margin: '4px 0 8px' }}>
        MARKET RELATIONS — LAST 60 SESSIONS
        <InfoTooltip indicatorKey="relations" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
        {macro.map(r => <RelationCard key={r.id} rel={r} />)}
      </div>
    </div>
  );
}
