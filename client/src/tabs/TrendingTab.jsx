import React, { useCallback, useEffect, useState } from 'react';
import { colors, fonts } from '../styles/theme';
import { fetchTrending, fetchIgnition } from '../lib/api';
import QuoteTable from '../components/QuoteTable';
import BacktestPanel from '../components/BacktestPanel';

// "Setups" tab — daily scan over S&P 500 + Nasdaq-100 (server/trending.js).
// Sections: Setups Daytrading (daily 12 EMA, within 5% of the all-time
// high/low) and Setups Swingtrading (weekly 12 EMA, 10% band), ranked by
// closeness to the 12 EMA (tightest pullbacks first); ΔEMA is that distance
// in ATR units (|ΔEMA| <= 1 ATR = PULLBACK entry zone, > 2.5 = EXTENDED).
// Setups Equilibriums Daily/Weekly: sideways-range screens — BB(20,2) width
// today at/below the 10th percentile of the stock's own ~1y history, inside
// the squeeze (≤ 15th) for ≥ 15 days / 8 weeks, plus a hard 20-bar high-low
// range cap (12% daily / 25% weekly); ranked by avg percentile over the
// persistence window (deepest sustained squeeze first).

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

const EQ_COLS = [
  { key: 'symbol', label: 'SYM', type: 'text' },
  { key: 'label', label: 'NAME', type: 'text' },
  { key: 'price', label: 'LAST', type: 'price' },
  { key: 'dayPct', label: 'DAY', type: 'pct' },
  { key: 'avgPctile', label: 'AVG %ILE', type: 'price', dec: 1 },
  { key: 'widthPctile', label: 'NOW %ILE', type: 'price', dec: 1 },
  { key: 'sqzBars', label: 'SQZ', type: 'price', dec: 0 },
  { key: 'bbWidth', label: 'BBW %', type: 'price', dec: 1 },
  { key: 'rangePct', label: 'RANGE %', type: 'price', dec: 1 },
  { key: 'rangePos', label: 'IN RANGE %', type: 'price', dec: 0 },
  { key: 'rs', label: 'RS', type: 'price', dec: 1 },
];

function EquilibriumSection({ title, subtitle, rows }) {
  const tableRows = (rows || []).map(r => ({
    id: r.symbol,
    chartSym: r.symbol,
    symbol: r.symbol,
    label: r.name,
    price: r.price,
    dayPct: r.dayPct,
    widthPctile: r.widthPctile,
    avgPctile: r.avgPctile,
    sqzBars: r.sqzBars,
    bbWidth: r.bbWidth != null ? r.bbWidth * 100 : null,
    rangePct: r.rangePct != null ? r.rangePct * 100 : null,
    rangePos: r.rangePos != null ? r.rangePos * 100 : null,
    rs: r.rs,
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
      {rows == null ? (
        <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16, color: colors.text.muted, fontFamily: fonts.mono, fontSize: 12 }}>
          Appears after the next scan (hit RESCAN)
        </div>
      ) : rows.length === 0 ? (
        <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16, color: colors.text.muted, fontFamily: fonts.mono, fontSize: 12 }}>
          No qualifiers today
        </div>
      ) : (
        <QuoteTable title="TOP 10 TIGHTEST RANGES" columns={EQ_COLS} rows={tableRows} />
      )}
    </div>
  );
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


