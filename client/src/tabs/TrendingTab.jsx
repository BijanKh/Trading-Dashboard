import React, { useCallback, useEffect, useState } from 'react';
import { colors, fonts } from '../styles/theme';
import { fetchTrending } from '../lib/api';
import QuoteTable from '../components/QuoteTable';
import BacktestPanel from '../components/BacktestPanel';

// Daily trend scan over S&P 500 + Nasdaq-100 (server/trending.js).
// Two sections: Setups Daytrading (daily 12 EMA, within 5% of the all-time
// high/low) and Setups Swingtrading (weekly 12 EMA, 10% band). Ranked by
// closeness to the 12 EMA (tightest pullbacks first); ΔEMA is that distance
// in ATR units (|ΔEMA| <= 1 ATR = PULLBACK entry zone, > 2.5 = EXTENDED).

const COLS = (side) => [
  { key: 'symbol', label: 'SYM', type: 'text' },
  { key: 'label', label: 'NAME', type: 'text' },
  { key: 'price', label: 'LAST', type: 'price' },
  { key: 'dayPct', label: 'DAY', type: 'pct' },
  { key: 'off', label: side === 'long' ? 'vs ATH' : 'vs 52W LO', type: 'pct' },
  { key: 'emaDistAtr', label: 'ΔEMA·ATR', type: 'price', dec: 1 },
  { key: 'rs', label: 'RS', type: 'price', dec: 1 },
  { key: 'setup', label: 'SETUP', type: 'text' },
];

function SetupTable({ title, side, rows }) {
  if (!rows?.length) {
    return (
      <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans, marginBottom: 10 }}>{title}</div>
        <div style={{ color: colors.text.muted, fontFamily: fonts.mono, fontSize: 12 }}>No qualifiers today</div>
      </div>
    );
  }
  const tableRows = rows.map(r => ({
    id: r.symbol,
    chartSym: r.symbol,
    symbol: r.symbol,
    label: r.name,
    price: r.price,
    dayPct: r.dayPct,
    off: side === 'long' ? r.offAth : r.offLow,
    emaDistAtr: r.emaDistAtr,
    rs: r.rs,
    setup: r.setup,
    spark: r.spark ?? null,
    sparkTf: r.sparkTf ?? null,
    dec: 2,
  }));
  return <QuoteTable title={title} columns={COLS(side)} rows={tableRows} />;
}

const MOMENTUM_COLS = (side) => [
  { key: 'symbol', label: 'SYM', type: 'text' },
  { key: 'label', label: 'NAME', type: 'text' },
  { key: 'price', label: 'LAST', type: 'price' },
  { key: 'dayPct', label: 'DAY', type: 'pct' },
  { key: 'r21', label: '1M', type: 'pct' },
  { key: 'r63', label: '3M', type: 'pct' },
  { key: 'r126', label: '6M', type: 'pct' },
  { key: 'off', label: side === 'strong' ? 'vs 52W HI' : 'vs 52W LO', type: 'pct' },
  { key: 'emaDistAtr', label: 'ΔEMA·ATR', type: 'price', dec: 1 },
  { key: 'rs', label: 'RS', type: 'price', dec: 1 },
  { key: 'setup', label: 'SETUP', type: 'text' },
];

function MomentumSection({ title, subtitle, side, rows }) {
  if (!rows?.length) return null;
  const tableRows = rows.map(r => ({
    id: r.symbol,
    chartSym: r.symbol,
    symbol: r.symbol,
    label: r.name,
    price: r.price,
    dayPct: r.dayPct,
    r21: r.r21,
    r63: r.r63,
    r126: r.r126,
    off: side === 'strong' ? r.offHigh : r.offLow,
    emaDistAtr: r.emaDistAtr,
    rs: r.rs,
    setup: r.setup,
    spark: r.spark ?? null,
    sparkTf: r.sparkTf ?? null,
    dec: 2,
  }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ borderLeft: `3px solid ${colors.text.accent}`, paddingLeft: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: colors.text.primary, fontFamily: fonts.sans, letterSpacing: 1.5 }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 4 }}>
          {subtitle}
        </div>
      </div>
      <QuoteTable
        title={side === 'strong' ? 'TOP 10 MOMENTUM' : 'BOTTOM 10 MOMENTUM'}
        columns={MOMENTUM_COLS(side)}
        rows={tableRows}
      />
    </div>
  );
}

