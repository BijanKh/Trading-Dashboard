import React from 'react';
import { colors, fonts } from '../styles/theme';
import { useQuotes, useCalendar, useEarnings } from '../context/QuotesContext';
import QuoteTile from '../components/QuoteTile';
import VolPanel from '../components/VolPanel';
import SectorHeatmap from '../components/SectorHeatmap';
import EventStrip from '../components/EventStrip';
import BreadthPanel from '../components/BreadthPanel';
import LeadershipPanel from '../components/LeadershipPanel';
import SpxBreadthPanel from '../components/SpxBreadthPanel';
import TapeScore from '../components/TapeScore';
import BriefingPanel from '../components/BriefingPanel';
import OptionsLevels from '../components/OptionsLevels';
import RelationsPanel from '../components/RelationsPanel';
import CorrelationMatrix from '../components/CorrelationMatrix';
import NewsPanel from '../components/NewsPanel';
import { daysUntil } from '../components/EarningsPanel';
import { fetchOptions } from '../lib/api';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';
import { useState, useCallback } from 'react';

function earningsBadge(symbol, earnings) {
  const item = (earnings?.items || []).find(i => i.symbol === symbol);
  const d = item ? daysUntil(item.date) : null;
  if (d == null || d < 0 || d > 7) return null;
  return d === 0 ? 'E today' : `E ${d}d`;
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: colors.text.muted, fontFamily: fonts.sans, letterSpacing: 1, margin: '4px 0 8px' }}>
      {children}
    </div>
  );
}

function TileRow({ quotes, showWtd, min = 140 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: 8 }}>
      {quotes.map(q => <QuoteTile key={q.symbol} quote={q} showWtd={showWtd} />)}
    </div>
  );
}

// Godmode overview: everything important at one look.
export default function OverviewTab() {
  const { quotes, error } = useQuotes();
  const calendar = useCalendar();
  const earnings = useEarnings();
  const [optionsData, setOptionsData] = useState(null);

  const loadOptions = useCallback(async () => {
    try { setOptionsData(await fetchOptions()); } catch {}
  }, []);
  useVisibilityPolling(loadOptions, 60 * 60 * 1000, true);

  if (!quotes && error) {
    return <div style={{ color: colors.regime.CRISIS, fontFamily: fonts.mono, padding: 40, textAlign: 'center' }}>{error}</div>;
  }
  if (!quotes) {
    return <div style={{ color: colors.text.muted, fontFamily: fonts.mono, padding: 40, textAlign: 'center' }}>Loading market data...</div>;
  }

  const g = quotes.groups;
  const ratioById = Object.fromEntries((quotes.ratios || []).map(r => [r.id, r]));
  const leadershipRatios = ['rsp_spy', 'qqq_spy', 'iwm_spy'].map(id => ratioById[id]).filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <TapeScore tape={quotes.tape} />

      {quotes.divergence?.active && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.08)',
          border: `1px solid ${colors.regime.CRISIS}`,
          borderRadius: 10,
          padding: '10px 16px',
          fontSize: 12,
          fontFamily: fonts.mono,
          color: colors.regime.CRISIS,
        }}>
          ⚠ BREADTH DIVERGENCE — SPY near its 20-day high while S&P {'>'}50d breadth fell from{' '}
          {Math.round(quotes.divergence.breadth5dAgo * 100)}% to {Math.round(quotes.divergence.breadthNow * 100)}% over 5 sessions.
        </div>
      )}

      <BriefingPanel />

      <div>
        <SectionLabel>INDEX FUTURES</SectionLabel>
        <TileRow quotes={g.futures || []} showWtd />
      </div>

      <div>
        <SectionLabel>WORLD</SectionLabel>
        <TileRow quotes={g.world || []} showWtd />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <VolPanel volatility={g.volatility} fearGreed={quotes.fearGreed} history={quotes.history} pctiles={quotes.volPctiles} />
        <LeadershipPanel ratios={leadershipRatios} relations={quotes.relations} />
        <SpxBreadthPanel spx={quotes.spxBreadth} mcclellan={quotes.mcclellan} history={quotes.history} />
        <BreadthPanel breadth={quotes.breadth} />
        <OptionsLevels walls={optionsData?.walls} />
      </div>

      <RelationsPanel relations={quotes.relations} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 12, alignItems: 'start' }}>
        <CorrelationMatrix correlations={quotes.correlations} />
        <div>
          <SectionLabel>SECTORS — TODAY</SectionLabel>
          <SectorHeatmap quotes={g.sectors || []} mode="day" compact />
        </div>
      </div>

      <div>
        <SectionLabel>MEGA CAPS</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {(g.megacaps || []).map(q => (
            <QuoteTile key={q.symbol} quote={q} showWtd badge={earningsBadge(q.symbol, earnings)} />
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12 }}>
        <div>
          <SectionLabel>COMMODITIES</SectionLabel>
          <TileRow quotes={g.commodities || []} min={120} showWtd />
        </div>
        <div>
          <SectionLabel>CRYPTO</SectionLabel>
          <TileRow quotes={g.crypto || []} min={120} showWtd />
        </div>
      </div>

      <NewsPanel />

      <EventStrip events={calendar?.events} />
    </div>
  );
}
