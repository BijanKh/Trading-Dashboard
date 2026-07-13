import React from 'react';
import { colors, fonts } from '../styles/theme';
import { useQuotes } from '../context/QuotesContext';
import QuoteTable from '../components/QuoteTable';

const SECTIONS = [
  { key: 'cmdEnergy', title: 'ENERGY' },
  { key: 'cmdPrecious', title: 'PRECIOUS METALS' },
  { key: 'cmdMiners', title: 'GOLD & SILVER MINERS' },
  { key: 'cmdBase', title: 'BASE METALS & MINING' },
  { key: 'cmdUranium', title: 'URANIUM & NUCLEAR' },
  { key: 'cmdBattery', title: 'BATTERY & STRATEGIC METALS' },
  { key: 'cmdAgri', title: 'AGRICULTURE' },
  { key: 'cmdBroad', title: 'BROAD COMMODITY' },
];

const COLUMNS = [
  { key: 'symbol', label: 'SYM', type: 'text' },
  { key: 'label', label: 'NAME', type: 'text' },
  { key: 'price', label: 'LAST', type: 'price' },
  { key: 'dayPct', label: 'DAY', type: 'pct' },
  { key: 'wtdPct', label: 'WTD', type: 'pct' },
  { key: 'ytdPct', label: 'YTD', type: 'pct' },
];

// Commodities complex, categorized: futures + ETFs + producers per theme.
export default function CommoditiesTab() {
  const { quotes } = useQuotes();

  if (!quotes) {
    return <div style={{ color: colors.text.muted, fontFamily: fonts.mono, padding: 40, textAlign: 'center' }}>Loading market data...</div>;
  }

  const rowsFor = (key) => (quotes.groups[key] || []).map(q => ({
    id: q.symbol,
    chartSym: q.symbol,
    symbol: q.symbol,
    label: q.label,
    price: q.price,
    dayPct: q.dayPct,
    wtdPct: q.wtdPct,
    ytdPct: q.ytdPct,
    dec: q.dec,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 16, alignItems: 'start' }}>
        {SECTIONS.map(s => (
          <QuoteTable key={s.key} title={s.title} columns={COLUMNS} rows={rowsFor(s.key)} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: colors.text.muted, fontFamily: fonts.mono }}>
        Futures (=F) are front-month CME/CBOT/NYMEX/COMEX contracts; spot XAUUSD/SILVER/COPPER are represented by their futures.
        Not available on any free feed: LME nickel/lead/tin, SGX iron ore swaps (TIO=F shown instead), XFRM.
        SXRS trades on Xetra in EUR.
      </div>
    </div>
  );
}
