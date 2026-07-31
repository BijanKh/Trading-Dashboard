import React, { useState } from 'react';
import { colors, fonts } from '../styles/theme';
import { useQuotes } from '../context/QuotesContext';
import SectorHeatmap from '../components/SectorHeatmap';
import QuoteTable from '../components/QuoteTable';
import RRGChart from '../components/RRGChart';
import SectorScreener from '../components/SectorScreener';

function Toggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${colors.bg.border}`, borderRadius: 6, overflow: 'hidden' }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            background: value === opt.value ? colors.bg.cardHover : 'transparent',
            color: value === opt.value ? colors.text.accent : colors.text.secondary,
            border: 'none',
            padding: '6px 14px',
            cursor: 'pointer',
            fontFamily: fonts.mono,
            fontSize: 11,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// Sector screener — replicates the TradingView sector + sector/SPY watchlists,
// with daily % and week-to-date % for each.
export default function SectorsTab() {
  const { quotes } = useQuotes();
  const [mode, setMode] = useState('day');

  if (!quotes) {
    return <div style={{ color: colors.text.muted, fontFamily: fonts.mono, padding: 40, textAlign: 'center' }}>Loading market data...</div>;
  }

  const sectors = quotes.groups.sectors || [];
  const sectorRatios = (quotes.ratios || []).filter(r => r.group === 'sectorRatio');

  const sectorRows = sectors.map(q => ({
    id: q.symbol,
    chartSym: q.symbol,
    symbol: q.symbol,
    label: q.label,
    price: q.price,
    dayPct: q.dayPct,
    wtdPct: q.wtdPct,
    ytdPct: q.ytdPct,
    d50Pct: q.price != null && q.sma50 != null ? q.price / q.sma50 - 1 : null,
    d200Pct: q.price != null && q.sma200 != null ? q.price / q.sma200 - 1 : null,
    dec: q.dec,
  }));

  const ratioRows = sectorRatios.map(r => ({
    id: r.id,
    chartSym: r.label,
    symbol: r.label,
    price: r.value,
    dayPct: r.dayPct,
    wtdPct: r.wtdPct,
    ytdPct: r.ytdPct,
    dec: r.dec,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.text.muted, fontFamily: fonts.sans, letterSpacing: 1 }}>
          SECTOR HEATMAP — {mode === 'day' ? 'TODAY' : mode === 'wtd' ? 'WEEK TO DATE' : 'YEAR TO DATE'}
        </div>
        <Toggle
          options={[{ value: 'day', label: 'DAY' }, { value: 'wtd', label: 'WEEK' }, { value: 'ytd', label: 'YTD' }]}
          value={mode}
          onChange={setMode}
        />
      </div>

      <SectorHeatmap quotes={sectors} mode={mode} />

      <RRGChart rrg={quotes.rrg} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, alignItems: 'start' }}>
        <QuoteTable
          title="SECTOR ETFs"
          columns={[
            { key: 'symbol', label: 'SYM', type: 'text' },
            { key: 'label', label: 'NAME', type: 'text' },
            { key: 'price', label: 'LAST', type: 'price' },
            { key: 'dayPct', label: 'DAY', type: 'pct' },
            { key: 'wtdPct', label: 'WTD', type: 'pct' },
            { key: 'ytdPct', label: 'YTD', type: 'pct' },
            { key: 'd50Pct', label: 'Δ50d', type: 'pct' },
            { key: 'd200Pct', label: 'Δ200d', type: 'pct' },
          ]}
          rows={sectorRows}
        />
        <QuoteTable
          title="SECTOR vs SPY (relative strength)"
          columns={[
            { key: 'symbol', label: 'PAIR', type: 'text' },
            { key: 'price', label: 'RATIO', type: 'price' },
            { key: 'dayPct', label: 'DAY', type: 'pct' },
            { key: 'wtdPct', label: 'WTD', type: 'pct' },
            { key: 'ytdPct', label: 'YTD', type: 'pct' },
          ]}
          rows={ratioRows}
        />
      </div>

      <SectorScreener />
    </div>
  );
}
