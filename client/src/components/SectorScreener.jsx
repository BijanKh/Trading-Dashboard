import React, { useCallback, useEffect, useRef, useState } from 'react';
import { colors, fonts } from '../styles/theme';
import { fetchSectorScreen, fetchSpace } from '../lib/api';
import { useVisibilityPolling } from '../hooks/useVisibilityPolling';
import ScreenerTable, { CompositeStrip, SHORT_SETUP_COLOR } from './ScreenerTable';
import BacktestPanel from './BacktestPanel';

// Per-sector screener block, embedded at the bottom of the Sectors tab — the
// bounce/pullback workflow (shorts + longs) over 17 sector universes (top 30 by
// market cap + the ETF as benchmark row, lists in server/sectorUniverses.js;
// DRAM = full memory-ETF holdings incl. foreign primaries) plus the Space
// watchlist as an 18th chip (server/space.js, UFO benchmark, AT-EMA backtest
// panel included).

const ETFS = [
  ['XLK', 'Technology'], ['SMH', 'Semis'], ['DRAM', 'Memory'], ['IGV', 'Software'],
  ['XLF', 'Financials'], ['XLV', 'Health Care'], ['XLY', 'Discretionary'],
  ['XLP', 'Staples'], ['XLE', 'Energy'], ['XLI', 'Industrials'],
  ['XLB', 'Materials'], ['XLC', 'Communications'], ['XLRE', 'Real Estate'],
  ['XBI', 'Biotech'], ['XRT', 'Retail'], ['XHB', 'Homebuilders'],
  ['IYT', 'Transports'], ['SPACE', 'Space'],
];

function initialEtf() {
  const saved = localStorage.getItem('sectorScreenEtf');
  return ETFS.some(([e]) => e === saved) ? saved : 'XLK';
}

