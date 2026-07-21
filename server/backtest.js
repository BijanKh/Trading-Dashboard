// Historical backtest of the dashboard's two rule-based entry shapes
// (GET /api/backtest?strategy=trending-long|space-short[&refresh=1]).
//
// Purpose: validate that the ENTRY SHAPES carry an edge — not to project
// returns. Caveats baked into the report: today's constituents only
// (survivorship bias), close-based signals, no slippage/fees, per-trade R
// stats rather than portfolio equity.
//
// Shared mechanics (mirrors the live screener math):
//   EMA12 on closes; vol20 = stdev of the last 20 close-to-close changes
//   (ATR proxy, same as Space tab); dEmaVol = (close − EMA12) / vol20;
//   SMA50 slope = SMA50 now vs 10 sessions ago.
//
// trending-long (Trending tab "Setups Daytrading" long rule):
//   Signal at close t: close > EMA12, dEmaVol ≤ 1 (PULLBACK), close within
//   5% of the running all-time high of the fetched history, price ≥ $5.
//   Enter long at close t. Stop = entry − 1.5·vol20.
// space-short (Space tab "AT EMA" rule):
//   Signal at close t: close < SMA50, SMA50 falling, |dEmaVol| ≤ 0.75,
//   plus a bounce into the EMA: close is HIGHER than 5 sessions ago.
//   Enter short at close t. Stop = entry + 1.5·vol20.
//
// Exits, evaluated with intraday high/low, two variants reported:
//   fixed2R:  target at 2R (3·vol20 in price beyond entry). Stop checked
//             BEFORE target on the same bar (conservative).
//   emaTrail: exit at close when the close crosses the EMA12 against the
//             position; stop still active via high/low.
//   Both: time stop after 40 sessions (exit at close).
// One open position per symbol per variant; 5-session cooldown after exit.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GROUPS } from './symbols.js';
import { yahooFinance, withTimeout } from './yahoo.js';
import { getSp500Symbols } from './sp500.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISK_CACHE = path.join(__dirname, '..', 'data', 'backtest.json');

const CHART_GAP_MS = 350;
const YEARS = { 'trending-long': 3, 'space-short': 5 };
const STOP_VOL = 1.5;      // stop distance in vol20 units
const TARGET_R = 2;        // fixed target in R multiples
const TIME_STOP = 40;      // sessions
const COOLDOWN = 5;        // sessions after exit before re-entry
const MIN_PRICE = 5;
const ATH_BAND = 0.05;     // trending-long: within 5% of running ATH
const AT_EMA_BAND = 0.75;  // space-short entry zone (matches server/space.js)
const RESCAN_MIN_GAP_MS = 10 * 60 * 1000;

const state = {
  results: {},    // strategy -> report
  inflight: null, // strategy currently running
  progress: null,
  lastStart: {},  // strategy -> ts (rescan guard is per-strategy)
};

try {
  const disk = JSON.parse(fs.readFileSync(DISK_CACHE, 'utf8'));
  if (disk?.results) state.results = disk.results;
} catch {}

// ---------- indicator series ----------

function emaSeries(closes, period) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period) return out;
  let e = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = e;
  const k = 2 / (period + 1);
  for (let i = period; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k);
    out[i] = e;
  }
  return out;
}