// Setups Ignition — Bijan's "ideal trade" template (ZEC 18–21 Oct 2026, locked
// 2026-10-22; spec in tradingcoach/optionsneutral/ideal_trade_zec_2026-10-20.md).
// The scan runs as a Python child process (server/ignition.js) over two
// universes and reports the STEP each name has reached:
//   D exhaustion (lower low without follow-through) · E ignition (>= 2.5 ATR on
//   >= 3x volume clearing the last lower high) · F equilibrium (falling highs +
//   rising lows holding the 50 % retrace) · G triggered (close through the range
//   high on >= 2x volume). Levels are what an alert needs, not an entry signal.
const STEP_LABEL = { G: 'G ▲ TRIGGERED', F: 'F EQUILIBRIUM', E: 'E IGNITED', D: 'D EXHAUSTION', C: 'C PULLBACK' };
const IGN_COLS = [
  { key: 'symbol', label: 'SYM', type: 'text' },
  { key: 'step', label: 'STEP', type: 'text' },
  { key: 'price', label: 'LAST', type: 'price' },
  { key: 'r126', label: '6M', type: 'pct' },
  { key: 'dd', label: 'DD %', type: 'price', dec: 0 },
  { key: 'fibDist', label: 'FIB Δ%', type: 'price', dec: 1 },
  { key: 'low', label: 'LOW', type: 'price' },
  { key: 'ignHigh', label: 'IGN HI', type: 'price' },
  { key: 'volX', label: 'VOLx', type: 'price', dec: 1 },
  { key: 'rangeLow', label: 'RNG LO', type: 'price' },
  { key: 'rangeHigh', label: 'RNG HI', type: 'price' },
  { key: 'fifty', label: '50 %', type: 'price' },
  { key: 'retr', label: 'RETR', type: 'price', dec: 2 },
  { key: 'dailyLh', label: 'DAILY LH', type: 'price' },
  { key: 'note', label: 'NOTE', type: 'text', max: 220 },
];

function IgnitionTable({ title, scan, onRescan }) {
  const status = scan?.status || 'idle';
  const rows = (scan?.candidates || []).map(r => ({
    id: r.symbol,
    chartSym: r.symbol,
    symbol: r.symbol,
    step: STEP_LABEL[r.step] || r.step,
    price: r.price,
    r126: r.ret_126 != null ? r.ret_126 * 100 : null,
    dd: r.drawdown != null ? r.drawdown * 100 : null,
    fibDist: r.fib_dist != null ? r.fib_dist * 100 : null,
    low: r.low ?? null,
    ignHigh: r.ign_high ?? null,
    volX: r.ign_vol_x ?? null,
    rangeLow: r.range_low ?? null,
    rangeHigh: r.range_high ?? null,
    fifty: r.fifty_pct ?? null,
    retr: r.wick_retrace ?? null,
    dailyLh: r.daily_lh ?? null,
    note: [r.note, r.step === 'G' && r.trig_bar ? `triggered ${String(r.trig_bar).slice(0, 16)}` : null,
           r.step === 'G' && r.back_inside ? 'BACK INSIDE RANGE' : null].filter(Boolean).join(' · '),
    dec: r.price >= 100 ? 2 : 4,
  }));
  const meta = [
    scan?.scannedAt ? `scanned ${new Date(scan.scannedAt).toLocaleString()}` : 'not scanned yet',
    scan?.passedDaily != null ? `${scan.passedDaily} of ${scan.scanned} past the daily gate` : null,
    scan?.leaderCut != null && scan.leaderCut > -1 ? `leader cut ${Math.round(scan.leaderCut * 100)}% (6M)` : null,
    status === 'running' ? `RUNNING ${scan.logTail?.slice(-1)[0] || ''}` : null,
    status === 'error' ? `ERROR ${scan.error}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div style={{ background: colors.bg.card, border: `1px solid ${colors.bg.border}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text.secondary, fontFamily: fonts.sans }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: status === 'error' ? colors.updown.down : colors.text.muted, fontFamily: fonts.mono }}>{meta}</span>
          <button
            onClick={onRescan}
            disabled={status === 'running'}
            style={{ background: colors.bg.cardHover, color: status === 'running' ? colors.text.muted : colors.text.accent, border: `1px solid ${colors.bg.border}`, borderRadius: 6, padding: '4px 10px', cursor: status === 'running' ? 'default' : 'pointer', fontFamily: fonts.mono, fontSize: 11 }}
          >
            {status === 'running' ? 'SCANNING...' : 'RESCAN'}
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <div style={{ color: colors.text.muted, fontFamily: fonts.mono, fontSize: 12 }}>
          {status === 'running' ? 'Scanning...' : 'No names past step D right now'}
        </div>
      ) : (
        <QuoteTable title={null} columns={IGN_COLS} rows={rows} />
      )}
    </div>
  );
}

