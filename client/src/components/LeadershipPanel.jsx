import React from 'react';
import { colors, fonts } from '../styles/theme';
import Pct from './Pct';
import Sparkline from './Sparkline';
import InfoTooltip from './InfoTooltip';

const LABELS = {
  rsp_spy: 'Equal-Weight vs S&P 500',
  qqq_spy: 'Nasdaq 100 vs S&P 500',
  iwm_spy: 'Small Caps vs S&P 500',
};

// Style-leadership ratios: which part of the market is driving. Sparklines
// show the last ~60 sessions of each ratio (from the relations series).
export default function LeadershipPanel({ ratios, relations }) {
  const seriesById = Object.fromEntries(
    (relations || []).filter(r => r.series).map(r => [r.id, r.series.map(p => ({ date: p.d, value: p.v }))])
  );

  return (
    <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 12 }}>
        LEADERSHIP
        <InfoTooltip indicatorKey="leadership" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(ratios || []).map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, color: colors.text.secondary, fontFamily: fonts.sans, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {LABELS[r.id] || r.label}
              </div>
              <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono }}>{r.label}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
              <Sparkline data={seriesById[r.id]} width={64} height={20} />
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 12, color: colors.text.primary, fontFamily: fonts.mono, marginRight: 8 }}>
                  {r.value != null ? r.value.toFixed(4) : '--'}
                </span>
                <Pct value={r.dayPct} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