export default function SectorScreener() {
  const [etf, setEtf] = useState(initialEtf);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const cacheRef = useRef(new Map()); // etf -> last payload, instant on switch-back

  const load = useCallback(async () => {
    try {
      setError(null);
      const d = etf === 'SPACE'
        ? { etf: 'SPACE', label: 'Space', loading: false, ...(await fetchSpace()) }
        : await fetchSectorScreen(etf);
      cacheRef.current.set(etf, d);
      setData(d);
    } catch (err) {
      setError(err.message);
    }
  }, [etf]);
  useVisibilityPolling(load, 45000, true);

  function pick(next) {
    if (next === etf) return;
    localStorage.setItem('sectorScreenEtf', next);
    setEtf(next);
    setData(cacheRef.current.get(next) ?? null);
  }
  // Immediate fetch on sector switch (the 45s poller keeps its own cadence)
  useEffect(() => { load(); }, [load]);

  const showing = data?.etf === etf ? data : cacheRef.current.get(etf) ?? null;
  const isSpace = etf === 'SPACE';
  const benchmark = isSpace ? 'UFO' : etf;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginTop: 8 }}>
        SECTOR SCREENER — top 30 by market cap per universe, 12-EMA bounce (short) + pullback (long) workflow
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ETFS.map(([e, label]) => {
          const active = e === etf;
          return (
            <button
              key={e}
              onClick={() => pick(e)}
              style={{
                fontFamily: fonts.mono, fontSize: 12, padding: '5px 10px',
                borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${active ? colors.text.accent : colors.bg.border}`,
                background: active ? colors.bg.cardHover : colors.bg.card,
                color: active ? colors.text.accent : colors.text.secondary,
                fontWeight: active ? 700 : 400,
              }}
              title={label}
            >
              {e}<span style={{ marginLeft: 6, fontSize: 10, color: active ? colors.text.accent : colors.text.muted, fontWeight: 400 }}>{label}</span>
            </button>
          );
        })}
      </div>

      {error && !showing && (
        <div style={{ color: colors.updown.down, fontFamily: fonts.mono, padding: 40, textAlign: 'center' }}>
          Failed to load screener: {error}
        </div>
      )}
      {!error && !showing && (
        <div style={{ color: colors.text.muted, fontFamily: fonts.mono, padding: 40, textAlign: 'center' }}>
          Loading {etf} screener...
        </div>
      )}

      {showing && (
        <>
          {showing.loading && (
            <div style={{
              fontSize: 11, color: colors.regime.ELEVATED, fontFamily: fonts.mono,
              background: colors.bg.card, border: `1px solid ${colors.bg.border}`,
              borderRadius: 8, padding: '8px 12px',
            }}>
              Loading daily history for {etf} (~30s) — indicators, candles and WTD/YTD fill in as the pass completes.
            </div>
          )}
          <CompositeStrip
            composite={showing.composite}
            title={isSpace
              ? `SPACE SECTOR — EQUAL WEIGHT (${showing.composite?.count ?? 0})`
              : `${showing.label.toUpperCase()} (${showing.etf}) — TOP ${showing.composite?.count ?? ''} BY MARKET CAP, EQUAL WEIGHT`}
            tooltipKey={isSpace ? 'space' : undefined}
          />
          <ScreenerTable
            rows={showing.rows}
            benchmark={benchmark}
            title={`${isSpace ? 'SPACE STOCKS' : `${showing.etf} — ${showing.label.toUpperCase()}`} — ${showing.stale ? 'STALE' : 'LIVE'} · default rank: AT EMA first (shorts ▼ + longs ▲), tightest to the 12 EMA`}
          />
          {isSpace && (
            <BacktestPanel
              strategy="space-short"
              title="AT-EMA SHORT (space universe, 5Y)"
            />
          )}
        </>
      )}

      <div style={{ fontSize: 11, color: colors.text.muted, fontFamily: fonts.mono, lineHeight: 1.6 }}>
        Universe: top 30 holdings by market cap per sector ETF (snapshot, see server/sectorUniverses.js); SPACE =
        the space watchlist with UFO as benchmark · benchmark row = yellow tint, pinned on top ·
        5D / 30D = 5- / 30-session change · vs 50DMA = distance to the 50-day average · ΔEMA = distance to the 12 EMA
        in units of 20-day close-to-close volatility (ATR proxy: 0 = at the EMA, negative = below) ·
        OS──OB = Bollinger(20,2) %B position, dot in the green zone = oversold, red = overbought ·
        IV30 = ~30d ATM implied vol from the option chain nearest 30 days ("--" = no listed options, e.g. foreign
        listings; refreshed 12h) · F P/E = forward price/earnings from Yahoo estimates ·
        SI %FLT = short interest as % of float (amber &gt;15% — squeeze fuel), DTC = days to cover ·
        EARN = days to next earnings (amber ≤7d — binary-event risk for shorts) · ADV $ = avg daily dollar
        volume, "thin" = fails the short liquidity floors (price ≥$5, ≥$20M ADV).
        SETUP is mirrored long/short with identical thresholds. SHORT side (▼, below a FALLING 50-DMA): BOUNCING =
        5d up, still under the 12 EMA → <span style={{ color: SHORT_SETUP_COLOR, fontWeight: 700 }}>AT EMA ▼</span> =
        bounce reached the declining 12 EMA (short-entry zone) · EXTENDED ▼ = ≥2 vol-units below (late to chase) ·
        EARLY DOWN = below a still-RISING 50-DMA (breakdown not confirmed). LONG side (▲, above a RISING 50-DMA):
        PULLBACK = 5d down, still over the 12 EMA → <span style={{ color: colors.updown.up, fontWeight: 700 }}>AT
        EMA ▲</span> = pullback reached the rising 12 EMA (long-entry zone) · EXTENDED ▲ = ≥2 vol-units above (late
        to chase) · EARLY UP = above a still-FALLING 50-DMA (breakout not confirmed). Quotes tick every 45s while visible; daily
        history per sector loads on first visit (6h refresh); short interest/earnings every 12h.
      </div>
    </div>
  );
}
