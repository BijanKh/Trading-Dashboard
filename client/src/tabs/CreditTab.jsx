import React, { useState, useEffect } from 'react';
import { fetchCurrent, fetchHistory, fetchHYHistory, refreshData } from '../lib/api';
import { colors, fonts } from '../styles/theme';
import Gauge from '../components/Gauge';
import IndicatorCard from '../components/IndicatorCard';
import HYChart from '../components/HYChart';
import YieldCurve from '../components/YieldCurve';
import ScoreHistory from '../components/ScoreHistory';
import SignalBox from '../components/SignalBox';
import ScoreBar from '../components/ScoreBar';

// The original credit-stress dashboard, moved verbatim from App.jsx.
// Weekly cadence: loads once on mount, manual refresh only.
export default function CreditTab() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [hyHistory, setHyHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  async function loadAll() {
    try {
      const [current, hist, hy] = await Promise.all([
        fetchCurrent(),
        fetchHistory(252),
        fetchHYHistory(252),
      ]);
      setData(current);
      setHistory(hist.history || []);
      setHyHistory(hy.history || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshData();
      await loadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: colors.text.muted, fontFamily: fonts.mono }}>
        Loading data...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 12 }}>
        <div style={{ color: '#EF4444', fontFamily: fonts.mono }}>{error}</div>
        <button onClick={loadAll} style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, color: colors.text.primary, padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontFamily: fonts.mono }}>
          Retry
        </button>
      </div>
    );
  }

  const indicatorKeys = ['hy_oas', 'ccc_bb', 'cp_spread', 'vix', 'sofr_ff', 'tsy_vol', 'hy_momentum'];

  return (
    <div>
      {/* Sub-header: data date + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 12, color: colors.text.muted, fontFamily: fonts.mono }}>
          FRED data as of {data?.asOf || '--'} (1-business-day lag)
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            background: colors.bg.card,
            border: `1px solid ${colors.bg.border}`,
            color: colors.text.accent,
            padding: '8px 16px',
            borderRadius: 6,
            cursor: refreshing ? 'not-allowed' : 'pointer',
            fontFamily: fonts.mono,
            fontSize: 12,
            opacity: refreshing ? 0.5 : 1,
            transition: 'opacity 0.2s',
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      {/* Top row: Gauge, Key Levels, Signal */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(260px, 1fr) minmax(300px, 1.2fr) minmax(280px, 1fr)',
        gap: 16,
        marginBottom: 16,
      }}>
        <Gauge score={data?.composite} regime={data?.regime} />

        {/* Key levels table */}
        <div style={{
          background: colors.bg.card,
          borderRadius: 12,
          padding: '20px',
          border: `1px solid ${colors.bg.border}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 12 }}>
            KEY LEVELS
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px', fontSize: 13, fontFamily: fonts.mono }}>
            {[
              ['HY OAS', data?.indicators?.hy_oas?.value, 'bps'],
              ['VIX', data?.indicators?.vix?.value, ''],
              ['CCC-BB', data?.indicators?.ccc_bb?.value, 'bps'],
              ['CP-TBill', data?.indicators?.cp_spread?.value, '%', 3],
              ['2Y Yield', data?.yields?.['2y'], '%'],
              ['10Y Yield', data?.yields?.['10y'], '%'],
              ['20Y Yield', data?.yields?.['20y'], '%'],
              ['30Y Yield', data?.yields?.['30y'], '%'],
              ['2s10s', data?.yields?.['10y'] != null && data?.yields?.['2y'] != null ? ((data.yields['10y'] - data.yields['2y']) * 100).toFixed(0) : null, 'bp'],
              ['SOFR', data?.context?.sofr, '%'],
              ['Fed Funds', data?.context?.fedFunds, '%'],
              ['SOFR-FF', data?.indicators?.sofr_ff?.value, 'bps'],
            ].map(([label, val, unit, dec]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: `1px solid ${colors.bg.border}` }}>
                <span style={{ color: colors.text.muted }}>{label}</span>
                <span style={{ color: colors.text.primary, fontWeight: 500 }}>
                  {val != null ? (dec ? Number(val).toFixed(dec) : typeof val === 'number' ? (val < 10 ? val.toFixed(2) : Math.round(val).toLocaleString()) : val) : '--'}
                  {val != null ? ` ${unit}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        <SignalBox composite={data?.composite} regime={data?.regime} signalActive={data?.signalActive} />
      </div>

      {/* Indicator cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 12,
        marginBottom: 16,
      }}>
        {indicatorKeys.map(key => (
          <IndicatorCard key={key} indicatorKey={key} data={data?.indicators?.[key]} />
        ))}
      </div>

      {/* Charts row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 16,
        marginBottom: 16,
      }}>
        <HYChart history={hyHistory} />
        <YieldCurve yields={data?.yields} history={data?.yieldHistory} />
      </div>

      {/* Composite score history */}
      <div style={{ marginBottom: 16 }}>
        <ScoreHistory history={history} />
      </div>

      {/* Score comparison */}
      <div style={{ marginBottom: 32 }}>
        <ScoreBar indicators={data?.indicators} />
      </div>

      {/* Methodology footer */}
      <footer style={{
        borderTop: `1px solid ${colors.bg.border}`,
        paddingTop: 20,
        fontSize: 11,
        color: colors.text.muted,
        fontFamily: fonts.mono,
        lineHeight: 1.7,
      }}>
        <div style={{ fontFamily: fonts.sans, fontSize: 12, fontWeight: 600, color: colors.text.secondary, marginBottom: 8 }}>
          METHODOLOGY
        </div>
        <p>
          Composite score is a weighted average of 7 indicators, each normalized to 0-100 via piecewise linear interpolation.
          Weights: HY OAS 25%, CCC-BB Dispersion 15%, CP-TBill Spread 15%, VIX 15%, SOFR-FF 10%, Treasury Vol 10%, HY Momentum 10%.
          Data sourced from FRED with a 1-business-day lag. Missing indicators are excluded and remaining weights are renormalized.
          Duration signal fires at composite {'>='} 65, indicating growth shock overtaking inflation shock.
        </p>
      </footer>
    </div>
  );
}
