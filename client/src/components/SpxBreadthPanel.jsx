import React from 'react';
import { colors, fonts } from '../styles/theme';
import InfoTooltip from './InfoTooltip';
import { BreadthRow } from './BreadthPanel';
import Sparkline from './Sparkline';

function oscColor(v) {
  if (v == null) return colors.text.muted;
  return v >= 0 ? colors.updown.up : colors.updown.down;
}

// % of S&P 500 index members above their own 20/50/200-day SMA,
// plus the McClellan Oscillator / Summation Index from the same members.
export default function SpxBreadthPanel({ spx, mcclellan, history }) {
  if (!spx) return null;
  const count = spx.count || 0;
  const mcc = mcclellan;
  const summRising = mcc && mcc.prevSummation != null ? mcc.summation > mcc.prevSummation : null;

  return (
    <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans }}>
        S&amp;P 500 BREADTH
        {spx.stale && <span style={{ marginLeft: 8, fontSize: 10, color: colors.regime.ELEVATED, fontFamily: fonts.mono }}>stale</span>}
        <InfoTooltip indicatorKey="spxBreadth" />
      </div>
      <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.sans, margin: '2px 0 12px' }}>
        % of {count} S&amp;P 500 stocks above their own moving average
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <BreadthRow label="> 20-day avg" pct={spx.pctAbove20} count={count} />
        <BreadthRow label="> 50-day avg" pct={spx.pctAbove50} count={count} />
        <BreadthRow label="> 200-day avg" pct={spx.pctAbove200} count={count} />
      </div>
      {spx.pctAbove20 == null && (
        <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 8 }}>
          20d loads in background (~10 min after server start)
        </div>
      )}
      {history?.spxAbove50?.length >= 3 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.sans, marginBottom: 2 }}>%{'>'}50d — 30 days</div>
          <Sparkline data={history.spxAbove50} width={140} />
        </div>
      )}

      <div style={{ borderTop: `1px solid ${colors.bg.border}`, marginTop: 12, paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans }}>
          MCCLELLAN OSCILLATOR
          <InfoTooltip indicatorKey="mcclellan" />
        </div>
        {mcc ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 600, fontFamily: fonts.mono, color: oscColor(mcc.osc) }}>
                {mcc.osc > 0 ? '+' : ''}{Math.round(mcc.osc)}
              </span>
              <span style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.text.muted }}>
                SUMM{' '}
                <span style={{ color: summRising == null ? colors.text.muted : summRising ? colors.updown.up : colors.updown.down }}>
                  {summRising == null ? '--' : summRising ? '▲ rising' : '▼ falling'}
                </span>
              </span>
              <span style={{ fontSize: 10, fontFamily: fonts.mono, color: colors.text.muted }}>
                A/D {mcc.adv}/{mcc.dec}
              </span>
            </div>
            {mcc.series?.length >= 3 && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 9, color: colors.text.muted, fontFamily: fonts.sans, marginBottom: 2 }}>
                  oscillator — {mcc.series.length} sessions
                </div>
                <Sparkline
                  data={mcc.series.map(p => ({ date: p.date, value: p.osc }))}
                  width={140}
                  height={30}
                  baseline={0}
                  posColor={colors.updown.up}
                  negColor={colors.updown.down}
                />
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 6 }}>
            computed by the daily pass (~10 min after server start)
          </div>
        )}
      </div>
    </div>
  );
}