function IgnitionSection() {
  const [ign, setIgn] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async (refresh = false, asset = null) => {
    try { setError(null); setIgn(await fetchIgnition(refresh, asset)); }
    catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const running = ign && (ign.crypto?.status === 'running' || ign.stock?.status === 'running');
  useEffect(() => {
    const t = setInterval(() => load(), running ? 10000 : 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [running, load]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ borderLeft: `3px solid ${colors.text.accent}`, paddingLeft: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: colors.text.primary, fontFamily: fonts.sans, letterSpacing: 1.5 }}>
          SETUPS IGNITION — IDEAL TRADE
        </div>
        <div style={{ fontSize: 11, color: colors.text.muted, fontFamily: fonts.mono, marginTop: 4 }}>
          leader (6M top decile, above 200d, recent high) · 25–50% off the high but ≤ 45% of the up-leg retraced (38.2 fib touch) · daily LH+LL, never oversold ·
          then on 4h (crypto) / 1h (stocks): D lower low w/o follow-through → E ignition ≥ 2.5 ATR on ≥ 3× volume → F equilibrium holding the 50% → G trigger on ≥ 2× volume
        </div>
      </div>
      {error && <div style={{ color: colors.updown.down, fontFamily: fonts.mono, fontSize: 12 }}>ignition scan unavailable: {error}</div>}
      <IgnitionTable title="CRYPTO — COINGECKO TOP 100 (4H BARS)" scan={ign?.crypto} onRescan={() => load(true, 'crypto')} />
      <IgnitionTable title="STOCKS — S&P 500 + NASDAQ-100 (1H BARS)" scan={ign?.stock} onRescan={() => load(true, 'stock')} />
      <div style={{ fontSize: 11, color: colors.text.muted, fontFamily: fonts.mono, lineHeight: 1.6 }}>
        STEP = how far along the template the name is; only G is a trigger, D–F are the watchlist. FIB Δ% = where the pullback low sits vs the
        38.2% retracement of the whole up-leg (≈0 = the ZEC touch). LOW = the exhaustion low (the “that's the higher low or I'm wrong” level once
        the range forms); IGN HI = ignition high; RNG LO/HI = the equilibrium; 50% = half-way of the ignition leg (held on closes in the template);
        RETR = deepest wick retrace of the ignition leg (0.56 in the template); DAILY LH = the daily lower high a close must clear to confirm the
        daily trend change. Crypto rescans every 4h, stocks every 2h in the US session; the daily gate is cached 20h.
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

      <IgnitionSection />

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

      <EquilibriumSection
        title="SETUPS EQUILIBRIUMS DAILY"
        subtitle="Bollinger(20,2) width ≤ 10th %ile of its own 1-year history · in squeeze (≤ 15th) ≥ 15 straight days · 20-day range ≤ 12% · ranked by deepest sustained squeeze"
        rows={data.eqDaily}
      />
      <EquilibriumSection
        title="SETUPS EQUILIBRIUMS WEEKLY"
        subtitle="weekly Bollinger(20,2) width ≤ 10th %ile of its own ~1-year history · in squeeze (≤ 15th) ≥ 8 straight weeks · 20-week range ≤ 25% · ranked by deepest sustained squeeze"
        rows={data.eqWeekly}
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
        Equilibriums: NOW %ILE = today's Bollinger(20,2) width as a percentile of the stock's own
        ~1-year width history (≤ 10 required); the width must also have stayed inside the squeeze
        (≤ 15th percentile) for ≥ 15 straight days (daily) / ≥ 8 straight weeks (weekly). AVG %ILE =
        mean percentile over that window — the ranking: deepest sustained squeeze first. SQZ = how many
        consecutive bars the squeeze has lasted (capped at 60). BBW % = width as % of price; RANGE % =
        total high-low span of the last 20 bars (≤ 12% daily / ≤ 25% weekly — rejects tight flags inside
        steep trends); IN RANGE % = where the live price sits inside that box (0 = low, 100 = high).
        Both lists require price ≥ $5 and ≥ $20M avg daily dollar volume. Strict by design — fewer than
        10 qualifiers is normal.
      </div>
    </div>
  );
}
