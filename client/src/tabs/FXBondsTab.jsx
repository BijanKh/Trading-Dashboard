import React, { useState, useEffect } from 'react';
import { colors, fonts } from '../styles/theme';
import { useQuotes } from '../context/QuotesContext';
import { fetchCurrent, fetchCot, fetchEcbCurve } from '../lib/api';
import QuoteTable from '../components/QuoteTable';
import QuoteTile from '../components/QuoteTile';
import YieldCurve from '../components/YieldCurve';
import CurveRegime from '../components/CurveRegime';
import CotCard from '../components/CotCard';
import EcbCurveCard from '../components/EcbCurveCard';

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: colors.text.muted, fontFamily: fonts.sans, letterSpacing: 1, margin: '4px 0 8px' }}>
      {children}
    </div>
  );
}

// Currencies (incl. DXY) and the bond complex: live US yields, futures, ETFs,
// plus FRED-based curve spreads (consistent prev-close basis).
export default function FXBondsTab() {
  const { quotes } = useQuotes();
  const [fred, setFred] = useState(null);
  const [cot, setCot] = useState(null);
  const [ecb, setEcb] = useState(null);

  useEffect(() => {
    fetchCurrent().then(setFred).catch(() => {});
    fetchCot().then(setCot).catch(() => {});
    fetchEcbCurve().then(setEcb).catch(() => {});
  }, []);

  if (!quotes) {
    return <div style={{ color: colors.text.muted, fontFamily: fonts.mono, padding: 40, textAlign: 'center' }}>Loading market data...</div>;
  }

  const fx = quotes.groups.fx || [];
  const bonds = quotes.groups.bonds || [];
  const yields = bonds.filter(q => q.kind === 'yield');
  const bondInstruments = bonds.filter(q => q.kind !== 'yield');

  const dgs2 = fred?.yields?.['2y'];
  const dgs10 = fred?.yields?.['10y'];
  const dgs20 = fred?.yields?.['20y'];
  const dgs30 = fred?.yields?.['30y'];
  const t10y2y = dgs10 != null && dgs2 != null ? ((dgs10 - dgs2) * 100).toFixed(0) : null;
  const t30y10y = dgs30 != null && dgs10 != null ? ((dgs30 - dgs10) * 100).toFixed(0) : null;

  const yieldBySym = Object.fromEntries(yields.map(q => [q.symbol, q]));

  const fxRows = fx.map(q => ({
    id: q.symbol, chartSym: q.symbol, symbol: q.label, price: q.price, dayPct: q.dayPct, wtdPct: q.wtdPct, ytdPct: q.ytdPct, dec: q.dec,
  }));
  const bondRows = bondInstruments.map(q => ({
    id: q.symbol, chartSym: q.symbol, symbol: q.symbol, label: q.label, price: q.price, dayPct: q.dayPct, wtdPct: q.wtdPct, ytdPct: q.ytdPct, dec: q.dec,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <SectionLabel>US YIELDS — LIVE (2Y via CME micro yield future; 20Y FRED prev close)</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
          {yields.map(q => <QuoteTile key={q.symbol} quote={q} showWtd />)}
          <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ fontSize: 11, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 4 }}>20Y Yield</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: colors.text.primary, fontFamily: fonts.mono }}>
              {dgs20 != null ? dgs20.toFixed(3) : '--'}
            </div>
            <div style={{ fontSize: 10, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 2 }}>FRED, prev close</div>
          </div>
        </div>
      </div>

      {/* Yield curve chart + regime read (FRED prev-close basis) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, alignItems: 'stretch' }}>
        <YieldCurve yields={fred?.yields} history={fred?.yieldHistory} />
        <CurveRegime fredYields={fred?.yields} q2={yieldBySym['2YY=F']} q10={yieldBySym['^TNX']} />
      </div>

      {/* Curve spreads from FRED (both legs prev close, consistent basis) */}
      <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 10 }}>
          CURVE LEVELS (FRED, prev close)
        </div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', fontSize: 12, fontFamily: fonts.mono }}>
          <span><span style={{ color: colors.text.muted }}>2Y </span><span style={{ color: colors.text.primary }}>{dgs2 != null ? `${dgs2.toFixed(2)}%` : '--'}</span></span>
          <span><span style={{ color: colors.text.muted }}>10Y </span><span style={{ color: colors.text.primary }}>{dgs10 != null ? `${dgs10.toFixed(2)}%` : '--'}</span></span>
          <span><span style={{ color: colors.text.muted }}>20Y </span><span style={{ color: colors.text.primary }}>{dgs20 != null ? `${dgs20.toFixed(2)}%` : '--'}</span></span>
          <span><span style={{ color: colors.text.muted }}>30Y </span><span style={{ color: colors.text.primary }}>{dgs30 != null ? `${dgs30.toFixed(2)}%` : '--'}</span></span>
          <span><span style={{ color: colors.text.muted }}>2s10s </span><span style={{ color: colors.text.primary }}>{t10y2y != null ? `${t10y2y} bp` : '--'}</span></span>
          <span><span style={{ color: colors.text.muted }}>10s30s </span><span style={{ color: colors.text.primary }}>{t30y10y != null ? `${t30y10y} bp` : '--'}</span></span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, alignItems: 'start' }}>
        <QuoteTable
          title="CURRENCIES"
          columns={[
            { key: 'symbol', label: 'PAIR', type: 'text' },
            { key: 'price', label: 'LAST', type: 'price' },
            { key: 'dayPct', label: 'DAY', type: 'pct' },
            { key: 'wtdPct', label: 'WTD', type: 'pct' },
            { key: 'ytdPct', label: 'YTD', type: 'pct' },
          ]}
          rows={fxRows}
        />
        <QuoteTable
          title="BOND FUTURES & ETFs"
          columns={[
            { key: 'symbol', label: 'SYM', type: 'text' },
            { key: 'label', label: 'NAME', type: 'text' },
            { key: 'price', label: 'LAST', type: 'price' },
            { key: 'dayPct', label: 'DAY', type: 'pct' },
            { key: 'wtdPct', label: 'WTD', type: 'pct' },
            { key: 'ytdPct', label: 'YTD', type: 'pct' },
          ]}
          rows={bondRows}
        />
      </div>

      <EcbCurveCard ecb={ecb} usYields={fred?.yields} />

      <CotCard cot={cot} />
    </div>
  );
}
