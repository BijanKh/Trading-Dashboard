// Space-sector screener (GET /api/space) — short-the-bounce focus.
//
// Per symbol, computed from the shared 45s quote() batch + the ~70-session
// close series of the daily refs pass (zero extra intraday API calls):
//   r5           5-session % change (bounce detector)
//   vs50         % distance to the 50-DMA (from quote's fiftyDayAverage)
//   sma50Falling 50-DMA now vs 10 sessions ago (trend filter)
//   rsi14        Wilder RSI on closes + live price
//   pctB         Bollinger(20,2) %B -> OS/OB classification like the
//                "Trading Range" column of the user's screener image
//   dEmaVol      (price − EMA12) / stdev20 of daily $ changes — distance to
//                the 12 EMA in close-to-close vol units (ATR proxy; same
//                reading convention as the Trending tab: |x| ≤ ~1 = at the
//                EMA, very negative = extended below it)
//   rs21         21-session return minus SPY's (relative strength, pp)
//   dollarVol    avg daily $ volume; thin = fails the user's short floors
//                (price ≥ $5, ≥ $20M ADV)
//   setup        short-side tag, only for names below a FALLING 50-DMA:
//                AT EMA (bounce reached the declining 12 EMA — entry zone),
//                BOUNCING (5d up, still below the EMA), EXTENDED (≤ −2 vol
//                units below the EMA — late to chase), TRENDING (drifting
//                lower near the EMA), UPTREND for everything else.
//
// Short interest (% float, days-to-cover) + next earnings date come from a
// sequential quoteSummary pass cached 12h (same pattern as earnings.js).

import { GROUPS } from './symbols.js';
import { yahooFinance, withTimeout, getCloseSeries, getQuotes } from './yahoo.js';

const SUMMARY_TTL_MS = 12 * 60 * 60 * 1000;
const SUMMARY_GAP_MS = 500;

// ---------- indicator math (close-only) ----------