function Section({ title, subtitle, lists }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ borderLeft: `3px solid ${colors.text.accent}`, paddingLeft: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: colors.text.primary, fontFamily: fonts.sans, letterSpacing: 1.5 }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 4 }}>
          {subtitle}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(560px, 1fr))', gap: 16, alignItems: 'start' }}>
        <SetupTable title="LONG — 10 STRONGEST" side="long" rows={lists?.long} />
        <SetupTable title="SHORT — 10 WEAKEST" side="short" rows={lists?.short} />
      </div>
    </div>
  );
}

export default function TrendingTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async (refresh = false) => {
    try {
      setError(null);
      setData(await fetchTrending(refresh));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // While a scan is running, poll for progress / the finished result
  const scanning = data && data.status !== 'ok';
  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(() => load(), 5000);
    return () => clearInterval(t);
  }, [scanning, load]);

  if (error && !data) {
    return (
      <div style={{ color: colors.updown.down, fontFamily: fonts.mono, padding: 40, textAlign: 'center' }}>
        Failed to load trending setups: {error}
        <div style={{ marginTop: 12 }}>
          <button onClick={() => load()} style={{ background: colors.bg.cardHover, color: colors.text.accent, border: `1px solid ${colors.bg.border}`, borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontFamily: fonts.mono, fontSize: 11 }}>
            RETRY
          </button>
        </div>
      </div>
    );
  }

  if (!data || (!data.day && !data.swing)) {
    const p = data?.progress;
    return (
      <div style={{ color: colors.text.muted, fontFamily: fonts.mono, padding: 40, textAlign: 'center' }}>
        Scanning universe for trending setups...
        {p ? ` (${p.phase} ${p.done}/${p.total})` : ''}
        <div style={{ marginTop: 8, fontSize: 11 }}>First scan takes a few minutes.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: colors.text.muted, fontFamily: fonts.mono }}>
          scanned {data.scannedAt ? new Date(data.scannedAt).toLocaleString() : '--'}
          {' · '}universe {data.universe?.total ?? '--'} (S&P 500 + Nasdaq-100)
          {scanning && data.progress ? ` · rescanning ${data.progress.done}/${data.progress.total}` : ''}
        </div>
        <button
          onClick={() => load(true)}
          disabled={scanning}
          style={{
            background: colors.bg.cardHover,
            color: scanning ? colors.text.muted : colors.text.accent,
            border: `1px solid ${colors.bg.border}`,
            borderRadius: 6,
            padding: '6px 14px',
            cursor: scanning ? 'default' : 'pointer',
            fontFamily: fonts.mono,
            fontSize: 11,
          }}
        >
          {scanning ? 'SCANNING...' : 'RESCAN'}
        </button>
      </div>

      <Section
        title="SETUPS DAYTRADING"
        subtitle="daily 12 EMA · within 5% of all-time high (long) / 52-week low (short) · ranked by closeness to the 12 EMA"
        lists={data.day}
      />
      <Section
        title="SETUPS SWINGTRADING"
        subtitle="weekly 12 EMA · within 10% of all-time high (long) / 52-week low (short) · ranked by closeness to the 12 EMA"
        lists={data.swing}
      />

      <MomentumSection
        title="STRONGEST TRENDING"
        subtitle="whole universe ranked by momentum (RS: weighted 1M/3M/6M return vs SPY) · above the daily 12 EMA · no ATH condition"
        side="strong"
        rows={data.momentum}
      />
      <MomentumSection
        title="WEAKEST TRENDING"
        subtitle="whole universe ranked by negative momentum (lowest RS vs SPY) · below the daily 12 EMA · no 52-week-low condition"
        side="weak"
        rows={data.weakest}
      />

      <BacktestPanel
        strategy="trending-long"
        title="12-EMA PULLBACK LONG (S&P 500, 3Y)"
      />

      <div style={{ fontSize: 11, color: colors.text.muted, fontFamily: fonts.mono, lineHeight: 1.6 }}>
        vs ATH = distance from the split-adjusted all-time high (full listing history); vs 52W LO =
        distance above the 52-week low (index members never trade near true all-time lows).
        ΔEMA·ATR = distance from the 12 EMA in ATR units — the ranking: tightest to the EMA first.
        |ΔEMA| ≤ 1 → PULLBACK (entry zone at the EMA),
        ≤ 2.5 → TRENDING, above → EXTENDED (chasing risk). RS = weighted 1/3/6-month excess return vs SPY
        in percentage points (context only, not the ranking). Shorts require price ≥ $5 and ≥ $20M avg
        daily dollar volume. Scan runs once per day after the US close.
      </div>
    </div>
  );
}