function smaSeries(closes, period) {
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function vol20Series(closes) {
  const out = new Array(closes.length).fill(null);
  for (let i = 20; i < closes.length; i++) {
    const changes = [];
    for (let j = i - 19; j <= i; j++) changes.push(closes[j] - closes[j - 1]);
    const m = changes.reduce((a, b) => a + b, 0) / changes.length;
    const v = changes.reduce((a, b) => a + (b - m) ** 2, 0) / (changes.length - 1);
    out[i] = Math.sqrt(v);
  }
  return out;
}

// ---------- per-symbol simulation ----------

function simulate(bars, side, entrySignal) {
  const closes = bars.map(b => b.close);
  const ema12 = emaSeries(closes, 12);
  const sma50 = smaSeries(closes, 50);
  const vol20 = vol20Series(closes);
  let runningHigh = -Infinity;

  const trades = { fixed2R: [], emaTrail: [] };
  const openPos = { fixed2R: null, emaTrail: null };
  const cooldownUntil = { fixed2R: 0, emaTrail: 0 };
  const dir = side === 'long' ? 1 : -1;

  for (let i = 0; i < bars.length; i++) {
    runningHigh = Math.max(runningHigh, closes[i]);
    const ctx = {
      i, close: closes[i], ema12: ema12[i], sma50: sma50[i], vol20: vol20[i],
      sma50Back: i >= 10 ? sma50[i - 10] : null,
      close5Back: i >= 5 ? closes[i - 5] : null,
      runningHigh,
    };

    for (const variant of ['fixed2R', 'emaTrail']) {
      const pos = openPos[variant];
      if (pos) {
        const bar = bars[i];
        const stopHit = side === 'long' ? bar.low <= pos.stop : bar.high >= pos.stop;
        const targetHit = variant === 'fixed2R'
          && (side === 'long' ? bar.high >= pos.target : bar.low <= pos.target);
        const trailHit = variant === 'emaTrail' && ema12[i] != null
          && (side === 'long' ? closes[i] < ema12[i] : closes[i] > ema12[i]);
        const timeHit = i - pos.entryIdx >= TIME_STOP;

        let exitPrice = null;
        if (stopHit) exitPrice = pos.stop;             // conservative: stop first
        else if (targetHit) exitPrice = pos.target;
        else if (trailHit || timeHit) exitPrice = closes[i];

        if (exitPrice != null) {
          const r = (exitPrice - pos.entry) * dir / pos.risk;
          trades[variant].push({
            symbol: pos.symbol, entryDate: pos.entryDate, exitDate: bars[i].date,
            entry: pos.entry, exit: exitPrice, r: Math.round(r * 100) / 100,
            hold: i - pos.entryIdx,
          });
          openPos[variant] = null;
          cooldownUntil[variant] = i + COOLDOWN;
        }
      }

      if (!openPos[variant] && i >= cooldownUntil[variant]
          && ctx.vol20 > 0 && entrySignal(ctx)) {
        const entry = closes[i];
        const risk = STOP_VOL * ctx.vol20;
        openPos[variant] = {
          symbol: bars[i].symbol, entryIdx: i, entryDate: bars[i].date,
          entry, risk,
          stop: entry - dir * risk,
          target: entry + dir * risk * TARGET_R,
        };
      }
    }
  }
  return trades;
}

const SIGNALS = {
  'trending-long': {
    side: 'long',
    universe: async () => {
      const spx = await getSp500Symbols();
      return spx || [];
    },
    signal: (c) => c.ema12 != null && c.close > c.ema12 && c.close >= MIN_PRICE
      && (c.close - c.ema12) / c.vol20 <= 1
      && c.close >= c.runningHigh * (1 - ATH_BAND),
  },
  'space-short': {
    side: 'short',
    universe: async () => GROUPS.space.filter(e => !['UFO', 'SPCX'].includes(e.s)).map(e => e.s),
    signal: (c) => c.ema12 != null && c.sma50 != null && c.sma50Back != null
      && c.close < c.sma50 && c.sma50 < c.sma50Back
      && c.close >= MIN_PRICE
      && Math.abs((c.close - c.ema12) / c.vol20) <= AT_EMA_BAND
      && c.close5Back != null && c.close > c.close5Back,
  },
};

// ---------- stats ----------

function stats(trades) {
  if (!trades.length) return null;
  const rs = trades.map(t => t.r);
  const wins = rs.filter(r => r > 0);
  const losses = rs.filter(r => r <= 0);
  const sum = rs.reduce((a, b) => a + b, 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  let maxConsecLoss = 0, run = 0;
  let peak = 0, dd = 0, equity = 0;
  const curve = [];
  const sorted = [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate));
  for (const t of sorted) {
    equity += t.r;
    curve.push({ d: t.exitDate, v: Math.round(equity * 100) / 100 });
    peak = Math.max(peak, equity);
    dd = Math.min(dd, equity - peak);
    if (t.r <= 0) { run++; maxConsecLoss = Math.max(maxConsecLoss, run); }
    else run = 0;
  }
  // thin the curve for the sparkline
  const step = Math.max(1, Math.floor(curve.length / 80));
  return {
    trades: trades.length,
    winRate: wins.length / trades.length,
    avgR: sum / trades.length,
    totalR: Math.round(sum * 10) / 10,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    maxConsecLoss,
    maxDrawdownR: Math.round(dd * 10) / 10,
    avgHold: trades.reduce((a, t) => a + t.hold, 0) / trades.length,
    curve: curve.filter((_, i) => i % step === 0 || i === curve.length - 1),
  };
}

// ---------- runner ----------

async function fetchBars(symbol, years) {
  const result = await withTimeout(yahooFinance.chart(symbol, {
    period1: new Date(Date.now() - years * 365 * 86400000),
    interval: '1d',
  }, { validateResult: false }), 15000, `chart(${symbol})`);
  const bars = (result?.quotes || [])
    .filter(q => q.close != null && q.high != null && q.low != null && isFinite(q.close));
  // drop a possibly still-forming last bar; date as YYYY-MM-DD
  const out = bars.slice(0, -1).map(b => ({
    symbol,
    date: new Date(b.date).toISOString().slice(0, 10),
    close: b.close, high: b.high, low: b.low,
  }));
  return out.length >= 60 ? out : null;
}

async function run(strategy) {
  const def = SIGNALS[strategy];
  const years = YEARS[strategy];
  const symbols = await def.universe();
  if (!symbols.length) throw new Error('empty universe');

  const all = { fixed2R: [], emaTrail: [] };
  let done = 0, ok = 0;
  for (const s of symbols) {
    try {
      const bars = await fetchBars(s, years);
      if (bars) {
        const trades = simulate(bars, def.side, def.signal);
        all.fixed2R.push(...trades.fixed2R);
        all.emaTrail.push(...trades.emaTrail);
        ok++;
      }
    } catch {}
    done++;
    state.progress = { strategy, done, total: symbols.length };
    if (done % 50 === 0) console.log(`Backtest ${strategy}: ${done}/${symbols.length}`);
    await new Promise(r => setTimeout(r, CHART_GAP_MS));
  }

  return {
    strategy,
    ranAt: new Date().toISOString(),
    years,
    universe: { requested: symbols.length, withData: ok },
    caveats: 'Current constituents only (survivorship bias) · close-based signals, stops on intraday extremes · no fees/slippage · per-trade R stats, overlapping positions across symbols',
    rules: strategy === 'trending-long'
      ? `Long at close: above EMA12, ≤1 vol-unit above it, within ${ATH_BAND * 100}% of running ATH, ≥$${MIN_PRICE}. Stop ${STOP_VOL}×vol20.`
      : `Short at close: below falling SMA50, within ${AT_EMA_BAND} vol-units of EMA12, 5d bounce up, ≥$${MIN_PRICE}. Stop ${STOP_VOL}×vol20.`,
    exits: {
      fixed2R: stats(all.fixed2R),
      emaTrail: stats(all.emaTrail),
    },
  };
}

async function runInBackground(strategy) {
  if (state.inflight) return;
  state.inflight = strategy;
  state.lastStart[strategy] = Date.now();
  console.log(`Backtest starting: ${strategy}`);
  try {
    const report = await run(strategy);
    state.results[strategy] = report;
    try { fs.writeFileSync(DISK_CACHE, JSON.stringify({ results: state.results })); } catch {}
    const f = report.exits.fixed2R;
    console.log(`Backtest ${strategy} done: ${f?.trades ?? 0} trades, win ${f ? Math.round(f.winRate * 100) : '--'}%, avg ${f?.avgR?.toFixed(2) ?? '--'}R`);
  } catch (err) {
    console.error(`Backtest ${strategy} failed:`, err.message);
  } finally {
    state.inflight = null;
    state.progress = null;
  }
}

// Runs ONLY on explicit refresh — a trending-long run is ~500 sequential
// chart() calls (~4 min); merely opening the tab must never trigger that.
export function getBacktest(strategy, refresh = false) {
  if (!SIGNALS[strategy]) return { error: `unknown strategy: ${strategy}` };
  const existing = state.results[strategy] ?? null;
  const mayStart = refresh && !state.inflight
    && Date.now() - (state.lastStart[strategy] || 0) > RESCAN_MIN_GAP_MS;
  if (mayStart) {
    runInBackground(strategy);
  }
  return {
    status: state.inflight === strategy ? 'running'
      : state.inflight ? `busy (${state.inflight})` : existing ? 'ok' : 'idle',
    progress: state.inflight === strategy ? state.progress : null,
    report: existing,
  };
}