function emaLast(values, period) {
  if (values.length < period) return null;
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi14(values) {
  const period = 14;
  if (values.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = values[i] - values[i - 1];
    if (ch > 0) gain += ch; else loss -= ch;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(ch, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-ch, 0)) / period;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

function stdev(values) {
  if (values.length < 2) return null;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v);
}

function sma(values, period, offsetFromEnd = 0) {
  const end = values.length - offsetFromEnd;
  if (end < period) return null;
  return values.slice(end - period, end).reduce((a, b) => a + b, 0) / period;
}

function classify(pctB) {
  if (pctB == null) return null;
  if (pctB < 0) return 'EXTREME OS';
  if (pctB < 0.2) return 'OVERSOLD';
  if (pctB > 1) return 'EXTREME OB';
  if (pctB > 0.8) return 'OVERBOUGHT';
  return 'NEUTRAL';
}

function computeRow(q, spyR21) {
  const series = getCloseSeries(q.symbol);
  const closes = series ? series.map(p => p.c) : null;
  const price = q.price;
  const out = {
    symbol: q.symbol,
    label: q.name || q.label,
    dec: q.dec ?? 2,
    price,
    dayPct: q.dayPct,
    wtdPct: q.wtdPct,
    ytdPct: q.ytdPct,
    marketCap: q.marketCap ?? null,
    r5: null, vs50: null, sma50Falling: null, rsi: null, pctB: null,
    range: null, dEmaVol: null, rs21: null, dollarVol: null, thin: null,
    setup: null,
  };
  if (price == null) return out;

  out.dollarVol = q.avgVolume != null ? q.avgVolume * price : null;
  out.thin = out.dollarVol != null ? (price < 5 || out.dollarVol < 20e6) : null;
  out.vs50 = q.sma50 ? price / q.sma50 - 1 : null;

  if (!closes || closes.length < 21) return out;
  const withLive = [...closes, price];

  out.r5 = closes.length >= 5 ? price / closes[closes.length - 5] - 1 : null;
  out.rsi = rsi14(withLive);

  const m20 = sma(withLive, 20);
  const sd20 = stdev(withLive.slice(-20));
  if (m20 != null && sd20 > 0) {
    out.pctB = (price - (m20 - 2 * sd20)) / (4 * sd20);
    out.range = classify(out.pctB);
  }

  const ema12 = emaLast(withLive, 12);
  const changes = [];
  for (let i = withLive.length - 20; i < withLive.length; i++) {
    if (i > 0) changes.push(withLive[i] - withLive[i - 1]);
  }
  const volAbs = stdev(changes);
  if (ema12 != null && volAbs > 0) out.dEmaVol = (price - ema12) / volAbs;

  const sma50Now = sma(withLive, 50);
  const sma50Back = sma(closes, 50, 10);
  if (sma50Now != null && sma50Back != null) out.sma50Falling = sma50Now < sma50Back;
  if (out.vs50 == null && sma50Now != null) out.vs50 = price / sma50Now - 1;

  if (closes.length >= 21 && spyR21 != null) {
    const r21 = price / closes[closes.length - 21] - 1;
    out.rs21 = (r21 - spyR21) * 100; // percentage points vs SPY
  }

  // Downtrend = below the 50-DMA unless the 50-DMA is actually rising.
  // (Slope can be unknown for recent IPOs with a short close series.)
  // Below a RISING 50-DMA = fresh breakdown after a run-up — not yet a
  // confirmed downtrend, tagged EARLY DOWN.
  const trendDown = out.vs50 != null && out.vs50 < 0 && out.sma50Falling !== false;
  if (out.vs50 == null) out.setup = null;
  else if (out.vs50 >= 0) out.setup = 'UPTREND';
  else if (!trendDown) out.setup = 'EARLY DOWN';
  else if (out.dEmaVol != null && Math.abs(out.dEmaVol) <= 0.75) out.setup = 'AT EMA';
  else if (out.dEmaVol != null && out.dEmaVol <= -2) out.setup = 'EXTENDED';
  else if (out.r5 != null && out.r5 > 0) out.setup = 'BOUNCING';
  else out.setup = 'TRENDING';
  return out;
}

// ---------- short interest + earnings (quoteSummary, 12h cache) ----------

const summaryCache = { bySymbol: new Map(), fetchedAt: 0, inflight: false };

async function refreshSummaries(symbols) {
  if (summaryCache.inflight) return;
  summaryCache.inflight = true;
  try {
    let ok = 0;
    for (const s of symbols) {
      try {
        const r = await withTimeout(yahooFinance.quoteSummary(s, {
          modules: ['defaultKeyStatistics', 'calendarEvents'],
        }, { validateResult: false }), 15000, `quoteSummary(${s})`);
        const ks = r?.defaultKeyStatistics;
        const earnings = r?.calendarEvents?.earnings?.earningsDate?.[0] ?? null;
        summaryCache.bySymbol.set(s, {
          shortPctFloat: ks?.shortPercentOfFloat ?? null,
          daysToCover: ks?.shortRatio ?? null,
          earningsDate: earnings ? new Date(earnings).toISOString() : null,
        });
        ok++;
      } catch {}
      await new Promise(r => setTimeout(r, SUMMARY_GAP_MS));
    }
    summaryCache.fetchedAt = Date.now();
    console.log(`Space quoteSummary loaded: ${ok}/${symbols.length}`);
  } finally {
    summaryCache.inflight = false;
  }
}

function ensureSummaries(symbols) {
  if (Date.now() - summaryCache.fetchedAt > SUMMARY_TTL_MS && !summaryCache.inflight) {
    refreshSummaries(symbols).catch(err => console.error('Space summaries failed:', err.message));
  }
}

// ---------- composite (equal-weight sector view) ----------

function composite(rows) {
  const live = rows.filter(r => r.price != null && r.symbol !== 'UFO' && r.symbol !== 'SPCX');
  if (!live.length) return null;
  const avg = (vals) => {
    const v = vals.filter(x => x != null && isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  // Equal-weight rebased index over the common sessions of the close series
  const seriesList = live
    .map(r => getCloseSeries(r.symbol))
    .filter(s => s && s.length >= 20);
  let index = null;
  if (seriesList.length >= 5) {
    const counts = new Map();
    for (const s of seriesList) for (const p of s) counts.set(p.d, (counts.get(p.d) || 0) + 1);
    const common = [...counts.entries()].filter(([, n]) => n === seriesList.length)
      .map(([d]) => d).sort();
    if (common.length >= 20) {
      const dates = new Set(common);
      index = common.map(d => ({ d, v: 0 }));
      for (const s of seriesList) {
        const byDate = new Map(s.filter(p => dates.has(p.d)).map(p => [p.d, p.c]));
        const base = byDate.get(common[0]);
        index.forEach(pt => { pt.v += (byDate.get(pt.d) / base) / seriesList.length; });
      }
      index = index.map(pt => ({ d: pt.d, v: Math.round(pt.v * 10000) / 10000 }));
    }
  }
  return {
    count: live.length,
    dayPct: avg(live.map(r => r.dayPct)),
    r5: avg(live.map(r => r.r5)),
    ytdPct: avg(live.map(r => r.ytdPct)),
    belowFalling50: live.filter(r => ['AT EMA', 'BOUNCING', 'TRENDING', 'EXTENDED'].includes(r.setup)).length,
    bouncing: live.filter(r => r.setup === 'BOUNCING' || r.setup === 'AT EMA').length,
    atEma: live.filter(r => r.setup === 'AT EMA').length,
    index,
  };
}

export async function getSpace() {
  const quotes = await getQuotes();
  const spaceQuotes = quotes?.groups?.space || [];
  const symbols = GROUPS.space.map(e => e.s);
  ensureSummaries(symbols);

  const spySeries = getCloseSeries('SPY');
  const spyQuote = quotes?.groups?.sectors?.find(x => x.symbol === 'SPY');
  const spyR21 = spySeries && spySeries.length >= 21 && spyQuote?.price != null
    ? spyQuote.price / spySeries[spySeries.length - 21].c - 1 : null;

  const rows = spaceQuotes.map(q => {
    const row = computeRow(q, spyR21);
    const extra = summaryCache.bySymbol.get(q.symbol);
    row.shortPctFloat = extra?.shortPctFloat ?? null;
    row.daysToCover = extra?.daysToCover ?? null;
    row.earningsDate = extra?.earningsDate ?? null;
    return row;
  });

  return {
    asOf: quotes?.asOf ?? new Date().toISOString(),
    stale: quotes?.stale ?? false,
    composite: composite(rows),
    rows,
  };
}
